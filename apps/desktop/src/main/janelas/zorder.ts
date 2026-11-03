import { BrowserWindow } from 'electron';
import { ordemCerta } from './pilha-win32';

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
    // Alguns apps tiram o topmost de quem perde o foco. Mas reordenar a cada troca de foco
    // entre as nossas próprias janelas fazia todas trocarem de lugar por um instante (a piscada).
    // Então: se o foco foi para outra janela do Ponto, nada; senão, só conserta se estiver errado.
    win.on('blur', () => {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        const focada = BrowserWindow.getFocusedWindow();
        if (focada && this.pilha.includes(focada)) return;
        if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
        this.verificar();
      }, 0);
    });
  }

  promover(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    if (this.pilha.at(-1) === win) return; // já é a de cima: nada a fazer a cada pixel do arraste
    this.pilha = [...this.pilha.filter((w) => w !== win), win];
    win.moveTop();
  }

  iniciar(): void {
    this.timer ??= setInterval(() => this.verificar(), INTERVALO_MS);
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Reordena só quando a ordem real (lida no Windows) não bate com a pilha. */
  private verificar(): void {
    const visiveis = this.pilha.filter((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized());
    if (ordemCerta(visiveis) === true) return;
    this.reafirmar();
  }

  /** De baixo para cima: o último a receber moveTop fica no topo. */
  private reafirmar(): void {
    for (const w of this.pilha) {
      if (w.isDestroyed() || !w.isVisible() || w.isMinimized()) continue;
      w.moveTop();
      this.aCadaVolta?.(w);
    }
  }
}
