import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { iniciarEstadoApp, janelaAtual } from './estado/app';
import { iniciarDominio } from './estado/dominio';
import { iniciarChat } from './estado/chat';
import { iniciarTranscricao } from './estado/transcricao';
import { api } from './api/cliente';
import './styles.css';

iniciarEstadoApp();

if (new URLSearchParams(location.search).get('janela') === 'captura') {
  // A janela invisível de captura não desenha nada: só liga o motor de áudio.
  void import('./captura/motor').then((m) => m.iniciarMotorCaptura());
} else {
  document.body.dataset.janela = janelaAtual;
  iniciarDominio();
  if (janelaAtual === 'agregador') iniciarChat();
  if (janelaAtual === 'transcricao') iniciarTranscricao();
  void api.conectar();

  const raiz = document.getElementById('raiz');
  if (raiz) {
    createRoot(raiz).render(
      <StrictMode>
        <App janela={janelaAtual} />
      </StrictMode>,
    );
  }
}
