import type { Agente, Configuracoes, PedidoChat } from '@ponto/shared';
import type { MensagemIa, ParteMensagem } from '../provedores/provedor';

/** Quantas trocas (pergunta + resposta) anteriores entram em cada chamada. */
export const TROCAS_NO_HISTORICO = 6;
/** Respostas antigas são cortadas no histórico: o modelo só precisa lembrar do assunto. */
export const MAX_CHARS_RESPOSTA_ANTIGA = 1200;

export const TEXTO_DOS_ATALHOS: Record<NonNullable<PedidoChat['atalho']>, string> = {
  assist: 'Com base no contexto, me ajude com o que for mais útil agora.',
  oQueDizer: 'O que eu devo dizer agora? Responda à última pergunta que me fizeram, com a fala pronta.',
  followUp: 'Sugira 3 perguntas de follow-up curtas que eu posso fazer agora.',
};

/**
 * Regras fixas, iguais em toda chamada (fazem parte do prefixo cacheável).
 *
 * A pessoa lê enquanto fala, de relance. Por isso a resposta tem duas camadas:
 * a ideia em negrito (bate o olho e já sabe o rumo) e a fala, em frases curtas
 * que funcionam sozinhas, para ela poder ir ajustando o tom e parar quando quiser.
 */
const REGRAS = [
  'Você escreve o que a pessoa vai dizer numa call ao vivo. Ela lê de relance enquanto fala, então:',
  '1. Primeira linha: a ideia central em negrito, com no máximo 10 palavras.',
  '2. Depois, a fala: 2 a 4 frases curtas, em primeira pessoa, do jeito que alguém fala numa conversa. ' +
    'Palavras simples, um exemplo concreto quando ajudar. Cada frase precisa fazer sentido sozinha.',
  'Soe humano: nada de "Claro!", "Ótima pergunta", introduções, conclusões, títulos ou listas. ' +
    'Exceções: quando pedirem perguntas ou opções, dê uma lista curta; código vai num bloco curto.',
  'Responda no idioma da conversa (padrão: português do Brasil). Não invente fatos sobre a pessoa que não estejam no perfil.',
].join('\n');

export interface TrocaAnterior {
  pergunta: string;
  resposta: string;
}

/**
 * Monta as mensagens na ordem que maximiza o cache do provedor: primeiro o que
 * nunca muda na sessão (agente + regras + perfil), depois o histórico, e por
 * último o que é novo nesta chamada.
 */
export function montarMensagens(args: {
  agente: Pick<Agente, 'prompt'>;
  config: Pick<Configuracoes, 'nomeUsuario' | 'contextoUsuario'>;
  historico: TrocaAnterior[];
  pedido: Pick<PedidoChat, 'texto' | 'atalho' | 'imagens'>;
  /** Trecho recente da call, já formatado. Vai só na última mensagem (não entra no histórico). */
  transcricao?: string | null;
}): MensagemIa[] {
  const perfil = [
    args.config.nomeUsuario && `Nome do usuário: ${args.config.nomeUsuario}.`,
    args.config.contextoUsuario && `Sobre o usuário: ${args.config.contextoUsuario}`,
  ]
    .filter(Boolean)
    .join('\n');

  const sistema: ParteMensagem[] = [{ tipo: 'texto', texto: `${args.agente.prompt}\n\n${REGRAS}`, cache: !perfil }];
  if (perfil) sistema.push({ tipo: 'texto', texto: perfil, cache: true });

  const mensagens: MensagemIa[] = [{ papel: 'system', conteudo: sistema }];

  for (const t of args.historico.slice(-TROCAS_NO_HISTORICO)) {
    mensagens.push({ papel: 'user', conteudo: t.pergunta });
    mensagens.push({ papel: 'assistant', conteudo: cortar(t.resposta, MAX_CHARS_RESPOSTA_ANTIGA) });
  }

  const pergunta = textoDoPedido(args.pedido);
  const texto = args.transcricao
    ? `Transcrição recente da call (o usuário aparece pelo nome ou como "Você"; os outros como "Participante"):\n${args.transcricao}\n\n---\n${pergunta}`
    : pergunta;
  if (args.pedido.imagens.length) {
    mensagens.push({
      papel: 'user',
      conteudo: [...args.pedido.imagens.map((url) => ({ tipo: 'imagem' as const, url })), { tipo: 'texto', texto }],
    });
  } else {
    mensagens.push({ papel: 'user', conteudo: texto });
  }
  return mensagens;
}

export function textoDoPedido(p: Pick<PedidoChat, 'texto' | 'atalho' | 'imagens'>): string {
  const base = p.atalho ? TEXTO_DOS_ATALHOS[p.atalho] : '';
  const digitado = p.texto.trim();
  if (base && digitado) return `${base}\n\n${digitado}`;
  if (base || digitado) return base || digitado;
  return p.imagens.length ? 'O que você vê nesta imagem que me ajuda agora?' : '';
}

function cortar(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
