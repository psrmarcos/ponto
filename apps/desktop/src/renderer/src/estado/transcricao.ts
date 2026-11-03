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
}

export const useTranscricao = create<Transcricao>(() => ({
  sessaoId: null,
  falas: [],
  aviso: null,
  niveis: { microfone: 0, sistema: 0 },
}));

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
        useTranscricao.setState((s) => ({ falas: lista.reduce(inserir, s.falas) }));
      })
      .catch(() => {});

  let ultimoErro: string | null = null;
  // Sessão nova: limpa a lista. Sessão parada: mantém o que foi dito, para ler depois.
  useEstadoApp.subscribe((s) => {
    const id = s.estado?.captura.sessaoId ?? null;
    if (id && id !== useTranscricao.getState().sessaoId) {
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
    if (e.tipo === 'transcricao.erro') mostrarAviso(e.mensagem);
  });
  window.ponto.ouvir('audio.niveis', (niveis) => useTranscricao.setState({ niveis }));
}
