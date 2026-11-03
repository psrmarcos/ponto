import type { ReactNode } from 'react';

/**
 * Realce de código leve, sem dependência: comentários, textos, números e
 * palavras-chave das linguagens mais comuns em entrevista (JS/TS, Python, Java,
 * C#, Go, SQL...). Não é um parser; é o suficiente para o código ficar legível de
 * relance. Tudo vira <span> (nada de innerHTML).
 */
const PALAVRAS = new Set(
  (
    'abstract as async await break case catch class const continue def default del delete do elif else enum export extends ' +
    'false final finally fn for from func function go if impl implements import in instanceof interface is lambda let match ' +
    'new nil none not null of or and package pass private protected pub public raise readonly return self static struct super ' +
    'switch this throw throws trait true try type typeof use val var void while with yield None True False ' +
    'select insert update delete from where join left right inner outer on group by order having limit offset into values set ' +
    'create table index primary key foreign references distinct as union all count sum avg min max case when then end'
  ).split(' '),
);
const TIPOS = new Set('string number boolean int long float double char bool any unknown never object list dict str map Promise Array'.split(' '));

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b(?=\s*\()|\b[A-Za-z_$][\w$]*\b)/g;

export function realcar(codigo: string, linguagem: string): ReactNode[] {
  const hashComenta = /^(py|python|sh|bash|shell|ruby|rb|yaml|yml|r)$/i.test(linguagem) || (!linguagem && /^\s*(def |import |from )/m.test(codigo));
  const traco = /^(sql|lua|haskell)$/i.test(linguagem) || (!linguagem && /\bselect\b[\s\S]*\bfrom\b/i.test(codigo));
  const sqlish = traco;
  const saida: ReactNode[] = [];
  let ultimo = 0;
  let k = 0;
  for (const m of codigo.matchAll(TOKEN)) {
    const t = m[0];
    const i = m.index ?? 0;
    if (i > ultimo) saida.push(codigo.slice(ultimo, i));
    ultimo = i + t.length;
    let cls: string | null = null;
    if (t.startsWith('//') || t.startsWith('/*')) cls = 'rc-com';
    else if (t.startsWith('#')) cls = hashComenta ? 'rc-com' : null;
    else if (t.startsWith('--')) cls = traco ? 'rc-com' : null;
    else if (/^["'`]/.test(t)) cls = 'rc-str';
    else if (/^\d/.test(t)) cls = 'rc-num';
    else if (PALAVRAS.has(sqlish ? t.toLowerCase() : t)) cls = 'rc-kw';
    else if (TIPOS.has(t) || /^[A-Z][a-z]\w*$/.test(t)) cls = 'rc-tipo';
    else if (codigo.slice(ultimo).match(/^\s*\(/)) cls = 'rc-fn';
    // Comentário de # ou -- fora da linguagem certa: devolve só o primeiro caractere e segue.
    if (cls === null && (t.startsWith('#') || t.startsWith('--'))) {
      saida.push(t[0]);
      ultimo = i + 1;
      continue;
    }
    saida.push(cls ? <span key={k++} className={cls}>{t}</span> : t);
  }
  if (ultimo < codigo.length) saida.push(codigo.slice(ultimo));
  return saida;
}
