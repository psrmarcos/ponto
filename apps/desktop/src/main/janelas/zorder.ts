import type { BrowserWindow } from 'electron';

const INTERVALO_MS = 1000;

/**
 * Mantém as janelas do app acima de tudo (inclusive de outros apps "sempre no
 * topo") e, entre elas, a que você mexeu por último fica por cima: arrastar uma
 * janela a traz para a frente das outras do Ponto.
 */
export class ZOrderService {
  /** Ordem de baixo para cima. */
  private pilha: BrowserWindow[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly aCadaVolta?: (w: BrowserWindow) => void) {}

  registrar(win: BrowserWindow): void {
    this.pilha.push(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.on('closed', () => (this.pilha = this.pilha.filter((w) => w !== win)));
    // 'will-move' dispara durante o arraste no Windows e macOS.
    win.on('will-move', () => this.promover(win));
    win.on('focus', () => this.promover(win));
    win.on('show', () => this.promover(win));
    // Alguns apps tiram o topmost de quem perde o foco: reafirma.
    win.on('blur', () => !win.isDestroyed() && win.setAlwaysOnTop(true, 'screen-saver'));
  }

  promover(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    if (this.pilha.at(-1) !== win) this.pilha = [...this.pilha.filter((w) => w !== win), win];
    win.moveTop();
  }

  iniciar(): void {
    this.timer ??= setInterval(() => this.reafirmar(), INTERVALO_MS);
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** De baixo para cima: o último a receber moveTop fica no topo. */
  private reafirmar(): void {
    for (const w of this.pilha) {
      if (w.isDestroyed() || !w.isVisible()) continue;
      w.moveTop();
      this.aCadaVolta?.(w);
    }
  }
}
