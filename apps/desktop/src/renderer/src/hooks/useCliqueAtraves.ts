import { useEffect } from 'react';
import type { Retangulo } from '@ponto/shared';

/**
 * Janelas flutuantes são do tamanho máximo que podem ocupar, mas só as áreas
 * `.solido` (e os menus abertos) recebem o mouse; no resto o clique atravessa
 * para o app de baixo.
 *
 * Quem decide é o processo principal, olhando a posição do cursor contra os
 * retângulos que mandamos daqui. Antes a janela decidia pelo mousemove, mas o
 * Windows não entrega mousemove (e às vezes dispara mouseleave) em cima das áreas
 * de arrastar, e a alça ficava "morta" de vez em quando.
 */
export function useCliqueAtraves(ativo: boolean): void {
  useEffect(() => {
    if (!ativo) return;
    let ultimo = '';
    let quadro = 0;

    const medir = () => {
      quadro = 0;
      const areas: Retangulo[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.solido, .menu.aberto')) {
        tamanhos.observe(el);
        if (el.closest('.escondido')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) continue;
        // 1 px de folga para a borda não piscar entre "atravessa" e "pega".
        areas.push({
          x: Math.floor(r.left) - 1,
          y: Math.floor(r.top) - 1,
          width: Math.ceil(r.width) + 2,
          height: Math.ceil(r.height) + 2,
        });
      }
      const json = JSON.stringify(areas);
      if (json === ultimo) return;
      ultimo = json;
      window.ponto.enviar('janela.areasSolidas', { areas });
    };
    const agendar = () => {
      quadro ||= requestAnimationFrame(medir);
    };

    const mutacoes = new MutationObserver(agendar);
    mutacoes.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    const tamanhos = new ResizeObserver(agendar);
    tamanhos.observe(document.body);
    // Animações de abrir/fechar mudam a posição sem mudar classe nem tamanho.
    window.addEventListener('transitionend', agendar);
    window.addEventListener('resize', agendar);
    agendar();

    return () => {
      cancelAnimationFrame(quadro);
      mutacoes.disconnect();
      tamanhos.disconnect();
      window.removeEventListener('transitionend', agendar);
      window.removeEventListener('resize', agendar);
    };
  }, [ativo]);
}
