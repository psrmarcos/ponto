import type { Rectangle } from 'electron';
import type { WindowId } from '@ponto/shared';

export interface WindowDefinition {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  /** Initial position within the primary display work area (first run only). */
  position: (area: Rectangle, width: number, height: number) => { x: number; y: number };
  showOnStart: boolean;
  /**
   * Floating window (transparent, click-through outside solid areas) or
   * standard opaque window, like Home.
   */
  floating: boolean;
}

const MARGIN = 24;

/**
 * All app windows. To add a new window, declare its id in @ponto/shared
 * (`windows.ts`) and add an entry here; everything else (stealth, z-order,
 * click-through, position persistence) is handled by `WindowManager`.
 */
export const WINDOW_DEFINITIONS: Record<WindowId, WindowDefinition> = {
  overlay: {
    width: 600,
    height: 700,
    position: (a, w) => ({ x: a.x + Math.round((a.width - w) / 2), y: a.y + 16 }),
    showOnStart: true,
    floating: true,
  },
  transcription: {
    width: 440,
    height: 540,
    minWidth: 320,
    minHeight: 260,
    position: (a, _w, h) => ({ x: a.x + MARGIN, y: a.y + a.height - h - MARGIN }),
    showOnStart: true,
    floating: true,
  },
  screen: {
    width: 400,
    height: 520,
    minWidth: 320,
    minHeight: 260,
    position: (a, w) => ({ x: a.x + a.width - w - MARGIN, y: a.y + 120 }),
    showOnStart: true,
    floating: true,
  },
  home: {
    width: 920,
    height: 640,
    minWidth: 720,
    minHeight: 480,
    position: (a, w, h) => ({ x: a.x + Math.round((a.width - w) / 2), y: a.y + Math.round((a.height - h) / 2) }),
    showOnStart: false,
    floating: false,
  },
};
