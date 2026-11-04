import { z } from 'zod';
import { WindowId, Rect } from './windows';
import { ShortcutAction, AppState } from './state';
import { SecretId, SecretStatus } from './secrets';
import { CaptureCommand, CaptureState, AudioLevels } from './transcription';

export const ApiConnection = z.object({ url: z.string().url(), ws: z.string(), token: z.string() });
export type ApiConnection = z.infer<typeof ApiConnection>;

export const PickedImage = z.object({ name: z.string(), dataUrl: z.string() });
export type PickedImage = z.infer<typeof PickedImage>;

const empty = z.void();

/**
 * Single IPC contract between renderer and main process.
 *
 * - `invoke`: renderer requests and awaits a response (ipcRenderer.invoke).
 * - `send`: renderer notifies without waiting for a response (ipcRenderer.send).
 * - `events`: main notifies windows (webContents.send).
 */
export const ipcContract = {
  invoke: {
    'state.get': { input: empty, output: AppState },
    'stealth.set': { input: z.object({ enabled: z.boolean() }), output: empty },
    'window.toggle': { input: z.object({ id: WindowId, visible: z.boolean().optional() }), output: empty },
    'window.focusInput': { input: empty, output: empty },
    /** Window control buttons on Home (acts on the caller's window). */
    'window.control': {
      input: z.object({ action: z.enum(['minimize', 'maximize', 'state']) }),
      output: z.object({ maximized: z.boolean() }),
    },
    'shortcuts.set': {
      input: z.object({ action: ShortcutAction, accelerator: z.string().min(1) }),
      output: z.object({ ok: z.boolean(), error: z.string().optional() }),
    },
    'shortcuts.resetDefaults': { input: empty, output: empty },
    'api.connection': { input: empty, output: ApiConnection.nullable() },
    'secrets.status': { input: empty, output: z.record(SecretId, SecretStatus) },
    'secrets.set': {
      input: z.object({ id: SecretId, value: z.string().trim().min(1).max(500).nullable() }),
      output: SecretStatus,
    },
    'file.pickImage': { input: empty, output: PickedImage.nullable() },
    'app.quit': { input: empty, output: empty },
    /** Start, pause, resume, or stop the transcription session. */
    'capture.command': { input: CaptureCommand, output: empty },
    /** Captures a screenshot of the display under the cursor and sends it to chat. */
    'screen.read': { input: empty, output: empty },
    /** Captures a higher-res screenshot without sending it to AI. */
    'screen.capture': { input: empty, output: z.object({ dataUrl: z.string(), at: z.number() }) },
    /** Sends a prepared image (e.g. cropped region) to chat for analysis. */
    'screen.send': { input: z.object({ dataUrl: z.string().startsWith('data:image/').max(6_000_000) }), output: empty },
    'screen.auto': { input: z.object({ enabled: z.boolean() }), output: empty },
    /** Saves a .md file in Documents/Ponto without a native dialog (native dialogs leak into screen recordings). */
    'file.saveMarkdown': {
      input: z.object({ name: z.string().min(1).max(160), content: z.string().max(20_000_000) }),
      output: z.object({ path: z.string() }),
    },
    /** Opens Explorer/Finder with the file selected. */
    'file.reveal': { input: z.object({ path: z.string().min(1) }), output: empty },
  },
  send: {
    /** Rectangles (in window px) that receive mouse events; clicks pass through outside them. */
    'window.solidAreas': z.object({ areas: z.array(Rect).max(64) }),
    /** From the hidden capture window only: current recording state. */
    'capture.status': CaptureState,
    /** From the hidden capture window only: channel volume levels, ~10x per second. */
    'capture.levels': AudioLevels,
  },
  events: {
    state: AppState,
    'chat.toggle': empty,
    /** Selected text shortcut: chat sends it to AI to explain or answer. */
    'selection.read': z.object({ text: z.string() }),
    /** Screenshot ready (compressed JPEG). Chat sends it to AI; Screen window shows preview. */
    'screen.read': z.object({ dataUrl: z.string(), at: z.number(), source: z.enum(['manual', 'crop', 'auto']) }),
    /** Sent to the hidden capture window: command to execute. */
    'capture.command': CaptureCommand,
    /** Sent to visible windows while recording. */
    'audio.levels': AudioLevels,
  },
} as const;

type Contract = typeof ipcContract;
export type InvokeChannel = keyof Contract['invoke'];
export type SendChannel = keyof Contract['send'];
export type EventChannel = keyof Contract['events'];

export type InvokeInput<C extends InvokeChannel> = z.input<Contract['invoke'][C]['input']>;
export type InvokeOutput<C extends InvokeChannel> = z.output<Contract['invoke'][C]['output']>;
export type SendPayload<C extends SendChannel> = z.input<Contract['send'][C]>;
export type EventPayload<C extends EventChannel> = z.output<Contract['events'][C]>;

/** Allowed channel names in preload (derived from contract so they never diverge). */
export const invokeChannels = Object.keys(ipcContract.invoke) as InvokeChannel[];
export const sendChannels = Object.keys(ipcContract.send) as SendChannel[];
export const eventChannels = Object.keys(ipcContract.events) as EventChannel[];

/** Prefix for Electron IPC channels to avoid collisions with internal channels. */
export const IPC_PREFIX = 'ponto:';

/** Bridge exposed by preload at `window.ponto`. */
export interface PontoBridge {
  invoke<C extends InvokeChannel>(
    channel: C,
    ...args: InvokeInput<C> extends void ? [] : [InvokeInput<C>]
  ): Promise<InvokeOutput<C>>;
  send<C extends SendChannel>(channel: C, data: SendPayload<C>): void;
  /** Returns an unsubscribe function. */
  on<C extends EventChannel>(channel: C, listener: (data: EventPayload<C>) => void): () => void;
}
