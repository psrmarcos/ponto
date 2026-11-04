import type { BrowserWindow } from 'electron';

/**
 * Reads the actual native window z-order on Windows so `ZOrderService` only
 * reorders when necessary. Reordering unnecessarily (`moveTop` on every window
 * every second) causes windows to swap places briefly and flicker.
 * On macOS/Linux returns null and `ZOrderService` falls back to periodic restacking.
 */
interface User32 {
  GetTopWindow: (hwnd: number) => number;
  GetWindow: (hwnd: number, cmd: number) => number;
  IsWindowVisible: (hwnd: number) => boolean;
  IsIconic: (hwnd: number) => boolean;
  GetWindowLongPtrW: (hwnd: number, idx: number) => number;
  GetWindowRect: (hwnd: number, out: WinRect) => boolean;
}
interface WinRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GW_HWNDNEXT = 2;
const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x8;
const WS_EX_TRANSPARENT = 0x20;
const MAX_WINDOWS = 600;

let u32: User32 | null | undefined;

function load(): User32 | null {
  if (u32 !== undefined) return u32;
  u32 = null;
  if (process.platform !== 'win32') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi');
    const lib = koffi.load('user32.dll');
    koffi.struct('PONTO_RECT', { left: 'long', top: 'long', right: 'long', bottom: 'long' });
    u32 = {
      GetTopWindow: lib.func('intptr_t __stdcall GetTopWindow(intptr_t hwnd)'),
      GetWindow: lib.func('intptr_t __stdcall GetWindow(intptr_t hwnd, uint32_t cmd)'),
      IsWindowVisible: lib.func('bool __stdcall IsWindowVisible(intptr_t hwnd)'),
      IsIconic: lib.func('bool __stdcall IsIconic(intptr_t hwnd)'),
      GetWindowLongPtrW: lib.func('intptr_t __stdcall GetWindowLongPtrW(intptr_t hwnd, int idx)'),
      GetWindowRect: lib.func('bool __stdcall GetWindowRect(intptr_t hwnd, _Out_ PONTO_RECT *rect)'),
    } as unknown as User32;
  } catch (e) {
    console.warn('[zorder] koffi unavailable, using periodic restacking:', (e as Error).message);
  }
  return u32;
}

export function hwndOf(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

function getRect(u: User32, h: number): WinRect | null {
  const r: WinRect = { left: 0, top: 0, right: 0, bottom: 0 };
  return u.GetWindowRect(h, r) ? r : null;
}

const overlaps = (a: WinRect, b: WinRect) =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

export function isAvailable(): boolean {
  return load() !== null;
}

/**
 * Checks whether the native z-order matches `ours` (ordered bottom-to-top, visible only).
 * Correct = no third-party topmost window is above and overlapping any of our windows,
 * and our windows appear in the same relative order as the stack.
 */
export function isOrderCorrect(ours: BrowserWindow[]): boolean | null {
  const u = load();
  if (!u) return null;
  if (!ours.length) return true;
  try {
    const ids = ours.map(hwndOf);
    const position = new Map(ids.map((h, i) => [h, i]));
    const rects = ids.map((h) => getRect(u, h)).filter((r): r is WinRect => !!r);
    // Walking from top to bottom, our windows must appear from the top of the stack down to the first.
    let expected = ids.length - 1;
    let h = u.GetTopWindow(0);
    for (let n = 0; h && n < MAX_WINDOWS && expected >= 0; n++, h = u.GetWindow(h, GW_HWNDNEXT)) {
      const p = position.get(Number(h));
      if (p !== undefined) {
        if (p !== expected) return false;
        expected--;
        continue;
      }
      if (!u.IsWindowVisible(h) || u.IsIconic(h)) continue;
      const ex = Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE));
      // Only care about topmost windows that actually draw over ours (transparent game/GPU overlays don't count).
      if (!(ex & WS_EX_TOPMOST) || ex & WS_EX_TRANSPARENT) continue;
      const r = getRect(u, h);
      if (r && r.right - r.left > 1 && r.bottom - r.top > 1 && rects.some((x) => overlaps(x, r))) return false;
    }
    return true;
  } catch {
    return null;
  }
}
