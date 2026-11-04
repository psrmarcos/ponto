import { create } from 'zustand';
import type { Agent, Settings, UsageSummary } from '@ponto/shared';
import { api } from '../api/client';

interface Domain {
  settings: Settings | null;
  agents: Agent[];
  usage: UsageSummary | null;
  saveSettings: (partial: Partial<Settings>) => Promise<void>;
}

export const useDomain = create<Domain>((set) => ({
  settings: null,
  agents: [],
  usage: null,
  saveSettings: async (partial) => {
    set((s) => (s.settings ? { settings: { ...s.settings, ...partial } } : s));
    const updated = await api.patch<Settings>('/settings', partial);
    set({ settings: updated });
  },
}));

export function initDomain(): void {
  api.onConnect(() => {
    void api.get<Settings>('/settings').then((settings) => useDomain.setState({ settings }));
    void api.get<Agent[]>('/agents').then((agents) => useDomain.setState({ agents }));
    void api.get<UsageSummary>('/usage/summary').then((usage) => useDomain.setState({ usage }));
  });
  api.on((e) => {
    if (e.type === 'settings') useDomain.setState({ settings: e.settings });
    if (e.type === 'usage') useDomain.setState({ usage: e.summary });
    if (e.type === 'agents') useDomain.setState({ agents: e.agents });
  });
}
