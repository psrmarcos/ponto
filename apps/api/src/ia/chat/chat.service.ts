import { Injectable, Logger } from '@nestjs/common';
import type { PedidoChat, UsoIa } from '@ponto/shared';
import { ConfiguracoesService } from '../../configuracoes/configuracoes.service';
import { AgentesService } from '../../agentes/agentes.service';
import { EventosService } from '../../eventos/eventos.service';
import { UsoService } from '../../uso/uso.service';
import { ProvedoresService } from '../provedores/provedores.service';
import { ErroProvedor } from '../provedores/provedor';
import { montarMensagens, textoDoPedido, TROCAS_NO_HISTORICO, type TrocaAnterior } from './prompt';

/** Junta os pedacinhos do streaming e manda no máximo a cada N ms (menos mensagens, menos re-render). */
const INTERVALO_DELTA_MS = 40;
const MAX_TOKENS = 800;
const MAX_TOKENS_RACIOCINIO = 2500;

interface Conversa {
  historico: TrocaAnterior[];
  gastoUsd: number;
  emAndamento: AbortController | null;
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
  ) {}

  /** Começa a responder em segundo plano e devolve o id da resposta na hora. */
  async enviar(pedido: PedidoChat): Promise<{ respostaId: string }> {
    const { respostaId } = pedido;
    const conversa = this.conversa(pedido.conversaId);
    // Pergunta nova cancela a anterior da mesma conversa: não pagamos por resposta que ninguém vai ler.
    conversa.emAndamento?.abort();
    const controle = new AbortController();
    conversa.emAndamento = controle;
    void this.responder(pedido, respostaId, conversa, controle);
    return { respostaId };
  }

  cancelar(conversaId: string): void {
    this.conversas.get(conversaId)?.emAndamento?.abort();
  }

  private conversa(id: string): Conversa {
    let c = this.conversas.get(id);
    if (!c) {
      c = { historico: [], gastoUsd: 0, emAndamento: null };
      this.conversas.set(id, c);
    }
    return c;
  }

  private async responder(pedido: PedidoChat, respostaId: string, conversa: Conversa, controle: AbortController) {
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
      const modelo = agente.modelo ?? config.modeloPadrao;
      const provedor = this.provedores.obter(config.provedorPadrao);
      const mensagens = montarMensagens({ agente, config, historico: conversa.historico, pedido });

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

      conversa.historico.push({ pergunta: textoDoPedido(pedido), resposta: acumulado });
      if (conversa.historico.length > TROCAS_NO_HISTORICO * 2) conversa.historico.splice(0, TROCAS_NO_HISTORICO);
      if (uso) {
        conversa.gastoUsd += uso.custoUsd;
        await this.uso.registrar({ provedor: provedor.id, origem: 'chat', uso });
      }
      this.eventos.emitir({ tipo: 'chat.fim', respostaId, uso });
    } catch (e) {
      if (timer) clearTimeout(timer);
      if (controle.signal.aborted) {
        // Cancelada por uma pergunta nova: fecha a resposta com o que já chegou.
        despejar();
        this.eventos.emitir({ tipo: 'chat.fim', respostaId, uso: null });
        return;
      }
      const mensagem = e instanceof ErroProvedor || e instanceof Error ? e.message : 'Erro inesperado.';
      this.log.warn(`falhou: ${mensagem}`);
      this.eventos.emitir({ tipo: 'chat.erro', respostaId, mensagem });
    } finally {
      if (conversa.emAndamento === controle) conversa.emAndamento = null;
    }
  }
}
