import { create } from 'zustand';
import type { AiUsage, ChatRequest, ChatResponse } from '@ponto/shared';
import { api } from '../api/client';
import { useAppState } from './app';
import { useDomain } from './domain';

export interface Message {
  id: string;
  role: 'user' | 'ai';
  text: string;
  images?: string[];
  state: 'sending' | 'streaming' | 'ready' | 'error';
  model?: string;
  usage?: AiUsage | null;
  automatic?: boolean;
  cap?: boolean;
}

export interface Attachment {
  id: string;
  name: string;
  dataUrl: string;
}

interface Chat {
  conversationId: string;
  messages: Message[];
  attachments: Attachment[];
  web: boolean;
  reasoning: boolean;
  busy: boolean;
  send: (text: string, shortcut?: ChatRequest['shortcut']) => Promise<void>;
  attach: (att: Omit<Attachment, 'id'>) => void;
  removeAttachment: (id: string) => void;
  toggleWeb: () => void;
  toggleReasoning: () => void;
  newConversation: () => void;
}

const newId = () => crypto.randomUUID();
const MAX_ATTACHMENTS = 4;

export const useChat = create<Chat>((set, get) => ({
  conversationId: newId(),
  messages: [],
  attachments: [],
  web: false,
  reasoning: false,
  busy: false,

  send: async (text, shortcut = null) => {
    const { attachments, web, reasoning, conversationId } = get();
    const trimmed = text.trim();
    if (!trimmed && !shortcut && !attachments.length) return;
    const settings = useDomain.getState().settings;
    const userId = newId();
    const aiId = newId();
    set((s) => ({
      attachments: [],
      busy: true,
      messages: [
        ...s.messages,
        { id: userId, role: 'user', text: trimmed || shortcutLabel(shortcut), images: attachments.map((a) => a.dataUrl), state: 'ready' },
        { id: aiId, role: 'ai', text: '', state: 'sending' },
      ],
    }));
    try {
      const req: ChatRequest = {
        conversationId,
        responseId: aiId,
        text: trimmed,
        shortcut,
        agentId: settings?.activeAgentId ?? 'general',
        web,
        reasoning,
        images: attachments.map((a) => a.dataUrl),
        sessionId: useAppState.getState().state?.capture.sessionId ?? null,
      };
      pending.set(aiId, true);
      await api.post<ChatResponse>('/chat/messages', req);
    } catch (err) {
      pending.delete(aiId);
      set((s) => ({
        busy: pending.size > 0,
        messages: s.messages.map((m) => (m.id === aiId ? { ...m, text: (err as Error).message, state: 'error' } : m)),
      }));
    }
  },

  attach: (att) =>
    set((s) => (s.attachments.length >= MAX_ATTACHMENTS ? s : { attachments: [...s.attachments, { ...att, id: newId() }] })),
  removeAttachment: (id) => set((s) => ({ attachments: s.attachments.filter((a) => a.id !== id) })),
  toggleWeb: () => set((s) => ({ web: !s.web })),
  toggleReasoning: () => set((s) => ({ reasoning: !s.reasoning })),
  newConversation: () => set({ conversationId: newId(), messages: [], attachments: [], busy: false }),
}));

const pending = new Map<string, true>();

function shortcutLabel(shortcut: ChatRequest['shortcut']): string {
  if (shortcut === 'assist') return 'Assist';
  if (shortcut === 'whatToSay') return 'O que devo dizer?';
  if (shortcut === 'followUp') return 'Perguntas de follow-up';
  if (shortcut === 'screen') return 'Ler a tela';
  if (shortcut === 'selection') return 'Texto selecionado';
  return '(imagem)';
}

export function initChat(): void {
  const update = (id: string, fn: (m: Message) => Message) =>
    useChat.setState((s) => ({ messages: s.messages.map((m) => (m.id === id ? fn(m) : m)) }));

  window.ponto.on('screen.read', ({ dataUrl }) => {
    const chat = useChat.getState();
    chat.attach({ name: 'Tela', dataUrl });
    void chat.send('', 'screen');
  });

  window.ponto.on('selection.read', ({ text }) => {
    if (!text) {
      const id = newId();
      useChat.setState((s) => ({
        messages: [
          ...s.messages,
          { id, role: 'ai', text: 'Não achei texto selecionado. Selecione um trecho e aperte o atalho de novo.', state: 'error' },
        ],
      }));
      return;
    }
    void useChat.getState().send(text, 'selection');
  });

  api.on((e) => {
    switch (e.type) {
      case 'suggestion.new':
        pending.set(e.responseId, true);
        useChat.setState((s) => ({
          busy: true,
          messages: [
            ...s.messages,
            { id: newId(), role: 'user', text: e.question, state: 'ready', automatic: true },
            { id: e.responseId, role: 'ai', text: '', state: 'sending' },
          ],
        }));
        break;
      case 'chat.start':
        update(e.responseId, (m) => ({ ...m, state: 'streaming', model: e.model }));
        break;
      case 'chat.delta':
        update(e.responseId, (m) => ({ ...m, state: 'streaming', text: m.text + e.text }));
        break;
      case 'chat.end':
        pending.delete(e.responseId);
        update(e.responseId, (m) => ({ ...m, state: 'ready', usage: e.usage }));
        useChat.setState({ busy: pending.size > 0 });
        break;
      case 'chat.error':
        pending.delete(e.responseId);
        update(e.responseId, (m) => ({ ...m, state: 'error', text: e.message, cap: e.code === 'budget' }));
        useChat.setState({ busy: pending.size > 0 });
        break;
    }
  });
}
