import { create } from 'zustand';
import type { AudioChannel, AudioLevels, Utterance, UtteranceTranslation } from '@ponto/shared';
import { api } from '../api/client';
import { useAppState } from './app';

interface TranscriptionStore {
  sessionId: string | null;
  utterances: Utterance[];
  notice: string | null;
  levels: AudioLevels;
  partials: Partial<Record<AudioChannel, { text: string; startMs: number }>>;
  translations: Record<string, UtteranceTranslation>;
  undoable: { utterances: Utterance[]; upToMs: number } | null;
  clear: () => void;
  undo: () => void;
}

const UNDO_TIMEOUT_MS = 8000;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

export const useTranscription = create<TranscriptionStore>((set, get) => ({
  sessionId: null,
  utterances: [],
  notice: null,
  levels: { microphone: 0, system: 0 },
  partials: {},
  translations: {},
  undoable: null,
  clear: () => {
    const { sessionId, utterances, undoable } = get();
    if (!sessionId || !utterances.length) return;
    if (undoable) confirmClear();
    const upToMs = Math.max(...utterances.map((u) => u.startMs));
    set({ utterances: [], undoable: { utterances, upToMs } });
    clearTimer = setTimeout(confirmClear, UNDO_TIMEOUT_MS);
  },
  undo: () => {
    const u = get().undoable;
    if (!u) return;
    if (clearTimer) clearTimeout(clearTimer);
    clearTimer = null;
    set((s) => ({ utterances: u.utterances.reduce(insertSorted, s.utterances), undoable: null }));
  },
}));

function confirmClear(): void {
  if (clearTimer) clearTimeout(clearTimer);
  clearTimer = null;
  const { sessionId, undoable } = useTranscription.getState();
  if (!sessionId || !undoable) return;
  useTranscription.setState({ undoable: null });
  api.delete(`/sessions/${sessionId}/utterances?upToMs=${undoable.upToMs}`).catch(() => {
    useTranscription.setState((s) => ({ utterances: undoable.utterances.reduce(insertSorted, s.utterances) }));
    showNotice('Não consegui limpar a transcrição. As falas voltaram.');
  });
}

function insertSorted(list: Utterance[], item: Utterance): Utterance[] {
  if (list.some((x) => x.id === item.id)) return list;
  let i = list.length;
  while (i > 0 && list[i - 1]!.startMs > item.startMs) i--;
  return [...list.slice(0, i), item, ...list.slice(i)];
}

let noticeTimer: ReturnType<typeof setTimeout> | null = null;
function showNotice(notice: string): void {
  useTranscription.setState({ notice });
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => useTranscription.setState({ notice: null }), 8000);
}

export function initTranscription(): void {
  const load = (id: string) =>
    void api
      .get<Utterance[]>(`/sessions/${id}/utterances`)
      .then((list) => {
        if (useTranscription.getState().sessionId !== id) return;
        const cutoff = useTranscription.getState().undoable?.upToMs ?? -1;
        useTranscription.setState((s) => ({
          utterances: list.filter((u) => u.startMs > cutoff).reduce(insertSorted, s.utterances),
        }));
      })
      .catch(() => {});
  const loadTranslations = (id: string) =>
    void api
      .get<UtteranceTranslation[]>(`/sessions/${id}/translations`)
      .then((list) => {
        if (useTranscription.getState().sessionId !== id || !list.length) return;
        useTranscription.setState((s) => ({
          translations: { ...Object.fromEntries(list.map((t) => [t.utteranceId, t])), ...s.translations },
        }));
      })
      .catch(() => {});

  let lastError: string | null = null;
  useAppState.subscribe((s) => {
    const id = s.state?.capture.sessionId ?? null;
    if (id && id !== useTranscription.getState().sessionId) {
      if (useTranscription.getState().undoable) confirmClear();
      useTranscription.setState({ sessionId: id, utterances: [], partials: {}, translations: {}, notice: null });
      load(id);
      loadTranslations(id);
    }
    const err = s.state?.capture.error;
    if (err && err !== lastError) showNotice(err);
    lastError = err ?? null;
  });
  api.onConnect(() => {
    const id = useTranscription.getState().sessionId;
    if (id) {
      load(id);
      loadTranslations(id);
    }
  });
  api.on((e) => {
    if (e.type === 'transcription.utterance' && e.utterance.sessionId === useTranscription.getState().sessionId) {
      useTranscription.setState((s) => ({ utterances: insertSorted(s.utterances, e.utterance) }));
    }
    if (e.type === 'transcription.translation' && e.translation.sessionId === useTranscription.getState().sessionId) {
      useTranscription.setState((s) => ({ translations: { ...s.translations, [e.translation.utteranceId]: e.translation } }));
    }
    if (e.type === 'transcription.partial' && e.sessionId === useTranscription.getState().sessionId) {
      useTranscription.setState((s) => {
        const partials = { ...s.partials };
        if (e.text) partials[e.channel] = { text: e.text, startMs: e.startMs };
        else delete partials[e.channel];
        return { partials };
      });
    }
    if (e.type === 'transcription.cleared' && e.sessionId === useTranscription.getState().sessionId) {
      useTranscription.setState((s) => ({ utterances: s.utterances.filter((u) => u.startMs > e.upToMs) }));
    }
    if (e.type === 'transcription.error') showNotice(e.message);
  });
  window.ponto.on('audio.levels', (levels) => useTranscription.setState({ levels }));
}
