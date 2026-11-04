import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TranscriptionModule } from '../transcription/transcription.module';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { AiController } from './ai.controller';
import { OpenRouterProvider } from './providers/openrouter.provider';
import { ProvidersService } from './providers/providers.service';
import { AiTextService } from './ai-text.service';

@Module({
  imports: [AgentsModule, SessionsModule, TranscriptionModule],
  controllers: [AiController, ChatController],
  providers: [OpenRouterProvider, ProvidersService, ChatService, AiTextService],
  exports: [ChatService, AiTextService],
})
export class AiModule {}
