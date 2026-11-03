import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { AoVivo, Fala, Insight, MetricasVoz, ParteAoVivo, ResumoAoVivo, TipoInsight } from '@ponto/shared';
import { novoId } from '../comum/id';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';
import { SessoesService } from '../sessoes/sessoes.service';
import { TextoIaService } from '../ia/texto-ia.service';

/** De quanto em quanto tempo, no mínimo, cada análise roda (e só se entrou fala nova o bastante). */
const INTERVALO_RESUMO_MS = 45_000;
const MIN_CHARS_RESUMO = 300;
const INTERVALO_INSIGHTS_MS = 40_000;
const MIN_CHARS_INSIGHTS = 250;
const MAX_INSIGHTS = 30;
/** Limites para os insights de voz calculados no PC (sem IA). */
const PARTE_ALTA = 0.7;
const RITMO_ALTO = 175;
const FALA_LONGA_S = 90;
const MIN_TEMPO_VOZ_MS = 3 * 60_000;

interface Estado {
  versao: number;
  resumo: ResumoAoVivo | null;
  /** Início da última fala coberta pelo resumo. */
  resumoAteMs: number;
  ultimoResumoEm: number;
  insights: Insight[];
  insightsAteMs: number;
  ultimoInsightsEm: number;
  /** Avisos de voz já dados (não repete). */
  avisosVoz: Set<string>;
  rodando: boolean;
  timer: NodeJS.Timeout | null;
  /** A aba já foi aberta nesta sessão: só então a análise roda (e segue sozinha depois). */
  ativo: Record<ParteAoVivo, boolean>;
}

const PROMPT_RESUMO =
  'Você mantém o resumo ao vivo de uma call para o usuário bater o olho enquanto fala. Português do Brasil, Markdown. ' +
  'No máximo 8 tópicos curtos (até 15 palavras cada), do mais importante ao menos: assunto, o que foi perguntado e respondido, ' +
  'números, nomes, decisões, pendências. Só o que foi dito. Sem título e sem introdução. ' +
  'O usuário aparece pelo nome ou como "Você"; os outros como "Participante".';

const PROMPT_INSIGHTS = `Você é um coach discreto que acompanha uma call ao vivo e só fala quando vale a pena.
Leia o trecho recente e devolva SOMENTE um JSON: um array com 0, 1 ou 2 itens {"tipo": "oportunidade"|"risco"|"voz"|"dica", "texto": "..."}.
- oportunidade: algo que o usuário pode aproveitar agora (interesse, dor, gancho para um exemplo).
- risco: objeção, mal-entendido, resposta fraca ou promessa arriscada.
- voz: como o usuário está falando (enrolando, vago, defensivo, muito técnico, sem exemplo).
- dica: uma pergunta ou frase concreta para usar agora.
Texto com até 20 palavras, direto, em segunda pessoa ("Pergunte...", "Você..."). Português do Brasil.
Na dúvida, devolva []. Nada óbvio, genérico ou repetido dos insights já dados.`;

/**
 * Análise ao vivo da call para as abas Resumo e Insights da Transcrição. Roda em
 * segundo plano com o modelo rápido, em intervalos, só quando entrou fala nova.
 * Cada análise só começa quando a pessoa abre a aba pela primeira vez na sessão
 * (e tem seu interruptor nas configurações).
 */
@Injectable()
export class AoVivoService implements OnModuleInit {
  private readonly log = new Logger('AoVivo');
  private readonly estados = new Map<string, Estado>();

  constructor(
    private readonly sessoes: SessoesService,
    private readonly texto: TextoIaService,
    private readonly config: ConfiguracoesService,
    private readonly eventos: EventosService,
  ) {}

  onModuleInit(): void {
    this.sessoes.aoNovaFala((f) => this.agendar(f.sessaoId));
  }

  async obter(sessaoId: string): Promise<AoVivo> {
    const e = this.estado(sessaoId);
    return { resumo: e.resumo, insights: e.insights, metricas: metricasVoz(await this.sessoes.falas(sessaoId)), ativo: { ...e.ativo } };
  }

  /**
   * A pessoa abriu a aba: liga aquela análise nesta sessão e gera a primeira
   * versão na hora (com o que já foi falado). Responde quando ela fica pronta.
   */
  async ativar(sessaoId: string, parte: ParteAoVivo): Promise<AoVivo> {
    const e = this.estado(sessaoId);
    if (!e.ativo[parte]) {
      e.ativo[parte] = true;
      const config = await this.config.obter();
      const falas = await this.sessoes.falas(sessaoId);
      try {
        if (parte === 'resumo' && config.resumoAoVivo) await this.atualizarResumo(sessaoId, e, falas, 1);
        if (parte === 'insights' && config.insightsAoVivo) {
          this.avisosDeVoz(sessaoId, e, falas);
          await this.buscarInsights(sessaoId, e, falas, 1);
        }
      } catch (err) {
        this.log.warn(`primeira análise falhou: ${(err as Error).message}`);
      }
    }
    return this.obter(sessaoId);
  }

