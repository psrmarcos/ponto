/**
 * In-window tooltips.
 *
 * The native `title` tooltip is a separate OS window and shows up in screen
 * recordings even when stealth mode is enabled (tested on Windows 11).
 * Here every `title` attribute is converted into `data-tooltip` as soon as it
 * enters the DOM, and the tooltip is an element inside the page itself, so it
 * stays hidden from screen capture along with the window.
 */
const DELAY_MS = 450;

export function installTooltips(): void {
  const convert = (el: Element) => {
    const t = el.getAttribute('title');
    if (t === null) return;
    el.removeAttribute('title');
    if (t) el.setAttribute('data-tooltip', t);
  };
  document.querySelectorAll('[title]').forEach(convert);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof Element) convert(m.target);
      m.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        convert(node);
        node.querySelectorAll('[title]').forEach(convert);
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  const tooltip = document.createElement('div');
  tooltip.className = 'floating-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  document.body.appendChild(tooltip);

  let currentTarget: Element | null = null;
  let timer: number | undefined;
  const hide = () => {
    window.clearTimeout(timer);
    currentTarget = null;
    tooltip.classList.remove('visible');
  };
  const show = (el: Element) => {
    const text = el.getAttribute('data-tooltip');
    if (!text || !el.isConnected) return;
    tooltip.textContent = text;
    tooltip.classList.add('visible');
    const r = el.getBoundingClientRect();
    const d = tooltip.getBoundingClientRect();
    const margin = 6;
    let x = r.left + r.width / 2 - d.width / 2;
    x = Math.max(margin, Math.min(x, window.innerWidth - d.width - margin));
    // Below the element; if it doesn't fit, above it.
    let y = r.bottom + margin;
    if (y + d.height > window.innerHeight - margin) y = r.top - d.height - margin;
    tooltip.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(margin, y))}px)`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-tooltip]') ?? null;
    if (el === currentTarget) return;
    hide();
    if (!el) return;
    currentTarget = el;
    timer = window.setTimeout(() => show(el), DELAY_MS);
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('blur', hide);
}
