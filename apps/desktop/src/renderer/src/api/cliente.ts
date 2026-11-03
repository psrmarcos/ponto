import { CABECALHO_TOKEN, EventoWs, type ConexaoApi } from '@ponto/shared';
import { useEstadoApp } from '../estado/app';

type Ouvinte = (e: EventoWs) => void;

/**
 * Cliente da API local: HTTP para pedidos, WebSocket para eventos. Reconecta
 * sozinho quando a API reinicia (a porta pode mudar, então pede a conexão de novo).
 */
class ClienteApi {
  private conexao: ConexaoApi | null = null;
  private ws: WebSocket | null = null;
  private readonly ouvintes = new Set<Ouvinte>();
  private readonly aoConectar = new Set<() => void>();
  private espera = 500;

  constructor() {
    // Quando a API fica pronta (de novo), reconecta.
    useEstadoApp.subscribe((s, antes) => {
      if (s.estado?.api.status === 'pronta' && antes.estado?.api.status !== 'pronta') void this.conectar();
    });
  }

  ouvir(o: Ouvinte): () => void {
    this.ouvintes.add(o);
    return () => this.ouvintes.delete(o);
  }

  /** Chamado a cada (re)conexão: bom lugar para recarregar dados. */
  quandoConectar(o: () => void): () => void {
    this.aoConectar.add(o);
    if (this.ws?.readyState === WebSocket.OPEN) o();
    return () => this.aoConectar.delete(o);
  }

  async conectar(): Promise<void> {
    const c = await window.ponto.invocar('api.conexao');
    if (!c) return;
    this.conexao = c;
    if (this.ws && this.ws.readyState <= WebSocket.OPEN) this.ws.close();
    const ws = new WebSocket(`${c.ws}?token=${encodeURIComponent(c.token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.espera = 500;
      this.aoConectar.forEach((o) => o());
    };
    ws.onmessage = (m) => {
      const r = EventoWs.safeParse(JSON.parse(String(m.data)));
      if (r.success) this.ouvintes.forEach((o) => o(r.data));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      setTimeout(() => void this.conectar(), this.espera);
      this.espera = Math.min(this.espera * 2, 10_000);
    };
  }

  get<T>(caminho: string): Promise<T> {
    return this.pedir<T>('GET', caminho);
  }
  post<T>(caminho: string, corpo?: unknown): Promise<T> {
    return this.pedir<T>('POST', caminho, corpo);
  }
  patch<T>(caminho: string, corpo: unknown): Promise<T> {
    return this.pedir<T>('PATCH', caminho, corpo);
  }

  private async pedir<T>(metodo: string, caminho: string, corpo?: unknown): Promise<T> {
    const c = this.conexao ?? (await window.ponto.invocar('api.conexao'));
    if (!c) throw new Error('A API local ainda está iniciando.');
    this.conexao = c;
    const r = await fetch(c.url + caminho, {
      method: metodo,
      headers: { [CABECALHO_TOKEN]: c.token, ...(corpo !== undefined ? { 'content-type': 'application/json' } : {}) },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
    });
    if (!r.ok) {
      const j = (await r.json().catch(() => null)) as { message?: string; mensagem?: string } | null;
      throw new Error(j?.mensagem ?? j?.message ?? `Erro ${r.status}`);
    }
    return (r.status === 204 ? undefined : await r.json()) as T;
  }
}

export const api = new ClienteApi();
