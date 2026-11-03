import { useEffect } from 'react';

/**
 * Janelas flutuantes são do tamanho máximo que podem ocupar, mas só os elementos
 * com a classe `.solido` recebem o mouse; no resto o clique atravessa para o app
 * de baixo. Avisamos o main só quando o estado muda.
 */
export function useCliqueAtraves(ativo: boolean): void {
  useEffect(() => {
    if (!ativo) return;
    let ignorando = true;
    const definir = (ignorar: boolean) => {
      if (ignorar === ignorando) return;
      ignorando = ignorar;
      window.ponto.enviar('janela.mouse', { ignorar });
    };
    const mover = (e: MouseEvent) => definir(!(e.target as Element | null)?.closest?.('.solido'));
    const sair = () => definir(true);
    window.addEventListener('mousemove', mover);
    document.documentElement.addEventListener('mouseleave', sair);
    return () => {
      window.removeEventListener('mousemove', mover);
      document.documentElement.removeEventListener('mouseleave', sair);
    };
  }, [ativo]);
}
