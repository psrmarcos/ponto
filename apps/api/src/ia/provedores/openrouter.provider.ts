import { Injectable, Logger } from '@nestjs/common';
import type { ModeloIa, ResultadoTesteChave } from '@ponto/shared';
import { SegredosService } from '../../segredos/segredos.service';
import { ErroProvedor, type MensagemIa, type PedacoGeracao, type PedidoGeracao, type ProvedorIa } from './provedor';
import { http } from '../../comum/http';
import { lerSse } from './sse';

const BASE = 'https://openrouter.ai/api/v1';
/** Modelos que raciocinam sem ser pedidos; neles o modo normal manda esforço mínimo. */
const PENSA_POR_PADRAO = /^(google\/|openai\/(gpt-5|o[0-9]))/;
const UMA_HORA = 60 * 60 * 1000;

interface ModeloOpenRouter {
  id: string;
  name: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
}

interface PedacoOpenRouter {
  model?: string;
  choices?: Array<{ delta?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    cost?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string; code?: number };
}

/** Modelos que aceitam `cache_control` explícito no OpenRouter (os demais cacheiam sozinhos ou não cacheiam). */
const aceitaCacheExplicito = (modelo: string): boolean => modelo.startsWith('anthropic/') || modelo.startsWith('google/');

@Injectable()
export class OpenRouterProvider implements ProvedorIa {
  readonly id = 'openrouter' as const;
  readonly nome = 'OpenRouter';
  readonly implementado = true;
  private readonly log = new Logger('OpenRouter');
  private modelosCache: { em: number; lista: ModeloIa[] } | null = null;

  constructor(private readonly segredos: SegredosService) {}

  configurado(): boolean {
    return this.segredos.tem('openrouter');
  }

  private cabecalhos(): Record<string, string> {
    const chave = this.segredos.obter('openrouter');
    if (!chave) throw new ErroProvedor('Cadastre sua chave do OpenRouter na Home, em Perfil e conta.', 401);
    return {
      Authorization: `Bearer ${chave}`,
      'Content-Type': 'application/json',
      // Identificam o app no painel do OpenRouter.
      'HTTP-Referer': 'https://github.com/ponto-app/ponto',
      'X-Title': 'Ponto',
    };
  }

  async testarChave(): Promise<ResultadoTesteChave> {
    try {
      const r = await http(`${BASE}/key`, { headers: this.cabecalhos(), signal: AbortSignal.timeout(10_000) });
      if (r.status === 401) return { ok: false, mensagem: 'Chave recusada pelo OpenRouter.' };
      if (!r.ok) return { ok: false, mensagem: `OpenRouter respondeu ${r.status}.` };
      const { data } = (await r.json()) as { data?: { limit_remaining?: number | null; label?: string } };
      return { ok: true, mensagem: 'Chave válida.', creditoRestanteUsd: data?.limit_remaining ?? null };
    } catch (e) {
      if (e instanceof ErroProvedor) return { ok: false, mensagem: e.message };
      return { ok: false, mensagem: 'Não consegui falar com o OpenRouter. Verifique a internet.' };
    }
  }

  async listarModelos(): Promise<ModeloIa[]> {
    if (this.modelosCache && Date.now() - this.modelosCache.em < UMA_HORA) return this.modelosCache.lista;
    const r = await http(`${BASE}/models`, { signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new ErroProvedor(`OpenRouter respondeu ${r.status} ao listar modelos.`, r.status);
    const { data } = (await r.json()) as { data: ModeloOpenRouter[] };
    const porMilhao = (v?: string): number | null => (v === undefined || Number(v) < 0 ? null : Number(v) * 1e6);
    const lista = data
      .filter((m) => !m.id.endsWith(':batch'))
      .map<ModeloIa>((m) => ({
        id: m.id,
        nome: m.name,
        contexto: m.context_length ?? null,
        precoEntrada: porMilhao(m.pricing?.prompt),
        precoSaida: porMilhao(m.pricing?.completion),
        aceitaImagem: m.architecture?.input_modalities?.includes('image') ?? false,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    this.modelosCache = { em: Date.now(), lista };
    return lista;
  }

  async *gerar(pedido: PedidoGeracao, sinal: AbortSignal): AsyncIterable<PedacoGeracao> {
    const corpo: Record<string, unknown> = {
      model: pedido.modelo,
      messages: pedido.mensagens.map((m) => this.converter(m, pedido.modelo)),
      stream: true,
      max_tokens: pedido.maxTokens,
      usage: { include: true },
    };
    if (pedido.temperatura !== undefined) corpo.temperature = pedido.temperatura;
    // Busca na web: poucos resultados, porque cada página entra como tokens de entrada.
    if (pedido.web) corpo.plugins = [{ id: 'web', max_results: 3 }];
    if (pedido.raciocinio) corpo.reasoning = { effort: 'medium', exclude: true };
    // Gemini e GPT pensam por padrão mesmo sem pedir. Numa call isso custa segundos e tokens:
    // medido com gemini-3.8-flash, 5,9 s e 478 tokens de saída contra 2,6 s e 36 com 'minimal'.
    else if (PENSA_POR_PADRAO.test(pedido.modelo)) corpo.reasoning = { effort: 'minimal', exclude: true };

    const r = await http(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: this.cabecalhos(),
      body: JSON.stringify(corpo),
      signal: sinal,
    });
    if (!r.ok || !r.body) {
      const texto = await r.text().catch(() => '');
      this.log.warn(`erro ${r.status}: ${texto.slice(0, 300)}`);
      throw new ErroProvedor(this.mensagemDeErro(r.status, texto), r.status);
    }

    let modelo = pedido.modelo;
    for await (const bruto of lerSse(r.body)) {
      const p = bruto as PedacoOpenRouter;
      if (p.error) throw new ErroProvedor(p.error.message ?? 'Erro do provedor no meio da resposta.', p.error.code);
      if (p.model) modelo = p.model;
      const texto = p.choices?.[0]?.delta?.content;
      if (texto) yield { tipo: 'texto', texto };
      if (p.usage) {
        yield {
          tipo: 'uso',
          uso: {
            modelo,
            tokensEntrada: p.usage.prompt_tokens ?? 0,
            tokensSaida: p.usage.completion_tokens ?? 0,
            tokensCache: p.usage.prompt_tokens_details?.cached_tokens ?? 0,
            custoUsd: p.usage.cost ?? 0,
          },
        };
      }
    }
  }

  private converter(m: MensagemIa, modelo: string): unknown {
    if (typeof m.conteudo === 'string') return { role: m.papel, content: m.conteudo };
    return {
      role: m.papel,
      content: m.conteudo.map((p) =>
        p.tipo === 'imagem'
          ? { type: 'image_url', image_url: { url: p.url } }
          : {
              type: 'text',
              text: p.texto,
              ...(p.cache && aceitaCacheExplicito(modelo) ? { cache_control: { type: 'ephemeral' } } : {}),
            },
      ),
    };
  }

  private mensagemDeErro(status: number, corpo: string): string {
    if (status === 401) return 'Chave do OpenRouter inválida.';
    if (status === 402) return 'Sem créditos no OpenRouter.';
    if (status === 429) return 'Muitas chamadas seguidas. Tente de novo em instantes.';
    try {
      const j = JSON.parse(corpo) as { error?: { message?: string } };
      if (j.error?.message) return j.error.message;
    } catch {
      // corpo não é JSON
    }
    return `O OpenRouter respondeu ${status}.`;
  }
}
