/**
 * Dicas (tooltips) desenhadas dentro da janela.
 *
 * O tooltip nativo do `title` é uma janela à parte do sistema e aparece na
 * gravação de tela mesmo com o modo invisível ligado (testado no Windows 11).
 * Aqui todo `title` vira `data-dica` assim que aparece no DOM, e a dica é um
 * elemento da própria página, que some da gravação junto com a janela.
 */
const ATRASO_MS = 450;

export function instalarDicas(): void {
  const converter = (el: Element) => {
    const t = el.getAttribute('title');
    if (t === null) return;
    el.removeAttribute('title');
    if (t) el.setAttribute('data-dica', t);
  };
  document.querySelectorAll('[title]').forEach(converter);
  new MutationObserver((mudancas) => {
    for (const m of mudancas) {
      if (m.type === 'attributes' && m.target instanceof Element) converter(m.target);
      m.addedNodes.forEach((n) => {
        if (!(n instanceof Element)) return;
        converter(n);
        n.querySelectorAll('[title]').forEach(converter);
      });
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  const dica = document.createElement('div');
  dica.className = 'dica';
  dica.setAttribute('role', 'tooltip');
  document.body.appendChild(dica);

  let alvo: Element | null = null;
  let timer: number | undefined;
  const esconder = () => {
    window.clearTimeout(timer);
    alvo = null;
    dica.classList.remove('visivel');
  };
  const mostrar = (el: Element) => {
    const texto = el.getAttribute('data-dica');
    if (!texto || !el.isConnected) return;
    dica.textContent = texto;
    dica.classList.add('visivel');
    const r = el.getBoundingClientRect();
    const d = dica.getBoundingClientRect();
    const margem = 6;
    let x = r.left + r.width / 2 - d.width / 2;
    x = Math.max(margem, Math.min(x, window.innerWidth - d.width - margem));
    // Embaixo do elemento; se não couber, em cima.
    let y = r.bottom + margem;
    if (y + d.height > window.innerHeight - margem) y = r.top - d.height - margem;
    dica.style.transform = `translate(${Math.round(x)}px, ${Math.round(Math.max(margem, y))}px)`;
  };

  document.addEventListener('pointerover', (e) => {
    const el = (e.target as Element | null)?.closest?.('[data-dica]') ?? null;
    if (el === alvo) return;
    esconder();
    if (!el) return;
    alvo = el;
    timer = window.setTimeout(() => mostrar(el), ATRASO_MS);
  });
  document.addEventListener('pointerdown', esconder, true);
  document.addEventListener('keydown', esconder, true);
  document.addEventListener('scroll', esconder, true);
  window.addEventListener('blur', esconder);
}
