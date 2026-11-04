import { TOKEN_HEADER, WsEvent, type ApiConnection } from '@ponto/shared';
import { useAppState } from '../state/app';

type Listener = (event: WsEvent) => void;

/**
 * Local API client: HTTP for requests, WebSocket for events. Reconnects
 * automatically when the API restarts (the port may change, so it requests
 * the connection info again).
 */
class ApiClient {
  private connection: ApiConnection | null = null;
  private ws: WebSocket | null = null;
  private readonly listeners = new Set<Listener>();
  private readonly connectHandlers = new Set<() => void>();
  private backoffMs = 500;

  constructor() {
    // Reconnect when the API becomes ready (again).
    useAppState.subscribe((state, prev) => {
      if (state.state?.api.status === 'ready' && prev.state?.api.status !== 'ready') void this.connect();
    });
  }

  on(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Called on every (re)connection: good place to reload initial data. */
  onConnect(handler: () => void): () => void {
    this.connectHandlers.add(handler);
    if (this.ws?.readyState === WebSocket.OPEN) handler();
    return () => this.connectHandlers.delete(handler);
  }

  async connect(): Promise<void> {
    const conn = await window.ponto.invoke('api.connection');
    if (!conn) return;
    this.connection = conn;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    const ws = new WebSocket(`${conn.ws}?token=${encodeURIComponent(conn.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.backoffMs = 500;
      this.connectHandlers.forEach((h) => h());
    };
    ws.onmessage = (msg) => {
      const parsed = WsEvent.safeParse(JSON.parse(String(msg.data)));
      if (parsed.success) this.listeners.forEach((l) => l(parsed.data));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      setTimeout(() => void this.connect(), this.backoffMs);
      this.backoffMs = Math.min(this.backoffMs * 2, 10_000);
    };
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }
  delete<T = void>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  /** Sends a raw WAV buffer (no JSON or base64 overhead). */
  async sendAudio(path: string, wav: ArrayBuffer): Promise<void> {
    const conn = this.connection ?? (await window.ponto.invoke('api.connection'));
    if (!conn) throw new Error('A API local ainda está iniciando.');
    this.connection = conn;
    const res = await fetch(conn.url + path, {
      method: 'POST',
      headers: { [TOKEN_HEADER]: conn.token, 'content-type': 'audio/wav' },
      body: wav,
    }).catch((err: unknown) => {
      this.connection = null; // API may have restarted on another port
      throw err;
    });
    if (!res.ok) throw new Error(`Erro ${res.status} ao enviar o áudio`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const conn = this.connection ?? (await window.ponto.invoke('api.connection'));
    if (!conn) throw new Error('A API local ainda está iniciando.');
    this.connection = conn;
    const res = await fetch(conn.url + path, {
      method,
      headers: { [TOKEN_HEADER]: conn.token, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }).catch((err: unknown) => {
      this.connection = null; // API may have restarted on another port
      throw err;
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => null)) as { message?: string; mensagem?: string } | null;
      throw new Error(json?.message ?? json?.mensagem ?? `Erro ${res.status}`);
    }
    const text = await res.text();
    if (!text) return undefined as T;
    return ((res.headers.get('content-type') ?? '').includes('json') ? JSON.parse(text) : text) as T;
  }
}

export const api = new ApiClient();
