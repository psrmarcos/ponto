import type { BrowserWindow } from 'electron';

/**
 * Leitura da ordem real das janelas no Windows (z-order), para o ZOrderService
 * só reordenar quando precisa. Reordenar sem precisar (moveTop em todas a cada
 * segundo) faz as janelas trocarem de lugar por um instante: é a piscada.
 * Em macOS/Linux devolve null e o ZOrderService segue o jeito antigo.
 */
interface User32 {
  GetTopWindow: (hwnd: number) => number;
  GetWindow: (hwnd: number, cmd: number) => number;
  IsWindowVisible: (hwnd: number) => boolean;
  IsIconic: (hwnd: number) => boolean;
  GetWindowLongPtrW: (hwnd: number, idx: number) => number;
  GetWindowRect: (hwnd: number, out: Retangulo) => boolean;
}
interface Retangulo {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

const GW_HWNDNEXT = 2;
const GWL_EXSTYLE = -20;
const WS_EX_TOPMOST = 0x8;
const WS_EX_TRANSPARENT = 0x20;
const MAX_JANELAS = 600;

let u32: User32 | null | undefined;

function carregar(): User32 | null {
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
    console.warn('[zorder] koffi indisponível, usando reordenação periódica:', (e as Error).message);
  }
  return u32;
}

export function hwndDe(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

function retangulo(u: User32, h: number): Retangulo | null {
  const r: Retangulo = { left: 0, top: 0, right: 0, bottom: 0 };
  return u.GetWindowRect(h, r) ? r : null;
}

const cruzam = (a: Retangulo, b: Retangulo) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/** null: não dá para saber (fora do Windows) e o chamador decide. */
export function disponivel(): boolean {
  return carregar() !== null;
}

/**
 * A ordem está certa? `nossas` vem de baixo para cima e só com as visíveis.
 * Certa = nenhuma janela de outro app "sempre no topo" por cima de alguma nossa
 * (e cobrindo ela) e as nossas na mesma ordem relativa da pilha.
 */
export function ordemCerta(nossas: BrowserWindow[]): boolean | null {
  const u = carregar();
  if (!u) return null;
  if (!nossas.length) return true;
  try {
    const ids = nossas.map(hwndDe);
    const posicao = new Map(ids.map((h, i) => [h, i]));
    const rets = ids.map((h) => retangulo(u, h)).filter((r): r is Retangulo => !!r);
    // Andando do topo para baixo, as nossas devem aparecer da última da pilha para a primeira.
    let esperada = ids.length - 1;
    let h = u.GetTopWindow(0);
    for (let n = 0; h && n < MAX_JANELAS && esperada >= 0; n++, h = u.GetWindow(h, GW_HWNDNEXT)) {
      const p = posicao.get(Number(h));
      if (p !== undefined) {
        if (p !== esperada) return false;
        esperada--;
        continue;
      }
      if (!u.IsWindowVisible(h) || u.IsIconic(h)) continue;
      const ex = Number(u.GetWindowLongPtrW(h, GWL_EXSTYLE));
      // Só incomoda quem é "sempre no topo" e de fato desenha por cima (sobreposições transparentes de jogos/GPU não contam).
      if (!(ex & WS_EX_TOPMOST) || ex & WS_EX_TRANSPARENT) continue;
      const r = retangulo(u, h);
      if (r && r.right - r.left > 1 && r.bottom - r.top > 1 && rets.some((x) => cruzam(x, r))) return false;
    }
    return true;
  } catch {
    return null;
  }
}
