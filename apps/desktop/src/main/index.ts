import { app, BrowserWindow, dialog, shell, type WebContents } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, resolve } from 'node:path';
import { IdJanela, IdSegredo, type EstadoApp } from '@ponto/shared';
import { ApiHost } from './api-host';
import { AtalhosService } from './atalhos';
import { CapturaService } from './captura';
import { emitir, registrarIpc } from './ipc';
import { GerenciadorJanelas, marcarEncerrando } from './janelas/gerenciador';
import { PreferenciasService } from './preferencias';
import { SegredosService } from './segredos';
import { capturarTela, LeituraAutomatica } from './tela';

/**
 * Processo principal: o único que fala com o sistema operacional. Monta os
 * serviços, as janelas e o IPC. As janelas desenham e pedem coisas pela API
 * tipada do preload.
 */

// Nome da pasta de dados (%APPDATA%\Ponto no Windows). Precisa vir antes de qualquer getPath.
app.setName('Ponto');
CapturaService.prepararAntesDoReady();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app.whenReady().then(iniciar);
}

const MAX_IMAGEM_BYTES = 8 * 1024 * 1024;

function iniciar(): void {
  const prefs = new PreferenciasService();
  const segredos = new SegredosService();

  // Estado espelhado nas janelas. Só reenvia quando algo mudou de fato (evita re-render e piscadas).
  let ultimoEstado = '';
  let agendado = false;
  const difundir = () => {
    if (agendado) return;
    agendado = true;
    queueMicrotask(() => {
      agendado = false;
      const estado = montarEstado();
      const json = JSON.stringify(estado);
      if (json === ultimoEstado) return;
      ultimoEstado = json;
      janelas.todas().forEach((w) => emitir(w.webContents, 'estado', estado));
    });
  };

  const janelas = new GerenciadorJanelas(prefs, difundir);
  const captura = new CapturaService(difundir);
  const leituraAuto = new LeituraAutomatica(() => lerTela('auto'), () => janelas.stealth.ligado && janelas.stealth.suportado);
  segredos.aoMudar(difundir);
  const api = new ApiHost(segredos, difundir);
  const atalhos = new AtalhosService(
    prefs,
    {
      alternarStealth: () => janelas.stealth.definir(!janelas.stealth.ligado),
      alternarChat: () => {
        const w = janelas.obter('agregador');
        if (w) emitir(w.webContents, 'chat.alternar', undefined);
      },
      alternarTranscricao: () => janelas.alternar('transcricao'),
      alternarTela: () => janelas.alternar('tela'),
      alternarHome: () => janelas.alternar('home'),
      lerTela: () => void lerTela(),
      alternarCaptura: () => captura.alternar(),
      sair: () => app.quit(),
    },
    difundir,
  );

  /** Print da tela: o chat (agregador) manda para a IA e a janela Tela mostra a prévia. */
  async function lerTela(origem: 'manual' | 'auto' = 'manual'): Promise<void> {
    difundirLeitura(await capturarTela(), origem);
  }

  function difundirLeitura(dataUrl: string, origem: 'manual' | 'recorte' | 'auto'): void {
    const dados = { dataUrl, em: Date.now(), origem };
    for (const id of ['agregador', 'tela'] as const) {
      const w = janelas.obter(id);
      if (w) emitir(w.webContents, 'tela.lida', dados);
    }
  }

  function montarEstado(): EstadoApp {
    const vis = {} as EstadoApp['janelas'];
    for (const id of IdJanela.options) vis[id] = { visivel: janelas.visivel(id) };
    return {
      stealth: { ligado: janelas.stealth.ligado, suportado: janelas.stealth.suportado },
      janelas: vis,
      atalhos: prefs.atalhos(),
      atalhosComErro: atalhos.erros,
      api: { status: api.status },
      captura: captura.estado,
      telaAuto: leituraAuto.ligada,
      chavesConfiguradas: IdSegredo.options.filter((id) => segredos.status()[id].configurado),
      plataforma: process.platform as EstadoApp['plataforma'],
      versao: app.getVersion(),
    };
  }

  const nossas = (wc: WebContents) => wc === captura.webContents || janelas.todas().some((w) => w.webContents === wc);
  const daCaptura = (wc: WebContents) => wc === captura.webContents;

  registrarIpc(
    {
      'estado.obter': () => montarEstado(),
      'stealth.definir': ({ ligado }) => janelas.stealth.definir(ligado),
      'janela.alternar': ({ id, visivel }) => janelas.alternar(id, visivel),
      'janela.focarEntrada': (_d, e) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        w?.focus();
      },
      'atalhos.definir': ({ acao, accelerator }) => atalhos.definir(acao, accelerator),
      'atalhos.restaurarPadrao': () => atalhos.restaurarPadrao(),
      'api.conexao': () => api.conexao(),
      'segredos.status': () => segredos.status(),
      'segredos.definir': ({ id, valor }) => segredos.definir(id, valor),
      'arquivo.escolherImagem': async () => {
        // Sem janela-mãe de propósito: diálogo modal de janela transparente deixa a faixa branca.
        const r = await dialog.showOpenDialog({
          title: 'Adicionar imagem',
          properties: ['openFile'],
          filters: [{ name: 'Imagens', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
        });
        const arquivo = r.filePaths[0];
        if (r.canceled || !arquivo) return null;
        const dados = await readFile(arquivo);
        if (dados.byteLength > MAX_IMAGEM_BYTES) throw new Error('Imagem maior que 8 MB.');
        const ext = extname(arquivo).slice(1).toLowerCase().replace('jpg', 'jpeg');
        return { nome: basename(arquivo), dataUrl: `data:image/${ext};base64,${dados.toString('base64')}` };
      },
      'app.sair': () => app.quit(),
      'captura.comandar': (c) => captura.comandar(c),
      'tela.ler': () => lerTela(),
      // Maior que o print normal: o recorte de um pedaço precisa continuar legível.
      'tela.capturar': async () => ({ dataUrl: await capturarTela({ ladoMaximo: 2560, maxBytes: 1_500_000 }), em: Date.now() }),
      'tela.enviar': ({ dataUrl }) => difundirLeitura(dataUrl, 'recorte'),
      'tela.auto': ({ ligado }) => {
        leituraAuto.definir(ligado);
        difundir();
      },
      'arquivo.salvarMarkdown': async ({ nome, conteudo }) => {
        const pasta = join(app.getPath('documents'), 'Ponto');
        await mkdir(pasta, { recursive: true });
        const limpo = nome.replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Sessão';
        const caminho = join(pasta, `${limpo}.md`);
        await writeFile(caminho, conteudo, 'utf8');
        return { caminho };
      },
      'arquivo.mostrar': ({ caminho }) => {
        // Só arquivos que o próprio app salvou.
        const pasta = resolve(app.getPath('documents'), 'Ponto');
        if (resolve(caminho).startsWith(pasta)) shell.showItemInFolder(caminho);
      },
    },
    {
      'janela.areasSolidas': ({ areas }, e) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        if (w) janelas.cliqueAtraves.definirAreas(w, areas);
      },
      'captura.status': (s, e) => {
        if (daCaptura(e.sender)) captura.receberStatus(s);
      },
      'captura.niveis': (n, e) => {
        if (daCaptura(e.sender)) captura.repassarNiveis(n, janelas.todas());
      },
    },
    nossas,
  );

  janelas.criarTodas();
  captura.criar();
  atalhos.registrarTodos();
  void api.iniciar();

  app.on('second-instance', () => janelas.alternar('home', true));
  app.on('before-quit', () => {
    marcarEncerrando();
    janelas.zorder.parar();
    janelas.cliqueAtraves.parar();
    prefs.salvarAgora();
    api.parar();
  });
}

app.on('window-all-closed', () => app.quit());
