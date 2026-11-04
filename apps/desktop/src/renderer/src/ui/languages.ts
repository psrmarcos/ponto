import { Language, LANGUAGE_NAMES, type Settings } from '@ponto/shared';

export const LANGUAGES: ReadonlyArray<{ value: Settings['language']; label: string }> = Language.options.map((v) => ({
  value: v,
  label: LANGUAGE_NAMES[v],
}));

export const TARGET_LANGUAGES: ReadonlyArray<{ value: Settings['translationTarget']; label: string }> = Language.options
  .filter((v): v is Settings['translationTarget'] => v !== 'auto')
  .map((v) => ({ value: v, label: LANGUAGE_NAMES[v] }));
