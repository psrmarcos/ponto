import type { BrowserWindow } from 'electron';

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
  readonly suportado = process.platform === 'win32' || process.platform === 'darwin';
  private _ligado: boolean;

  constructor(
    ligadoInicial: boolean,
    private readonly janelas: () => BrowserWindow[],
    private readonly aoMudar: (ligado: boolean) => void,
  ) {
    this._ligado = ligadoInicial;
  }

  get ligado(): boolean {
    return this._ligado;
  }

  /** Chame para toda janela nova e sempre que ela reaparecer (alguns SOs perdem a proteção ao esconder). */
  aplicar(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    win.setContentProtection(this._ligado);
  }

  definir(ligado: boolean): void {
    if (ligado === this._ligado) return;
    this._ligado = ligado;
    this.janelas().forEach((w) => this.aplicar(w));
    this.aoMudar(ligado);
  }
}
