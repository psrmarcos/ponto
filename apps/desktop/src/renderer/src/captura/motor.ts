import {
  ESTADO_CAPTURA_INICIAL,
  type CanalAudio,
  type ComandoCaptura,
  type Configuracoes,
  type EstadoCaptura,
  type Sessao,
} from '@ponto/shared';
import { api } from '../api/cliente';
import { StreamCanal } from './aoVivo';
import { DetectorFala, MS_QUADRO, type TrechoFala } from './vad';
import { paraWav } from './wav';

/**
 * Motor da captura. Roda só na janela invisível de captura.
 *
 * Microfone e áudio do sistema viram dois canais independentes, cada um com o
 * seu detector de fala. Cada fala cortada vai para a API como WAV; a API
 * transcreve e avisa todas as janelas pelo WebSocket.
 */

const INTERVALO_NIVEIS_MS = 100;
/**
 * Sem fone, o microfone escuta o alto-falante e a fala do outro volta como se
 * fosse sua. Uma fala do microfone que acontece na maior parte (70%+ do tempo) enquanto o
 * áudio do sistema também tem fala é tratada como eco e descartada.
 */
const LIMITE_ECO = 0.7;
const GUARDAR_ECO_MS = 60_000;
const URL_COLETOR = new URL('./coletor.worklet.js', document.baseURI).href;

interface Canal {
  id: CanalAudio;
  stream: MediaStream;
  fonte: MediaStreamAudioSourceNode;
  no: AudioWorkletNode;
  detector: DetectorFala;
  /** Quadros recebidos desde o início da sessão: é o relógio do canal. */
  quadros: number;
  /** Onde este canal começou, em ms da sessão. */
  baseMs: number;
  /** Streaming (Deepgram). Enquanto estiver de pé, as falas não vão em lote. */
  aoVivo: StreamCanal | null;
}

class MotorCaptura {
  private estado: EstadoCaptura = ESTADO_CAPTURA_INICIAL;
  private ctx: AudioContext | null = null;
  private canais: Canal[] = [];
  private sessao: Sessao | null = null;
  private timerNiveis: ReturnType<typeof setInterval> | null = null;
  /** Os comandos rodam um de cada vez (iniciar e parar logo em seguida não se atropelam). */
  private fila: Promise<void> = Promise.resolve();
  /** Quadros (índice de 20 ms da sessão) em que o áudio do sistema estava com fala. */
  private falaSistema = new Set<number>();
  private streaming: { ws: string; token: string } | null = null;

  /** Deepgram com streaming ligado: abre um stream por canal; senão, tudo em lote. */
  private async querStreaming(): Promise<{ ws: string; token: string } | null> {
    try {
      const config = await api.get<Configuracoes>('/configuracoes');
      if (config.provedorStt !== 'deepgram' || !config.sttStreaming) return null;
      const c = await window.ponto.invocar('api.conexao');
      return c ? { ws: c.ws, token: c.token } : null;
    } catch {
      return null;
    }
  }

  comandar(c: ComandoCaptura): void {
    this.fila = this.fila.then(() => this.executar(c)).catch((e: unknown) => {
      console.error(e);
      this.publicar({ erro: (e as Error).message });
    });
  }

  private async executar({ acao }: ComandoCaptura): Promise<void> {
    if (acao === 'iniciar') return this.iniciar();
    if (acao === 'pausar') return this.pausar();
    if (acao === 'retomar') return this.retomar();
    return this.parar();
  }

