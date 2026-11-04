import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { currentWindow, initAppState } from './state/app';
import { initDomain } from './state/domain';
import { initChat } from './state/chat';
import { initTranscription } from './state/transcription';
import { api } from './api/client';
import { installTooltips } from './ui/tooltips';
import './styles.css';

installTooltips();

initAppState();

if (new URLSearchParams(location.search).get('window') === 'capture') {
  void import('./capture/engine').then((m) => m.startCaptureEngine());
} else {
  document.body.dataset.window = currentWindow;
  initDomain();
  if (currentWindow === 'overlay') initChat();
  if (currentWindow === 'transcription') initTranscription();
  void api.connect();

  const root = document.getElementById('root');
  if (root) {
    createRoot(root).render(
      <StrictMode>
        <App windowId={currentWindow} />
      </StrictMode>,
    );
  }
}