  private estado(sessaoId: string): Estado {
    const versao = this.sessoes.versao(sessaoId);
    let e = this.estados.get(sessaoId);
    // Transcrição limpa: o que foi analisado não vale mais.
    if (!e || e.versao !== versao) {
      if (e?.timer) clearTimeout(e.timer);
      e = {
        versao,
        resumo: null,
        resumoAteMs: -1,
        ultimoResumoEm: 0,
        insights: [],
        insightsAteMs: -1,
        ultimoInsightsEm: 0,
        avisosVoz: new Set(),
        rodando: false,
        timer: null,
        ativo: { resumo: false, insights: false },
      };
      this.estados.set(sessaoId, e);
    }
    return e;
  }

  private agendar(sessaoId: string): void {
    const e = this.estado(sessaoId);
    if (e.timer) return;
    e.timer = setTimeout(() => {
      e.timer = null;
      void this.rodar(sessaoId);
    }, 4000);
  }

  private async rodar(sessaoId: string): Promise<void> {
    const e = this.estado(sessaoId);
    if (e.rodando) return;
    e.rodando = true;
    try {
      const config = await this.config.obter();
      const falas = await this.sessoes.falas(sessaoId);
      if (e.ativo.insights) this.avisosDeVoz(sessaoId, e, falas);
      const agora = Date.now();
      if (e.ativo.resumo && config.resumoAoVivo && agora - e.ultimoResumoEm >= INTERVALO_RESUMO_MS) await this.atualizarResumo(sessaoId, e, falas);
      if (e.ativo.insights && config.insightsAoVivo && agora - e.ultimoInsightsEm >= INTERVALO_INSIGHTS_MS) await this.buscarInsights(sessaoId, e, falas);
    } catch (err) {
      this.log.warn(`análise ao vivo falhou: ${(err as Error).message}`);
    } finally {
      e.rodando = false;
    }
    // Se ainda tem fala nova esperando o intervalo, volta depois.
    if (this.sessoes.versao(sessaoId) === e.versao) {
      const falta = Math.min(INTERVALO_RESUMO_MS, INTERVALO_INSIGHTS_MS);
      e.timer ??= setTimeout(() => {
        e.timer = null;
        void this.rodarSeTemNovidade(sessaoId);
      }, falta);
    }
  }

  private async rodarSeTemNovidade(sessaoId: string): Promise<void> {
    const e = this.estado(sessaoId);
    const novas = await this.sessoes.falasApos(sessaoId, Math.min(e.resumoAteMs, e.insightsAteMs));
    if (novas.length) void this.rodar(sessaoId);
  }

  private async atualizarResumo(sessaoId: string, e: Estado, falas: Fala[], minimo = MIN_CHARS_RESUMO): Promise<void> {
    const novas = falas.filter((f) => f.inicioMs > e.resumoAteMs);
    if (!novas.length || tamanho(novas) < minimo) return;
    const versao = e.versao;
    let trecho = await this.sessoes.formatar(novas);
    if (trecho.length > 12_000) trecho = `(…)\n${trecho.slice(-12_000)}`;
    e.ultimoResumoEm = Date.now();
    const texto = await this.texto.gerar({
      origem: 'resumo_ao_vivo',
      sessaoId,
      maxTokens: 500,
      timeoutMs: 40_000,
      mensagens: [
        { papel: 'system', conteudo: PROMPT_RESUMO },
        {
          papel: 'user',
          conteudo: `${e.resumo ? `Resumo até agora:\n${e.resumo.texto}\n\nFalas novas:\n` : 'Falas:\n'}${trecho}\n\nDevolva o resumo atualizado.`,
        },
      ],
    });
    if (!texto || this.sessoes.versao(sessaoId) !== versao) return;
    e.resumo = { texto, em: Date.now() };
    e.resumoAteMs = novas[novas.length - 1]!.inicioMs;
    this.eventos.emitir({ tipo: 'sessao.aoVivo', sessaoId, resumo: e.resumo });
  }

