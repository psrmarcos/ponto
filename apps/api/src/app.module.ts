import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgentesModule } from './agentes/agentes.module';
import { TokenGuard } from './comum/token.guard';
import { ConfiguracoesModule } from './configuracoes/configuracoes.module';
import { DbModule } from './db/db.module';
import { EventosModule } from './eventos/eventos.module';
import { IaModule } from './ia/ia.module';
import { SaudeController } from './saude.controller';
import { SegredosModule } from './segredos/segredos.module';
import { UsoModule } from './uso/uso.module';
import { SessoesModule } from './sessoes/sessoes.module';
import { TranscricaoModule } from './transcricao/transcricao.module';
import { SugestoesModule } from './sugestoes/sugestoes.module';
import { ResumosModule } from './resumos/resumos.module';
import { EstatisticasModule } from './estatisticas/estatisticas.module';

@Module({
  imports: [DbModule, SegredosModule, EventosModule, ConfiguracoesModule, UsoModule, AgentesModule, IaModule, SessoesModule, TranscricaoModule, SugestoesModule, ResumosModule, EstatisticasModule],
  controllers: [SaudeController],
  providers: [{ provide: APP_GUARD, useClass: TokenGuard }],
})
export class AppModule {}
