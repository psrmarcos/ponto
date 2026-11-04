import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { LANGUAGE_NAMES, type Settings, type Utterance, type UtteranceTranslation } from '@ponto/shared';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import { AiTextService } from '../ai/ai-text.service';
import { SessionsService } from '../sessions/sessions.service';

const IN_ENGLISH: Partial<Record<Settings['translationTarget'], string>> = {
  'pt-BR': 'Brazilian Portuguese',
  'pt-PT': 'European Portuguese',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
};
const MAX_PER_SESSION = 2000;

@Injectable()
export class TranslationService implements OnModuleInit {
  private readonly log = new Logger('Translation');
  private readonly bySession = new Map<string, Map<string, UtteranceTranslation>>();

  constructor(
    private readonly sessions: SessionsService,
    private readonly settings: SettingsService,
    private readonly aiText: AiTextService,
    private readonly events: EventsService,
  ) {}

  onModuleInit(): void {
    this.sessions.onNewUtterance((u) => void this.translate(u));
  }

  list(sessionId: string): UtteranceTranslation[] {
    return [...(this.bySession.get(sessionId)?.values() ?? [])];
  }

  private async translate(u: Utterance): Promise<void> {
    const cfg = await this.settings.get();
    if (!cfg.translationEnabled) return;
    const isMine = u.channel === 'microphone';
    if ((cfg.translationSource === 'others' && isMine) || (cfg.translationSource === 'me' && !isMine)) return;
    if (u.text.trim().length < 2) return;
    const learn = cfg.translationLearning && isMine;
    const target = `${IN_ENGLISH[cfg.translationTarget] ?? LANGUAGE_NAMES[cfg.translationTarget]} (${cfg.translationTarget})`;
    const system = learn
      ? `You help someone practice a language during a live call. For the user's sentence, return ONLY JSON {"traducao": string|null, "correcao": string|null}.\n` +
        `- traducao: the sentence translated to ${target}; null if it is already in that language.\n` +
        `- correcao: if the sentence has a grammar, word choice or naturalness problem in the language it was spoken, the corrected natural version in that same language (max 25 words); otherwise null.`
      : `Translate the text to ${target}. Natural spoken style, keep names and numbers. Reply with the translation only. If it is already in that language, reply exactly: =`;
    try {
      const raw = await this.aiText.generate({
        source: 'translation',
        sessionId: u.sessionId,
        maxTokens: 300,
        timeoutMs: 20_000,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: u.text },
        ],
      });
      const t = learn ? parseLearningResult(raw) : { text: clean(raw), correction: null };
      if (!t.text && !t.correction) return;
      const translation: UtteranceTranslation = {
        sessionId: u.sessionId,
        utteranceId: u.id,
        text: t.text,
        correction: t.correction,
      };
      const map = this.bySession.get(u.sessionId) ?? new Map<string, UtteranceTranslation>();
      map.set(u.id, translation);
      if (map.size > MAX_PER_SESSION) map.delete(map.keys().next().value!);
      this.bySession.set(u.sessionId, map);
      this.events.emit({ type: 'transcription.translation', translation });
    } catch (e) {
      this.log.warn(`translation failed: ${(e as Error).message}`);
    }
  }
}

function clean(s: string): string | null {
  const t = s.trim().replace(/^["“]|["”]$/g, '');
  return !t || t === '=' ? null : t;
}

export function parseLearningResult(raw: string): { text: string | null; correction: string | null } {
  const json = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1);
  try {
    const o = JSON.parse(json) as { traducao?: unknown; translation?: unknown; correcao?: unknown; correction?: unknown };
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
    return { text: str(o.traducao ?? o.translation), correction: str(o.correcao ?? o.correction) };
  } catch {
    return { text: clean(raw), correction: null };
  }
}
