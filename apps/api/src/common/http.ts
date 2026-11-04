type Fetch = typeof globalThis.fetch;

function chooseFetch(): Fetch {
  if (process.versions.electron) {
    try {
      const { net } = require('electron') as { net?: { fetch?: Fetch } };
      if (net?.fetch) return net.fetch.bind(net) as Fetch;
    } catch {
    }
  }
  return globalThis.fetch;
}

const baseFetch = chooseFetch();

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

export async function http(url: string, init: RequestInit = {}, retries = 2): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      const r = await baseFetch(url, init);
      if (i < retries && TRANSIENT_STATUS.has(r.status)) {
        await r.body?.cancel().catch(() => {});
        await sleep(backoffDelay(i, r.headers.get('retry-after')), init.signal);
        continue;
      }
      return r;
    } catch (e) {
      if (init.signal?.aborted || i >= retries) throw e;
      await sleep(backoffDelay(i, null), init.signal);
    }
  }
}

function backoffDelay(attempt: number, retryAfter: string | null): number {
  const s = Number(retryAfter);
  if (Number.isFinite(s) && s > 0) return Math.min(s * 1000, 5000);
  return 500 * 2 ** attempt;
}

function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((ok, fail) => {
    const t = setTimeout(ok, ms);
    signal?.addEventListener('abort', () => (clearTimeout(t), fail(signal.reason)), { once: true });
  });
}
