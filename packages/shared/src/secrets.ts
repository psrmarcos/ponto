import { z } from 'zod';

/**
 * API keys registered by the user. Stored only in the main process, encrypted
 * with the OS vault (safeStorage). The renderer never receives the raw value,
 * only whether it is configured.
 */
export const SecretId = z.enum(['openrouter', 'openai', 'anthropic', 'deepgram']);
export type SecretId = z.infer<typeof SecretId>;

export const SecretStatus = z.object({
  configured: z.boolean(),
  /** Last 4 characters so the user can recognize which key is saved. */
  lastFour: z.string().nullable(),
});
export type SecretStatus = z.infer<typeof SecretStatus>;
