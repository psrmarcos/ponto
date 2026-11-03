import type { Configuracoes } from '@ponto/shared';

/** Idiomas da conversa (transcrição e respostas). O nome vai no próprio idioma, como a pessoa procura. */
export const IDIOMAS: ReadonlyArray<{ valor: Configuracoes['idioma']; rotulo: string }> = [
  { valor: 'auto', rotulo: 'Detectar idioma' },
  { valor: 'pt-BR', rotulo: 'Português (Brasil)' },
  { valor: 'pt-PT', rotulo: 'Português (Portugal)' },
  { valor: 'en', rotulo: 'English' },
  { valor: 'es', rotulo: 'Español' },
  { valor: 'fr', rotulo: 'Français' },
  { valor: 'de', rotulo: 'Deutsch' },
  { valor: 'it', rotulo: 'Italiano' },
  { valor: 'nl', rotulo: 'Nederlands' },
  { valor: 'ja', rotulo: '日本語' },
  { valor: 'ko', rotulo: '한국어' },
  { valor: 'zh', rotulo: '中文' },
  { valor: 'ru', rotulo: 'Русский' },
  { valor: 'hi', rotulo: 'हिन्दी' },
  { valor: 'tr', rotulo: 'Türkçe' },
  { valor: 'pl', rotulo: 'Polski' },
  { valor: 'sv', rotulo: 'Svenska' },
  { valor: 'da', rotulo: 'Dansk' },
  { valor: 'no', rotulo: 'Norsk' },
  { valor: 'fi', rotulo: 'Suomi' },
  { valor: 'uk', rotulo: 'Українська' },
  { valor: 'id', rotulo: 'Bahasa Indonesia' },
  { valor: 'vi', rotulo: 'Tiếng Việt' },
];
