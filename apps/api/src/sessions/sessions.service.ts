import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, lte, max, sql, sum } from 'drizzle-orm';
import type { AudioChannel, Utterance, SpendBySource, SavedMessage, Session, SessionListItem } from '@ponto/shared';
import { newId } from '../common/id';
import { DB } from '../db/db.module';
import type { Database } from '../db/connection';
import { utterances, chatMessages, sessions, aiUsage } from '../db/schema';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';

const MAX_CONTEXT_CHARS = 6000;
const MAX_CONTEXT_UTTERANCES = 40;

export interface PartialSummary {
  text: string;
  upToMs: number;
}

@Injectable()
export class SessionsService {
  private readonly utteranceListeners = new Set<(u: Utterance) => void>();
  private readonly finishListeners = new Set<(sessionId: string) => void>();
  private readonly partials = new Map<string, PartialSummary>();
  private readonly versions = new Map<string, number>();
  readonly generatingSummary = new Set<string>();

  onFinish(fn: (sessionId: string) => void): () => void {
    this.finishListeners.add(fn);
    return () => this.finishListeners.delete(fn);
  }

  partialSummary(sessionId: string): PartialSummary | null {
    return this.partials.get(sessionId) ?? null;
  }

  setPartialSummary(sessionId: string, r: PartialSummary): void {
    this.partials.set(sessionId, r);
  }

  version(sessionId: string): number {
    return this.versions.get(sessionId) ?? 0;
  }

