import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  ipcContract,
  IPC_PREFIX,
  type SendChannel,
  type EventChannel,
  type InvokeChannel,
  type SendPayload,
  type EventPayload,
  type InvokeInput,
  type InvokeOutput,
} from '@ponto/shared';

export type InvokeHandlers = {
  [C in InvokeChannel]: (
    data: InvokeInput<C>,
    e: IpcMainInvokeEvent,
  ) => InvokeOutput<C> | Promise<InvokeOutput<C>>;
};
export type SendHandlers = { [C in SendChannel]: (data: SendPayload<C>, e: IpcMainEvent) => void };

/**
 * Binds the @ponto/shared contract to ipcMain. The `InvokeHandlers` type forces
 * every channel in the contract to be implemented; input is validated against
 * its Zod schema before reaching the handler, and only our windows may call it.
 */
export function registerIpc(
  invoke: InvokeHandlers,
  send: SendHandlers,
  isValidSender: (wc: WebContents) => boolean,
): void {
  for (const channel of Object.keys(ipcContract.invoke) as InvokeChannel[]) {
    const schema = ipcContract.invoke[channel].input;
    ipcMain.handle(IPC_PREFIX + channel, async (e, raw: unknown) => {
      if (!isValidSender(e.sender)) throw new Error('unauthorized sender');
      const r = schema.safeParse(raw);
      if (!r.success) throw new Error(`invalid payload on ${channel}: ${r.error.issues[0]?.message ?? ''}`);
      const fn = invoke[channel] as (d: unknown, e: IpcMainInvokeEvent) => unknown;
      return fn(r.data, e);
    });
  }
  for (const channel of Object.keys(ipcContract.send) as SendChannel[]) {
    const schema = ipcContract.send[channel];
    ipcMain.on(IPC_PREFIX + channel, (e, raw: unknown) => {
      if (!isValidSender(e.sender)) return;
      const r = schema.safeParse(raw);
      if (!r.success) return;
      (send[channel] as (d: unknown, e: IpcMainEvent) => void)(r.data, e);
    });
  }
}

export function emit<C extends EventChannel>(wc: WebContents, channel: C, data: EventPayload<C>): void {
  if (!wc.isDestroyed()) wc.send(IPC_PREFIX + channel, data);
}
