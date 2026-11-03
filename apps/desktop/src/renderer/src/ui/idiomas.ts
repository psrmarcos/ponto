import { Idioma, NOMES_IDIOMA, type Configuracoes } from '@ponto/shared';

/** Idiomas da conversa (transcrição e respostas). O nome vai no próprio idioma, como a pessoa procura. */
export const IDIOMAS: ReadonlyArray<{ valor: Configuracoes['idioma']; rotulo: string }> = Idioma.options.map((v) => ({
  valor: v,
  rotulo: NOMES_IDIOMA[v],
}));

/** Para onde traduzir (sem "detectar"). */
export const IDIOMAS_DESTINO: ReadonlyArray<{ valor: Configuracoes['traducaoDestino']; rotulo: string }> = Idioma.options
  .filter((v): v is Configuracoes['traducaoDestino'] => v !== 'auto')
  .map((v) => ({ valor: v, rotulo: NOMES_IDIOMA[v] }));
