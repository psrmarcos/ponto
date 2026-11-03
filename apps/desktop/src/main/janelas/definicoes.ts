import type { Rectangle } from 'electron';
import type { IdJanela } from '@ponto/shared';

export interface DefinicaoJanela {
  largura: number;
  altura: number;
  larguraMinima?: number;
  alturaMinima?: number;
  /** Posição inicial na área útil do monitor principal (só na primeira execução). */
  posicao: (area: Rectangle, largura: number, altura: number) => { x: number; y: number };
  mostrarAoIniciar: boolean;
  /**
   * Janela flutuante (transparente, clique atravessa o que não é sólido) ou
   * janela "normal" opaca, como a Home.
   */
  flutuante: boolean;
}

const MARGEM = 24;

/**
 * Todas as janelas do app. Para adicionar uma, crie o id em
 * @ponto/shared (janelas.ts) e uma entrada aqui; o resto (stealth, z-order,
 * clique-através, memória de posição) vem do gerenciador.
 */
export const DEFINICOES: Record<IdJanela, DefinicaoJanela> = {
  agregador: {
    largura: 600,
    altura: 700,
    posicao: (a, l) => ({ x: a.x + Math.round((a.width - l) / 2), y: a.y + 16 }),
    mostrarAoIniciar: true,
    flutuante: true,
  },
  transcricao: {
    largura: 440,
    altura: 540,
    larguraMinima: 320,
    alturaMinima: 260,
    posicao: (a, _l, h) => ({ x: a.x + MARGEM, y: a.y + a.height - h - MARGEM }),
    mostrarAoIniciar: true,
    flutuante: true,
  },
  tela: {
    largura: 400,
    altura: 520,
    larguraMinima: 320,
    alturaMinima: 260,
    posicao: (a, l) => ({ x: a.x + a.width - l - MARGEM, y: a.y + 120 }),
    mostrarAoIniciar: true,
    flutuante: true,
  },
  home: {
    largura: 920,
    altura: 640,
    larguraMinima: 720,
    alturaMinima: 480,
    posicao: (a, l, h) => ({ x: a.x + Math.round((a.width - l) / 2), y: a.y + Math.round((a.height - h) / 2) }),
    mostrarAoIniciar: false,
    flutuante: false,
  },
};
