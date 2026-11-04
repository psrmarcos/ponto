import { describe, expect, it } from 'vitest';
import { openDatabase, migrateDatabase } from '../db/connection';
import { utterances, sessions, aiUsage } from '../db/schema';
import { StatsService } from './stats.service';

describe('StatsService', () => {
  it('sums sessions, your talk share, and costs', async () => {
    const { db, sqlite } = openDatabase(':memory:');
    await migrateDatabase(db, sqlite);
    const now = new Date();
    await db.insert(sessions).values({ id: 's1', agentId: 'general', startedAt: now, title: 'x' });
    await db.insert(utterances).values([
      { id: 'f1', sessionId: 's1', channel: 'microphone', text: 'olá tudo bem', startMs: 0, endMs: 3000, speaker: null },
      { id: 'f2', sessionId: 's1', channel: 'system', text: 'tudo', startMs: 3000, endMs: 4000, speaker: null },
    ]);
    await db.insert(aiUsage).values({
      id: 'u1',
      createdAt: now,
      sessionId: 's1',
      provider: 'x',
      model: 'm',
      source: 'chat',
      costUsd: 0.5,
    });
    const s = await new StatsService(db).get();
    expect(s.sessions.total).toBe(1);
    expect(s.utterances.yourShare).toBeCloseTo(0.75);
    expect(s.words).toEqual({ yours: 3, others: 1 });
    expect(s.cost.monthUsd).toBeCloseTo(0.5);
    expect(s.byDay.at(-1)!.sessions).toBe(1);
    expect(s.byDay.at(-1)!.minutes).toBeCloseTo(4000 / 60000);
  });
});
