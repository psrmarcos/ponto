import { app, BrowserWindow } from 'electron';
import { release } from 'node:os';

/**
 * WDA_EXCLUDEFROMCAPTURE existe a partir do Windows 10 2004 (build 19041). Antes
 * disso o Windows trata como WDA_MONITOR: a janela vira um retângulo preto na
 * gravação, o que denuncia mais do que esconde. Então lá consideramos sem suporte.
 */
function windowsSuporta(): boolean {
  const build = Number(release().split('.')[2] ?? 0);
  return build >= 19041;
}

/**
 * Único lugar que decide se as janelas aparecem em gravações, prints e
 * compartilhamento de tela. A regra vale para TODAS as janelas, e o interruptor
 * é global.
 *
 * Por SO (o resto do app não precisa saber):
 * - Windows 10 2004+: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) via setContentProtection.
 * - macOS: NSWindowSharingNone via setContentProtection. Obs.: o ScreenCaptureKit do
 *   macOS 15+ pode ignorar isso em alguns apps de gravação.
 * - Linux: o SO não oferece; `suportado` fica false e a UI avisa.
 */
export class StealthService {
  readonly suportado = (process.platform === 'win32' && windowsSuporta()) || process.platform === 'darwin';
  private _ligado: boolean;

  constructor(
    ligadoInicial: boolean,
    private readonly janelas: () => BrowserWindow[],
    private readonly aoMudar: (ligado: boolean) => void,
  ) {
    this._ligado = ligadoInicial;
    // Rede de segurança: toda janela do processo nasce sem proteção (WDA_NONE), inclusive
    // as que não passam pelo gerenciador (captura, DevTools). Protege assim que nasce.
    app.on('browser-window-created', (_e, win) => {
      this.aplicar(win);
      win.once('ready-to-show', () => this.aplicar(win));
    });
  }

  get ligado(): boolean {
    return this._ligado;
  }

  /** Chame para toda janela nova e sempre que ela reaparecer (alguns SOs perdem a proteção ao esconder). */
  aplicar(win: BrowserWindow): void {
    if (win.isDestroyed() || !this.suportado) return;
    win.setContentProtection(this._ligado);
  }

  definir(ligado: boolean): void {
    if (ligado === this._ligado) return;
    this._ligado = ligado;
    this.janelas().forEach((w) => this.aplicar(w));
    this.aoMudar(ligado);
  }
}