  onNewUtterance(fn: (u: Utterance) => void): () => void {
    this.utteranceListeners.add(fn);
    return () => this.utteranceListeners.delete(fn);
  }

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  async create(agentId?: string): Promise<Session> {
    const agent = agentId ?? (await this.settings.get()).activeAgentId;
    const now = new Date();
    const title = `Sessão de ${now.toLocaleDateString('pt-BR')} ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const id = newId();
    await this.db.insert(sessions).values({ id, title, agentId: agent, startedAt: now });
    return { id, title, agentId: agent, startedAt: now.getTime(), endedAt: null, summary: null };
  }

  async list(limit = 100): Promise<SessionListItem[]> {
    const rows = await this.db
      .select({
        id: sessions.id,
        title: sessions.title,
        agentId: sessions.agentId,
        startedAt: sessions.startedAt,
        endedAt: sessions.endedAt,
        summary: sessions.summary,
        totalUtterances: count(utterances.id),
        end: max(utterances.endMs),
      })
      .from(sessions)
      .leftJoin(utterances, eq(utterances.sessionId, sessions.id))
      .groupBy(sessions.id)
      .orderBy(desc(sessions.startedAt))
      .limit(limit);
    const ids = rows.map((r) => r.id);
    const spends = ids.length
      ? await this.db
          .select({ sessionId: aiUsage.sessionId, cost: sum(aiUsage.costUsd) })
          .from(aiUsage)
          .where(inArray(aiUsage.sessionId, ids))
          .groupBy(aiUsage.sessionId)
      : [];
    const costBySession = new Map(spends.map((s) => [s.sessionId, Number(s.cost ?? 0)]));
    return rows
      .filter((r) => r.totalUtterances > 0 || r.summary)
      .map((r) => ({
        costUsd: costBySession.get(r.id) ?? 0,
        id: r.id,
        title: r.title,
        agentId: r.agentId,
        startedAt: r.startedAt.getTime(),
        endedAt: r.endedAt?.getTime() ?? null,
        totalUtterances: r.totalUtterances,
        durationMs: r.end ?? 0,
        hasSummary: !!r.summary,
        generatingSummary: this.generatingSummary.has(r.id),
      }));
  }

  async spend(sessionId: string): Promise<SpendBySource[]> {
    const rows = await this.db
      .select({
        source: aiUsage.source,
        cost: sum(aiUsage.costUsd),
        calls: count(aiUsage.id),
        tokens: sql<number>`sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens})`,
      })
      .from(aiUsage)
      .where(eq(aiUsage.sessionId, sessionId))
      .groupBy(aiUsage.source);
    return rows
      .map((r) => ({ source: r.source, costUsd: Number(r.cost ?? 0), calls: r.calls, tokens: Number(r.tokens ?? 0) }))
      .sort((a, b) => b.costUsd - a.costUsd);
  }

  async saveMessage(m: Omit<SavedMessage, 'id' | 'createdAt'> & { sessionId: string | null }): Promise<void> {
    await this.db.insert(chatMessages).values({ id: newId(), createdAt: new Date(), ...m });
  }

  async conversation(sessionId: string): Promise<SavedMessage[]> {
    const rows = await this.db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));
    return rows.map(({ sessionId: _s, createdAt, ...m }) => ({ ...m, createdAt: createdAt.getTime() }));
  }

  async rename(id: string, title: string): Promise<void> {
    await this.db.update(sessions).set({ title }).where(eq(sessions.id, id));
  }

  async saveSummary(id: string, summary: string, title?: string): Promise<void> {
    await this.db.update(sessions).set(title ? { summary, title } : { summary }).where(eq(sessions.id, id));
  }

  async remove(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
    this.partials.delete(id);
  }

  async utterancesAfter(sessionId: string, afterMs: number): Promise<Utterance[]> {
    return this.db
      .select()
      .from(utterances)
      .where(and(eq(utterances.sessionId, sessionId), gt(utterances.startMs, afterMs)))
      .orderBy(asc(utterances.startMs));
  }

  async format(list: Pick<Utterance, 'channel' | 'speaker' | 'text'>[]): Promise<string> {
    const { userName } = await this.settings.get();
    return list
      .map((u) => `[${u.speaker ?? (u.channel === 'microphone' ? userName || 'Você' : 'Participante')}] ${u.text}`)
      .join('\n');
  }

  async get(id: string): Promise<Session> {
    const [s] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    if (!s) throw new NotFoundException('Sessão não encontrada.');
    return {
      ...s,
      startedAt: s.startedAt.getTime(),
      endedAt: s.endedAt?.getTime() ?? null,
      summary: s.summary ?? null,
    };
  }

  async finish(id: string): Promise<void> {
    await this.db.update(sessions).set({ endedAt: new Date() }).where(and(eq(sessions.id, id)));
    this.finishListeners.forEach((fn) => fn(id));
  }

  async utterances(sessionId: string): Promise<Utterance[]> {
    return this.db.select().from(utterances).where(eq(utterances.sessionId, sessionId)).orderBy(asc(utterances.startMs));
  }

  async clearUtterances(sessionId: string, upToMs: number): Promise<void> {
    await this.db.delete(utterances).where(and(eq(utterances.sessionId, sessionId), lte(utterances.startMs, upToMs)));
    this.partials.delete(sessionId);
    this.versions.set(sessionId, this.version(sessionId) + 1);
    this.events.emit({ type: 'transcription.cleared', sessionId, upToMs });
  }

  async addUtterance(data: { sessionId: string; channel: AudioChannel; text: string; startMs: number; endMs: number }): Promise<Utterance> {
    const utterance: Utterance = { id: newId(), speaker: null, ...data };
    await this.db.insert(utterances).values(utterance);
    this.events.emit({ type: 'transcription.utterance', utterance });
    this.utteranceListeners.forEach((fn) => fn(utterance));
    return utterance;
  }

  async recentContext(sessionId: string, maxUtterances = MAX_CONTEXT_UTTERANCES): Promise<string | null> {
    const recent = await this.db
      .select({ channel: utterances.channel, speaker: utterances.speaker, text: utterances.text })
      .from(utterances)
      .where(eq(utterances.sessionId, sessionId))
      .orderBy(desc(utterances.startMs))
      .limit(maxUtterances);
    if (!recent.length) return null;
    const { userName } = await this.settings.get();
    const lines: string[] = [];
    let total = 0;
    for (const u of recent) {
      const who = u.speaker ?? (u.channel === 'microphone' ? userName || 'Você' : 'Participante');
      const line = `[${who}] ${u.text}`;
      if (total + line.length > MAX_CONTEXT_CHARS) break;
      lines.push(line);
      total += line.length + 1;
    }
    return lines.reverse().join('\n');
  }
}
