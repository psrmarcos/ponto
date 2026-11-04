import type { Rectangle } from 'electron';
import type { WindowId } from '@ponto/shared';

export interface WindowDefinition {
  width: number;
  height: number;
  minWidth?: number;
  minHeight?: number;
  position: (area: Rectangle, width: number, height: number) => { x: number; y: number };
  showOnStart: boolean;
  floating: boolean;
}

const MARGIN = 24;

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
