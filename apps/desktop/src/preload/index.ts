import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import { sendChannels, eventChannels, invokeChannels, IPC_PREFIX, type PontoBridge } from '@ponto/shared';

const invokeSet = new Set<string>(invokeChannels);
const sendSet = new Set<string>(sendChannels);
const eventSet = new Set<string>(eventChannels);

const bridge: PontoBridge = {
  invoke: (channel, ...args) => {
    if (!invokeSet.has(channel)) return Promise.reject(new Error(`unknown channel: ${channel}`));
    return ipcRenderer.invoke(IPC_PREFIX + channel, args[0]);
  },
  send: (channel, data) => {
    if (sendSet.has(channel)) ipcRenderer.send(IPC_PREFIX + channel, data);
  },
  on: (channel, listener) => {
    if (!eventSet.has(channel)) return () => {};
    const fn = (_e: IpcRendererEvent, data: unknown) => listener(data as never);
    ipcRenderer.on(IPC_PREFIX + channel, fn);
    return () => ipcRenderer.removeListener(IPC_PREFIX + channel, fn);
  },
};

contextBridge.exposeInMainWorld('ponto', bridge);
