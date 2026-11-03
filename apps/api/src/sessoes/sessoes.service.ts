import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, lte, max, sql, sum } from 'drizzle-orm';
import type { CanalAudio, Fala, GastoPorOrigem, MensagemSalva, Sessao, SessaoNaLista } from '@ponto/shared';
import { novoId } from '../comum/id';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { falas, mensagensChat, sessoes, usoIa } from '../db/schema';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';

/** Contexto da call que vai junto de cada pergunta ao chat: só o trecho recente, para gastar pouco. */
const MAX_CHARS_CONTEXTO = 6000;
const MAX_FALAS_CONTEXTO = 40;

/** Resumo do começo da call, para o chat não reenviar a transcrição inteira. Fica só em memória. */
export interface ResumoParcial {
  texto: string;
  /** Falas com início até aqui estão cobertas pelo resumo. */
  ateMs: number;
}

@Injectable()
export class SessoesService {
  private readonly ouvintesFala = new Set<(f: Fala) => void>();
  private readonly ouvintesEncerrar = new Set<(sessaoId: string) => void>();
  private readonly parciais = new Map<string, ResumoParcial>();
  /** Muda quando falas são apagadas: quem guardou transcrição antiga sabe que precisa descartar. */
  private readonly versoes = new Map<string, number>();
  /** Sessões com ata sendo gerada agora (para a lista mostrar). */
  readonly gerandoResumo = new Set<string>();

  aoEncerrar(fn: (sessaoId: string) => void): () => void {
    this.ouvintesEncerrar.add(fn);
    return () => this.ouvintesEncerrar.delete(fn);
  }

  resumoParcial(sessaoId: string): ResumoParcial | null {
    return this.parciais.get(sessaoId) ?? null;
  }

  definirResumoParcial(sessaoId: string, r: ResumoParcial): void {
    this.parciais.set(sessaoId, r);
  }

  versao(sessaoId: string): number {
    return this.versoes.get(sessaoId) ?? 0;
  }

  /** Avisa quem precisa reagir a cada fala nova (ex.: sugestões automáticas). */
  aoNovaFala(fn: (f: Fala) => void): () => void {
    this.ouvintesFala.add(fn);
    return () => this.ouvintesFala.delete(fn);
  }

  constructor(
    @Inject(BANCO) private readonly banco: Banco,
    private readonly config: ConfiguracoesService,
    private readonly eventos: EventosService,
  ) {}

