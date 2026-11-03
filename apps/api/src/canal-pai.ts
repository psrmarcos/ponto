import { MensagemParaApi, type MensagemDaApi } from '@ponto/shared';

/**
 * Canal privado com o processo principal do Electron (process.parentPort do
 * utilityProcess). É por aqui, e nunca pela rede, que chegam as chaves de API.
 */
interface PortaPai {
  on(evento: 'message', ouvinte: (e: { data: unknown }) => void): void;
  postMessage(mensagem: unknown): void;
}

declare global {
  namespace NodeJS {
    interface Process {
      parentPort?: PortaPai;
    }
  }
}

type Ouvinte = (m: MensagemParaApi) => void;
const ouvintes: Ouvinte[] = [];

process.parentPort?.on('message', (e) => {
  const r = MensagemParaApi.safeParse(e.data);
  if (!r.success) return;
  for (const o of ouvintes) o(r.data);
});

export const canalPai = {
  aoReceber(o: Ouvinte): void {
    ouvintes.push(o);
  },
  enviar(m: MensagemDaApi): void {
    process.parentPort?.postMessage(m);
  },
};
