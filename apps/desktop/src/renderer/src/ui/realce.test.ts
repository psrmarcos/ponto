import { describe, expect, it } from 'vitest';
import { isValidElement, type ReactNode } from 'react';
import { realcar } from './realce';

const texto = (n: ReactNode[]) => n.map((x) => (isValidElement<{ children: string }>(x) ? x.props.children : String(x))).join('');
const classes = (n: ReactNode[]) => n.filter(isValidElement).map((x) => (x.props as { className: string }).className);

describe('realcar', () => {
  const casos: Array<[string, string]> = [
    ['ts', 'const x: number = 42; // resposta\nfunction f(a) { return `oi ${a}`; }'],
    ['python', 'def soma(a, b):\n    # comentário\n    return a + b  # fim'],
    ['sql', "SELECT u.nome FROM usuarios u LEFT JOIN pedidos p ON p.uid = u.id -- todos\nWHERE p.id IS NULL AND u.nome = 'x'"],
    ['', 'x = "a#b"; y = 1 - -2;'],
  ];
  it.each(casos)('não perde nem troca texto (%s)', (lang, codigo) => {
    expect(texto(realcar(codigo, lang))).toBe(codigo);
  });
  it('marca palavras, textos e comentários', () => {
    const c = classes(realcar("const a = 'x'; // nota", 'js'));
    expect(c).toEqual(expect.arrayContaining(['rc-kw', 'rc-str', 'rc-com']));
  });
  it('em SQL palavras maiúsculas contam e -- é comentário', () => {
    const c = classes(realcar('SELECT 1 -- ok', 'sql'));
    expect(c).toEqual(['rc-kw', 'rc-num', 'rc-com']);
  });
});
