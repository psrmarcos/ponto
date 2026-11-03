import { Fragment, type ReactNode } from 'react';
import { realcar } from './realce';

/**
 * Markdown leve para as respostas da IA: parágrafos, listas, **negrito**,
 * `código` e blocos ```. Tudo vira elemento React (nada de innerHTML), então
 * texto vindo do modelo nunca executa nada.
 */
export function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  // ```lang ... ``` vira bloco de código colorido; o resto, parágrafos e listas.
  const re = /```([\w+#.-]*)[^\n]*\n?([\s\S]*?)(?:```|$)/g;
  let ultimo = 0;
  let n = 0;
  for (const m of texto.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > ultimo) blocos.push(...paragrafos(texto.slice(ultimo, i), n++));
    const linguagem = m[1] ?? '';
    const codigo = (m[2] ?? '').replace(/\n$/, '');
    blocos.push(
      <pre key={`c${n++}`} className="codigo">
        {linguagem && <span className="rc-lang">{linguagem}</span>}
        <code>{realcar(codigo, linguagem)}</code>
      </pre>,
    );
    ultimo = i + m[0].length;
  }
  if (ultimo < texto.length) blocos.push(...paragrafos(texto.slice(ultimo), n++));
  return <>{blocos}</>;
}

function paragrafos(texto: string, chave: number): ReactNode[] {
  const saida: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = (k: string) => {
    if (!lista.length) return;
    saida.push(
      <ul key={k}>
        {lista.map((l, i) => {
          const tarefa = /^\[( |x|X)\]\s+(.*)$/.exec(l);
          return (
            <li key={i} className={tarefa ? 'md-tarefa' : undefined}>
              {tarefa ? <span aria-hidden>{tarefa[1] === ' ' ? '☐ ' : '☑ '}</span> : null}
              {inline(tarefa ? (tarefa[2] ?? '') : l)}
            </li>
          );
        })}
      </ul>,
    );
    lista = [];
  };
  texto.split('\n').forEach((linha, i) => {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(linha);
    if (item) {
      lista.push(item[1] ?? '');
      return;
    }
    fecharLista(`${chave}-l${i}`);
    const titulo = /^(#{1,6})\s+(.*)$/.exec(linha);
    if (titulo) {
      const nivel = titulo[1]!.length;
      saida.push(
        nivel === 1 ? <h3 key={`${chave}-h${i}`} className="md-h1">{inline(titulo[2] ?? '')}</h3> : <h4 key={`${chave}-h${i}`} className="md-h2">{inline(titulo[2] ?? '')}</h4>,
      );
      return;
    }
    const limpa = linha.replace(/^_(.+)_$/, '$1');
    if (limpa.trim()) saida.push(<p key={`${chave}-p${i}`}>{inline(limpa)}</p>);
  });
  fecharLista(`${chave}-lfim`);
  return saida;
}

function inline(texto: string): ReactNode {
  return texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/).map((t, i) => {
    if (t.startsWith('**') && t.endsWith('**') && t.length > 4) return <strong key={i}>{t.slice(2, -2)}</strong>;
    if (t.startsWith('`') && t.endsWith('`') && t.length > 2) return <code key={i}>{t.slice(1, -1)}</code>;
    return <Fragment key={i}>{t}</Fragment>;
  });
}
