import { Injectable, Logger } from '@nestjs/common';
import type { AiModel, KeyTestResult } from '@ponto/shared';
import { SecretsService } from '../../secrets/secrets.service';
import { ProviderError, type AiMessage, type GenerationChunk, type GenerationRequest, type AiProvider } from './provider';
import { http } from '../../common/http';
import { readSse } from './sse';

const BASE = 'https://openrouter.ai/api/v1';
/** Models that reason by default even without being asked; in normal mode we send minimal effort. */
const REASONS_BY_DEFAULT = /^(google\/|openai\/(gpt-5|o[0-9]))/;
const ONE_HOUR = 60 * 60 * 1000;

interface OpenRouterModel {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
}

interface OpenRouterChunk {
  model?: string;
  choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; code?: number };
}

/** Models that accept explicit `cache_control` on OpenRouter (others cache automatically or not at all). */
const acceptsExplicitCache = (model: string): boolean => model.startsWith('anthropic/') || model.startsWith('google/');

@Injectable()
export class OpenRouterProvider implements AiProvider {
  readonly id = 'openrouter' as const;
  readonly name = 'OpenRouter';
  readonly implemented = true;
  private readonly log = new Logger('OpenRouter');
  private modelsCache: { at: number; list: AiModel[] } | null = null;
  /** Models that accept the `reasoning` parameter (returned with the models list). */
  private reasoningModels = new Set<string>();

  constructor(private readonly secrets: SecretsService) {}

  isConfigured(): boolean {
    return this.secrets.has('openrouter');
  }

  private headers(): Record<string, string> {
    const key = this.secrets.get('openrouter');
    if (!key) throw new ProviderError('Cadastre sua chave do OpenRouter na Home, em Perfil e conta.', 401);
    return {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      // Identifies the app in the OpenRouter dashboard.
      'HTTP-Referer': 'https://github.com/ponto-app/ponto',
      'X-Title': 'Ponto',
    };
  }

  async testKey(): Promise<KeyTestResult> {
    try {
      const r = await http(`${BASE}/key`, { headers: this.headers(), signal: AbortSignal.timeout(10_000) });
      if (r.status === 401) return { ok: false, message: 'Chave recusada pelo OpenRouter.' };
      if (!r.ok) return { ok: false, message: `OpenRouter respondeu ${r.status}.` };
      const { data } = (await r.json()) as { data?: { limit_remaining?: number | null; label?: string } };
      return { ok: true, message: 'Chave válida.', remainingCreditUsd: data?.limit_remaining ?? null };
    } catch (e) {
      if (e instanceof ProviderError) return { ok: false, message: e.message };
      return { ok: false, message: 'Não consegui falar com o OpenRouter. Verifique a internet.' };
    }
  }

  async listModels(): Promise<AiModel[]> {
    if (this.modelsCache && Date.now() - this.modelsCache.at < ONE_HOUR) return this.modelsCache.list;
    const r = await http(`${BASE}/models`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new ProviderError(`OpenRouter respondeu ${r.status} ao listar modelos.`, r.status);
    const { data } = (await r.json()) as { data: OpenRouterModel[] };
    this.reasoningModels = new Set(data.filter((m) => m.supported_parameters?.includes('reasoning')).map((m) => m.id));
    const perMillion = (v?: string): number | null => (v === undefined || Number(v) < 0 ? null : Number(v) * 1e6);
    const list = data
      .filter((m) => !m.id.endsWith(':batch'))
      .map<AiModel>((m) => ({
        id: m.id,
        name: m.name,
        contextLength: m.context_length ?? null,
        inputPrice: perMillion(m.pricing?.prompt),
        outputPrice: perMillion(m.pricing?.completion),
        supportsImages: m.architecture?.input_modalities?.includes('image') ?? false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    this.modelsCache = { at: Date.now(), list };
    return list;
  }

  async *generate(request: GenerationRequest, signal: AbortSignal): AsyncIterable<GenerationChunk> {
    const body: Record<string, unknown> = {
      model: request.model,
      messages: request.messages.map((m) => this.convert(m, request.model)),
      stream: true,
      max_tokens: request.maxTokens,
      usage: { include: true },
    };
    if (request.temperature !== undefined) body.temperature = request.temperature;
    // Web search: few results, because each page counts towards input tokens.
    if (request.web) body.plugins = [{ id: 'web', max_results: 3 }];
    if (request.reasoning) body.reasoning = { effort: 'medium', exclude: true };
    // Gemini and GPT reason by default even without being asked. In a live call that costs seconds and tokens:
    // measured with gemini-3.8-flash: 5.9s and 478 output tokens vs 2.6s and 36 with 'minimal'.
    else if (REASONS_BY_DEFAULT.test(request.model)) body.reasoning = { effort: 'minimal', exclude: true };
    // DeepSeek, Qwen, etc. also reason by default, and reasoning can consume the entire
    // max_tokens before emitting text (empty response). On those models we disable it completely.
    else if (await this.supportsReasoning(request.model)) body.reasoning = { enabled: false };

    const r = await http(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
      signal,
    });
    if (!r.ok || !r.body) {
      const text = await r.text().catch(() => '');
      this.log.warn(`error ${r.status}: ${text.slice(0, 300)}`);
      throw new ProviderError(this.errorMessage(r.status, text), r.status);
    }

    let model = request.model;
    let hadText = false;
    let finishReason: string | null | undefined;
    for await (const raw of readSse(r.body)) {
      const p = raw as OpenRouterChunk;
      if (p.error) throw new ProviderError(p.error.message ?? 'Erro do provedor no meio da resposta.', p.error.code);
      if (p.model) model = p.model;
      const text = p.choices?.[0]?.delta?.content;
      if (text) {
        hadText = true;
        yield { type: 'text', text };
      }
      if (p.choices?.[0]?.finish_reason) finishReason = p.choices[0].finish_reason;
      if (p.usage) {
        yield {
          type: 'usage',
          usage: {
            model,
            inputTokens: p.usage.prompt_tokens ?? 0,
            outputTokens: p.usage.completion_tokens ?? 0,
            cachedTokens: p.usage.prompt_tokens_details?.cached_tokens ?? 0,
            costUsd: p.usage.cost ?? 0,
          },
        };
      }
    }
    if (!hadText && !signal.aborted) {
      throw new ProviderError(
        finishReason === 'length'
          ? 'O modelo gastou o limite pensando e não respondeu. Tente outro modelo ou desligue o raciocínio.'
          : 'O modelo não devolveu texto. Tente de novo ou troque de modelo.',
      );
    }
  }

  private async supportsReasoning(model: string): Promise<boolean> {
    if (!this.modelsCache) await this.listModels().catch(() => undefined);
    return this.reasoningModels.has(model);
  }

  private convert(m: AiMessage, model: string): unknown {
    if (typeof m.content === 'string') return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: m.content.map((p) =>
        p.type === 'image'
          ? { type: 'image_url', image_url: { url: p.url } }
          : {
              type: 'text',
              text: p.text,
              ...(p.cache && acceptsExplicitCache(model) ? { cache_control: { type: 'ephemeral' } } : {}),
            },
      ),
    };
  }

  private errorMessage(status: number, body: string): string {
    if (status === 401) return 'Chave do OpenRouter inválida.';
    if (status === 402) return 'Sem créditos no OpenRouter.';
    if (status === 429) return 'Muitas chamadas seguidas. Tente de novo em instantes.';
    try {
      const j = JSON.parse(body) as { error?: { message?: string } };
      if (j.error?.message) return j.error.message;
    } catch {
      // body is not JSON
    }
    return `O OpenRouter respondeu ${status}.`;
  }
}
