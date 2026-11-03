import { Injectable, Logger } from '@nestjs/common';
import type { PedidoChat, UsoIa } from '@ponto/shared';
import { ConfiguracoesService } from '../../configuracoes/configuracoes.service';
import { AgentesService } from '../../agentes/agentes.service';
import { EventosService } from '../../eventos/eventos.service';
import { UsoService } from '../../uso/uso.service';
import { SessoesService } from '../../sessoes/sessoes.service';
import { TranscricaoService } from '../../transcricao/transcricao.service';
import { ProvedoresService } from '../provedores/provedores.service';
import { ErroProvedor, type ProvedorIa } from '../provedores/provedor';
import { mensagemDoUsuario, montarMensagens, textoDoPedido, TROCAS_NO_HISTORICO, type TrocaAnterior } from './prompt';
import type { ResumoParcial } from '../../sessoes/sessoes.service';

/** Junta os pedacinhos do streaming e manda no máximo a cada N ms (menos mensagens, menos re-render). */
const INTERVALO_DELTA_MS = 40;
const MAX_TOKENS = 800;
const MAX_TOKENS_RACIOCINIO = 2500;
/** Quanto o chat espera por falas ainda em transcrição antes de responder. */
const ESPERA_TRANSCRICAO_MS = 1200;
/** Falas novas mandadas de uma vez, no máximo (o começo fica de fora; o resumo cobre). */
const MAX_CHARS_FALAS_NOVAS = 8000;
/** Passando disso de transcrição no histórico, troca a parte antiga pelo resumo do começo. */
const MAX_CHARS_TRANSCRICAO_HISTORICO = 9000;

/**
 * O que esta conversa já mandou da call. A transcrição vai em pedaços, só
 * acrescentando: cada pergunta leva as falas novas desde a anterior, e o
 * histórico guarda o que foi enviado. Assim o começo das mensagens não muda e o
 * provedor reaproveita o cache. Quando o acumulado fica grande, a parte antiga
 * vira o resumo do começo da call (uma troca de prefixo de vez em quando).
 */
interface CallNaConversa {
  sessaoId: string;
  versao: number;
  resumo: ResumoParcial | null;
  /** Início da última fala já enviada. */
  cursorMs: number;
}

interface Conversa {
  historico: TrocaAnterior[];
  gastoUsd: number;
  emAndamento: AbortController | null;
  call: CallNaConversa | null;
}

@Injectable()
export class ChatService {
  private readonly log = new Logger('Chat');
  private readonly conversas = new Map<string, Conversa>();

  constructor(
    private readonly config: ConfiguracoesService,
    private readonly agentes: AgentesService,
    private readonly provedores: ProvedoresService,
    private readonly eventos: EventosService,
    private readonly uso: UsoService,
    private readonly sessoes: SessoesService,
    private readonly transcricao: TranscricaoService,
  ) {}

  /** Começa a responder em segundo plano e devolve o id da resposta na hora. */
  /** `rotulo`: como a pergunta aparece no histórico salvo (ex.: a pergunta detectada na call). */
  async enviar(pedido: PedidoChat, opcoes: { rotulo?: string } = {}): Promise<{ respostaId: string }> {
    const { respostaId } = pedido;
    const conversa = this.conversa(pedido.conversaId);
    // Pergunta nova cancela a anterior da mesma conversa: não pagamos por resposta que ninguém vai ler.
    conversa.emAndamento?.abort();
    const controle = new AbortController();
    conversa.emAndamento = controle;
    void this.responder(pedido, respostaId, conversa, controle, opcoes.rotulo);
    return { respostaId };
  }

  /** Pela lista de modelos do provedor (em cache). Na dúvida, confia no modelo escolhido. */
  private async enxerga(provedor: ProvedorIa, modelo: string): Promise<boolean> {
    const lista = await provedor.listarModelos().catch(() => null);
    return lista?.find((m) => m.id === modelo)?.aceitaImagem ?? true;
  }

