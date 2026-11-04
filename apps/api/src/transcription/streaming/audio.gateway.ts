import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { RawData, WebSocket } from 'ws';
import { AudioChannel } from '@ponto/shared';
import { isValidToken } from '../../common/token.guard';
import { StreamingService } from './streaming.service';

@WebSocketGateway({ path: '/audio' })
export class AudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('LiveAudio');
  private readonly connections = new Map<WebSocket, string>();

  constructor(private readonly streaming: StreamingService) {}

  async handleConnection(client: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    const channel = AudioChannel.safeParse(url.searchParams.get('channel'));
    const sessionId = url.searchParams.get('sessionId');
    if (!isValidToken(url.searchParams.get('token')) || !channel.success || !sessionId) {
      client.close(4401, 'invalid request');
      return;
    }
    const rejection = await this.streaming.open(sessionId, channel.data, () => client.close(4000, 'streaming dropped'));
    if (rejection) {
      client.close(4000, rejection.slice(0, 120));
      return;
    }
    const id = `${sessionId}:${channel.data}`;
    this.connections.set(client, id);
    client.on('message', (data: RawData, binary: boolean) => {
      if (!binary) return;
      const b = Buffer.isBuffer(data) ? data : Buffer.concat(data as Buffer[]);
      if (b.length <= 8) return;
      this.streaming.audio(id, b.subarray(8), b.readDoubleLE(0));
    });
    this.log.debug(`streaming opened (${id})`);
  }

  handleDisconnect(client: WebSocket): void {
    const id = this.connections.get(client);
    if (!id) return;
    this.connections.delete(client);
    this.streaming.close(id);
  }
}
