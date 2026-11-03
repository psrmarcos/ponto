import { Logger } from '@nestjs/common';
import { OnGatewayConnection, OnGatewayDisconnect, WebSocketGateway } from '@nestjs/websockets';
import type { IncomingMessage } from 'node:http';
import type { RawData, WebSocket } from 'ws';
import { CanalAudio } from '@ponto/shared';
import { tokenValido } from '../../comum/token.guard';
import { StreamingService } from './streaming.service';

/**
 * Áudio ao vivo da janela de captura (ws://127.0.0.1:<porta>/audio?token&sessaoId&canal).
 * Cada mensagem binária: 8 bytes com o ms da sessão em que o pedaço começa
 * (float64 little-endian) e depois o PCM 16 bits mono 16 kHz.
 */
@WebSocketGateway({ path: '/audio' })
export class AudioGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger('AudioAoVivo');
  private readonly ligacoes = new Map<WebSocket, string>();

  constructor(private readonly streaming: StreamingService) {}

  async handleConnection(cliente: WebSocket, req: IncomingMessage): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://local');
    const canal = CanalAudio.safeParse(url.searchParams.get('canal'));
    const sessaoId = url.searchParams.get('sessaoId');
    if (!tokenValido(url.searchParams.get('token')) || !canal.success || !sessaoId) {
      cliente.close(4401, 'pedido inválido');
      return;
    }
    const recusa = await this.streaming.abrir(sessaoId, canal.data, () => cliente.close(4000, 'streaming caiu'));
    if (recusa) {
      // 4000: a captura volta para o modo em lote sem tentar de novo.
      cliente.close(4000, recusa.slice(0, 120));
      return;
    }
    const id = `${sessaoId}:${canal.data}`;
    this.ligacoes.set(cliente, id);
    cliente.on('message', (dados: RawData, binario: boolean) => {
      if (!binario) return;
      const b = Buffer.isBuffer(dados) ? dados : Buffer.concat(dados as Buffer[]);
      if (b.length <= 8) return;
      this.streaming.audio(id, b.subarray(8), b.readDoubleLE(0));
    });
    this.log.debug(`streaming aberto (${id})`);
  }

  handleDisconnect(cliente: WebSocket): void {
    const id = this.ligacoes.get(cliente);
    if (!id) return;
    this.ligacoes.delete(cliente);
    this.streaming.fechar(id);
  }
}
