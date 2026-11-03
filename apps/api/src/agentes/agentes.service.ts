import { ForbiddenException, Inject, Injectable, NotFoundException, type OnModuleInit } from '@nestjs/common';
import { asc, eq, max } from 'drizzle-orm';
import { EdicaoAgente, type Agente } from '@ponto/shared';
import { novoId } from '../comum/id';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { agentes } from '../db/schema';
import { AGENTES_EMBUTIDOS } from './embutidos';

@Injectable()
export class AgentesService implements OnModuleInit {
  constructor(
    @Inject(BANCO) private readonly banco: Banco,
    private readonly config: ConfiguracoesService,
    private readonly eventos: EventosService,
  ) {}

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

  async criar(dados: EdicaoAgente): Promise<Agente> {
    const d = EdicaoAgente.parse(dados);
    const [{ ultima } = { ultima: 0 }] = await this.banco.select({ ultima: max(agentes.ordem) }).from(agentes);
    const id = novoId();
    await this.banco.insert(agentes).values({
      id,
      ...d,
      categoria: 'Seus',
      embutido: false,
      ordem: (ultima ?? 0) + 1,
      criadoEm: new Date(),
    });
    await this.avisar();
    return this.obter(id);
  }

  async editar(id: string, dados: EdicaoAgente): Promise<Agente> {
    const atual = await this.obter(id);
    if (atual.embutido) throw new ForbiddenException({ mensagem: 'Agentes embutidos não mudam. Duplique para editar.' });
    await this.banco.update(agentes).set(EdicaoAgente.parse(dados)).where(eq(agentes.id, id));
    await this.avisar();
    return this.obter(id);
  }

  async apagar(id: string): Promise<void> {
    const atual = await this.obter(id);
    if (atual.embutido) throw new ForbiddenException({ mensagem: 'Agentes embutidos não podem ser apagados.' });
    await this.banco.delete(agentes).where(eq(agentes.id, id));
    if ((await this.config.obter()).agenteAtivo === id) await this.config.atualizar({ agenteAtivo: 'geral' });
    await this.avisar();
  }

  private async avisar(): Promise<void> {
    this.eventos.emitir({ tipo: 'agentes', agentes: await this.listar() });
  }
}
