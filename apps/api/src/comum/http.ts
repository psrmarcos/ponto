/**
 * Todo acesso à internet da API passa por aqui.
 *
 * Dentro do Electron usamos o `net.fetch`, que roda na pilha de rede do Chromium:
 * confia nos certificados do Windows/macOS e respeita o proxy do sistema. O fetch
 * do Node só conhece a lista de certificados embutida nele, então quebra com
 * SELF_SIGNED_CERT_IN_CHAIN quando um antivírus (Kaspersky, Avast, ESET...) ou
 * proxy corporativo inspeciona o HTTPS. É o mesmo motivo de o VS Code carregar os
 * certificados do sistema por padrão. Fora do Electron (testes, `node dist/main.js`)
 * cai no fetch normal.
 */
type Fetch = typeof globalThis.fetch;

function escolherFetch(): Fetch {
  if (process.versions.electron) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { net } = require('electron') as { net?: { fetch?: Fetch } };
      if (net?.fetch) return net.fetch.bind(net) as Fetch;
    } catch {
      /* sem o módulo: segue com o fetch do Node */
    }
  }
  return globalThis.fetch;
}

const fetchBase = escolherFetch();

/** Status que valem uma nova tentativa: limite de taxa e falhas passageiras do servidor. */
const STATUS_TEMPORARIO = new Set([408, 429, 500, 502, 503, 504]);

/**
 * fetch com até `tentativas` repetições para erros de rede e status temporários,
 * com espera crescente (0,5 s, 1 s...). Só repete antes de a resposta começar a
 * chegar, então nunca duplica texto no streaming nem cobra duas vezes.
 */
export async function http(url: string, init: RequestInit = {}, tentativas = 2): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await fetchBase(url, init);
      if (i < tentativas && STATUS_TEMPORARIO.has(r.status)) {
        await r.body?.cancel().catch(() => {});
        await esperar(atraso(i, r.headers.get('retry-after')), init.signal);
        continue;
      }
      return r;
    } catch (e) {
      if (init.signal?.aborted || i >= tentativas) throw e;
      await esperar(atraso(i, null), init.signal);
    }
  }
}

function atraso(tentativa: number, retryAfter: string | null): number {
  const s = Number(retryAfter);
  if (Number.isFinite(s) && s > 0) return Math.min(s * 1000, 5000);
  return 500 * 2 ** tentativa;
}

function esperar(ms: number, sinal?: AbortSignal | null): Promise<void> {
  return new Promise((ok, falha) => {
    const t = setTimeout(ok, ms);
    sinal?.addEventListener('abort', () => (clearTimeout(t), falha(sinal.reason)), { once: true });
  });
}
