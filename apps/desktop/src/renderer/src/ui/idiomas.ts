import type { Configuracoes } from '@ponto/shared';

/** Idiomas da conversa (transcrição e respostas). */
export const IDIOMAS: ReadonlyArray<{ valor: Configuracoes['idioma']; rotulo: string }> = [
  { valor: 'auto', rotulo: 'Detectar idioma' },
  { valor: 'pt-BR', rotulo: 'Português (BR)' },
  { valor: 'en', rotulo: 'English' },
  { valor: 'es', rotulo: 'Español' },
];
