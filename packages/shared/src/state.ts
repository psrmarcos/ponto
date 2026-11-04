import { z } from 'zod';
import { WindowId } from './windows';
import { SecretId } from './secrets';
import { CaptureState } from './transcription';

export const ShortcutAction = z.enum([
  'toggleStealth',
  'toggleChat',
  'toggleTranscription',
  'toggleScreen',
  'toggleHome',
  'readScreen',
  'askSelection',
  'toggleCapture',
  'quit',
]);
export type ShortcutAction = z.infer<typeof ShortcutAction>;

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, string> = {
  toggleStealth: 'CommandOrControl+Shift+I',
  toggleChat: 'CommandOrControl+Shift+H',
  toggleTranscription: 'CommandOrControl+Shift+T',
  toggleScreen: 'CommandOrControl+Shift+E',
  toggleHome: 'CommandOrControl+Shift+O',
  readScreen: 'CommandOrControl+Shift+S',
  askSelection: 'CommandOrControl+Shift+Y',
  toggleCapture: 'CommandOrControl+Shift+G',
  quit: 'CommandOrControl+Shift+Q',
};

export const ApiStatus = z.enum(['starting', 'ready', 'crashed']);
export type ApiStatus = z.infer<typeof ApiStatus>;

export const AppState = z.object({
  stealth: z.object({
    enabled: z.boolean(),
    supported: z.boolean(),
  }),
  windows: z.record(WindowId, z.object({ visible: z.boolean() })),
  shortcuts: z.record(ShortcutAction, z.string()),
  failedShortcuts: z.array(ShortcutAction),
  api: z.object({ status: ApiStatus }),
  capture: CaptureState,
  screenAuto: z.boolean(),
  configuredSecrets: z.array(SecretId),
  platform: z.enum(['win32', 'darwin', 'linux']),
  version: z.string(),
});
export type AppState = z.infer<typeof AppState>;
