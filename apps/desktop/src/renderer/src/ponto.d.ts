import type { PontoBridge } from '@ponto/shared';

declare global {
  interface Window {
    /** Ponte do preload (ver apps/desktop/src/preload/index.ts). Não existe fora do Electron. */
    ponto: PontoBridge;
  }
}

export {};
