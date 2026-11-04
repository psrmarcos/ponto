import type { PontoBridge } from '@ponto/shared';

declare global {
  interface Window {
    ponto: PontoBridge;
  }
}

export {};
