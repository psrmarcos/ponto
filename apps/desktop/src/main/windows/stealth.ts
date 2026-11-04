import { app, BrowserWindow } from 'electron';
import { release } from 'node:os';

function windowsSupportsStealth(): boolean {
  const build = Number(release().split('.')[2] ?? 0);
  return build >= 19041;
}

export class StealthService {
  readonly supported = (process.platform === 'win32' && windowsSupportsStealth()) || process.platform === 'darwin';
  private _enabled: boolean;

  constructor(
    initialEnabled: boolean,
    private readonly windows: () => BrowserWindow[],
    private readonly onChange: (enabled: boolean) => void,
  ) {
    this._enabled = initialEnabled;
    app.on('browser-window-created', (_e, win) => {
      this.apply(win);
      win.once('ready-to-show', () => this.apply(win));
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  apply(win: BrowserWindow): void {
    if (win.isDestroyed() || !this.supported) return;
    win.setContentProtection(this._enabled);
  }

  set(enabled: boolean): void {
    if (enabled === this._enabled) return;
    this._enabled = enabled;
    this.windows().forEach((w) => this.apply(w));
    this.onChange(enabled);
  }
}
