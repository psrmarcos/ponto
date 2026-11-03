import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { PedidoChat, type RespostaPedidoChat } from '@ponto/shared';
import { ZodPipe } from '../../comum/zod.pipe';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Responde na hora com o id; o texto chega em streaming pelo WebSocket (chat.delta). */
  @Post('mensagens')
  @HttpCode(202)
  enviar(@Body(new ZodPipe(PedidoChat)) pedido: PedidoChat): Promise<RespostaPedidoChat> {
    return this.chat.enviar(pedido);
  }

  @Post('conversas/:id/cancelar')
  @HttpCode(204)
  cancelar(@Param('id') id: string): void {
    this.chat.cancelar(id);
  }
}
