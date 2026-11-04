import type { PontoBridge } from '@ponto/shared';

declare global {
  interface Window {
    /** Preload bridge (see apps/desktop/src/preload/index.ts). Only exists inside Electron. */
    ponto: PontoBridge;
  }
}

export {};
