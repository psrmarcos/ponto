import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { CanalAudio, Fala, Sessao } from '@ponto/shared';
import { novoId } from '../comum/id';
import { BANCO } from '../db/db.module';
import type { Banco } from '../db/conexao';
import { falas, sessoes } from '../db/schema';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';

/** Contexto da call que vai junto de cada pergunta ao chat: só o trecho recente, para gastar pouco. */
const MAX_CHARS_CONTEXTO = 6000;
const MAX_FALAS_CONTEXTO = 40;

@Injectable()
export class SessoesService {
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
    return { id, titulo, agenteId: agente, iniciadaEm: agora.getTime(), encerradaEm: null };
  }

  async obter(id: string): Promise<Sessao> {
    const [s] = await this.banco.select().from(sessoes).where(eq(sessoes.id, id));
    if (!s) throw new NotFoundException('Sessão não encontrada.');
    return { ...s, iniciadaEm: s.iniciadaEm.getTime(), encerradaEm: s.encerradaEm?.getTime() ?? null };
  }

  async encerrar(id: string): Promise<void> {
    await this.banco.update(sessoes).set({ encerradaEm: new Date() }).where(and(eq(sessoes.id, id)));
  }

  async falas(sessaoId: string): Promise<Fala[]> {
    return this.banco.select().from(falas).where(eq(falas.sessaoId, sessaoId)).orderBy(asc(falas.inicioMs));
  }

  async adicionarFala(dados: { sessaoId: string; canal: CanalAudio; texto: string; inicioMs: number; fimMs: number }): Promise<Fala> {
    const fala: Fala = { id: novoId(), falante: null, ...dados };
    await this.banco.insert(falas).values(fala);
    this.eventos.emitir({ tipo: 'transcricao.fala', fala });
    return fala;
  }

  /**
   * O fim da conversa em texto corrido, do mais antigo para o mais novo, cortado
   * por tamanho. Vai na mensagem do usuário (não no prefixo fixo), para não
   * quebrar o cache do provedor a cada fala nova.
   */
  async contextoRecente(sessaoId: string): Promise<string | null> {
    const ultimas = await this.banco
      .select({ canal: falas.canal, falante: falas.falante, texto: falas.texto })
      .from(falas)
      .where(eq(falas.sessaoId, sessaoId))
      .orderBy(desc(falas.inicioMs))
      .limit(MAX_FALAS_CONTEXTO);
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