  /**
   * Falas que esta conversa ainda não mandou. Reinicia a parte da call (troca a
   * transcrição antiga do histórico pelo resumo do começo) quando a sessão mudou,
   * quando falas foram apagadas ou quando o acumulado ficou grande e já existe um
   * resumo mais novo. O cursor só anda quando a resposta termina.
   */
  private async falasNovas(conversa: Conversa, sessaoId: string): Promise<{ texto: string | null; cursorMs: number }> {
    const parcial = this.sessoes.resumoParcial(sessaoId);
    const versao = this.sessoes.versao(sessaoId);
    const noHistorico = conversa.historico.reduce((n, t) => n + t.charsTranscricao, 0);
    const atual = conversa.call;
    const resumoMaisNovo = !!parcial && parcial.ateMs > (atual?.resumo?.ateMs ?? -1);
    if (
      !atual ||
      atual.sessaoId !== sessaoId ||
      atual.versao !== versao ||
      (resumoMaisNovo && noHistorico > MAX_CHARS_TRANSCRICAO_HISTORICO)
    ) {
      conversa.historico = conversa.historico.map((t) => ({ ...t, pergunta: t.perguntaPura, charsTranscricao: 0 }));
      conversa.call = { sessaoId, versao, resumo: parcial, cursorMs: parcial?.ateMs ?? -1 };
    }
    const call = conversa.call!;
    const novas = await this.sessoes.falasApos(sessaoId, call.cursorMs);
    if (!novas.length) return { texto: null, cursorMs: call.cursorMs };
    const cursorMs = novas[novas.length - 1]!.inicioMs;
    let texto = await this.sessoes.formatar(novas);
    if (texto.length > MAX_CHARS_FALAS_NOVAS) {
      const corte = texto.indexOf('\n', texto.length - MAX_CHARS_FALAS_NOVAS);
      texto = `(…)\n${texto.slice(corte + 1)}`;
    }
    return { texto, cursorMs };
  }

  /** Guarda a troca para rever depois na sessão. Falhar aqui não pode estragar a resposta. */
  private async guardar(pedido: PedidoChat, pergunta: string, resposta: string, uso: UsoIa | null): Promise<void> {
    const automatica = pedido.conversaId.startsWith('auto:');
    const base = { sessaoId: pedido.sessaoId ?? null, conversaId: pedido.conversaId, automatica };
    const comImagem = pedido.imagens.length ? `🖼 ${pedido.imagens.length} imagem(ns)\n` : '';
    try {
      await this.sessoes.salvarMensagem({ ...base, papel: 'eu', texto: comImagem + pergunta, modelo: null, custoUsd: null });
      await this.sessoes.salvarMensagem({ ...base, papel: 'ia', texto: resposta, modelo: uso?.modelo ?? null, custoUsd: uso?.custoUsd ?? null });
    } catch (e) {
      this.log.warn(`não guardou a conversa: ${(e as Error).message}`);
    }
  }

  cancelar(conversaId: string): void {
    this.conversas.get(conversaId)?.emAndamento?.abort();
  }

  private conversa(id: string): Conversa {
    let c = this.conversas.get(id);
    if (!c) {
      c = { historico: [], gastoUsd: 0, emAndamento: null, call: null };
      this.conversas.set(id, c);
    }
    return c;
  }

