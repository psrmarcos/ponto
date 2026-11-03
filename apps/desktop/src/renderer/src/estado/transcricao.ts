import { create } from 'zustand';
import type { Fala, NiveisAudio } from '@ponto/shared';
import { api } from '../api/cliente';
import { useEstadoApp } from './app';

/**
 * Falas da sessão atual (ou da última, depois de parar). A lista vem da API ao
 * abrir/reconectar e cresce com os eventos do WebSocket.
 */
interface Transcricao {
  sessaoId: string | null;
  falas: Fala[];
  aviso: string | null;
  niveis: NiveisAudio;
  /** Limpeza pedida e ainda desfazível: as falas só somem do banco quando o prazo acaba. */
  desfazivel: { falas: Fala[]; ateMs: number } | null;
  limpar: () => void;
  desfazer: () => void;
}

/** Tempo para desfazer a limpeza antes de apagar de vez. */
const PRAZO_DESFAZER_MS = 8000;
let timerLimpeza: ReturnType<typeof setTimeout> | null = null;

export const useTranscricao = create<Transcricao>((set, get) => ({
  sessaoId: null,
  falas: [],
  aviso: null,
  niveis: { microfone: 0, sistema: 0 },
  desfazivel: null,
  limpar: () => {
    const { sessaoId, falas, desfazivel } = get();
    if (!sessaoId || !falas.length) return;
    if (desfazivel) confirmarLimpeza(); // uma limpeza anterior ainda no prazo vai de vez
    const ateMs = Math.max(...falas.map((f) => f.inicioMs));
    set({ falas: [], desfazivel: { falas, ateMs } });
    timerLimpeza = setTimeout(confirmarLimpeza, PRAZO_DESFAZER_MS);
  },
  desfazer: () => {
    const d = get().desfazivel;
    if (!d) return;
    if (timerLimpeza) clearTimeout(timerLimpeza);
    timerLimpeza = null;
    set((s) => ({ falas: d.falas.reduce(inserir, s.falas), desfazivel: null }));
  },
}));

/** Fim do prazo: apaga no banco (as outras janelas e o contexto do chat também esquecem). */
function confirmarLimpeza(): void {
  if (timerLimpeza) clearTimeout(timerLimpeza);
  timerLimpeza = null;
  const { sessaoId, desfazivel } = useTranscricao.getState();
  if (!sessaoId || !desfazivel) return;
  useTranscricao.setState({ desfazivel: null });
  api.delete(`/sessoes/${sessaoId}/falas?ateMs=${desfazivel.ateMs}`).catch(() => {
    useTranscricao.setState((s) => ({ falas: desfazivel.falas.reduce(inserir, s.falas) }));
    mostrarAviso('Não consegui limpar a transcrição. As falas voltaram.');
  });
}

/** As falas chegam fora de ordem (os dois canais transcrevem em paralelo): insere no lugar certo. */
function inserir(falas: Fala[], f: Fala): Fala[] {
  if (falas.some((x) => x.id === f.id)) return falas;
  let i = falas.length;
  while (i > 0 && falas[i - 1]!.inicioMs > f.inicioMs) i--;
  return [...falas.slice(0, i), f, ...falas.slice(i)];
}

let timerAviso: ReturnType<typeof setTimeout> | null = null;
function mostrarAviso(aviso: string): void {
  useTranscricao.setState({ aviso });
  if (timerAviso) clearTimeout(timerAviso);
  timerAviso = setTimeout(() => useTranscricao.setState({ aviso: null }), 8000);
}

export function iniciarTranscricao(): void {
  const carregar = (id: string) =>
    void api
      .get<Fala[]>(`/sessoes/${id}/falas`)
      .then((lista) => {
        if (useTranscricao.getState().sessaoId !== id) return;
        const limite = useTranscricao.getState().desfazivel?.ateMs ?? -1;
        useTranscricao.setState((s) => ({ falas: lista.filter((f) => f.inicioMs > limite).reduce(inserir, s.falas) }));
      })
      .catch(() => {});

  let ultimoErro: string | null = null;
  // Sessão nova: limpa a lista. Sessão parada: mantém o que foi dito, para ler depois.
  useEstadoApp.subscribe((s) => {
    const id = s.estado?.captura.sessaoId ?? null;
    if (id && id !== useTranscricao.getState().sessaoId) {
      if (useTranscricao.getState().desfazivel) confirmarLimpeza();
      useTranscricao.setState({ sessaoId: id, falas: [], aviso: null });
      carregar(id);
    }
    const erro = s.estado?.captura.erro;
    if (erro && erro !== ultimoErro) mostrarAviso(erro);
    ultimoErro = erro ?? null;
  });
  api.quandoConectar(() => {
    const id = useTranscricao.getState().sessaoId;
    if (id) carregar(id);
  });
  api.ouvir((e) => {
    if (e.tipo === 'transcricao.fala' && e.fala.sessaoId === useTranscricao.getState().sessaoId) {
      useTranscricao.setState((s) => ({ falas: inserir(s.falas, e.fala) }));
    }
    if (e.tipo === 'transcricao.limpa' && e.sessaoId === useTranscricao.getState().sessaoId) {
      useTranscricao.setState((s) => ({ falas: s.falas.filter((f) => f.inicioMs > e.ateMs) }));
    }
    if (e.tipo === 'transcricao.erro') mostrarAviso(e.mensagem);
  });
  window.ponto.ouvir('audio.niveis', (niveis) => useTranscricao.setState({ niveis }));
}
