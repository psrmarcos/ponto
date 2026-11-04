/**
 * All internet access from the API goes through here.
 *
 * Inside Electron we use `net.fetch`, which runs on Chromium's network stack:
 * it trusts Windows/macOS certificates and respects the system proxy. Node's
 * built-in fetch only knows its bundled CA list, breaking with
 * SELF_SIGNED_CERT_IN_CHAIN when an antivirus (Kaspersky, Avast, ESET...) or
 * corporate proxy inspects HTTPS. Outside Electron (tests, `node dist/main.js`)
 * it falls back to standard fetch.
 */
type Fetch = typeof globalThis.fetch;

function chooseFetch(): Fetch {
  if (process.versions.electron) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { net } = require('electron') as { net?: { fetch?: Fetch } };
      if (net?.fetch) return net.fetch.bind(net) as Fetch;
    } catch {
      /* module unavailable: fall back to Node fetch */
    }
  }
  return globalThis.fetch;
}

const baseFetch = chooseFetch();

/** Status codes worth retrying: rate limits and transient server failures. */
const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

/**
 * fetch with up to `retries` attempts for network errors and transient status codes,
 * with exponential backoff (0.5s, 1s...). Only retries before the response body starts
 * streaming, so it never duplicates streamed text or double-charges.
 */
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
