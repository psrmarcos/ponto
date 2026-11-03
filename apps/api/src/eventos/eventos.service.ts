import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { EventoWs } from '@ponto/shared';

const ABERTO = 1;

@Injectable()
export class EventosService {
  private readonly clientes = new Set<WebSocket>();

  get total(): number {
    return this.clientes.size;
  }

  adicionar(c: WebSocket): void {
    this.clientes.add(c);
  }

  remover(c: WebSocket): void {
    this.clientes.delete(c);
  }

  enviarPara(c: WebSocket, e: EventoWs): void {
    if (c.readyState === ABERTO) c.send(JSON.stringify(e));
  }

  /** Manda para todas as janelas conectadas. */
  emitir(e: EventoWs): void {
    const dados = JSON.stringify(e);
    for (const c of this.clientes) if (c.readyState === ABERTO) c.send(dados);
  }
}
