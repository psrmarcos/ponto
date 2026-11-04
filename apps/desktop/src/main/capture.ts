import { app, BrowserWindow, desktopCapturer, session, type WebContents } from 'electron';
import { join } from 'node:path';
import {
  INITIAL_CAPTURE_STATE,
  type CaptureCommand,
  type CaptureState,
  type AudioLevels,
} from '@ponto/shared';
import { emit } from './ipc';

/**
 * Owner of audio capture.
 *
 * Audio is captured inside a dedicated hidden window (never shown, not even in
 * the taskbar), because microphone and system audio are Chromium APIs. That way
 * capture never depends on any visible panel being open. The main process sends
 * commands to it and stores the state it reports.
 *
 * System audio ("what you hear"), without joining the meeting as a bot:
 * - Windows: WASAPI loopback via getDisplayMedia with `audio: 'loopback'`.
 * - macOS 13+: ScreenCaptureKit (flag MacLoopbackAudioForScreenShare). Prompts
 *   for Screen Recording permission on first use.
 * - Linux: depends on PipeWire/PulseAudio; if unavailable, continues with microphone only.
 */
export class CaptureService {
  private win: BrowserWindow | null = null;
  private _state: CaptureState = INITIAL_CAPTURE_STATE;

  constructor(private readonly onChange: () => void) {}

  /** Must run before app is ready. */
  static prepareBeforeReady(): void {
    if (process.platform === 'darwin') app.commandLine.appendSwitch('enable-features', 'MacLoopbackAudioForScreenShare');
  }

  get state(): CaptureState {
    return this._state;
  }

  get webContents(): WebContents | null {
    return this.win && !this.win.isDestroyed() ? this.win.webContents : null;
  }

  create(): void {
    const win = new BrowserWindow({
      show: false,
      width: 200,
      height: 200,
      skipTaskbar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        // Without this, Chromium throttles the hidden window and audio stutters.
        backgroundThrottling: false,
      },
    });
    this.win = win;
    this.configurePermissions(win.webContents);

    const query = { window: 'capture' };
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      url.searchParams.set('window', 'capture');
      void win.loadURL(url.toString());
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    }

    // If the renderer process crashes mid-recording, stop the session and reload the hidden window.
    win.webContents.on('render-process-gone', () => {
      this.receiveStatus({ ...INITIAL_CAPTURE_STATE, error: 'A captura de áudio caiu. Comece de novo.' });
      if (!win.isDestroyed()) win.webContents.reload();
    });
  }

  command(c: CaptureCommand): void {
    const wc = this.webContents;
    if (!wc) return;
    if (c.action === 'start' && this._state.status !== 'stopped') return;
    emit(wc, 'capture.command', c);
  }

  /** Global shortcut: starts if stopped, pauses if recording, resumes if paused. */
  toggle(): void {
    const s = this._state.status;
    if (s === 'stopped') this.command({ action: 'start' });
    else if (s === 'recording') this.command({ action: 'pause' });
    else if (s === 'paused') this.command({ action: 'resume' });
  }

  receiveStatus(s: CaptureState): void {
    this._state = s;
    this.onChange();
  }

  forwardLevels(levels: AudioLevels, targets: BrowserWindow[]): void {
    for (const w of targets) if (w.isVisible()) emit(w.webContents, 'audio.levels', levels);
  }

  /**
   * Microphone and screen capture permissions are granted ONLY to the hidden
   * capture window. Other windows need no sensitive permissions, so we deny them.
   */
  private configurePermissions(captureWc: WebContents): void {
    const ses = session.defaultSession;
    const allowed = (wc: WebContents | null, permission: string) => {
      if (permission === 'clipboard-sanitized-write') return true;
      return wc === captureWc && (permission === 'media' || permission === 'display-capture');
    };
    ses.setPermissionRequestHandler((wc, permission, ok) => ok(allowed(wc, permission)));
    ses.setPermissionCheckHandler((wc, permission) => allowed(wc, permission));

    // getDisplayMedia from the capture window: primary display + system audio loopback, without a picker.
    // Video track is immediately discarded; we only want the audio loopback.
    ses.setDisplayMediaRequestHandler(
      (request, callback) => {
        if (request.frame?.top !== captureWc.mainFrame) return callback({});
        void desktopCapturer
          .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
          .then((sources) => {
            const screenSource = sources[0];
            if (!screenSource) return callback({});
            callback(process.platform === 'linux' ? { video: screenSource } : { video: screenSource, audio: 'loopback' });
          })
          .catch(() => callback({}));
      },
      { useSystemPicker: false },
    );
  }
}
