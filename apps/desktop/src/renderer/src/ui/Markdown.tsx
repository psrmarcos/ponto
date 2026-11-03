import { Fragment, type ReactNode } from 'react';

/**
 * Markdown leve para as respostas da IA: parágrafos, listas, **negrito**,
 * `código` e blocos ```. Tudo vira elemento React (nada de innerHTML), então
 * texto vindo do modelo nunca executa nada.
 */
export function Markdown({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  const partes = texto.split(/```[^\n]*\n?/);
  partes.forEach((parte, i) => {
    if (i % 2 === 1) {
      blocos.push(
        <pre key={`c${i}`}>
          <code>{parte.replace(/\n$/, '')}</code>
        </pre>,
      );
      return;
    }
    blocos.push(...paragrafos(parte, i));
  });
  return <>{blocos}</>;
}

function paragrafos(texto: string, chave: number): ReactNode[] {
  const saida: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = (k: string) => {
    if (!lista.length) return;
    saida.push(
      <ul key={k}>
        {lista.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
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
    const limpa = linha.replace(/^#{1,6}\s+/, '');
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
