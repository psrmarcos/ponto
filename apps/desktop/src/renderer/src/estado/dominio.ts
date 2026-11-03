import { create } from 'zustand';
import type { Agente, Configuracoes, ResumoUso } from '@ponto/shared';
import { api } from '../api/cliente';

/** Dados da API compartilhados pelas janelas (cada janela tem sua cópia, sincronizada pelo WebSocket). */
interface Dominio {
  configuracoes: Configuracoes | null;
  agentes: Agente[];
  uso: ResumoUso | null;
  salvarConfiguracoes: (parcial: Partial<Configuracoes>) => Promise<void>;
}

export const useDominio = create<Dominio>((set) => ({
  configuracoes: null,
  agentes: [],
  uso: null,
  salvarConfiguracoes: async (parcial) => {
    // Otimista: a UI muda na hora; o WebSocket confirma para todas as janelas.
    set((s) => (s.configuracoes ? { configuracoes: { ...s.configuracoes, ...parcial } } : s));
    const c = await api.patch<Configuracoes>('/configuracoes', parcial);
    set({ configuracoes: c });
  },
}));

export function iniciarDominio(): void {
  api.quandoConectar(() => {
    void api.get<Configuracoes>('/configuracoes').then((configuracoes) => useDominio.setState({ configuracoes }));
    void api.get<Agente[]>('/agentes').then((agentes) => useDominio.setState({ agentes }));
    void api.get<ResumoUso>('/uso/resumo').then((uso) => useDominio.setState({ uso }));
  });
  api.ouvir((e) => {
    if (e.tipo === 'configuracoes') useDominio.setState({ configuracoes: e.configuracoes });
    if (e.tipo === 'uso') useDominio.setState({ uso: e.resumo });
    if (e.tipo === 'agentes') useDominio.setState({ agentes: e.agentes });
  });
}
