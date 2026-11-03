import { Inject, Injectable } from '@nestjs/common';
import { gte, sql } from 'drizzle-orm';
import type { ResumoUso, UsoIa } from '@ponto/shared';
import { novoId } from '../comum/id';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { usoIa } from '../db/schema';
import { EventosService } from '../eventos/eventos.service';

/** Registra o custo de cada chamada de IA e mantém o resumo do mês. */
@Injectable()
export class UsoService {
  constructor(
    @Inject(BANCO) private readonly banco: Banco,
    private readonly eventos: EventosService,
  ) {}

  async registrar(dados: { provedor: string; origem: string; sessaoId?: string | null; uso: UsoIa }): Promise<void> {
    await this.banco.insert(usoIa).values({
      id: novoId(),
      criadoEm: new Date(),
      sessaoId: dados.sessaoId ?? null,
      provedor: dados.provedor,
      modelo: dados.uso.modelo,
      origem: dados.origem,
      tokensEntrada: dados.uso.tokensEntrada,
      tokensSaida: dados.uso.tokensSaida,
      tokensCache: dados.uso.tokensCache,
      custoUsd: dados.uso.custoUsd,
    });
    this.eventos.emitir({ tipo: 'uso', resumo: await this.resumoMes() });
  }

  async resumoMes(): Promise<ResumoUso> {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const [r] = await this.banco
      .select({
        custo: sql<number>`coalesce(sum(${usoIa.custoUsd}), 0)`,
        tokens: sql<number>`coalesce(sum(${usoIa.tokensEntrada} + ${usoIa.tokensSaida}), 0)`,
        chamadas: sql<number>`count(*)`,
      })
      .from(usoIa)
      .where(gte(usoIa.criadoEm, inicioMes));
    return { custoMesUsd: Number(r?.custo ?? 0), tokensMes: Number(r?.tokens ?? 0), chamadasMes: Number(r?.chamadas ?? 0) };
  }
}
