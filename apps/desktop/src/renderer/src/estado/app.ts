import { create } from 'zustand';
import type { EstadoApp, IdJanela } from '@ponto/shared';

/** Espelho do estado que o processo principal é dono (stealth, janelas, atalhos, API). */
interface Store {
  estado: EstadoApp | null;
}

export const useEstadoApp = create<Store>(() => ({ estado: null }));

export function iniciarEstadoApp(): void {
  window.ponto.ouvir('estado', (estado) => useEstadoApp.setState({ estado }));
  void window.ponto.invocar('estado.obter').then((estado) => useEstadoApp.setState({ estado }));
}

/** Seletores pequenos: cada componente só re-renderiza quando o pedaço que usa muda. */
export const useStealth = () => useEstadoApp((s) => s.estado?.stealth ?? { ligado: true, suportado: true });
export const useJanelaVisivel = (id: IdJanela) => useEstadoApp((s) => s.estado?.janelas[id]?.visivel ?? false);
export const useStatusApi = () => useEstadoApp((s) => s.estado?.api.status ?? 'iniciando');

export const janelaAtual = (new URLSearchParams(location.search).get('janela') ?? 'agregador') as IdJanela;
