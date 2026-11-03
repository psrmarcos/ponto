import { Module } from '@nestjs/common';
import { IaModule } from '../ia/ia.module';
import { SessoesModule } from '../sessoes/sessoes.module';
import { TraducaoController } from './traducao.controller';
import { TraducaoService } from './traducao.service';

/** Tradução em tempo real das falas (e correção no modo aprendizado). */
@Module({ imports: [IaModule, SessoesModule], controllers: [TraducaoController], providers: [TraducaoService] })
export class TraducaoModule {}
