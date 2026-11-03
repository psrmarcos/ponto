import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  botao: (abrir: { aberto: boolean; alternar: () => void }) => ReactNode;
  children: (fechar: () => void) => ReactNode;
  className?: string;
}

const MARGEM = 8;

/**
 * Menu ancorado no botão. Fecha ao clicar fora ou com Esc.
 * Abre para baixo ou para cima, para o lado que tiver mais espaço dentro da
 * janela, e ganha rolagem se mesmo assim não couber (a janela corta o que passa).
 */
export function Menu({ botao, children, className = '' }: Props) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState<{ acima: boolean; max: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  // Mede antes de pintar: sem piscar no lado errado.
  useLayoutEffect(() => {
    if (!aberto || !ref.current || !menu.current) {
      setPosicao(null);
      return;
    }
    const ancora = ref.current.getBoundingClientRect();
    const altura = menu.current.scrollHeight;
    const abaixo = window.innerHeight - ancora.bottom - MARGEM;
    const acimaEspaco = ancora.top - MARGEM;
    const acima = altura > abaixo && acimaEspaco > abaixo;
    setPosicao({ acima, max: Math.max(120, Math.floor(acima ? acimaEspaco : abaixo) - 6) });
  }, [aberto]);

  return (
    <div className="ancora" ref={ref}>
      {botao({ aberto, alternar: () => setAberto((v) => !v) })}
      <div
        ref={menu}
        className={`menu ${className}${aberto ? ' aberto' : ''}${posicao?.acima ? ' para-cima' : ''}`}
        role="menu"
        style={posicao ? { maxHeight: posicao.max, overflowY: 'auto' } : undefined}
      >
        {children(() => setAberto(false))}
      </div>
    </div>
  );
}
