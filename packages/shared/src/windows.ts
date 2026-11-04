import { z } from 'zod';

export const WindowId = z.enum(['overlay', 'transcription', 'screen', 'home']);
export type WindowId = z.infer<typeof WindowId>;

export const Rect = z.object({
  x: z.number().int(),
  y: z.number().int(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Rect = z.infer<typeof Rect>;
