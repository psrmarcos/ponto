import { z } from 'zod';
import { WindowId } from './windows';
import { SecretId } from './secrets';
import { CaptureState } from './transcription';

/** Configurable global shortcuts in Electron Accelerator format (e.g. "CommandOrControl+Shift+I"). */
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

/**
 * App state owned by the main process and mirrored across all windows.
 * Main always broadcasts the full object (it is small) so no window ever has a
 * partial or stale view.
 */
export const AppState = z.object({
  stealth: z.object({
    /** Global switch: when enabled, ALL windows are hidden from recordings and screenshots. */
    enabled: z.boolean(),
    /** false on Linux, where the OS does not offer capture protection. */
    supported: z.boolean(),
  }),
  windows: z.record(WindowId, z.object({ visible: z.boolean() })),
  shortcuts: z.record(ShortcutAction, z.string()),
  /** Shortcuts that the OS refused to register (already used by another app). */
  failedShortcuts: z.array(ShortcutAction),
  api: z.object({ status: ApiStatus }),
  capture: CaptureState,
  /** Automatic screen reading: reads automatically when the screen changes. In-memory only. */
  screenAuto: z.boolean(),
  /** Which API keys are configured (never the raw values). */
  configuredSecrets: z.array(SecretId),
  platform: z.enum(['win32', 'darwin', 'linux']),
  version: z.string(),
});
export type AppState = z.infer<typeof AppState>;