  private async buscarInsights(sessaoId: string, e: Estado, falas: Fala[], minimo = MIN_CHARS_INSIGHTS): Promise<void> {
    const novas = falas.filter((f) => f.inicioMs > e.insightsAteMs);
    if (!novas.length || tamanho(novas) < minimo) return;
    const versao = e.versao;
    // Contexto: um pouco antes do que é novo, para o insight fazer sentido.
    const inicio = Math.max(0, falas.indexOf(novas[0]!) - 6);
    let trecho = await this.sessoes.formatar(falas.slice(inicio));
    if (trecho.length > 5000) trecho = `(…)\n${trecho.slice(-5000)}`;
    const dados = e.insights.slice(-8).map((i) => `- ${i.texto}`).join('\n');
    e.ultimoInsightsEm = Date.now();
    const bruto = await this.texto.gerar({
      origem: 'insights',
      sessaoId,
      maxTokens: 300,
      timeoutMs: 30_000,
      mensagens: [
        { papel: 'system', conteudo: PROMPT_INSIGHTS },
        { papel: 'user', conteudo: `${dados ? `Insights já dados:\n${dados}\n\n` : ''}Trecho recente da call:\n${trecho}` },
      ],
    });
    if (this.sessoes.versao(sessaoId) !== versao) return;
    e.insightsAteMs = novas[novas.length - 1]!.inicioMs;
    for (const i of lerInsights(bruto)) this.adicionar(sessaoId, e, i.tipo, i.texto);
  }

  /** Ritmo e tempo de fala: medidos aqui, sem gastar nada. Cada aviso sai uma vez por sessão. */
  private avisosDeVoz(sessaoId: string, e: Estado, falas: Fala[]): void {
    const config = this.config;
    void config.obter().then((c) => {
      if (!c.insightsAoVivo || !falas.length) return;
      const m = metricasVoz(falas);
      const duracao = falas[falas.length - 1]!.fimMs;
      if (duracao < MIN_TEMPO_VOZ_MS) return;
      const avisar = (chave: string, texto: string) => {
        if (e.avisosVoz.has(chave)) return;
        e.avisosVoz.add(chave);
        this.adicionar(sessaoId, e, 'voz', texto);
      };
      if (m.suaParte > PARTE_ALTA) avisar('parte', `Você está com ${Math.round(m.suaParte * 100)}% da fala. Faça uma pergunta e deixe o outro lado falar.`);
      if (m.seuRitmo && m.seuRitmo > RITMO_ALTO) avisar('ritmo', `Você está rápido (${Math.round(m.seuRitmo)} palavras/min). Respire e diminua um pouco.`);
      if (m.suaMaiorFala > FALA_LONGA_S) avisar('longa', `Teve uma fala sua de ${Math.round(m.suaMaiorFala)} s. Respostas mais curtas prendem mais a atenção.`);
    });
  }

  private adicionar(sessaoId: string, e: Estado, tipo: TipoInsight, texto: string): void {
    const insight: Insight = { id: novoId(), tipo, texto, em: Date.now() };
    e.insights = [...e.insights, insight].slice(-MAX_INSIGHTS);
    this.eventos.emitir({ tipo: 'sessao.aoVivo', sessaoId, insight });
  }
}

const tamanho = (falas: Pick<Fala, 'texto'>[]) => falas.reduce((n, f) => n + f.texto.length, 0);

export function metricasVoz(falas: Pick<Fala, 'canal' | 'texto' | 'inicioMs' | 'fimMs'>[]): MetricasVoz {
  let seu = 0;
  let outros = 0;
  let palavras = 0;
  let maior = 0;
  for (const f of falas) {
    const d = Math.max(0, f.fimMs - f.inicioMs);
    if (f.canal === 'microfone') {
      seu += d;
      palavras += f.texto.split(/\s+/).filter(Boolean).length;
      maior = Math.max(maior, d);
    } else {
      outros += d;
    }
  }
  return {
    suaParte: seu + outros ? seu / (seu + outros) : 0,
    seuRitmo: seu > 20_000 ? palavras / (seu / 60_000) : null,
    suaMaiorFala: maior / 1000,
  };
}

const TIPOS = new Set(['oportunidade', 'risco', 'voz', 'dica']);

/** Aceita o JSON mesmo com cerca de código ou texto em volta; qualquer coisa estranha vira lista vazia. */
export function lerInsights(bruto: string): Array<{ tipo: TipoInsight; texto: string }> {
  const inicio = bruto.indexOf('[');
  const fim = bruto.lastIndexOf(']');
  if (inicio < 0 || fim <= inicio) return [];
  try {
    const v: unknown = JSON.parse(bruto.slice(inicio, fim + 1));
    if (!Array.isArray(v)) return [];
    return v
      .filter((i): i is { tipo: string; texto: string } => !!i && typeof i.tipo === 'string' && typeof i.texto === 'string')
      .filter((i) => TIPOS.has(i.tipo) && i.texto.trim().length > 3)
      .slice(0, 2)
      .map((i) => ({ tipo: i.tipo as TipoInsight, texto: i.texto.trim().slice(0, 240) }));
  } catch {
    return [];
  }
}
