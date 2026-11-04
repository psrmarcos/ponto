import { app, BrowserWindow, dialog, shell, type WebContents } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { WindowId, SecretId, type AppState } from '@ponto/shared';
import { ApiHost } from './api-host';
import { ShortcutsService } from './shortcuts';
import { CaptureService } from './capture';
import { emit, registerIpc } from './ipc';
import { WindowManager, markQuitting } from './windows/manager';
import { PreferencesService } from './preferences';
import { SecretsService } from './secrets';
import { captureScreen, AutoScreenReader } from './screen';
import { readSelectedText } from './selection';

app.setName('Ponto');
CaptureService.prepareBeforeReady();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(start);
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

function start(): void {
  const prefs = new PreferencesService();
  const secrets = new SecretsService();

  let lastStateJson = '';
  let scheduled = false;
  const broadcast = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      const state = buildState();
      const json = JSON.stringify(state);
      if (json === lastStateJson) return;
      lastStateJson = json;
      windows.all().forEach((w) => emit(w.webContents, 'state', state));
    });
  };

  const windows = new WindowManager(prefs, broadcast);
  const capture = new CaptureService(broadcast);
  const autoReader = new AutoScreenReader(
    () => readScreen('auto'),
    () => windows.stealth.enabled && windows.stealth.supported,
  );
  secrets.onChange(broadcast);
  const api = new ApiHost(secrets, broadcast);
  const shortcuts = new ShortcutsService(
    prefs,
    {
      toggleStealth: () => windows.stealth.set(!windows.stealth.enabled),
      toggleChat: () => {
        const w = windows.get('overlay');
        if (w) emit(w.webContents, 'chat.toggle', undefined);
      },
      toggleTranscription: () => windows.toggle('transcription'),
      toggleScreen: () => windows.toggle('screen'),
      toggleHome: () => windows.toggle('home'),
      readScreen: () => void readScreen(),
      askSelection: () => void askSelection(),
      toggleCapture: () => capture.toggle(),
      quit: () => app.quit(),
    },
    broadcast,
  );

  async function askSelection(): Promise<void> {
    const text = await readSelectedText();
    const w = windows.get('overlay');
    if (!w) return;
    emit(w.webContents, 'selection.read', { text: text ?? '' });
  }

  async function readScreen(source: 'manual' | 'auto' = 'manual'): Promise<void> {
    broadcastScreenRead(await captureScreen(), source);
  }

  function broadcastScreenRead(dataUrl: string, source: 'manual' | 'crop' | 'auto'): void {
    const data = { dataUrl, at: Date.now(), source };
    for (const id of ['overlay', 'screen'] as const) {
      const w = windows.get(id);
      if (w) emit(w.webContents, 'screen.read', data);
    }
  }

  function buildState(): AppState {
    const vis = {} as AppState['windows'];
    for (const id of WindowId.options) vis[id] = { visible: windows.isVisible(id) };
    return {
      stealth: { enabled: windows.stealth.enabled, supported: windows.stealth.supported },
      windows: vis,
      shortcuts: prefs.shortcuts(),
      failedShortcuts: shortcuts.errors,
      api: { status: api.status },
      capture: capture.state,
      screenAuto: autoReader.enabled,
      configuredSecrets: SecretId.options.filter((id) => secrets.status()[id].configured),
      platform: process.platform as AppState['platform'],
      version: app.getVersion(),
    };
  }

  const isOurWindow = (wc: WebContents) => wc === capture.webContents || windows.all().some((w) => w.webContents === wc);
  const isCaptureWindow = (wc: WebContents) => wc === capture.webContents;

  registerIpc(
    {
      'state.get': () => buildState(),
      'stealth.set': ({ enabled }) => windows.stealth.set(enabled),
      'window.toggle': ({ id, visible }) => windows.toggle(id, visible),
      'window.control': ({ action }, e) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        if (w && action === 'minimize') w.minimize();
        if (w && action === 'maximize') {
          if (w.isMaximized()) w.unmaximize();
          else w.maximize();
        }
        return { maximized: w?.isMaximized() ?? false };
      },
      'window.focusInput': (_d, e) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        w?.focus();
      },
      'shortcuts.set': ({ action, accelerator }) => shortcuts.set(action, accelerator),
      'shortcuts.resetDefaults': () => shortcuts.resetDefaults(),
      'api.connection': () => api.connection(),
      'secrets.status': () => secrets.status(),
      'secrets.set': ({ id, value }) => secrets.set(id, value),
      'file.pickImage': async () => {
        const r = await dialog.showOpenDialog({
          title: 'Adicionar imagem',
          properties: ['openFile'],
          filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        });
        const file = r.filePaths[0];
        if (r.canceled || !file) return null;
        const data = await readFile(file);
        if (data.byteLength > MAX_IMAGE_BYTES) throw new Error('Imagem maior que 8 MB.');
        const ext = extname(file).slice(1).toLowerCase().replace('jpg', 'jpeg');
        return { name: basename(file), dataUrl: `data:image/${ext};base64,${data.toString('base64')}` };
      },
      'app.quit': () => app.quit(),
      'capture.command': (c) => capture.command(c),
      'screen.read': () => readScreen(),
      'screen.capture': async () => ({
        dataUrl: await captureScreen({ maxSide: 2560, maxBytes: 1_500_000 }),
        at: Date.now(),
      }),
      'screen.send': ({ dataUrl }) => broadcastScreenRead(dataUrl, 'crop'),
      'screen.auto': ({ enabled }) => {
        autoReader.set(enabled);
        broadcast();
      },
      'file.saveMarkdown': async ({ name, content }) => {
        const folder = join(app.getPath('documents'), 'Ponto');
        await mkdir(folder, { recursive: true });
        const cleanName =
          name
            .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 120) || 'Sessão';
        const path = join(folder, `${cleanName}.md`);
        await writeFile(path, content, 'utf8');
        return { path };
      },
      'file.reveal': ({ path }) => {
        const folder = resolve(app.getPath('documents'), 'Ponto');
        if (resolve(path).startsWith(folder)) shell.showItemInFolder(path);
      },
    },
    {
      'window.solidAreas': ({ areas }, e) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        if (w) windows.clickThrough.setAreas(w, areas);
      },
      'capture.status': (s, e) => {
        if (isCaptureWindow(e.sender)) capture.receiveStatus(s);
      },
      'capture.levels': (n, e) => {
        if (isCaptureWindow(e.sender)) capture.forwardLevels(n, windows.all());
      },
    },
    isOurWindow,
  );

  windows.createAll();
  capture.create();
  shortcuts.registerAll();
  void api.start();

  app.on('second-instance', () => windows.toggle('home', true));
  app.on('before-quit', () => {
    markQuitting();
    windows.zorder.stop();
    windows.clickThrough.stop();
    prefs.saveNow();
    api.stop();
  });
}

app.on('window-all-closed', () => app.quit());
