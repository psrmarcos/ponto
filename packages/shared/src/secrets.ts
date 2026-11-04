import { z } from 'zod';

export const SecretId = z.enum(['openrouter', 'openai', 'anthropic', 'deepgram']);
export type SecretId = z.infer<typeof SecretId>;

export const SecretStatus = z.object({
  configured: z.boolean(),
  lastFour: z.string().nullable(),
});
export type SecretStatus = z.infer<typeof SecretStatus>;
