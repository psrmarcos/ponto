import { create } from 'zustand';
import { INITIAL_CAPTURE_STATE, type AppState, type WindowId } from '@ponto/shared';

/** Mirror of the state owned by the main process (stealth, windows, shortcuts, API). */
interface Store {
  state: AppState | null;
}

export const useAppState = create<Store>(() => ({ state: null }));

export function initAppState(): void {
  window.ponto.on('state', (state) => useAppState.setState({ state }));
  void window.ponto.invoke('state.get').then((state) => useAppState.setState({ state }));
}

/** Fine-grained selectors: each component only re-renders when its slice changes. */
export const useStealth = () => useAppState((s) => s.state?.stealth ?? { enabled: true, supported: true });
export const useWindowVisible = (id: WindowId) => useAppState((s) => s.state?.windows[id]?.visible ?? false);
export const useCapture = () => useAppState((s) => s.state?.capture ?? INITIAL_CAPTURE_STATE);
export const useApiStatus = () => useAppState((s) => s.state?.api.status ?? 'starting');

export const currentWindow = (new URLSearchParams(location.search).get('window') ?? 'overlay') as WindowId;