  async criar(agenteId?: string): Promise<Sessao> {
    const agente = agenteId ?? (await this.config.obter()).agenteAtivo;
    const agora = new Date();
    const titulo = `Sessão de ${agora.toLocaleDateString('pt-BR')} ${agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
    const id = novoId();
    await this.banco.insert(sessoes).values({ id, titulo, agenteId: agente, iniciadaEm: agora });
    return { id, titulo, agenteId: agente, iniciadaEm: agora.getTime(), encerradaEm: null, resumo: null };
  }

  async listar(limite = 100): Promise<SessaoNaLista[]> {
    const linhas = await this.banco
      .select({
        id: sessoes.id,
        titulo: sessoes.titulo,
        agenteId: sessoes.agenteId,
        iniciadaEm: sessoes.iniciadaEm,
        encerradaEm: sessoes.encerradaEm,
        resumo: sessoes.resumo,
        totalFalas: count(falas.id),
        fim: max(falas.fimMs),
      })
      .from(sessoes)
      .leftJoin(falas, eq(falas.sessaoId, sessoes.id))
      .groupBy(sessoes.id)
      .orderBy(desc(sessoes.iniciadaEm))
      .limit(limite);
    const ids = linhas.map((l) => l.id);
    const gastos = ids.length
      ? await this.banco
          .select({ sessaoId: usoIa.sessaoId, custo: sum(usoIa.custoUsd) })
          .from(usoIa)
          .where(inArray(usoIa.sessaoId, ids))
          .groupBy(usoIa.sessaoId)
      : [];
    const custoPor = new Map(gastos.map((g) => [g.sessaoId, Number(g.custo ?? 0)]));
    return linhas
      .filter((l) => l.totalFalas > 0 || l.resumo)
      .map((l) => ({
        custoUsd: custoPor.get(l.id) ?? 0,
        id: l.id,
        titulo: l.titulo,
        agenteId: l.agenteId,
        iniciadaEm: l.iniciadaEm.getTime(),
        encerradaEm: l.encerradaEm?.getTime() ?? null,
        totalFalas: l.totalFalas,
        duracaoMs: l.fim ?? 0,
        temResumo: !!l.resumo,
        gerandoResumo: this.gerandoResumo.has(l.id),
      }));
  }

  /** Quanto a sessão gastou, separado por tipo de uso. */
  async gastos(sessaoId: string): Promise<GastoPorOrigem[]> {
    const linhas = await this.banco
      .select({
        origem: usoIa.origem,
        custo: sum(usoIa.custoUsd),
        chamadas: count(usoIa.id),
        tokens: sql<number>`sum(${usoIa.tokensEntrada} + ${usoIa.tokensSaida})`,
      })
      .from(usoIa)
      .where(eq(usoIa.sessaoId, sessaoId))
      .groupBy(usoIa.origem);
    return linhas
      .map((l) => ({ origem: l.origem, custoUsd: Number(l.custo ?? 0), chamadas: l.chamadas, tokens: Number(l.tokens ?? 0) }))
      .sort((a, b) => b.custoUsd - a.custoUsd);
  }

  async salvarMensagem(m: Omit<MensagemSalva, 'id' | 'criadoEm'> & { sessaoId: string | null }): Promise<void> {
    await this.banco.insert(mensagensChat).values({ id: novoId(), criadoEm: new Date(), ...m });
  }

  async conversa(sessaoId: string): Promise<MensagemSalva[]> {
    const linhas = await this.banco
      .select()
      .from(mensagensChat)
      .where(eq(mensagensChat.sessaoId, sessaoId))
      .orderBy(asc(mensagensChat.criadoEm));
    return linhas.map(({ sessaoId: _s, criadoEm, ...m }) => ({ ...m, criadoEm: criadoEm.getTime() }));
  }

  async renomear(id: string, titulo: string): Promise<void> {
    await this.banco.update(sessoes).set({ titulo }).where(eq(sessoes.id, id));
  }

  async salvarResumo(id: string, resumo: string, titulo?: string): Promise<void> {
    await this.banco.update(sessoes).set(titulo ? { resumo, titulo } : { resumo }).where(eq(sessoes.id, id));
  }

  async apagar(id: string): Promise<void> {
    await this.banco.delete(sessoes).where(eq(sessoes.id, id));
    this.parciais.delete(id);
  }

  /** Falas depois de `aposMs` (início), em ordem. */
  async falasApos(sessaoId: string, aposMs: number): Promise<Fala[]> {
    return this.banco
      .select()
      .from(falas)
      .where(and(eq(falas.sessaoId, sessaoId), gt(falas.inicioMs, aposMs)))
      .orderBy(asc(falas.inicioMs));
  }

  /** "[Marcos] texto" por linha, com o nome configurado para o microfone. */
  async formatar(lista: Pick<Fala, 'canal' | 'falante' | 'texto'>[]): Promise<string> {
    const { nomeUsuario } = await this.config.obter();
    return lista.map((f) => `[${f.falante ?? (f.canal === 'microfone' ? nomeUsuario || 'Você' : 'Participante')}] ${f.texto}`).join('\n');
  }

  async obter(id: string): Promise<Sessao> {
    const [s] = await this.banco.select().from(sessoes).where(eq(sessoes.id, id));
    if (!s) throw new NotFoundException('Sessão não encontrada.');
    return { ...s, iniciadaEm: s.iniciadaEm.getTime(), encerradaEm: s.encerradaEm?.getTime() ?? null, resumo: s.resumo ?? null };
  }

  async encerrar(id: string): Promise<void> {
    await this.banco.update(sessoes).set({ encerradaEm: new Date() }).where(and(eq(sessoes.id, id)));
    this.ouvintesEncerrar.forEach((fn) => fn(id));
  }

  async falas(sessaoId: string): Promise<Fala[]> {
    return this.banco.select().from(falas).where(eq(falas.sessaoId, sessaoId)).orderBy(asc(falas.inicioMs));
  }

  /**
   * Apaga as falas da sessão até `ateMs` (início da fala). O limite protege as
   * falas que chegaram depois de a pessoa pedir para limpar.
   */
  async limparFalas(sessaoId: string, ateMs: number): Promise<void> {
    await this.banco.delete(falas).where(and(eq(falas.sessaoId, sessaoId), lte(falas.inicioMs, ateMs)));
    // O resumo do começo e a transcrição guardada nas conversas falavam do que foi apagado.
    this.parciais.delete(sessaoId);
    this.versoes.set(sessaoId, this.versao(sessaoId) + 1);
    this.eventos.emitir({ tipo: 'transcricao.limpa', sessaoId, ateMs });
  }

  async adicionarFala(dados: { sessaoId: string; canal: CanalAudio; texto: string; inicioMs: number; fimMs: number }): Promise<Fala> {
    const fala: Fala = { id: novoId(), falante: null, ...dados };
    await this.banco.insert(falas).values(fala);
    this.eventos.emitir({ tipo: 'transcricao.fala', fala });
    this.ouvintesFala.forEach((fn) => fn(fala));
    return fala;
  }

  /**
   * O fim da conversa em texto corrido, do mais antigo para o mais novo, cortado
   * por tamanho. Vai na mensagem do usuário (não no prefixo fixo), para não
   * quebrar o cache do provedor a cada fala nova.
   */
  async contextoRecente(sessaoId: string, maxFalas = MAX_FALAS_CONTEXTO): Promise<string | null> {
    const ultimas = await this.banco
      .select({ canal: falas.canal, falante: falas.falante, texto: falas.texto })
      .from(falas)
      .where(eq(falas.sessaoId, sessaoId))
      .orderBy(desc(falas.inicioMs))
      .limit(maxFalas);
    if (!ultimas.length) return null;
    const { nomeUsuario } = await this.config.obter();
    const linhas: string[] = [];
    let total = 0;
    for (const f of ultimas) {
      const quem = f.falante ?? (f.canal === 'microfone' ? nomeUsuario || 'Você' : 'Participante');
      const linha = `[${quem}] ${f.texto}`;
      if (total + linha.length > MAX_CHARS_CONTEXTO) break;
      linhas.push(linha);
      total += linha.length + 1;
    }
    return linhas.reverse().join('\n');
  }
}
