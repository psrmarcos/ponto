import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  botao: (abrir: { aberto: boolean; alternar: () => void }) => ReactNode;
  children: (fechar: () => void) => ReactNode;
  className?: string;
}

/** Menu ancorado no botão. Fecha ao clicar fora ou com Esc. */
export function Menu({ botao, children, className = '' }: Props) {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div className="ancora" ref={ref}>
      {botao({ aberto, alternar: () => setAberto((v) => !v) })}
      <div className={`menu ${className}${aberto ? ' aberto' : ''}`} role="menu">
        {children(() => setAberto(false))}
      </div>
    </div>
  );
}
