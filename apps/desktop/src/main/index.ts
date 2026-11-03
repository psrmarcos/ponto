import { app, BrowserWindow, dialog, type WebContents } from 'electron';
import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import { IdJanela, IdSegredo, type EstadoApp } from '@ponto/shared';
import { ApiHost } from './api-host';
import { AtalhosService } from './atalhos';
import { emitir, registrarIpc } from './ipc';
import { GerenciadorJanelas, marcarEncerrando } from './janelas/gerenciador';
import { PreferenciasService } from './preferencias';
import { SegredosService } from './segredos';

/**
 * Processo principal: o único que fala com o sistema operacional. Monta os
 * serviços, as janelas e o IPC. As janelas desenham e pedem coisas pela API
 * tipada do preload.
 */

// Nome da pasta de dados (%APPDATA%\Ponto no Windows). Precisa vir antes de qualquer getPath.
app.setName('Ponto');

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
      lerTela: () => {
        const w = janelas.obter('tela');
        if (w) emitir(w.webContents, 'tela.ler', undefined);
      },
      sair: () => app.quit(),
    },
    difundir,
  );

  function montarEstado(): EstadoApp {
    const vis = {} as EstadoApp['janelas'];
    for (const id of IdJanela.options) vis[id] = { visivel: janelas.visivel(id) };
    return {
      stealth: { ligado: janelas.stealth.ligado, suportado: janelas.stealth.suportado },
      janelas: vis,
      atalhos: prefs.atalhos(),
      atalhosComErro: atalhos.erros,
      api: { status: api.status },
      chavesConfiguradas: IdSegredo.options.filter((id) => segredos.status()[id].configurado),
      plataforma: process.platform as EstadoApp['plataforma'],
      versao: app.getVersion(),
    };
  }

  const nossas = (wc: WebContents) => janelas.todas().some((w) => w.webContents === wc);

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
    },
    {
      'janela.areasSolidas': ({ areas }, e) => {
        const w = BrowserWindow.fromWebContents(e.sender);
        if (w) janelas.cliqueAtraves.definirAreas(w, areas);
      },
    },
    nossas,
  );

  janelas.criarTodas();
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
