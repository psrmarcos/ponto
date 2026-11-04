import { Inject, Injectable } from '@nestjs/common';
import { gte, sql } from 'drizzle-orm';
import type { Stats } from '@ponto/shared';
import { DB } from '../db/db.module';
import type { Database } from '../db/connection';
import { utterances, chatMessages, sessions, aiUsage } from '../db/schema';

const DAY_MS = 86_400_000;
const CHART_DAYS = 14;

@Injectable()
export class StatsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(): Promise<Stats> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const chartStart = new Date(today.getTime() - (CHART_DAYS - 1) * DAY_MS);
    const weekStart = new Date(today.getTime() - 6 * DAY_MS);

    const perSession = await this.db
      .select({
        id: sessions.id,
        agentId: sessions.agentId,
        startedAt: sessions.startedAt,
        durationMs: sql<number>`coalesce(max(${utterances.endMs}), 0)`,
      })
      .from(sessions)
      .innerJoin(utterances, sql`${utterances.sessionId} = ${sessions.id}`)
      .groupBy(sessions.id);

    const [u] = await this.db
      .select({
        total: sql<number>`count(*)`,
        yoursMs: sql<number>`coalesce(sum(case when ${utterances.channel} = 'microphone' then ${utterances.endMs} - ${utterances.startMs} else 0 end), 0)`,
        allMs: sql<number>`coalesce(sum(${utterances.endMs} - ${utterances.startMs}), 0)`,
        yourWords: sql<number>`coalesce(sum(case when ${utterances.channel} = 'microphone' then length(trim(${utterances.text})) - length(replace(trim(${utterances.text}), ' ', '')) + 1 else 0 end), 0)`,
        otherWords: sql<number>`coalesce(sum(case when ${utterances.channel} = 'system' then length(trim(${utterances.text})) - length(replace(trim(${utterances.text}), ' ', '')) + 1 else 0 end), 0)`,
      })
      .from(utterances);

    const totalCost = await this.sumCost();
    const monthCost = await this.sumCost(startOfMonth);
    const bySourceMonth = await this.db
      .select({ source: aiUsage.source, cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, startOfMonth))
      .groupBy(aiUsage.source);
    const costByDay = await this.db
      .select({ createdAt: aiUsage.createdAt, cost: aiUsage.costUsd })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, chartStart));

    const [chat] = await this.db
      .select({
        total: sql<number>`count(*)`,
        detected: sql<number>`coalesce(sum(case when ${chatMessages.automatic} then 1 else 0 end), 0)`,
      })
      .from(chatMessages)
      .where(sql`${chatMessages.role} = 'user'`);

    const days = Array.from({ length: CHART_DAYS }, (_, i) => {
      const d = new Date(chartStart.getTime() + i * DAY_MS);
      return { day: dayKey(d), sessions: 0, minutes: 0, costUsd: 0 };
    });
    const byDayMap = new Map(days.map((d) => [d.day, d]));
    for (const s of perSession) {
      const d = byDayMap.get(dayKey(s.startedAt));
      if (d) {
        d.sessions++;
        d.minutes += Number(s.durationMs) / 60_000;
      }
    }
    for (const row of costByDay) {
      const d = byDayMap.get(dayKey(row.createdAt));
      if (d) d.costUsd += Number(row.cost);
    }

    const agentsMap = new Map<string, number>();
    for (const s of perSession) agentsMap.set(s.agentId, (agentsMap.get(s.agentId) ?? 0) + 1);
    const hours = (list: typeof perSession) => list.reduce((n, s) => n + Number(s.durationMs), 0) / 3_600_000;
    const thisMonth = perSession.filter((s) => s.startedAt >= startOfMonth);
    const allMs = Number(u?.allMs ?? 0);

    return {
      sessions: {
        total: perSession.length,
        thisMonth: thisMonth.length,
        thisWeek: perSession.filter((s) => s.startedAt >= weekStart).length,
      },
      recordedHours: { total: hours(perSession), thisMonth: hours(thisMonth) },
      utterances: { total: Number(u?.total ?? 0), yourShare: allMs ? Number(u?.yoursMs ?? 0) / allMs : 0 },
      words: { yours: Number(u?.yourWords ?? 0), others: Number(u?.otherWords ?? 0) },
      cost: {
        monthUsd: monthCost,
        totalUsd: totalCost,
        avgPerSessionUsd: perSession.length ? totalCost / perSession.length : 0,
        bySourceMonth: bySourceMonth
          .map((o) => ({ source: o.source, costUsd: Number(o.cost) }))
          .sort((a, b) => b.costUsd - a.costUsd),
      },
      chatQuestions: { total: Number(chat?.total ?? 0), detected: Number(chat?.detected ?? 0) },
      byDay: days,
      agents: [...agentsMap.entries()]
        .map(([agentId, n]) => ({ agentId, sessions: n }))
        .sort((a, b) => b.sessions - a.sessions),
    };
  }

  private async sumCost(since?: Date): Promise<number> {
    const q = this.db.select({ cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)` }).from(aiUsage);
    const [r] = since ? await q.where(gte(aiUsage.createdAt, since)) : await q;
    return Number(r?.cost ?? 0);
  }
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
