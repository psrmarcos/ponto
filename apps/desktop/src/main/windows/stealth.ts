import { app, BrowserWindow } from 'electron';
import { release } from 'node:os';

/**
 * WDA_EXCLUDEFROMCAPTURE exists starting in Windows 10 2004 (build 19041). Prior
 * to that, Windows treats it as WDA_MONITOR: the window turns into a solid black
 * rectangle in recordings, which is more conspicuous than helpful.
 */
function windowsSupportsStealth(): boolean {
  const build = Number(release().split('.')[2] ?? 0);
  return build >= 19041;
}

/**
 * Single authority deciding whether windows appear in recordings, screenshots,
 * and screen shares. Applies to ALL windows via a global switch.
 *
 * Per OS:
 * - Windows 10 2004+: SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE) via setContentProtection.
 * - macOS: NSWindowSharingNone via setContentProtection.
 * - Linux: unsupported by the OS; `supported` is false and the UI warns the user.
 */
export class StealthService {
  readonly supported = (process.platform === 'win32' && windowsSupportsStealth()) || process.platform === 'darwin';
  private _enabled: boolean;

  constructor(
    initialEnabled: boolean,
    private readonly windows: () => BrowserWindow[],
    private readonly onChange: (enabled: boolean) => void,
  ) {
    this._enabled = initialEnabled;
    // Safety net: every window in the process starts unprotected (WDA_NONE), including
    // windows created outside WindowManager (capture, DevTools). Protect immediately on creation.
    app.on('browser-window-created', (_e, win) => {
      this.apply(win);
      win.once('ready-to-show', () => this.apply(win));
    });
  }

  get enabled(): boolean {
    return this._enabled;
  }

  /** Call for every new window and whenever it is shown again (some OSes drop protection when hidden). */
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
