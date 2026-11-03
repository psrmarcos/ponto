import { BrowserWindow, screen, type Rectangle } from 'electron';
import { join } from 'node:path';
import type { IdJanela, Retangulo } from '@ponto/shared';
import type { PreferenciasService } from '../preferencias';
import { DEFINICOES } from './definicoes';
import { protegerMoldura } from './moldura-win32';
import { StealthService } from './stealth';
import { ZOrderService } from './zorder';
import { CliqueAtravesService } from './clique-atraves';

const COR_HOME = '#16161B';

/**
 * Cria e controla as janelas. Cada janela é independente (posição, tamanho,
 * visível ou não) e todas passam pelas mesmas regras: stealth, z-order,
 * clique-através e correção da faixa branca.
 */
export class GerenciadorJanelas {
  private readonly janelas = new Map<IdJanela, BrowserWindow>();
  readonly stealth: StealthService;
  readonly zorder: ZOrderService;
  readonly cliqueAtraves = new CliqueAtravesService();

  constructor(
    private readonly prefs: PreferenciasService,
    private readonly aoMudar: () => void,
  ) {
    this.stealth = new StealthService(prefs.valor.stealth, () => this.todas(), (ligado) => {
      prefs.alterar((p) => (p.stealth = ligado));
      this.aoMudar();
    });
    // Sem limpeza de moldura a cada segundo: o RedrawWindow periódico (com RDW_INVALIDATE)
    // repinta as janelas transparentes inteiras e é o suspeito nº 1 das piscadas. A faixa
    // branca continua sendo limpa nas mensagens de ativação (protegerMoldura).
    this.zorder = new ZOrderService();
  }

  todas(): BrowserWindow[] {
    return [...this.janelas.values()].filter((w) => !w.isDestroyed());
  }

  obter(id: IdJanela): BrowserWindow | undefined {
    const w = this.janelas.get(id);
    return w && !w.isDestroyed() ? w : undefined;
  }

  idDe(win: BrowserWindow | null): IdJanela | undefined {
    if (!win) return undefined;
    for (const [id, w] of this.janelas) if (w === win) return id;
    return undefined;
  }

  visivel(id: IdJanela): boolean {
    return this.obter(id)?.isVisible() ?? false;
  }

  criarTodas(): void {
    for (const id of Object.keys(DEFINICOES) as IdJanela[]) this.criar(id);
    this.zorder.iniciar();
  }

  alternar(id: IdJanela, visivel?: boolean): void {
    const w = this.obter(id);
    if (!w) return;
    const mostrar = visivel ?? !w.isVisible();
    if (mostrar === w.isVisible()) return;
    if (mostrar) {
      // A Home é uma janela "de verdade": ganha foco. As flutuantes não roubam o foco da call.
      if (DEFINICOES[id].flutuante) w.showInactive();
      else w.show();
    } else {
      w.hide();
    }
    this.prefs.alterar((p) => (p.janelas[id] = { ...p.janelas[id], visivel: mostrar }));
    this.aoMudar();
  }

  private criar(id: IdJanela): BrowserWindow {
    const def = DEFINICOES[id];
    const salvo = this.prefs.valor.janelas[id];
    const ret = this.retanguloInicial(id, salvo?.retangulo);

    const win = new BrowserWindow({
      ...ret,
      minWidth: def.larguraMinima,
      minHeight: def.alturaMinima,
      show: false,
      frame: false,
      // Janelas flutuantes são transparentes; a Home é opaca (sem faixa branca e com cantos do SO).
      transparent: def.flutuante,
      backgroundColor: def.flutuante ? '#00000000' : COR_HOME,
      hasShadow: !def.flutuante,
      // resizable:false em janela transparente faz o Windows desenhar uma barra branca.
      resizable: true,
      // Sem WS_THICKFRAME o Windows não desenha moldura/halo em volta das flutuantes.
      thickFrame: !def.flutuante,
      roundedCorners: !def.flutuante,
      skipTaskbar: true,
      alwaysOnTop: true,
      fullscreenable: false,
      maximizable: !def.flutuante,
      minimizable: !def.flutuante,
      title: 'Ponto',
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        spellcheck: false,
        // Sem isso o Chromium reduz timers de janelas em segundo plano e o streaming "engasga".
        backgroundThrottling: false,
      },
    });

    this.janelas.set(id, win);
    this.stealth.aplicar(win);
    this.zorder.registrar(win);
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (def.flutuante) {
      this.cliqueAtraves.registrar(win);
      protegerMoldura(win);
    }

    win.on('show', () => {
      this.stealth.aplicar(win);
      this.aoMudar();
    });
    win.on('hide', () => this.aoMudar());
    const lembrar = () => this.prefs.alterar((p) => (p.janelas[id] = { ...p.janelas[id], retangulo: win.getBounds() }));
    win.on('moved', lembrar);
    win.on('resized', lembrar);
    // Fechar (Alt+F4 etc.) só esconde: as janelas vivem enquanto o app vive.
    win.on('close', (e) => {
      if (!encerrando) {
        e.preventDefault();
        this.alternar(id, false);
      }
    });

    // Links externos abrem no navegador, nunca dentro do app.
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    win.webContents.on('will-navigate', (e) => e.preventDefault());

    const query = { janela: id };
    if (process.env.ELECTRON_RENDERER_URL) {
      const url = new URL(process.env.ELECTRON_RENDERER_URL);
      url.searchParams.set('janela', id);
      void win.loadURL(url.toString());
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { query });
    }

    const mostrar = salvo?.visivel ?? def.mostrarAoIniciar;
    win.once('ready-to-show', () => {
      if (mostrar) win.showInactive();
      this.aoMudar();
    });
    return win;
  }

  /** Usa a posição salva se ainda couber em algum monitor; senão volta para a padrão. */
  private retanguloInicial(id: IdJanela, salvo?: Retangulo): Rectangle {
    const def = DEFINICOES[id];
    if (salvo && screen.getAllDisplays().some((d) => intersecta(d.workArea, salvo))) return salvo;
    const area = screen.getPrimaryDisplay().workArea;
    return { ...def.posicao(area, def.largura, def.altura), width: def.largura, height: def.altura };
  }
}

let encerrando = false;
export function marcarEncerrando(): void {
  encerrando = true;
}

function intersecta(a: Rectangle, b: Rectangle): boolean {
  // Exige pelo menos 80x40 px visíveis para a janela poder ser arrastada de volta.
  const l = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return l >= 80 && h >= 40;
}
