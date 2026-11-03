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
    // Arrastar pela área -webkit-app-region nem sempre dispara 'will-move' no Windows;
    // 'move' dispara a cada passo do arraste. Cobrimos os dois.
    win.on('will-move', () => this.promover(win));
    win.on('move', () => this.promover(win));
    win.on('will-resize', () => this.promover(win));
    win.on('focus', () => this.promover(win));
    win.on('show', () => this.promover(win));
    // Alguns apps tiram o topmost de quem perde o foco: reafirma. Mas setAlwaysOnTop joga a
    // janela para o topo da faixa "sempre no topo", então logo em seguida refazemos a ordem,
    // senão a janela que perdeu o foco passaria na frente da que você acabou de arrastar.
    win.on('blur', () => {
      if (win.isDestroyed()) return;
      win.setAlwaysOnTop(true, 'screen-saver');
      this.reafirmar();
    });
  }

  promover(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    if (this.pilha.at(-1) === win) return; // já é a de cima: nada a fazer a cada pixel do arraste
    this.pilha = [...this.pilha.filter((w) => w !== win), win];
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
