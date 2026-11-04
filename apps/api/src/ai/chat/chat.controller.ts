import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { UnlockSpend, ChatRequest, type ConversationContext, type ChatResponse } from '@ponto/shared';
import { ZodPipe } from '../../common/zod.pipe';
import { ChatService } from './chat.service';

@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  /** Responds immediately with the id; text streams over the WebSocket (chat.delta). */
  @Post('messages')
  @HttpCode(202)
  send(@Body(new ZodPipe(ChatRequest)) request: ChatRequest): Promise<ChatResponse> {
    return this.chat.send(request);
  }

  /** Context window inspector: what goes into each call of this conversation. */
  @Get('conversations/:id/context')
  context(@Param('id') id: string, @Query('agent') agent?: string): Promise<ConversationContext> {
    return this.chat.context(id, agent || undefined);
  }

  /** Replaces older turns with a short summary (costs one fast-model call). */
  @Post('conversations/:id/compress')
  compress(@Param('id') id: string, @Query('session') session?: string): Promise<ConversationContext> {
    return this.chat.compress(id, session || null);
  }

  /** Hit the spend cap: unlocks additional USD for this conversation. */
  @Post('conversations/:id/unlock')
  @HttpCode(204)
  unlock(@Param('id') id: string, @Body(new ZodPipe(UnlockSpend)) body: UnlockSpend): void {
    this.chat.unlock(id, body.usd);
  }

  @Post('conversations/:id/cancel')
  @HttpCode(204)
  cancel(@Param('id') id: string): void {
    this.chat.cancel(id);
  }
}
