import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

interface Props {
  botao: (abrir: { aberto: boolean; alternar: () => void }) => ReactNode;
  children: (fechar: () => void) => ReactNode;
  className?: string;
  /** Lado preferido. Se não couber, abre para o outro. */
  abrirPara?: 'baixo' | 'cima';
  /** Borda do botão em que o menu se alinha. */
  alinhar?: 'esquerda' | 'direita';
}

const MARGEM = 8;
const FOLGA = 4;

/**
 * Menu ancorado no botão. Fecha ao clicar fora, com Esc ou quando a página rola.
 *
 * Fica em `position: fixed`, calculado a partir do botão: assim nenhum painel
 * com rolagem ou `overflow: hidden` corta o menu. Abre para o lado que tiver
 * espaço, desliza na horizontal para não passar da borda da janela e ganha
 * rolagem se mesmo assim não couber (a janela do SO corta o que passa dela).
 */
export function Menu({ botao, children, className = '', abrirPara = 'baixo', alinhar = 'esquerda' }: Props) {
  const [aberto, setAberto] = useState(false);
  const [estilo, setEstilo] = useState<CSSProperties | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    // Rolou a página por baixo: o botão saiu do lugar, então fecha (rolar dentro do menu não conta).
    const rolou = (e: Event) => {
      if (!menu.current?.contains(e.target as Node)) setAberto(false);
    };
    const redimensionou = () => setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    document.addEventListener('scroll', rolou, true);
    window.addEventListener('resize', redimensionou);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
      document.removeEventListener('scroll', rolou, true);
      window.removeEventListener('resize', redimensionou);
    };
  }, [aberto]);

  // Mede antes de pintar: sem piscar no lugar errado.
  useLayoutEffect(() => {
    if (!aberto || !ref.current || !menu.current) {
      setEstilo(null);
      return;
    }
    const b = ref.current.getBoundingClientRect();
    const altura = menu.current.scrollHeight;
    const larguraNatural = menu.current.offsetWidth;
    const abaixo = window.innerHeight - b.bottom - MARGEM - FOLGA;
    const acimaEspaco = b.top - MARGEM - FOLGA;
    const acima =
      abrirPara === 'cima' ? altura <= acimaEspaco || acimaEspaco > abaixo : altura > abaixo && acimaEspaco > abaixo;
    const max = Math.max(120, Math.floor(acima ? acimaEspaco : abaixo));
    const h = Math.min(altura, max);
    const largura = Math.min(larguraNatural, window.innerWidth - 2 * MARGEM);
    let left = alinhar === 'direita' ? b.right - largura : b.left;
    left = Math.max(MARGEM, Math.min(left, window.innerWidth - MARGEM - largura));
    setEstilo({
      position: 'fixed',
      left: Math.round(left),
      top: Math.round(acima ? b.top - FOLGA - h : b.bottom + FOLGA),
      right: 'auto',
      bottom: 'auto',
      maxHeight: max,
      overflowY: 'auto',
      width: largura < larguraNatural ? largura : undefined,
    });
  }, [aberto, abrirPara, alinhar]);

  return (
    <div className="ancora" ref={ref}>
      {botao({ aberto, alternar: () => setAberto((v) => !v) })}
      <div
        ref={menu}
        className={`menu ${className}${aberto ? ' aberto' : ''}`}
        role="menu"
        style={estilo ?? (aberto ? { visibility: 'hidden' } : undefined)}
      >
        {children(() => setAberto(false))}
      </div>
    </div>
  );
}
