import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { highlightCode } from './highlight';

const plainText = (nodes: ReactNode[]) =>
  nodes.map((x) => (isValidElement<{ children: string }>(x) ? x.props.children : String(x))).join('');
const classNames = (nodes: ReactNode[]) => nodes.filter(isValidElement).map((x) => (x.props as { className: string }).className);

describe('highlightCode', () => {
  const cases: Array<[string, string]> = [
    ['ts', 'const x: number = 42; // resposta\nfunction f(a) { return `oi ${a}`; }'],
    ['python', 'def soma(a, b):\n    # comentário\n    return a + b  # fim'],
    ['sql', "SELECT u.nome FROM usuarios u LEFT JOIN pedidos p ON p.uid = u.id -- todos\nWHERE p.id IS NULL AND u.nome = 'x'"],
    ['', 'x = "a#b"; y = 1 - -2;'],
  ];
  it.each(cases)('preserves exact source text (%s)', (lang, code) => {
    expect(plainText(highlightCode(code, lang))).toBe(code);
  });
  it('highlights keywords, strings, and comments', () => {
    const c = classNames(highlightCode("const a = 'x'; // nota", 'js'));
    expect(c).toEqual(expect.arrayContaining(['hl-kw', 'hl-str', 'hl-com']));
  });
  it('treats uppercase SQL keywords and -- comments properly', () => {
    const c = classNames(highlightCode('SELECT 1 -- ok', 'sql'));
    expect(c).toEqual(['hl-kw', 'hl-num', 'hl-com']);
  });
});
