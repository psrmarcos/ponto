import { BrowserWindow } from 'electron';
import { isOrderCorrect } from './stack-win32';

const INTERVAL_MS = 1000;

export class ZOrderService {
  private stack: BrowserWindow[] = [];
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly onEachPass?: (w: BrowserWindow) => void) {}

  register(win: BrowserWindow): void {
    this.stack.push(win);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.on('closed', () => (this.stack = this.stack.filter((w) => w !== win)));
    win.on('will-move', () => this.promote(win));
    win.on('move', () => this.promote(win));
    win.on('will-resize', () => this.promote(win));
    win.on('focus', () => this.promote(win));
    win.on('show', () => this.promote(win));
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
    if (this.stack.at(-1) === win) return;
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

  private check(): void {
    const visible = this.stack.filter((w) => !w.isDestroyed() && w.isVisible() && !w.isMinimized());
    if (isOrderCorrect(visible) === true) return;
    this.reassert();
  }

  private reassert(): void {
    for (const w of this.stack) {
      if (w.isDestroyed() || !w.isVisible() || w.isMinimized()) continue;
      w.moveTop();
      this.onEachPass?.(w);
    }
  }
}
