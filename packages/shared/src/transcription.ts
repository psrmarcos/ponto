import { z } from 'zod';

export const AudioChannel = z.enum(['microphone', 'system']);
export type AudioChannel = z.infer<typeof AudioChannel>;

export const Utterance = z.object({
  id: z.string(),
  sessionId: z.string(),
  channel: AudioChannel,
  speaker: z.string().nullable(),
  text: z.string(),
  startMs: z.number().int(),
  endMs: z.number().int(),
});
export type Utterance = z.infer<typeof Utterance>;

export const Session = z.object({
  id: z.string(),
  title: z.string(),
  agentId: z.string(),
  startedAt: z.number(),
  endedAt: z.number().nullable(),
  summary: z.string().nullable(),
});
export type Session = z.infer<typeof Session>;

export const SessionListItem = Session.omit({ summary: true }).extend({
  totalUtterances: z.number().int(),
  durationMs: z.number().int(),
  hasSummary: z.boolean(),
  generatingSummary: z.boolean(),
  costUsd: z.number(),
});
export type SessionListItem = z.infer<typeof SessionListItem>;

export const SessionUpdate = z.object({ title: z.string().trim().min(1).max(120) });
export type SessionUpdate = z.infer<typeof SessionUpdate>;

export const CreateSession = z.object({ agentId: z.string().optional() });
export type CreateSession = z.infer<typeof CreateSession>;

export const SttProviderId = z.enum(['openrouter', 'deepgram']);
export type SttProviderId = z.infer<typeof SttProviderId>;

export const STT_PROVIDERS_INFO: Record<SttProviderId, { name: string; defaultModel: string; secretId: 'openrouter' | 'deepgram' }> = {
  openrouter: { name: 'OpenRouter', defaultModel: 'openai/whisper-large-v3-turbo', secretId: 'openrouter' },
  deepgram: { name: 'Deepgram', defaultModel: 'nova-3', secretId: 'deepgram' },
};

export const AudioChunkQuery = z.object({
  sessionId: z.string().min(1).max(64),
  channel: AudioChannel,
  startMs: z.coerce.number().int().min(0),
  endMs: z.coerce.number().int().min(0),
});
export type AudioChunkQuery = z.infer<typeof AudioChunkQuery>;

export const CaptureStatus = z.enum(['stopped', 'starting', 'recording', 'paused']);
export type CaptureStatus = z.infer<typeof CaptureStatus>;

export const CaptureState = z.object({
  status: CaptureStatus,
  sessionId: z.string().nullable(),
  startedAt: z.number().nullable(),
  sources: z.object({ microphone: z.boolean(), system: z.boolean() }),
  error: z.string().nullable(),
});
export type CaptureState = z.infer<typeof CaptureState>;

export const INITIAL_CAPTURE_STATE: CaptureState = {
  status: 'stopped',
  sessionId: null,
  startedAt: null,
  sources: { microphone: false, system: false },
  error: null,
};

export const CaptureCommand = z.object({ action: z.enum(['start', 'pause', 'resume', 'stop']) });
export type CaptureCommand = z.infer<typeof CaptureCommand>;

export const AudioLevels = z.object({ microphone: z.number().min(0).max(1), system: z.number().min(0).max(1) });
export type AudioLevels = z.infer<typeof AudioLevels>;
