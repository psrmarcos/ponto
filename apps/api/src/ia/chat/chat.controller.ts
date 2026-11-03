import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { PedidoChat, type ContextoConversa, type RespostaPedidoChat } from '@ponto/shared';
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

  /** Janela de contexto: o que vai em cada chamada desta conversa. */
  @Get('conversas/:id/contexto')
  contexto(@Param('id') id: string, @Query('agente') agente?: string): Promise<ContextoConversa> {
    return this.chat.contexto(id, agente || undefined);
  }

  /** Troca as trocas antigas por um resumo curto (gasta uma chamada do modelo rápido). */
  @Post('conversas/:id/comprimir')
  comprimir(@Param('id') id: string, @Query('sessao') sessao?: string): Promise<ContextoConversa> {
    return this.chat.comprimir(id, sessao || null);
  }

  @Post('conversas/:id/cancelar')
  @HttpCode(204)
  cancelar(@Param('id') id: string): void {
    this.chat.cancelar(id);
  }
}
