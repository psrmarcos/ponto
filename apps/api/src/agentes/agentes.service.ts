import { Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import type { Agente } from '@ponto/shared';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { agentes } from '../db/schema';
import { AGENTES_EMBUTIDOS } from './embutidos';

@Injectable()
export class AgentesService implements OnModuleInit {
  constructor(@Inject(BANCO) private readonly banco: Banco) {}

  /** Garante que os agentes embutidos existem e estão na versão do app (sem mexer nos do usuário). */
  async onModuleInit(): Promise<void> {
    const agora = new Date();
    for (const [ordem, a] of AGENTES_EMBUTIDOS.entries()) {
      const valores = { ...a, embutido: true, ordem, criadoEm: agora };
      await this.banco
        .insert(agentes)
        .values(valores)
        .onConflictDoUpdate({
          target: agentes.id,
          set: { nome: a.nome, descricao: a.descricao, categoria: a.categoria, prompt: a.prompt, ordem },
        });
    }
  }

  async listar(): Promise<Agente[]> {
    const linhas = await this.banco.select().from(agentes).orderBy(asc(agentes.ordem), asc(agentes.criadoEm));
    return linhas.map(({ ordem: _o, criadoEm: _c, ...a }) => a);
  }

  async obter(id: string): Promise<Agente> {
    const [l] = await this.banco.select().from(agentes).where(eq(agentes.id, id)).limit(1);
    if (!l) throw new NotFoundException(`agente ${id} não existe`);
    const { ordem: _o, criadoEm: _c, ...a } = l;
    return a;
  }
}