  private async responder(pedido: PedidoChat, respostaId: string, conversa: Conversa, controle: AbortController, rotulo?: string) {
    let acumulado = '';
    let pendente = '';
    let timer: NodeJS.Timeout | null = null;
    const despejar = () => {
      timer = null;
      if (!pendente) return;
      this.eventos.emitir({ tipo: 'chat.delta', respostaId, texto: pendente });
      pendente = '';
    };

    try {
      const config = await this.config.obter();
      if (config.tetoSessaoUsd > 0 && conversa.gastoUsd >= config.tetoSessaoUsd) {
        throw new ErroProvedor(
          `Teto de gasto desta conversa atingido (US$ ${config.tetoSessaoUsd.toFixed(2)}). Ajuste em Configurações.`,
        );
      }
      const agente = await this.agentes.obter(pedido.agenteId).catch(() => this.agentes.obter('geral'));
      const provedor = this.provedores.obter(config.provedorPadrao);
      let modelo = agente.modelo ?? config.modeloPadrao;
      // Com imagem (print da tela, anexo), troca para o modelo de visão se o escolhido não enxerga.
      if (pedido.imagens.length && !(await this.enxerga(provedor, modelo))) modelo = config.modeloVisao;
      // A última fala (normalmente a pergunta) pode estar a 1-2 s de virar texto: espera no máximo 1,2 s por ela e segue sem (rapidez vale mais).
      if (pedido.sessaoId) await this.transcricao.aguardarPendentes(pedido.sessaoId, ESPERA_TRANSCRICAO_MS);
      const call = pedido.sessaoId ? await this.falasNovas(conversa, pedido.sessaoId).catch(() => null) : null;
      const mensagens = montarMensagens({
        agente,
        config,
        historico: conversa.historico,
        pedido,
        transcricao: call?.texto,
        resumoCall: conversa.call?.resumo?.texto,
      });

      this.eventos.emitir({ tipo: 'chat.inicio', conversaId: pedido.conversaId, respostaId, modelo });

      let uso: UsoIa | null = null;
      for await (const p of provedor.gerar(
        {
          modelo,
          mensagens,
          web: pedido.web,
          raciocinio: pedido.raciocinio,
          maxTokens: pedido.raciocinio ? MAX_TOKENS_RACIOCINIO : MAX_TOKENS,
        },
        controle.signal,
      )) {
        if (p.tipo === 'texto') {
          acumulado += p.texto;
          pendente += p.texto;
          timer ??= setTimeout(despejar, INTERVALO_DELTA_MS);
        } else {
          uso = p.uso;
        }
      }
      if (timer) clearTimeout(timer);
      despejar();

      const perguntaPura = textoDoPedido(pedido);
      conversa.historico.push({
        pergunta: mensagemDoUsuario(perguntaPura, call?.texto),
        perguntaPura,
        resposta: acumulado,
        charsTranscricao: call?.texto?.length ?? 0,
      });
      if (call && conversa.call) conversa.call.cursorMs = call.cursorMs;
      if (conversa.historico.length > TROCAS_NO_HISTORICO * 2) {
        conversa.historico.splice(0, TROCAS_NO_HISTORICO);
        // As falas que estavam nas trocas descartadas voltam pelo resumo + falas desde ele.
        conversa.call = null;
      }
      if (uso) {
        conversa.gastoUsd += uso.custoUsd;
        await this.uso.registrar({ provedor: provedor.id, origem: 'chat', sessaoId: pedido.sessaoId ?? null, uso });
      }
      this.eventos.emitir({ tipo: 'chat.fim', respostaId, uso });
      await this.guardar(pedido, rotulo ?? perguntaPura, acumulado, uso);
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (controle.signal.aborted) {
        // Cancelada por uma pergunta nova: fecha a resposta com o que já chegou.
        despejar();
        this.eventos.emitir({ tipo: 'chat.fim', respostaId, uso: null });
        return;
      }
      const causa = (e as { cause?: { code?: string } } | null)?.cause?.code;
      this.log.warn(`falhou: ${(e as Error)?.message}${causa ? ` (${causa})` : ''}`);
      const mensagem =
        e instanceof ErroProvedor
          ? e.message
          : e instanceof TypeError || causa
            ? 'Não consegui falar com o provedor de IA. Verifique a internet e tente de novo.'
            : e instanceof Error
              ? e.message
              : 'Erro inesperado.';
      this.eventos.emitir({ tipo: 'chat.erro', respostaId, mensagem });
    } finally {
      if (conversa.emAndamento === controle) conversa.emAndamento = null;
    }
  }
}
