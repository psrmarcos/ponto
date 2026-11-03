import { z } from 'zod';
import { IdJanela, Retangulo } from './janelas';
import { AcaoAtalho, EstadoApp } from './estado';
import { IdSegredo, StatusSegredo } from './segredos';
import { ComandoCaptura, EstadoCaptura, NiveisAudio } from './transcricao';

export const ConexaoApi = z.object({ url: z.string().url(), ws: z.string(), token: z.string() });
export type ConexaoApi = z.infer<typeof ConexaoApi>;

export const ImagemEscolhida = z.object({ nome: z.string(), dataUrl: z.string() });
export type ImagemEscolhida = z.infer<typeof ImagemEscolhida>;

const nada = z.void();

/**
 * Contrato único entre renderer e processo principal.
 *
 * - `invocar`: o renderer pede e espera resposta (ipcRenderer.invoke).
 * - `enviar`: o renderer avisa, sem resposta (ipcRenderer.send). Para coisas de alta frequência.
 * - `eventos`: o main avisa as janelas (webContents.send).
 *
 * Para criar um canal novo basta adicionar aqui: o preload libera o nome
 * automaticamente, o main é obrigado (pelo tipo) a implementar o handler e valida
 * a entrada com o schema antes de chamar o seu código.
 */
export const contratoIpc = {
  invocar: {
    'estado.obter': { entrada: nada, saida: EstadoApp },
    'stealth.definir': { entrada: z.object({ ligado: z.boolean() }), saida: nada },
    'janela.alternar': { entrada: z.object({ id: IdJanela, visivel: z.boolean().optional() }), saida: nada },
    'janela.focarEntrada': { entrada: nada, saida: nada },
    'atalhos.definir': {
      entrada: z.object({ acao: AcaoAtalho, accelerator: z.string().min(1) }),
      saida: z.object({ ok: z.boolean(), erro: z.string().optional() }),
    },
    'atalhos.restaurarPadrao': { entrada: nada, saida: nada },
    'api.conexao': { entrada: nada, saida: ConexaoApi.nullable() },
    'segredos.status': { entrada: nada, saida: z.record(IdSegredo, StatusSegredo) },
    'segredos.definir': {
      entrada: z.object({ id: IdSegredo, valor: z.string().trim().min(1).max(500).nullable() }),
      saida: StatusSegredo,
    },
    'arquivo.escolherImagem': { entrada: nada, saida: ImagemEscolhida.nullable() },
    'app.sair': { entrada: nada, saida: nada },
    /** Gravar, pausar, retomar ou encerrar a sessão de transcrição. */
    'captura.comandar': { entrada: ComandoCaptura, saida: nada },
  },
  enviar: {
    /** Retângulos (px da janela) que recebem o mouse; fora deles o clique atravessa. */
    'janela.areasSolidas': z.object({ areas: z.array(Retangulo).max(64) }),
    /** Só da janela de captura (invisível): como está a gravação. */
    'captura.status': EstadoCaptura,
    /** Só da janela de captura: volume dos canais, ~10 vezes por segundo. */
    'captura.niveis': NiveisAudio,
  },
  eventos: {
    estado: EstadoApp,
    'chat.alternar': nada,
    'tela.ler': nada,
    /** Para a janela de captura: o que fazer. */
    'captura.comando': ComandoCaptura,
    /** Para as janelas visíveis, enquanto grava. */
    'audio.niveis': NiveisAudio,
  },
} as const;

type Contrato = typeof contratoIpc;
export type CanalInvocar = keyof Contrato['invocar'];
export type CanalEnviar = keyof Contrato['enviar'];
export type CanalEvento = keyof Contrato['eventos'];

export type EntradaInvocar<C extends CanalInvocar> = z.input<Contrato['invocar'][C]['entrada']>;
export type SaidaInvocar<C extends CanalInvocar> = z.output<Contrato['invocar'][C]['saida']>;
export type DadosEnviar<C extends CanalEnviar> = z.input<Contrato['enviar'][C]>;
export type DadosEvento<C extends CanalEvento> = z.output<Contrato['eventos'][C]>;

/** Nomes liberados no preload (allowlist). Derivados do contrato para nunca divergirem. */
export const canaisInvocar = Object.keys(contratoIpc.invocar) as CanalInvocar[];
export const canaisEnviar = Object.keys(contratoIpc.enviar) as CanalEnviar[];
export const canaisEvento = Object.keys(contratoIpc.eventos) as CanalEvento[];

/** Prefixo dos canais no Electron, para não colidir com canais internos. */
export const PREFIXO_IPC = 'ponto:';

/** O que o preload expõe em `window.ponto`. */
export interface PontoBridge {
  invocar<C extends CanalInvocar>(
    canal: C,
    ...dados: EntradaInvocar<C> extends void ? [] : [EntradaInvocar<C>]
  ): Promise<SaidaInvocar<C>>;
  enviar<C extends CanalEnviar>(canal: C, dados: DadosEnviar<C>): void;
  /** Retorna uma função que cancela a inscrição. */
  ouvir<C extends CanalEvento>(canal: C, ouvinte: (dados: DadosEvento<C>) => void): () => void;
}
