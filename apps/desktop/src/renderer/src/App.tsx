import type { WindowId } from '@ponto/shared';
import { useClickThrough } from './hooks/useClickThrough';
import { Overlay } from './windows/Overlay';
import { Home } from './windows/Home';
import { Screen } from './windows/Screen';
import { Transcription } from './windows/Transcription';

const WINDOWS: Record<WindowId, () => React.JSX.Element> = {
  overlay: Overlay,
  transcription: Transcription,
  screen: Screen,
  home: Home,
};

export function App({ windowId }: { windowId: WindowId }) {
  // Home is opaque and receives all clicks; floating windows let clicks pass through outside solid areas.
  useClickThrough(windowId !== 'home');
  const WindowComponent = WINDOWS[windowId] ?? Overlay;
  return <WindowComponent />;
}
