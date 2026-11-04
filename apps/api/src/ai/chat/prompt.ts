import type { Agent, Settings, ChatRequest } from '@ponto/shared';
import type { AiMessage, MessagePart } from '../providers/provider';

export const HISTORY_TURNS = 6;
export const MAX_OLD_RESPONSE_CHARS = 1200;

export const SHORTCUT_TEXTS: Record<NonNullable<ChatRequest['shortcut']>, string> = {
  assist: 'Com base no contexto, me ajude com o que for mais útil agora.',
  whatToSay: 'O que eu devo dizer agora? Responda à última pergunta que me fizeram, com a fala pronta.',
  followUp: 'Sugira 3 perguntas de follow-up curtas que eu posso fazer agora.',
  selection: 'Selecionei este texto agora. Explique o que importa nele para a conversa; se for uma pergunta, exercício ou código, resolva.',
  screen: 'Esta é a minha tela agora. Diga o que nela importa para a conversa; se houver uma pergunta, exercício ou código, resolva.',
};

const RULES = [
  'Você escreve o que a pessoa vai dizer numa call ao vivo. Ela lê de relance enquanto fala, então:',
  '1. Primeira linha: a ideia central em negrito, com no máximo 10 palavras.',
  '2. Depois, a fala: 2 a 4 frases curtas, em primeira pessoa, do jeito que alguém fala numa conversa. ' +
    'Palavras simples, um exemplo concreto quando ajudar. Cada frase precisa fazer sentido sozinha.',
  'Soe humano: nada de "Claro!", "Ótima pergunta", introduções, conclusões, títulos ou listas. ' +
    'Exceções: quando pedirem perguntas ou opções, dê uma lista curta; código vai num bloco curto.',
  'Responda no idioma da conversa (padrão: português do Brasil). Não invente fatos sobre a pessoa que não estejam no perfil.',
].join('\n');

export const CONVERSATION_SUMMARY_PREFIX = 'Resumo do que já conversamos neste chat:';

export function instructionsText(agent: Pick<Agent, 'prompt'>): string {
  return `${agent.prompt}\n\n${RULES}`;
}

export const COMPRESS_PROMPT = [
  'Resuma esta conversa entre um usuário e o assistente que o ajuda numa call ao vivo.',
  'Guarde só o que vai ser útil para as próximas respostas: o assunto, fatos e números citados, decisões, o que o usuário pediu e o que já foi respondido.',
  'Escreva em tópicos curtos, no idioma da conversa, com no máximo 180 palavras. Não invente nada.',
].join('\n');

export interface PreviousTurn {
  question: string;
  pureQuestion: string;
  answer: string;
  transcriptChars: number;
}

export function buildMessages(args: {
  agent: Pick<Agent, 'prompt'>;
  settings: Pick<Settings, 'userName' | 'userContext'>;
  history: PreviousTurn[];
  request: Pick<ChatRequest, 'text' | 'shortcut' | 'images'>;
  transcript?: string | null;
  callSummary?: string | null;
  conversationSummary?: string | null;
}): AiMessage[] {
  const profile = [
    args.settings.userName && `Nome do usuário: ${args.settings.userName}.`,
    args.settings.userContext && `Sobre o usuário: ${args.settings.userContext}`,
  ]
    .filter(Boolean)
    .join('\n');

  const system: MessagePart[] = [{ type: 'text', text: `${args.agent.prompt}\n\n${RULES}`, cache: !profile }];
  if (profile) system.push({ type: 'text', text: profile, cache: !args.callSummary && !args.conversationSummary });
  if (args.callSummary) system.push({ type: 'text', text: `Resumo do começo da call:\n${args.callSummary}`, cache: !args.conversationSummary });
  if (args.conversationSummary) system.push({ type: 'text', text: `${CONVERSATION_SUMMARY_PREFIX}\n${args.conversationSummary}`, cache: true });

  const messages: AiMessage[] = [{ role: 'system', content: system }];

  for (const t of args.history.slice(-HISTORY_TURNS)) {
    messages.push({ role: 'user', content: t.question });
    messages.push({ role: 'assistant', content: truncate(t.answer, MAX_OLD_RESPONSE_CHARS) });
  }

  const text = userMessage(requestText(args.request), args.transcript);
  if (args.request.images.length) {
    messages.push({
      role: 'user',
      content: [...args.request.images.map((url) => ({ type: 'image' as const, url })), { type: 'text', text }],
    });
  } else {
    messages.push({ role: 'user', content: text });
  }
  return messages;
}

export function userMessage(question: string, transcript?: string | null): string {
  if (!transcript) return question;
  return (
    `Falas da call desde a última mensagem (o usuário aparece pelo nome ou como "Você"; os outros como "Participante"). ` +
    `São só contexto: não responda perguntas daqui que já foram respondidas ou que o pedido abaixo não pede.\n${transcript}\n\n` +
    `---\nPedido do usuário (responda só a isto):\n${question}`
  );
}

export function requestText(p: Pick<ChatRequest, 'text' | 'shortcut' | 'images'>): string {
  const base = p.shortcut ? SHORTCUT_TEXTS[p.shortcut] : '';
  const typed = p.text.trim();
  if (base && typed) return `${base}\n\n${typed}`;
  if (base || typed) return base || typed;
  return p.images.length ? 'O que você vê nesta imagem que me ajuda agora?' : '';
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}