  private async iniciar(): Promise<void> {
    if (this.estado.status !== 'parada') return;
    this.publicar({ ...ESTADO_CAPTURA_INICIAL, status: 'iniciando' });

    const sessao = await api.post<Sessao>('/sessoes', {});
    this.sessao = sessao;
    this.streaming = await this.querStreaming();
    // Pedimos 16 kHz direto: o Chromium reamostra com filtro de qualidade, melhor que fazer na mão.
    // Se a placa não aceitar, o coletor reamostra a partir da taxa nativa.
    const ctx = criarContexto();
    this.ctx = ctx;
    await ctx.audioWorklet.addModule(URL_COLETOR);

    const problemas: string[] = [];
    const mic = await navigator.mediaDevices
      .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } })
      .catch((e: unknown) => {
        problemas.push(nomeErro(e, 'microfone'));
        return null;
      });
    const sistema = await this.capturarSistema().catch((e: unknown) => {
      problemas.push(nomeErro(e, 'áudio do computador'));
      return null;
    });

    if (mic) this.canais.push(this.criarCanal(ctx, 'microfone', mic));
    if (sistema) this.canais.push(this.criarCanal(ctx, 'sistema', sistema));
    if (!this.canais.length) {
      await this.desmontar();
      await api.post(`/sessoes/${sessao.id}/encerrar`).catch(() => {});
      this.sessao = null;
      this.publicar({ ...ESTADO_CAPTURA_INICIAL, erro: problemas.join(' ') || 'Nenhuma fonte de áudio disponível.' });
      return;
    }

    this.timerNiveis = setInterval(() => {
      const nivel = (id: CanalAudio) => this.canais.find((c) => c.id === id)?.detector.nivel ?? 0;
      const pausado = this.estado.status === 'pausada';
      window.ponto.enviar('captura.niveis', { microfone: pausado ? 0 : nivel('microfone'), sistema: pausado ? 0 : nivel('sistema') });
    }, INTERVALO_NIVEIS_MS);

    this.publicar({
      status: 'gravando',
      sessaoId: sessao.id,
      iniciadaEm: sessao.iniciadaEm,
      fontes: { microfone: !!mic, sistema: !!sistema },
      erro: problemas.length ? problemas.join(' ') : null,
    });
  }

  /** Áudio do sistema pelo getDisplayMedia: o main responde com a tela e o loopback, sem seletor. */
  private async capturarSistema(): Promise<MediaStream | null> {
    const s = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    s.getVideoTracks().forEach((t) => t.stop());
    if (!s.getAudioTracks().length) throw new Error('sem-audio');
    return new MediaStream(s.getAudioTracks());
  }

  private criarCanal(ctx: AudioContext, id: CanalAudio, stream: MediaStream): Canal {
    const fonte = ctx.createMediaStreamSource(stream);
    const no = new AudioWorkletNode(ctx, 'ponto-coletor', { numberOfInputs: 1, numberOfOutputs: 0 });
    const baseMs = this.sessao ? Math.max(0, Date.now() - this.sessao.iniciadaEm) : 0;
    const aoVivo = this.streaming && this.sessao ? new StreamCanal(this.streaming.ws, this.streaming.token, this.sessao.id, id) : null;
    const canal: Canal = { id, stream, fonte, no, detector: new DetectorFala(), quadros: 0, baseMs, aoVivo };
    no.port.onmessage = (m: MessageEvent<Float32Array>) => this.receberQuadro(canal, m.data);
    fonte.connect(no);
    // Fone desconectado, permissão revogada etc.
    stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      const fontes = { ...this.estado.fontes, [id]: false };
      this.publicar({ fontes, erro: id === 'microfone' ? 'O microfone parou de responder.' : 'O áudio do computador parou de chegar.' });
    });
    return canal;
  }

  private receberQuadro(canal: Canal, quadro: Float32Array): void {
    const tMs = canal.baseMs + canal.quadros * MS_QUADRO;
    canal.quadros++;
    if (this.estado.status !== 'gravando') return;
    const trecho = canal.detector.processar(quadro, tMs);
    if (canal.id === 'sistema' && canal.detector.emFala) this.marcarFalaSistema(tMs);
    if (canal.aoVivo && !canal.aoVivo.falhou) {
      // Sem fone, o microfone ouve o outro: não abre fala sua enquanto o computador está falando.
      const podeComecar = canal.id === 'sistema' || !this.falaSistema.has(Math.floor(tMs / MS_QUADRO));
      canal.aoVivo.processar(quadro, tMs, canal.detector.emFala, podeComecar);
      return;
    }
    if (trecho) this.enviar(canal.id, trecho);
  }

  private marcarFalaSistema(tMs: number): void {
    const q = Math.floor(tMs / MS_QUADRO);
    this.falaSistema.add(q);
    // Limpa de tempos em tempos o que já não serve para comparar.
    if (q % 500 === 0) {
      const limite = q - GUARDAR_ECO_MS / MS_QUADRO;
      for (const x of this.falaSistema) if (x < limite) this.falaSistema.delete(x);
    }
  }

  private provavelEco(t: TrechoFala): boolean {
    const de = Math.floor(t.inicioMs / MS_QUADRO);
    const ate = Math.floor(t.fimMs / MS_QUADRO);
    if (ate <= de) return false;
    let juntos = 0;
    for (let q = de; q < ate; q++) if (this.falaSistema.has(q)) juntos++;
    return juntos / (ate - de) >= LIMITE_ECO;
  }

  private enviar(canal: CanalAudio, t: TrechoFala): void {
    const sessao = this.sessao;
    if (!sessao) return;
    if (canal === 'microfone' && this.provavelEco(t)) return;
    const q = new URLSearchParams({ sessaoId: sessao.id, canal, inicioMs: String(t.inicioMs), fimMs: String(t.fimMs) });
    api.enviarAudio(`/transcricao/trechos?${q}`, paraWav(t.amostras)).catch((e: unknown) => {
      console.warn('trecho não enviado', e);
      this.publicar({ erro: 'Um trecho de áudio não chegou na API local.' });
    });
  }

  /** Manda o que estava no meio de uma fala, para nada se perder ao pausar ou parar. */
  private descarregar(): void {
    for (const c of this.canais) {
      const t = c.detector.descarregar(c.baseMs + c.quadros * MS_QUADRO);
      if (t && !(c.aoVivo && !c.aoVivo.falhou)) this.enviar(c.id, t);
    }
  }

  private async pausar(): Promise<void> {
    if (this.estado.status !== 'gravando') return;
    this.descarregar();
    this.publicar({ status: 'pausada' });
  }

  private async retomar(): Promise<void> {
    if (this.estado.status !== 'pausada') return;
    this.canais.forEach((c) => c.detector.reiniciar());
    this.publicar({ status: 'gravando' });
  }

  private async parar(): Promise<void> {
    if (this.estado.status === 'parada') return;
    if (this.estado.status === 'gravando') this.descarregar();
    const sessao = this.sessao;
    await this.desmontar();
    this.sessao = null;
    this.publicar({ ...ESTADO_CAPTURA_INICIAL });
    if (sessao) await api.post(`/sessoes/${sessao.id}/encerrar`).catch(() => {});
  }

  private async desmontar(): Promise<void> {
    if (this.timerNiveis) clearInterval(this.timerNiveis);
    this.timerNiveis = null;
    window.ponto.enviar('captura.niveis', { microfone: 0, sistema: 0 });
    for (const c of this.canais) {
      c.aoVivo?.fechar();
      c.no.port.onmessage = null;
      c.fonte.disconnect();
      c.stream.getTracks().forEach((t) => t.stop());
    }
    this.canais = [];
    this.falaSistema.clear();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
  }

  private publicar(parcial: Partial<EstadoCaptura>): void {
    this.estado = { ...this.estado, ...parcial };
    window.ponto.enviar('captura.status', this.estado);
  }
}

function criarContexto(): AudioContext {
  try {
    return new AudioContext({ sampleRate: 16_000, latencyHint: 'playback' });
  } catch {
    return new AudioContext({ latencyHint: 'playback' });
  }
}

function nomeErro(e: unknown, fonte: string): string {
  const n = (e as { name?: string })?.name;
  if (n === 'NotAllowedError') return `Sem permissão para o ${fonte}.`;
  if (n === 'NotFoundError') return `Nenhum ${fonte} encontrado.`;
  if (n === 'NotReadableError') return `O ${fonte} está ocupado por outro programa.`;
  if ((e as Error)?.message === 'sem-audio') return 'Este sistema não entregou o áudio do computador; seguindo só com o microfone.';
  return `Não consegui abrir o ${fonte}.`;
}

/** Liga o motor. Chamado pelo main.tsx quando a janela é a de captura. */
export function iniciarMotorCaptura(): void {
  const motor = new MotorCaptura();
  window.ponto.ouvir('captura.comando', (c) => motor.comandar(c));
  // Avisa o main que está pronta (e zera um estado antigo, se a página recarregou).
  window.ponto.enviar('captura.status', ESTADO_CAPTURA_INICIAL);
}
