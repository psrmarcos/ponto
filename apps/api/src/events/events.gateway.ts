import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { env } from '../env';
import { isValidToken } from '../common/token.guard';
import { EventsService } from './events.service';

/**
 * Single API WebSocket (ws://127.0.0.1:<port>/ws?token=...). Only the API sends
 * messages over this channel: windows receive events (streaming AI responses,
 * live transcription...) and make requests over HTTP.
 */
@WebSocketGateway({ path: '/ws' })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('WS');

  constructor(private readonly events: EventsService) {}

  handleConnection(client: WebSocket, req: IncomingMessage): void {
    const token = new URL(req.url ?? '/', 'http://local').searchParams.get('token');
    if (!isValidToken(token)) {
      client.close(4401, 'invalid token');
      return;
    }
    this.events.add(client);
    this.events.sendTo(client, { type: 'hello', version: env.version });
    this.log.debug(`window connected (${this.events.total})`);
  }

  handleDisconnect(client: WebSocket): void {
    this.events.remove(client);
  }
}
