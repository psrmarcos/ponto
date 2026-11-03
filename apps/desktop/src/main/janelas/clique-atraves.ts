import { screen, type BrowserWindow } from 'electron';
import type { Retangulo } from '@ponto/shared';

/** ~60 vezes por segundo: rápido o bastante para o clique nunca "escapar" na borda. */
const INTERVALO_MS = 16;

interface Estado {
  areas: Retangulo[];
  ignorando: boolean;
}

/**
 * Clique-através das janelas flutuantes, decidido aqui no main.
 *
 * Cada janela informa os retângulos que devem receber o mouse. Enquanto alguma
 * flutuante está visível, comparamos a posição do cursor com esses retângulos e
 * só chamamos setIgnoreMouseEvents quando o resultado muda. Não depende de
 * mousemove do renderer, que o Windows não entrega nas áreas de arrastar.
 */
export class CliqueAtravesService {
  private readonly estados = new Map<BrowserWindow, Estado>();
  private timer: NodeJS.Timeout | null = null;

  registrar(win: BrowserWindow): void {
    this.estados.set(win, { areas: [], ignorando: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.on('show', () => this.ligar());
    win.on('closed', () => this.estados.delete(win));
    if (win.isVisible()) this.ligar();
  }

  definirAreas(win: BrowserWindow, areas: Retangulo[]): void {
    const e = this.estados.get(win);
    if (!e) return; // a Home não é flutuante e não entra aqui
    e.areas = areas;
    this.verificar();
  }

  parar(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private ligar(): void {
    this.timer ??= setInterval(() => this.verificar(), INTERVALO_MS);
  }

  private verificar(): void {
    const p = screen.getCursorScreenPoint();
    let algumaVisivel = false;
    for (const [win, e] of this.estados) {
      if (win.isDestroyed() || !win.isVisible()) continue;
      algumaVisivel = true;
      const b = win.getContentBounds();
      const x = p.x - b.x;
      const y = p.y - b.y;
      const dentro = e.areas.some((a) => x >= a.x && x < a.x + a.width && y >= a.y && y < a.y + a.height);
      if (dentro === !e.ignorando) continue;
      e.ignorando = !dentro;
      win.setIgnoreMouseEvents(e.ignorando, { forward: true });
    }
    // Tudo escondido: para de olhar o cursor até alguma janela aparecer de novo.
    if (!algumaVisivel) this.parar();
  }
}
