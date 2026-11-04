import { Injectable } from '@nestjs/common';
import type { AiUsage } from '@ponto/shared';
import { SettingsService } from '../settings/settings.service';
import { UsageService } from '../usage/usage.service';
import { ProvidersService } from './providers/providers.service';
import type { AiMessage } from './providers/provider';

/**
 * Generates a complete text response at once (without streaming to the UI) for
 * background tasks: meeting minutes, initial call summary, compaction, translation.
 * Uses the fast model by default and records token usage.
 */
@Injectable()
export class AiTextService {
  constructor(
    private readonly settings: SettingsService,
    private readonly providers: ProvidersService,
    private readonly usage: UsageService,
  ) {}

  async generate(args: {
    messages: AiMessage[];
    source: string;
    sessionId?: string | null;
    model?: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<string> {
    const cfg = await this.settings.get();
    const provider = this.providers.get(cfg.defaultProvider);
    const signal = AbortSignal.timeout(args.timeoutMs ?? 90_000);
    let text = '';
    let usage: AiUsage | null = null;
    for await (const p of provider.generate(
      {
        model: args.model ?? cfg.fastModel,
        messages: args.messages,
        maxTokens: args.maxTokens ?? 1500,
        temperature: 0.2,
        web: false,
        reasoning: false,
      },
      signal,
    )) {
      if (p.type === 'text') text += p.text;
      else usage = p.usage;
    }
    if (usage) await this.usage.record({ provider: provider.id, source: args.source, sessionId: args.sessionId ?? null, usage });
    return text.trim();
  }
}
