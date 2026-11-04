import type { BrowserWindow } from 'electron';

type FnRedraw = (hwnd: number, rect: number, rgn: number, flags: number) => boolean;

const RDW_INVALIDATE = 0x0001;
const RDW_UPDATENOW = 0x0100;
const RDW_FRAME = 0x0400;
const WM_ACTIVATE = 0x0006;
const WM_SETTEXT = 0x000c;
const WM_ACTIVATEAPP = 0x001c;
const WM_NCACTIVATE = 0x0086;

let redraw: FnRedraw | null | undefined;

function load(): FnRedraw | null {
  if (redraw !== undefined) return redraw;
  redraw = null;
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    redraw = user32.func(
      'bool __stdcall RedrawWindow(intptr_t hwnd, intptr_t rect, intptr_t rgn, uint32_t flags)',
    ) as unknown as FnRedraw;
  } catch (e) {
    console.warn('[frame] koffi unavailable, white-bar frame cleanup disabled:', (e as Error).message);
  }
  return redraw;
}

function hwnd(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

export function clearFrame(win: BrowserWindow): void {
  const fn = load();
  if (!fn || win.isDestroyed() || !win.isVisible()) return;
  try {
    fn(hwnd(win), 0, 0, RDW_INVALIDATE | RDW_FRAME | RDW_UPDATENOW);
  } catch {
  }
}

export function scheduleFrameClear(win: BrowserWindow): void {
  setTimeout(() => clearFrame(win), 30);
  setTimeout(() => clearFrame(win), 300);
}

export function protectFrame(win: BrowserWindow): void {
  if (process.platform !== 'win32' || !load()) return;
  for (const msg of [WM_ACTIVATE, WM_SETTEXT, WM_ACTIVATEAPP, WM_NCACTIVATE]) {
    win.hookWindowMessage(msg, () => scheduleFrameClear(win));
  }
  for (const ev of ['focus', 'blur', 'show', 'restore'] as const) {
    win.on(ev as 'focus', () => scheduleFrameClear(win));
  }
}
