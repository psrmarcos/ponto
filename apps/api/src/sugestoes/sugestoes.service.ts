import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import type { Fala } from '@ponto/shared';
import { novoId } from '../comum/id';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';
import { ChatService } from '../ia/chat/chat.service';
import { SessoesService } from '../sessoes/sessoes.service';
import { JevService } from './jev.service';

/** Acima disso o Jev tem certeza o bastante para gastarmos uma resposta. */
export const LIMIAR_PERGUNTA = 0.85;
/** Falas curtas demais ("né?", "hum") não viram sugestão. */
const MIN_PALAVRAS = 3;
const FALAS_NO_ESTADO = 6;

/**
 * Sugestões automáticas: quando alguém faz uma pergunta para você, a resposta
 * começa a ser gerada antes de você clicar em nada.
 *
 * Cada fala nova dos outros passa pelo Jev (barato e rápido). Só quando ele diz
 * que é uma pergunta para você é que o modelo grande é chamado, como se você
 * tivesse clicado em "O que devo dizer?". Uma pergunta nova cancela a sugestão
 * anterior que ainda estava sendo escrita.
 */
@Injectable()
export class SugestoesService implements OnModuleInit {
  private readonly log = new Logger('Sugestoes');

  constructor(
    private readonly config: ConfiguracoesService,
    private readonly sessoes: SessoesService,
    private readonly chat: ChatService,
    private readonly eventos: EventosService,
    private readonly jev: JevService,
  ) {}

  onModuleInit(): void {
    this.sessoes.aoNovaFala((f) => void this.avaliar(f));
  }

  private async avaliar(f: Fala): Promise<void> {
    if (f.canal !== 'sistema') return;
    if (f.texto.trim().split(/\s+/).length < MIN_PALAVRAS) return;
    const config = await this.config.obter();
    if (!config.sugestoesAutomaticas) return;

    const contexto = await this.sessoes.contextoRecente(f.sessaoId, FALAS_NO_ESTADO);
    const estado = `Conversa ao vivo. O usuário é ${config.nomeUsuario || 'a pessoa que usa o app'}. Últimas falas:\n${contexto ?? ''}`;
    const p = await this.jev.perguntaParaMim(estado, f.sessaoId);
    // Sem o Jev (fora do ar, sem chave): só sugere quando a fala termina com interrogação.
    const ehPergunta = p === null ? /\?\s*$/.test(f.texto) : p >= LIMIAR_PERGUNTA;
    this.log.log(`"${f.texto.slice(0, 60)}" → ${p === null ? 'sem Jev' : p.toFixed(2)}${ehPergunta ? ' (sugere)' : ''}`);
    if (!ehPergunta) return;

    const respostaId = novoId();
    this.eventos.emitir({ tipo: 'sugestao.nova', sessaoId: f.sessaoId, respostaId, pergunta: f.texto });
    await this.chat.enviar({
      conversaId: `auto:${f.sessaoId}`,
      respostaId,
      texto: '',
      atalho: 'oQueDizer',
      agenteId: config.agenteAtivo,
      web: false,
      raciocinio: false,
      imagens: [],
      sessaoId: f.sessaoId,
    }, { rotulo: `Te perguntaram: ${f.texto}` });
  }
}
