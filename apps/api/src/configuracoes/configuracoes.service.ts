import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { Configuracoes, CONFIGURACOES_PADRAO } from '@ponto/shared';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { configuracoes } from '../db/schema';
import { EventosService } from '../eventos/eventos.service';

@Injectable()
export class ConfiguracoesService {
  /** Cache em memória: configurações são lidas em toda chamada de IA. */
  private atual: Configuracoes | null = null;

  constructor(
    @Inject(BANCO) private readonly banco: Banco,
    private readonly eventos: EventosService,
  ) {}

  async obter(): Promise<Configuracoes> {
    if (this.atual) return this.atual;
    const linhas = await this.banco.select().from(configuracoes);
    const salvo: Record<string, unknown> = {};
    for (const l of linhas) salvo[l.chave] = l.valor;
    // Valores antigos inválidos (ex.: depois de mudar o schema) voltam para o padrão.
    const r = Configuracoes.partial().safeParse(salvo);
    this.atual = { ...CONFIGURACOES_PADRAO, ...(r.success ? r.data : {}) };
    return this.atual;
  }

  async atualizar(parcial: Partial<Configuracoes>): Promise<Configuracoes> {
    const agora = new Date();
    const entradas = Object.entries(parcial).filter(([, v]) => v !== undefined);
    for (const [chave, valor] of entradas) {
      await this.banco
        .insert(configuracoes)
        .values({ chave, valor, atualizadoEm: agora })
        .onConflictDoUpdate({ target: configuracoes.chave, set: { valor: sql`excluded.valor`, atualizadoEm: agora } });
    }
    this.atual = null;
    const novas = await this.obter();
    this.eventos.emitir({ tipo: 'configuracoes', configuracoes: novas });
    return novas;
  }
}
