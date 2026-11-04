import type { ReactNode } from 'react';

/**
 * Lightweight zero-dependency code syntax highlighter: comments, strings,
 * numbers, and keywords for common interview languages (JS/TS, Python, Java,
 * C#, Go, SQL...). Not a full parser, just enough to make code readable at a
 * glance. Emits React `<span>` elements (never innerHTML).
 */
const KEYWORDS = new Set(
  (
    'abstract as async await break case catch class const continue def default del delete do elif else enum export extends ' +
    'false final finally fn for from func function go if impl implements import in instanceof interface is lambda let match ' +
    'new nil none not null of or and package pass private protected pub public raise readonly return self static struct super ' +
    'switch this throw throws trait true try type typeof use val var void while with yield None True False ' +
    'select insert update delete from where join left right inner outer on group by order having limit offset into values set ' +
    'create table index primary key foreign references distinct as union all count sum avg min max case when then end'
  ).split(' '),
);
const TYPES = new Set('string number boolean int long float double char bool any unknown never object list dict str map Promise Array'.split(' '));

const TOKEN =
  /(\/\/[^\n]*|#[^\n]*|--[^\n]*|\/\*[\s\S]*?\*\/|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b(?=\s*\()|\b[A-Za-z_$][\w$]*\b)/g;

export function highlightCode(code: string, language: string): ReactNode[] {
  const hashComment = /^(py|python|sh|bash|shell|ruby|rb|yaml|yml|r)$/i.test(language) || (!language && /^\s*(def |import |from )/m.test(code));
  const dashComment = /^(sql|lua|haskell)$/i.test(language) || (!language && /\bselect\b[\s\S]*\bfrom\b/i.test(code));
  const sqlish = dashComment;
  const output: ReactNode[] = [];
  let lastIndex = 0;
  let k = 0;
  for (const m of code.matchAll(TOKEN)) {
    const token = m[0];
    const index = m.index ?? 0;
    if (index > lastIndex) output.push(code.slice(lastIndex, index));
    lastIndex = index + token.length;
    let cls: string | null = null;
    if (token.startsWith('//') || token.startsWith('/*')) cls = 'hl-com';
    else if (token.startsWith('#')) cls = hashComment ? 'hl-com' : null;
    else if (token.startsWith('--')) cls = dashComment ? 'hl-com' : null;
    else if (/^["'`]/.test(token)) cls = 'hl-str';
    else if (/^\d/.test(token)) cls = 'hl-num';
    else if (KEYWORDS.has(sqlish ? token.toLowerCase() : token)) cls = 'hl-kw';
    else if (TYPES.has(token) || /^[A-Z][a-z]\w*$/.test(token)) cls = 'hl-type';
    else if (code.slice(lastIndex).match(/^\s*\(/)) cls = 'hl-fn';
    // '#' or '--' comment outside its target language: emit only the first char and continue.
    if (cls === null && (token.startsWith('#') || token.startsWith('--'))) {
      output.push(token[0]);
      lastIndex = index + 1;
      continue;
    }
    output.push(cls ? <span key={k++} className={cls}>{token}</span> : token);
  }
  if (lastIndex < code.length) output.push(code.slice(lastIndex));
  return output;
}
