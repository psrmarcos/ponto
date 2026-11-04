import { Injectable } from '@nestjs/common';
import type { WebSocket } from 'ws';
import type { WsEvent } from '@ponto/shared';

const OPEN = 1;

@Injectable()
export class EventsService {
  private readonly clients = new Set<WebSocket>();

  get total(): number {
    return this.clients.size;
  }

  add(c: WebSocket): void {
    this.clients.add(c);
  }

  remove(c: WebSocket): void {
    this.clients.delete(c);
  }

  sendTo(c: WebSocket, e: WsEvent): void {
    if (c.readyState === OPEN) c.send(JSON.stringify(e));
  }

  /** Broadcasts to all connected windows. */
  emit(e: WsEvent): void {
    const data = JSON.stringify(e);
    for (const c of this.clients) if (c.readyState === OPEN) c.send(data);
  }
}
