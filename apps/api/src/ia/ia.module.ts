import { Module } from '@nestjs/common';
import { AgentesModule } from '../agentes/agentes.module';
import { SessoesModule } from '../sessoes/sessoes.module';
import { ChatController } from './chat/chat.controller';
import { ChatService } from './chat/chat.service';
import { IaController } from './ia.controller';
import { OpenRouterProvider } from './provedores/openrouter.provider';
import { ProvedoresService } from './provedores/provedores.service';

@Module({
  imports: [AgentesModule, SessoesModule],
  controllers: [IaController, ChatController],
  providers: [OpenRouterProvider, ProvedoresService, ChatService],
})
export class IaModule {}
