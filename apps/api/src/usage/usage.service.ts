import { Inject, Injectable } from '@nestjs/common';
import { gte, sql } from 'drizzle-orm';
import type { UsageSummary, AiUsage } from '@ponto/shared';
import { newId } from '../common/id';
import { DB } from '../db/db.module';
import type { Database } from '../db/connection';
import { aiUsage } from '../db/schema';
import { EventsService } from '../events/events.service';

@Injectable()
export class UsageService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: EventsService,
  ) {}

  async record(data: { provider: string; source: string; sessionId?: string | null; usage: AiUsage }): Promise<void> {
    await this.db.insert(aiUsage).values({
      id: newId(),
      createdAt: new Date(),
      sessionId: data.sessionId ?? null,
      provider: data.provider,
      model: data.usage.model,
      source: data.source,
      inputTokens: data.usage.inputTokens,
      outputTokens: data.usage.outputTokens,
      cachedTokens: data.usage.cachedTokens,
      costUsd: data.usage.costUsd,
    });
    this.events.emit({ type: 'usage', summary: await this.monthSummary() });
  }

  async monthSummary(): Promise<UsageSummary> {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const [r] = await this.db
      .select({
        cost: sql<number>`coalesce(sum(${aiUsage.costUsd}), 0)`,
        tokens: sql<number>`coalesce(sum(${aiUsage.inputTokens} + ${aiUsage.outputTokens}), 0)`,
        calls: sql<number>`count(*)`,
      })
      .from(aiUsage)
      .where(gte(aiUsage.createdAt, startOfMonth));
    return {
      monthCostUsd: Number(r?.cost ?? 0),
      monthTokens: Number(r?.tokens ?? 0),
      monthCalls: Number(r?.calls ?? 0),
    };
  }
}
