import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { canaisEnviar, canaisEvento, canaisInvocar, PREFIXO_IPC, type PontoBridge } from '@ponto/shared';

/**
 * Ponte entre as janelas (sem acesso a Node) e o processo principal.
 *
 * Expõe só três funções em `window.ponto`: invocar, enviar e ouvir. Os nomes de
 * canal aceitos vêm do contrato em @ponto/shared, então não existe canal "solto"
 * e nada do ipcRenderer vaza para a página. Para um canal novo, edite só o
 * contrato: este arquivo não muda.
 */
const invocar = new Set<string>(canaisInvocar);
const enviar = new Set<string>(canaisEnviar);
const eventos = new Set<string>(canaisEvento);

const ponte: PontoBridge = {
  invocar: (canal, ...dados) => {
    if (!invocar.has(canal)) return Promise.reject(new Error(`canal desconhecido: ${canal}`));
    return ipcRenderer.invoke(PREFIXO_IPC + canal, dados[0]);
  },
  enviar: (canal, dados) => {
    if (enviar.has(canal)) ipcRenderer.send(PREFIXO_IPC + canal, dados);
  },
  ouvir: (canal, ouvinte) => {
    if (!eventos.has(canal)) return () => {};
    // Nunca repassa o IpcRendererEvent para a página (ele dá acesso ao ipcRenderer).
    const fn = (_e: IpcRendererEvent, dados: unknown) => ouvinte(dados as never);
    ipcRenderer.on(PREFIXO_IPC + canal, fn);
    return () => ipcRenderer.removeListener(PREFIXO_IPC + canal, fn);
  },
};

contextBridge.exposeInMainWorld('ponto', ponte);
