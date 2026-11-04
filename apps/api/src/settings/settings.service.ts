import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Settings, DEFAULT_SETTINGS } from '@ponto/shared';
import { DB } from '../db/db.module';
import type { Database } from '../db/connection';
import { settings } from '../db/schema';
import { EventsService } from '../events/events.service';

@Injectable()
export class SettingsService {
  private current: Settings | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly events: EventsService,
  ) {}

  async get(): Promise<Settings> {
    if (this.current) return this.current;
    const rows = await this.db.select().from(settings);
    const saved: Record<string, unknown> = {};
    for (const r of rows) saved[r.key] = r.value;
    const parsed = Settings.partial().safeParse(saved);
    this.current = { ...DEFAULT_SETTINGS, ...(parsed.success ? parsed.data : {}) };
    return this.current;
  }

  async update(partial: Partial<Settings>): Promise<Settings> {
    const now = new Date();
    const entries = Object.entries(partial).filter(([, v]) => v !== undefined);
    for (const [key, value] of entries) {
      await this.db
        .insert(settings)
        .values({ key, value, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: sql`excluded.value`, updatedAt: now },
        });
    }
    this.current = null;
    const updated = await this.get();
    this.events.emit({ type: 'settings', settings: updated });
    return updated;
  }
}
