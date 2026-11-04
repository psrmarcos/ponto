import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { WindowId, Rect } from '@ponto/shared';
import type { PreferencesService } from '../preferences';
import { WINDOW_DEFINITIONS } from './definitions';
import { protectFrame } from './frame-win32';
import { StealthService } from './stealth';
import { ZOrderService } from './zorder';
import { ClickThroughService } from './click-through';

const HOME_BG_COLOR = '#16161B';

export class WindowManager {
  private readonly windows = new Map<WindowId, BrowserWindow>();
  readonly stealth: StealthService;
  readonly zorder: ZOrderService;
  readonly clickThrough = new ClickThroughService();

  constructor(
    private readonly prefs: PreferencesService,
    private readonly onChange: () => void,
  ) {
    this.stealth = new StealthService(
      prefs.value.stealth,
      () => this.all(),
      (enabled) => {
        prefs.update((p) => (p.stealth = enabled));
        this.onChange();
      },
    );
    this.zorder = new ZOrderService();
  }

  all(): BrowserWindow[] {
    return [...this.windows.values()].filter((w) => !w.isDestroyed());
  }

  get(id: WindowId): BrowserWindow | undefined {
    const w = this.windows.get(id);
    return w && !w.isDestroyed() ? w : undefined;
  }

  idOf(win: BrowserWindow | null): WindowId | undefined {
    if (!win) return undefined;
    for (const [id, w] of this.windows) if (w === win) return id;
    return undefined;
  }

  isVisible(id: WindowId): boolean {
    const w = this.get(id);
    return !!w && w.isVisible() && !w.isMinimized();
  }

  createAll(): void {
    for (const id of Object.keys(WINDOW_DEFINITIONS) as WindowId[]) this.create(id);
    this.zorder.start();
  }

  toggle(id: WindowId, visible?: boolean): void {
    const w = this.get(id);
    if (!w) return;
    if (w.isMinimized() && visible !== false) {
      w.restore();
      w.focus();
      this.onChange();
      return;
    }
    const show = visible ?? !w.isVisible();
    if (show === w.isVisible()) return;
    if (show) {
      if (WINDOW_DEFINITIONS[id].floating) w.showInactive();
      else w.show();
    } else {
      w.hide();
    }
    this.prefs.update((p) => (p.windows[id] = { ...p.windows[id], visible: show }));
    this.onChange();
  }

  private create(id: WindowId): BrowserWindow {
    const def = WINDOW_DEFINITIONS[id];
    const saved = this.prefs.value.windows[id];
    const bounds = this.initialBounds(id, saved?.bounds);

    const win = new BrowserWindow({
      ...bounds,
      minWidth: def.minWidth,
      minHeight: def.minHeight,
      show: false,
      frame: false,
      transparent: def.floating,
      backgroundColor: def.floating ? '#00000000' : HOME_BG_COLOR,
      hasShadow: !def.floating,
      resizable: true,
      thickFrame: !def.floating,
      roundedCorners: !def.floating,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      maximizable: !def.floating,
      minimizable: !def.floating,
      title: 'Ponto',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        backgroundThrottling: false,
      },
    });

    this.windows.set(id, win);
    this.stealth.apply(win);
    this.zorder.register(win);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (def.floating) {
      this.clickThrough.register(win);
      protectFrame(win);
    }

    win.on('show', () => {
      this.stealth.apply(win);
      this.onChange();
    });
    win.on('hide', () => this.onChange());
    win.on('minimize', () => this.onChange());
    win.on('restore', () => this.onChange());
    const rememberBounds = () => this.prefs.update((p) => (p.windows[id] = { ...p.windows[id], bounds: win.getBounds() }));
    win.on('moved', rememberBounds);
    win.on('resized', rememberBounds);
    win.on('close', (e) => {
      if (!quitting) {
        e.preventDefault();
        this.toggle(id, false);
      }
    });

    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    const query = { window: id };
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      url.searchParams.set('window', id);
      void win.loadURL(url.toString());
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    }

    const show = saved?.visible ?? def.showOnStart;
    win.once('ready-to-show', () => {
      if (show) win.showInactive();
      this.onChange();
    });
    return win;
  }

  private initialBounds(id: WindowId, saved?: Rect): Rectangle {
    const def = WINDOW_DEFINITIONS[id];
    if (saved && screen.getAllDisplays().some((d) => intersects(d.workArea, saved))) return saved;
    const area = screen.getPrimaryDisplay().workArea;
    return { ...def.position(area, def.width, def.height), width: def.width, height: def.height };
  }
}

let quitting = false;
export function markQuitting(): void {
  quitting = true;
}

function intersects(a: Rectangle, b: Rectangle): boolean {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w >= 80 && h >= 40;
}
