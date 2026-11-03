import type { BrowserWindow } from 'electron';

/**
 * Correção da "faixa branca" no Windows.
 *
 * Em janela transparente sem moldura, o Windows às vezes pinta a área
 * não-cliente (uma barra branca com o título) quando a ativação muda: clicar na
 * janela, abrir um diálogo, trocar de app. A pintura fica presa até a moldura ser
 * redesenhada. Testado no PC do Marcos: RedrawWindow com RDW_FRAME apaga na hora.
 * O Electron não expõe isso, então chamamos a user32 direto via koffi.
 * Em macOS/Linux tudo aqui vira no-op.
 */
type FnRedraw = (hwnd: number, rect: number, rgn: number, flags: number) => boolean;

const RDW_INVALIDATE = 0x0001;
const RDW_UPDATENOW = 0x0100;
const RDW_FRAME = 0x0400;
const WM_ACTIVATE = 0x0006;
const WM_SETTEXT = 0x000c;
const WM_ACTIVATEAPP = 0x001c;
const WM_NCACTIVATE = 0x0086;

let redraw: FnRedraw | null | undefined;

function carregar(): FnRedraw | null {
  if (redraw !== undefined) return redraw;
  redraw = null;
  if (process.platform !== 'win32') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const koffi = require('koffi') as typeof import('koffi');
    const user32 = koffi.load('user32.dll');
    redraw = user32.func(
      'bool __stdcall RedrawWindow(intptr_t hwnd, intptr_t rect, intptr_t rgn, uint32_t flags)',
    ) as unknown as FnRedraw;
  } catch (e) {
    console.warn('[moldura] koffi indisponível, sem limpeza da faixa branca:', (e as Error).message);
  }
  return redraw;
}

function hwnd(win: BrowserWindow): number {
  const buf = win.getNativeWindowHandle();
  return buf.length >= 8 ? Number(buf.readBigUInt64LE(0)) : buf.readUInt32LE(0);
}

export function limparMoldura(win: BrowserWindow): void {
  const fn = carregar();
  if (!fn || win.isDestroyed() || !win.isVisible()) return;
  try {
    fn(hwnd(win), 0, 0, RDW_INVALIDATE | RDW_FRAME | RDW_UPDATENOW);
  } catch {
    // janela sumiu no meio do caminho
  }
}

/** Limpa logo depois e de novo um pouco depois (o Windows às vezes pinta com atraso). */
export function agendarLimpeza(win: BrowserWindow): void {
  setTimeout(() => limparMoldura(win), 30);
  setTimeout(() => limparMoldura(win), 300);
}

export function protegerMoldura(win: BrowserWindow): void {
  if (process.platform !== 'win32' || !carregar()) return;
  for (const msg of [WM_ACTIVATE, WM_SETTEXT, WM_ACTIVATEAPP, WM_NCACTIVATE]) {
    win.hookWindowMessage(msg, () => agendarLimpeza(win));
  }
  for (const ev of ['focus', 'blur', 'show', 'restore'] as const) {
    win.on(ev as 'focus', () => agendarLimpeza(win));
  }
}
