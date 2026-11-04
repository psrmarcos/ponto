import { BrowserWindow } from 'electron';
import { isOrderCorrect } from './stack-win32';

const INTERVAL_MS = 1000;

/**
 * Keeps app windows above everything else (including other "always on top" apps)
 * and, among our own windows, keeps the most recently interacted window on top:
 * dragging a window brings it in front of the other Ponto windows.
 */
export class ZOrderService {
  /** Ordered bottom to top. */
  private stack: BrowserWindow[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onEachPass?: (w: BrowserWindow) => void) {}

  register(win: BrowserWindow): void {
    this.stack.push(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.on('closed', () => (this.stack = this.stack.filter((w) => w !== win)));
    // Dragging via -webkit-app-region doesn't always fire 'will-move' on Windows;
    // 'move' fires on every step of the drag. We handle both.
    win.on('will-move', () => this.promote(win));
    win.on('move', () => this.promote(win));
    win.on('will-resize', () => this.promote(win));
    win.on('focus', () => this.promote(win));
    win.on('show', () => this.promote(win));
    // Some apps strip topmost from windows that lose focus. However, restacking on every
    // focus change between our own windows caused brief flicker. Therefore: if focus moved
    // to another Ponto window, do nothing; otherwise, only restack if the order is wrong.
    win.on('blur', () => {
      setTimeout(() => {
        if (win.isDestroyed()) return;
        const focused = BrowserWindow.getFocusedWindow();
        if (focused && this.stack.includes(focused)) return;
        if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
        this.check();
      }, 0);
    });
  }

  promote(win: BrowserWindow): void {
    if (win.isDestroyed()) return;
    if (this.stack.at(-1) === win) return; // already on top: nothing to do on each drag pixel
    this.stack = [...this.stack.filter((w) => w !== win), win];
    win.moveTop();
  }

  start(): void {
    this.timer ??= setInterval(() => this.check(), INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Reorders only when the actual native z-order on Windows disagrees with our stack. */
  private check(): void {
    const visible = this.stack.filter((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized());
    if (isOrderCorrect(visible) === true) return;
    this.reassert();
  }

  /** Bottom to top: the last window to receive moveTop ends up on top. */
  private reassert(): void {
    for (const w of this.stack) {
      if (w.isDestroyed() || !w.isVisible() || w.isMinimized()) continue;
      w.moveTop();
      this.onEachPass?.(w);
    }
  }
}
