import { Injectable, Logger } from '@nestjs/common';
import type { IdProvedorStt, TrechoAudio } from '@ponto/shared';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { EventosService } from '../eventos/eventos.service';
import { SessoesService } from '../sessoes/sessoes.service';
import { UsoService } from '../uso/uso.service';
import { ehAlucinacao } from './alucinacoes';
import { DeepgramStt } from './stt/deepgram-stt';
import { OpenRouterStt } from './stt/openrouter-stt';
import { ErroStt, type ProvedorStt } from './stt/provedor-stt';

/** Bytes por segundo de WAV 16 kHz, 16 bits, mono. */
const BYTES_POR_SEGUNDO = 32_000;
/** Trechos transcrevendo ao mesmo tempo. Os outros esperam na fila, em ordem. */
const EM_PARALELO = 3;
const TEMPO_LIMITE_MS = 45_000;
/** Não repete o mesmo aviso de erro mais de uma vez nesse intervalo. */
const INTERVALO_AVISO_MS = 15_000;

interface Tarefa {
  trecho: TrechoAudio;
  wav: Buffer;
}

/**
 * Recebe cada fala já cortada pela janela de captura, manda para o STT e grava
 * o texto. As falas chegam em paralelo (você e o outro falando), então podem
 * terminar fora de ordem; a tela ordena pelo início.
 */
@Injectable()
export class TranscricaoService {
  private readonly log = new Logger('Transcricao');
  private readonly fila: Tarefa[] = [];
  private ativos = 0;
  private ultimoAviso = new Map<string, number>();
  private readonly provedores: Record<IdProvedorStt, ProvedorStt>;

  constructor(
    private readonly config: ConfiguracoesService,
    private readonly sessoes: SessoesService,
    private readonly eventos: EventosService,
    private readonly uso: UsoService,
    openrouter: OpenRouterStt,
    deepgram: DeepgramStt,
  ) {
    this.provedores = { openrouter, deepgram };
  }

  enfileirar(trecho: TrechoAudio, wav: Buffer): void {
    this.fila.push({ trecho, wav });
    this.puxar();
  }

  private puxar(): void {
    while (this.ativos < EM_PARALELO && this.fila.length) {
      const t = this.fila.shift()!;
      this.ativos++;
      void this.processar(t).finally(() => {
        this.ativos--;
        this.puxar();
      });
    }
  }

  private async processar({ trecho, wav }: Tarefa): Promise<void> {
    const config = await this.config.obter();
    const provedor = this.provedores[config.provedorStt];
    const duracaoS = (wav.length - 44) / BYTES_POR_SEGUNDO;
    try {
      const r = await provedor.transcrever(
        { wav, modelo: config.modeloStt, idioma: config.idioma, duracaoS },
        AbortSignal.timeout(TEMPO_LIMITE_MS),
      );
      if (r.custoUsd > 0) {
        await this.uso.registrar({
          provedor: provedor.id,
          origem: 'transcricao',
          sessaoId: trecho.sessaoId,
          uso: { modelo: config.modeloStt, tokensEntrada: 0, tokensSaida: 0, tokensCache: 0, custoUsd: r.custoUsd },
        });
      }
      const texto = r.texto.trim();
      if (ehAlucinacao(texto, duracaoS)) return;
      await this.sessoes.adicionarFala({ ...trecho, texto });
    } catch (e) {
      const causa = (e as { cause?: { code?: string } }).cause?.code;
      this.log.warn(`falhou (${trecho.canal}, ${duracaoS.toFixed(1)} s): ${(e as Error).message}${causa ? ` (${causa})` : ''}`);
      const mensagem =
        e instanceof ErroStt
          ? e.message
          : (e as Error).name === 'TimeoutError'
            ? 'A transcrição demorou demais e um trecho ficou de fora.'
            : 'Não consegui falar com o serviço de transcrição. Verifique a internet.';
      this.avisar(trecho.sessaoId, mensagem);
    }
  }

  private avisar(sessaoId: string, mensagem: string): void {
    const agora = Date.now();
    if (agora - (this.ultimoAviso.get(mensagem) ?? 0) < INTERVALO_AVISO_MS) return;
    this.ultimoAviso.set(mensagem, agora);
    this.eventos.emitir({ tipo: 'transcricao.erro', sessaoId, mensagem });
  }
}
