import { app, BrowserWindow, desktopCapturer, session, type WebContents } from 'electron';
import { join } from 'node:path';
import {
  ESTADO_CAPTURA_INICIAL,
  type ComandoCaptura,
  type EstadoCaptura,
  type NiveisAudio,
} from '@ponto/shared';
import { emitir } from './ipc';

/**
 * Dono da captura de áudio.
 *
 * O áudio é capturado numa janela invisível só para isso (nunca aparece, nem na
 * barra de tarefas), porque microfone e áudio do sistema são APIs do Chromium.
 * Assim a captura não depende de nenhum painel estar aberto. O main só manda
 * comandos para ela e guarda o estado que ela informa.
 *
 * Áudio do sistema ("o que você ouve"), sem entrar na reunião:
 * - Windows: loopback do WASAPI, pelo getDisplayMedia com audio: 'loopback'.
 * - macOS 13+: ScreenCaptureKit (flag MacLoopbackAudioForScreenShare). Pede a
 *   permissão de Gravação de Tela na primeira vez.
 * - Linux: depende do PipeWire/PulseAudio; se não vier, segue só com o microfone.
 */
export class CapturaService {
  private win: BrowserWindow | null = null;
  private _estado: EstadoCaptura = ESTADO_CAPTURA_INICIAL;

  constructor(private readonly aoMudar: () => void) {}

  /** Precisa rodar antes do app ficar pronto. */
  static prepararAntesDoReady(): void {
    if (process.platform === 'darwin') app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare');
  }

  get estado(): EstadoCaptura {
    return this._estado;
  }

  get webContents(): WebContents | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : null;
  }

  criar(): void {
    const win = new BrowserWindow({
      show: false,
      width: 200,
      height: 200,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Sem isso o Chromium reduz o ritmo da janela escondida e o áudio engasga.
        backgroundThrottling: false,
      },
    });
    this.win = win;
    this.configurarPermissoes(win.webContents);

    const query = { janela: 'captura' };
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      url.searchParams.set('janela', 'captura');
      void win.loadURL(url.toString());
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    }

    // Se o processo da página cair no meio de uma gravação, a sessão para e a janela volta.
    win.webContents.on('render-process-gone', () => {
      this.receberStatus({ ...ESTADO_CAPTURA_INICIAL, erro: 'A captura de áudio caiu. Comece de novo.' });
      if (!win.isDestroyed()) win.webContents.reload();
    });
  }

  comandar(c: ComandoCaptura): void {
    const wc = this.webContents;
    if (!wc) return;
    if (c.acao === 'iniciar' && this._estado.status !== 'parada') return;
    emitir(wc, 'captura.comando', c);
  }

  /** Atalho global: grava se está parada, pausa se está gravando, retoma se está pausada. */
  alternar(): void {
    const s = this._estado.status;
    if (s === 'parada') this.comandar({ acao: 'iniciar' });
    else if (s === 'gravando') this.comandar({ acao: 'pausar' });
    else if (s === 'pausada') this.comandar({ acao: 'retomar' });
  }

  receberStatus(e: EstadoCaptura): void {
    this._estado = e;
    this.aoMudar();
  }

  repassarNiveis(n: NiveisAudio, destinos: BrowserWindow[]): void {
    for (const w of destinos) if (w.isVisible()) emitir(w.webContents, 'audio.niveis', n);
  }

  /**
   * Microfone e captura de tela só para a janela de captura. As outras janelas
   * não precisam de nenhuma permissão sensível, então negamos tudo para elas.
   */
  private configurarPermissoes(captura: WebContents): void {
    const ses = session.defaultSession;
    const permitido = (wc: WebContents | null, permissao: string) => {
      if (permissao === 'clipboard-sanitized-write') return true;
      return wc === captura && (permissao === 'media' || permissao === 'display-capture');
    };
    ses.setPermissionRequestHandler((wc, permissao, ok) => ok(permitido(wc, permissao)));
    ses.setPermissionCheckHandler((wc, permissao) => permitido(wc, permissao));

    // getDisplayMedia da janela de captura: tela principal + áudio do sistema, sem seletor.
    // O vídeo é descartado na hora; só queremos o loopback.
    ses.setDisplayMediaRequestHandler(
      (pedido, responder) => {
        if (pedido.frame?.top !== captura.mainFrame) return responder({});
        void desktopCapturer
          .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
          .then((fontes) => {
            const tela = fontes[0];
            if (!tela) return responder({});
            responder(process.platform === 'linux' ? { video: tela } : { video: tela, audio: 'loopback' });
          })
          .catch(() => responder({}));
      },
      { useSystemPicker: false },
    );
  }
}
