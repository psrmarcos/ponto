import { Injectable, Logger } from '@nestjs/common';
import type { CanalAudio } from '@ponto/shared';
import { ConfiguracoesService } from '../../configuracoes/configuracoes.service';
import { EventosService } from '../../eventos/eventos.service';
import { SegredosService } from '../../segredos/segredos.service';
import { SessoesService } from '../../sessoes/sessoes.service';
import { UsoService } from '../../uso/uso.service';
import { ehAlucinacao } from '../alucinacoes';
import { DeepgramAoVivo, USD_POR_MINUTO_STREAMING, USD_POR_MINUTO_STREAMING_MULTI } from './deepgram-ao-vivo';

interface Ligacao {
  sessaoId: string;
  canal: CanalAudio;
  dg: DeepgramAoVivo;
  modelo: string;
}

/**
 * Transcrição em streaming (hoje só Deepgram). A captura manda o áudio da fala
 * enquanto ela acontece; o texto provisório vai para as janelas na hora e a fala
 * fechada é gravada como qualquer outra. Se o streaming não estiver disponível,
 * a captura continua no modo em lote.
 */
@Injectable()
export class StreamingService {
  private readonly log = new Logger('Streaming');
  private readonly ligacoes = new Map<string, Ligacao>();

  constructor(
    private readonly config: ConfiguracoesService,
    private readonly segredos: SegredosService,
    private readonly sessoes: SessoesService,
    private readonly eventos: EventosService,
    private readonly uso: UsoService,
  ) {}

  /** Abre o streaming de um canal. Devolve o motivo quando não dá (a captura usa o lote). */
  async abrir(sessaoId: string, canal: CanalAudio): Promise<string | null> {
    const config = await this.config.obter();
    if (config.provedorStt !== 'deepgram') return 'O streaming só existe no Deepgram.';
    if (!config.sttStreaming) return 'Streaming desligado nas configurações.';
    const chave = this.segredos.obter('deepgram');
    if (!chave) return 'Sem chave do Deepgram.';
    const id = `${sessaoId}:${canal}`;
    this.fechar(id);
    const dg = new DeepgramAoVivo(chave, config, canal, {
      parcial: (texto, inicioMs) => this.eventos.emitir({ tipo: 'transcricao.parcial', sessaoId, canal, texto, inicioMs }),
      fala: (f) => void this.gravar(id, f),
      erro: (mensagem) => {
        this.log.warn(`${id}: ${mensagem}`);
        this.eventos.emitir({ tipo: 'transcricao.erro', sessaoId, mensagem });
      },
    });
    this.ligacoes.set(id, { sessaoId, canal, dg, modelo: config.modeloStt });
    return null;
  }

  audio(id: string, pcm: Buffer, sessaoMs: number): void {
    this.ligacoes.get(id)?.dg.audio(pcm, sessaoMs);
  }

  fechar(id: string): void {
    const l = this.ligacoes.get(id);
    if (!l) return;
    this.ligacoes.delete(id);
    l.dg.encerrar();
    // As últimas falas ainda chegam depois do CloseStream; cobra quando tudo fechou.
    setTimeout(() => void this.cobrar(l), 3500).unref();
  }

  /**
   * Fecha já as falas em andamento da sessão e espera elas virarem texto (até
   * `maxMs`). O chat chama antes de responder, para a pergunta entrar inteira.
   */
  async aguardar(sessaoId: string, maxMs: number): Promise<void> {
    const abertas = [...this.ligacoes.values()].filter((l) => l.sessaoId === sessaoId && l.dg.temFalaAberta());
    if (!abertas.length) return;
    abertas.forEach((l) => l.dg.finalizar());
    const limite = Date.now() + maxMs;
    while (Date.now() < limite && abertas.some((l) => l.dg.temFalaAberta())) {
      await new Promise((ok) => setTimeout(ok, 50));
    }
  }

  private async gravar(id: string, f: { texto: string; inicioMs: number; fimMs: number }): Promise<void> {
    const l = this.ligacoes.get(id) ?? null;
    const [sessaoId, canal] = id.split(':') as [string, CanalAudio];
    this.eventos.emitir({ tipo: 'transcricao.parcial', sessaoId, canal, texto: '', inicioMs: f.inicioMs });
    if (ehAlucinacao(f.texto, (f.fimMs - f.inicioMs) / 1000)) return;
    try {
      await this.sessoes.adicionarFala({ sessaoId, canal, texto: f.texto, inicioMs: f.inicioMs, fimMs: f.fimMs });
    } catch (e) {
      this.log.warn(`fala não gravada: ${(e as Error).message}`);
    }
    if (l) await this.cobrar(l);
  }

  private async cobrar(l: Ligacao): Promise<void> {
    const ms = l.dg.cobrar();
    if (ms <= 0) return;
    const porMinuto = l.dg.multi ? USD_POR_MINUTO_STREAMING_MULTI : USD_POR_MINUTO_STREAMING;
    await this.uso
      .registrar({
        provedor: 'deepgram',
        origem: 'transcricao',
        sessaoId: l.sessaoId,
        uso: { modelo: `${l.modelo} (streaming)`, tokensEntrada: 0, tokensSaida: 0, tokensCache: 0, custoUsd: (ms / 60_000) * porMinuto },
      })
      .catch(() => undefined);
  }
}
