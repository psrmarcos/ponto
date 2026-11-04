import { MessageToApi, type MessageFromApi } from '@ponto/shared';

/**
 * Private channel with the Electron main process (process.parentPort of the
 * utilityProcess). API keys arrive over this channel and never over the network.
 */
interface ParentPort {
  on(event: 'message', listener: (e: { data: unknown }) => void): void;
  postMessage(message: unknown): void;
}

declare global {
  namespace NodeJS {
    interface Process {
      parentPort?: ParentPort;
    }
  }
}

type Listener = (m: MessageToApi) => void;
const listeners: Listener[] = [];

process.parentPort?.on('message', (e) => {
  const r = MessageToApi.safeParse(e.data);
  if (!r.success) return;
  for (const l of listeners) l(r.data);
});

export const parentChannel = {
  onReceive(l: Listener): void {
    listeners.push(l);
  },
  send(m: MessageFromApi): void {
    process.parentPort?.postMessage(m);
  },
};
