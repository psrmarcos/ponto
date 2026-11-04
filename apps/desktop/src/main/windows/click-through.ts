import { screen, type BrowserWindow } from 'electron';
import type { Rect } from '@ponto/shared';

const INTERVAL_MS = 16;

interface WindowClickState {
  areas: Rect[];
  ignoring: boolean;
}

export class ClickThroughService {
  private readonly states = new Map<BrowserWindow, WindowClickState>();
  private timer: NodeJS.Timeout | null = null;

  register(win: BrowserWindow): void {
    this.states.set(win, { areas: [], ignoring: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('show', () => this.start());
    win.on('closed', () => this.states.delete(win));
    if (win.isVisible()) this.start();
  }

  setAreas(win: BrowserWindow, areas: Rect[]): void {
    const s = this.states.get(win);
    if (!s) return;
    s.areas = areas;
    this.check();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private start(): void {
    this.timer ??= setInterval(() => this.check(), INTERVAL_MS);
  }

  private check(): void {
    const p = screen.getCursorScreenPoint();
    let anyVisible = false;
    for (const [win, s] of this.states) {
      if (win.isDestroyed() || !win.isVisible()) continue;
      anyVisible = true;
      const b = win.getContentBounds();
      const x = p.x - b.x;
      const y = p.y - b.y;
      const inside = s.areas.some((a) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
      if (inside === !s.ignoring) continue;
      s.ignoring = !inside;
      win.setIgnoreMouseEvents(s.ignoring, { forward: true });
    }
    if (!anyVisible) this.stop();
  }
}
