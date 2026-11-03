import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { WebSocket } from 'ws';
import { ambiente } from '../ambiente';
import { tokenValido } from '../comum/token.guard';
import { EventosService } from './eventos.service';

/**
 * WebSocket único da API (ws://127.0.0.1:<porta>/ws?token=...). Só a API fala
 * por aqui: as janelas recebem eventos (respostas da IA em streaming,
 * transcrição ao vivo...) e pedem coisas por HTTP.
 */
@WebSocketGateway({ path: '/ws' })
export class EventosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('WS');

  constructor(private readonly eventos: EventosService) {}

  handleConnection(cliente: WebSocket, req: IncomingMessage): void {
    const token = new URL(req.url ?? '/', 'http://local').searchParams.get('token');
    if (!tokenValido(token)) {
      cliente.close(4401, 'token inválido');
      return;
    }
    this.eventos.adicionar(cliente);
    this.eventos.enviarPara(cliente, { tipo: 'ola', versao: ambiente.versao });
    this.log.debug(`janela conectada (${this.eventos.total})`);
  }

  handleDisconnect(cliente: WebSocket): void {
    this.eventos.remover(cliente);
  }
}
