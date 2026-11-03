import { create } from 'zustand';
import type { PedidoChat, RespostaPedidoChat, UsoIa } from '@ponto/shared';
import { api } from '../api/cliente';
import { useEstadoApp } from './app';
import { useDominio } from './dominio';

export interface Mensagem {
  id: string;
  papel: 'eu' | 'ia';
  texto: string;
  /** Prévias das imagens enviadas junto. */
  imagens?: string[];
  estado: 'enviando' | 'escrevendo' | 'pronta' | 'erro';
  modelo?: string;
  uso?: UsoIa | null;
  /** Pergunta que o app detectou sozinho na call (não foi você que mandou). */
  automatica?: boolean;
}

export interface Anexo {
  id: string;
  nome: string;
  dataUrl: string;
}

interface Chat {
  conversaId: string;
  mensagens: Mensagem[];
  anexos: Anexo[];
  web: boolean;
  raciocinio: boolean;
  ocupado: boolean;
  enviar: (texto: string, atalho?: PedidoChat['atalho']) => Promise<void>;
  anexar: (a: Omit<Anexo, 'id'>) => void;
  removerAnexo: (id: string) => void;
  alternarWeb: () => void;
  alternarRaciocinio: () => void;
  novaConversa: () => void;
}

const novoId = () => crypto.randomUUID();
const MAX_ANEXOS = 4;

export const useChat = create<Chat>((set, get) => ({
  conversaId: novoId(),
  mensagens: [],
  anexos: [],
  web: false,
  raciocinio: false,
  ocupado: false,

  enviar: async (texto, atalho = null) => {
    const { anexos, web, raciocinio, conversaId } = get();
    const limpo = texto.trim();
    if (!limpo && !atalho && !anexos.length) return;
    const config = useDominio.getState().configuracoes;
    const idEu = novoId();
    const idIa = novoId();
    set((s) => ({
      anexos: [],
      ocupado: true,
      mensagens: [
        ...s.mensagens,
        { id: idEu, papel: 'eu', texto: limpo || rotuloAtalho(atalho), imagens: anexos.map((a) => a.dataUrl), estado: 'pronta' },
        { id: idIa, papel: 'ia', texto: '', estado: 'enviando' },
      ],
    }));
    try {
      const pedido: PedidoChat = {
        conversaId,
        respostaId: idIa,
        texto: limpo,
        atalho,
        agenteId: config?.agenteAtivo ?? 'geral',
        web,
        raciocinio,
        imagens: anexos.map((a) => a.dataUrl),
        // Gravando: a API junta o trecho recente da conversa como contexto.
        sessaoId: useEstadoApp.getState().estado?.captura.sessaoId ?? null,
      };
      pendentes.set(idIa, true);
      await api.post<RespostaPedidoChat>('/chat/mensagens', pedido);
    } catch (e) {
      pendentes.delete(idIa);
      set((s) => ({
        ocupado: pendentes.size > 0,
        mensagens: s.mensagens.map((m) => (m.id === idIa ? { ...m, texto: (e as Error).message, estado: 'erro' } : m)),
      }));
    }
  },

  anexar: (a) => set((s) => (s.anexos.length >= MAX_ANEXOS ? s : { anexos: [...s.anexos, { ...a, id: novoId() }] })),
  removerAnexo: (id) => set((s) => ({ anexos: s.anexos.filter((a) => a.id !== id) })),
  alternarWeb: () => set((s) => ({ web: !s.web })),
  alternarRaciocinio: () => set((s) => ({ raciocinio: !s.raciocinio })),
  novaConversa: () => set({ conversaId: novoId(), mensagens: [], anexos: [], ocupado: false }),
}));

const pendentes = new Map<string, true>();

function rotuloAtalho(a: PedidoChat['atalho']): string {
  if (a === 'assist') return 'Assist';
  if (a === 'oQueDizer') return 'O que devo dizer?';
  if (a === 'followUp') return 'Perguntas de follow-up';
  if (a === 'tela') return 'Ler a tela';
  return '(imagem)';
}

/** Liga o chat aos eventos de streaming do WebSocket. */
export function iniciarChat(): void {
  const atualizar = (id: string, fn: (m: Mensagem) => Mensagem) =>
    useChat.setState((s) => ({ mensagens: s.mensagens.map((m) => (m.id === id ? fn(m) : m)) }));

  // Print da tela (botão na janela Tela ou Ctrl+Shift+S): vai para a IA como imagem.
  window.ponto.ouvir('tela.lida', ({ dataUrl }) => {
    const chat = useChat.getState();
    chat.anexar({ nome: 'Tela', dataUrl });
    void chat.enviar('', 'tela');
  });

  api.ouvir((e) => {
    switch (e.tipo) {
      case 'sugestao.nova':
        pendentes.set(e.respostaId, true);
        useChat.setState((s) => ({
          ocupado: true,
          mensagens: [
            ...s.mensagens,
            { id: novoId(), papel: 'eu', texto: e.pergunta, estado: 'pronta', automatica: true },
            { id: e.respostaId, papel: 'ia', texto: '', estado: 'enviando' },
          ],
        }));
        break;
      case 'chat.inicio':
        atualizar(e.respostaId, (m) => ({ ...m, estado: 'escrevendo', modelo: e.modelo }));
        break;
      case 'chat.delta':
        atualizar(e.respostaId, (m) => ({ ...m, estado: 'escrevendo', texto: m.texto + e.texto }));
        break;
      case 'chat.fim':
        pendentes.delete(e.respostaId);
        atualizar(e.respostaId, (m) => ({ ...m, estado: 'pronta', uso: e.uso }));
        useChat.setState({ ocupado: pendentes.size > 0 });
        break;
      case 'chat.erro':
        pendentes.delete(e.respostaId);
        atualizar(e.respostaId, (m) => ({ ...m, estado: 'erro', texto: e.mensagem }));
        useChat.setState({ ocupado: pendentes.size > 0 });
        break;
    }
  });
}
