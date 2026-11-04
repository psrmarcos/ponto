import { ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { asc, eq, max } from 'drizzle-orm';
import { AgentInput, type Agent } from '@ponto/shared';
import { newId } from '../common/id';
import { SettingsService } from '../settings/settings.service';
import { EventsService } from '../events/events.service';
import { DB } from '../db/db.module';
import type { Database } from '../db/connection';
import { agents } from '../db/schema';
import { BUILT_IN_AGENTS } from './built-in';

@Injectable()
export class AgentsService implements OnModuleInit {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly settings: SettingsService,
    private readonly events: EventsService,
  ) {}

  async onModuleInit(): Promise<void> {
    const now = new Date();
    for (const [sortOrder, a] of BUILT_IN_AGENTS.entries()) {
      const values = { ...a, builtIn: true, sortOrder, createdAt: now };
      await this.db
        .insert(agents)
        .values(values)
        .onConflictDoUpdate({
          target: agents.id,
          set: { name: a.name, description: a.description, category: a.category, prompt: a.prompt, sortOrder },
        });
    }
  }

  async list(): Promise<Agent[]> {
    const rows = await this.db.select().from(agents).orderBy(asc(agents.sortOrder), asc(agents.createdAt));
    return rows.map(({ sortOrder: _s, createdAt: _c, ...a }) => a);
  }

  async get(id: string): Promise<Agent> {
    const [row] = await this.db.select().from(agents).where(eq(agents.id, id)).limit(1);
    if (!row) throw new NotFoundException(`agent ${id} does not exist`);
    const { sortOrder: _s, createdAt: _c, ...a } = row;
    return a;
  }

  async create(data: AgentInput): Promise<Agent> {
    const d = AgentInput.parse(data);
    const [{ last } = { last: 0 }] = await this.db.select({ last: max(agents.sortOrder) }).from(agents);
    const id = newId();
    await this.db.insert(agents).values({
      id,
      ...d,
      category: 'Seus',
      builtIn: false,
      sortOrder: (last ?? 0) + 1,
      createdAt: new Date(),
    });
    await this.notify();
    return this.get(id);
  }

  async update(id: string, data: AgentInput): Promise<Agent> {
    const current = await this.get(id);
    if (current.builtIn) throw new ForbiddenException({ message: 'Agentes embutidos não mudam. Duplique para editar.' });
    await this.db.update(agents).set(AgentInput.parse(data)).where(eq(agents.id, id));
    await this.notify();
    return this.get(id);
  }

  async remove(id: string): Promise<void> {
    const current = await this.get(id);
    if (current.builtIn) throw new ForbiddenException({ message: 'Agentes embutidos não podem ser apagados.' });
    await this.db.delete(agents).where(eq(agents.id, id));
    if ((await this.settings.get()).activeAgentId === id) await this.settings.update({ activeAgentId: 'general' });
    await this.notify();
  }

  private async notify(): Promise<void> {
    this.events.emit({ type: 'agents', agents: await this.list() });
  }
}
