import { useEffect } from 'react';
import type { Rect } from '@ponto/shared';

/**
 * Floating windows occupy the maximum area they might need, but only `.solid`
 * regions (and open menus) receive mouse events; everywhere else clicks pass
 * through to the app underneath.
 *
 * The main process makes the decision by checking the cursor position against
 * the rectangles reported from here. Previously the window decided on mousemove,
 * but Windows does not deliver mousemove (and sometimes fires mouseleave) over
 * draggable regions, leaving the drag handle occasionally unresponsive.
 */
export function useClickThrough(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    let lastJson = '';
    let frameId = 0;

    const measure = () => {
      frameId = 0;
      const areas: Rect[] = [];
      for (const el of document.querySelectorAll<HTMLElement>('.solid, .menu.open')) {
        resizeObserver.observe(el);
        if (el.closest('.hidden')) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        // 1 px padding so the border doesn't flicker between pass-through and interactive.
        areas.push({
          x: Math.floor(rect.left) - 1,
          y: Math.floor(rect.top) - 1,
          width: Math.ceil(rect.width) + 2,
          height: Math.ceil(rect.height) + 2,
        });
      }
      const json = JSON.stringify(areas);
      if (json === lastJson) return;
      lastJson = json;
      window.ponto.send('window.solidAreas', { areas });
    };
    const schedule = () => {
      frameId ||= requestAnimationFrame(measure);
    };

    const mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(document.body);
    // Open/close animations change position without changing class or size.
    window.addEventListener('transitionend', schedule);
    window.addEventListener('resize', schedule);
    schedule();

    return () => {
      cancelAnimationFrame(frameId);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener('transitionend', schedule);
      window.removeEventListener('resize', schedule);
    };
  }, [enabled]);
}
