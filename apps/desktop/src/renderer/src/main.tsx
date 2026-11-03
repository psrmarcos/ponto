import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { iniciarEstadoApp, janelaAtual } from './estado/app';
import { iniciarDominio } from './estado/dominio';
import { iniciarChat } from './estado/chat';
import { api } from './api/cliente';
import './styles.css';

document.body.dataset.janela = janelaAtual;

iniciarEstadoApp();
iniciarDominio();
if (janelaAtual === 'agregador') iniciarChat();
void api.conectar();

const raiz = document.getElementById('raiz');
if (raiz) {
  createRoot(raiz).render(
    <StrictMode>
      <App janela={janelaAtual} />
    </StrictMode>,
  );
}
