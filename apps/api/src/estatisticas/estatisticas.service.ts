import { Inject, Injectable } from '@nestjs/common';
import { gte, sql } from 'drizzle-orm';
import type { Estatisticas } from '@ponto/shared';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { falas, mensagensChat, sessoes, usoIa } from '../db/schema';

const DIA_MS = 86_400_000;
const DIAS_NO_GRAFICO = 14;

/** Números do uso do app para o Início. Tudo calculado no banco local, sem IA. */
@Injectable()
export class EstatisticasService {
  constructor(@Inject(BANCO) private readonly banco: Banco) {}

  async obter(): Promise<Estatisticas> {
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);
    const hoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    const inicioGrafico = new Date(hoje.getTime() - (DIAS_NO_GRAFICO - 1) * DIA_MS);
    const inicioSemana = new Date(hoje.getTime() - 6 * DIA_MS);

    // Uma linha por sessão com fala: quando começou, quanto durou e qual agente.
    const porSessao = await this.banco
      .select({
        id: sessoes.id,
        agenteId: sessoes.agenteId,
        iniciadaEm: sessoes.iniciadaEm,
        duracaoMs: sql<number>`coalesce(max(${falas.fimMs}), 0)`,
      })
      .from(sessoes)
      .innerJoin(falas, sql`${falas.sessaoId} = ${sessoes.id}`)
      .groupBy(sessoes.id);

    const [f] = await this.banco
      .select({
        total: sql<number>`count(*)`,
        suasMs: sql<number>`coalesce(sum(case when ${falas.canal} = 'microfone' then ${falas.fimMs} - ${falas.inicioMs} else 0 end), 0)`,
        todasMs: sql<number>`coalesce(sum(${falas.fimMs} - ${falas.inicioMs}), 0)`,
        palavrasSuas: sql<number>`coalesce(sum(case when ${falas.canal} = 'microfone' then length(trim(${falas.texto})) - length(replace(trim(${falas.texto}), ' ', '')) + 1 else 0 end), 0)`,
        palavrasOutros: sql<number>`coalesce(sum(case when ${falas.canal} = 'sistema' then length(trim(${falas.texto})) - length(replace(trim(${falas.texto}), ' ', '')) + 1 else 0 end), 0)`,
      })
      .from(falas);

    const custoTotal = await this.soma();
    const custoMes = await this.soma(inicioMes);
    const porOrigemMes = await this.banco
      .select({ origem: usoIa.origem, custo: sql<number>`coalesce(sum(${usoIa.custoUsd}), 0)` })
      .from(usoIa)
      .where(gte(usoIa.criadoEm, inicioMes))
      .groupBy(usoIa.origem);
    const custoPorDia = await this.banco
      .select({ criadoEm: usoIa.criadoEm, custo: usoIa.custoUsd })
      .from(usoIa)
      .where(gte(usoIa.criadoEm, inicioGrafico));

    const [chat] = await this.banco
      .select({
        total: sql<number>`count(*)`,
        detectadas: sql<number>`coalesce(sum(case when ${mensagensChat.automatica} then 1 else 0 end), 0)`,
      })
      .from(mensagensChat)
      .where(sql`${mensagensChat.papel} = 'eu'`);

    const dias = Array.from({ length: DIAS_NO_GRAFICO }, (_, i) => {
      const d = new Date(inicioGrafico.getTime() + i * DIA_MS);
      return { dia: chaveDia(d), sessoes: 0, minutos: 0, custoUsd: 0 };
    });
    const doDia = new Map(dias.map((d) => [d.dia, d]));
    for (const s of porSessao) {
      const d = doDia.get(chaveDia(s.iniciadaEm));
      if (d) {
        d.sessoes++;
        d.minutos += Number(s.duracaoMs) / 60_000;
      }
    }
    for (const u of custoPorDia) {
      const d = doDia.get(chaveDia(u.criadoEm));
      if (d) d.custoUsd += Number(u.custo);
    }

    const agentes = new Map<string, number>();
    for (const s of porSessao) agentes.set(s.agenteId, (agentes.get(s.agenteId) ?? 0) + 1);
    const horas = (lista: typeof porSessao) => lista.reduce((n, s) => n + Number(s.duracaoMs), 0) / 3_600_000;
    const noMes = porSessao.filter((s) => s.iniciadaEm >= inicioMes);
    const todasMs = Number(f?.todasMs ?? 0);

    return {
      sessoes: {
        total: porSessao.length,
        noMes: noMes.length,
        naSemana: porSessao.filter((s) => s.iniciadaEm >= inicioSemana).length,
      },
      horasGravadas: { total: horas(porSessao), noMes: horas(noMes) },
      falas: { total: Number(f?.total ?? 0), suaParte: todasMs ? Number(f?.suasMs ?? 0) / todasMs : 0 },
      palavras: { suas: Number(f?.palavrasSuas ?? 0), outros: Number(f?.palavrasOutros ?? 0) },
      custo: {
        mesUsd: custoMes,
        totalUsd: custoTotal,
        mediaPorSessaoUsd: porSessao.length ? custoTotal / porSessao.length : 0,
        porOrigemMes: porOrigemMes
          .map((o) => ({ origem: o.origem, custoUsd: Number(o.custo) }))
          .sort((a, b) => b.custoUsd - a.custoUsd),
      },
      perguntasAoChat: { total: Number(chat?.total ?? 0), detectadas: Number(chat?.detectadas ?? 0) },
      porDia: dias,
      agentes: [...agentes.entries()].map(([agenteId, n]) => ({ agenteId, sessoes: n })).sort((a, b) => b.sessoes - a.sessoes),
    };
  }

  private async soma(desde?: Date): Promise<number> {
    const q = this.banco.select({ custo: sql<number>`coalesce(sum(${usoIa.custoUsd}), 0)` }).from(usoIa);
    const [r] = desde ? await q.where(gte(usoIa.criadoEm, desde)) : await q;
    return Number(r?.custo ?? 0);
  }
}

/** Dia local no formato AAAA-MM-DD. */
function chaveDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
