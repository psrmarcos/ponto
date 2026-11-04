import { z } from 'zod';

/**
 * Application windows. Each one is an independent BrowserWindow loading the
 * same renderer with `?window=<id>`. To add a new window:
 *   1. add the id here;
 *   2. define its size/position in apps/desktop/src/main/windows/definitions.ts;
 *   3. create the component in apps/desktop/src/renderer/src/windows/ and register it in App.tsx.
 */
export const WindowId = z.enum(['overlay', 'transcription', 'screen', 'home']);
export type WindowId = z.infer<typeof WindowId>;

export const Rect = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Rect = z.infer<typeof Rect>;
