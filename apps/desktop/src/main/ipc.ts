import { ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron';
import {
  contratoIpc,
  PREFIXO_IPC,
  type CanalEnviar,
  type CanalEvento,
  type CanalInvocar,
  type DadosEnviar,
  type DadosEvento,
  type EntradaInvocar,
  type SaidaInvocar,
} from '@ponto/shared';

export type Manipuladores = {
  [C in CanalInvocar]: (
    dados: EntradaInvocar<C>,
    e: IpcMainInvokeEvent,
  ) => SaidaInvocar<C> | Promise<SaidaInvocar<C>>;
};
export type ManipuladoresEnviar = { [C in CanalEnviar]: (dados: DadosEnviar<C>, e: IpcMainEvent) => void };

/**
 * Liga o contrato de @ponto/shared ao ipcMain. O tipo `Manipuladores` obriga a
 * implementar todo canal do contrato; a entrada é validada com o schema antes de
 * chegar no handler, e só as nossas janelas podem chamar.
 */
export function registrarIpc(
  invocar: Manipuladores,
  enviar: ManipuladoresEnviar,
  remetenteValido: (wc: WebContents) => boolean,
): void {
  for (const canal of Object.keys(contratoIpc.invocar) as CanalInvocar[]) {
    const schema = contratoIpc.invocar[canal].entrada;
    ipcMain.handle(PREFIXO_IPC + canal, async (e, bruto: unknown) => {
      if (!remetenteValido(e.sender)) throw new Error('remetente não autorizado');
      const r = schema.safeParse(bruto);
      if (!r.success) throw new Error(`dados inválidos em ${canal}: ${r.error.issues[0]?.message ?? ''}`);
      const fn = invocar[canal] as (d: unknown, e: IpcMainInvokeEvent) => unknown;
      return fn(r.data, e);
    });
  }
  for (const canal of Object.keys(contratoIpc.enviar) as CanalEnviar[]) {
    const schema = contratoIpc.enviar[canal];
    ipcMain.on(PREFIXO_IPC + canal, (e, bruto: unknown) => {
      if (!remetenteValido(e.sender)) return;
      const r = schema.safeParse(bruto);
      if (!r.success) return;
      (enviar[canal] as (d: unknown, e: IpcMainEvent) => void)(r.data, e);
    });
  }
}

export function emitir<C extends CanalEvento>(wc: WebContents, canal: C, dados: DadosEvento<C>): void {
  if (!wc.isDestroyed()) wc.send(PREFIXO_IPC + canal, dados);
}
