import { Module } from '@nestjs/common';
import { IaModule } from '../ia/ia.module';
import { SessoesModule } from '../sessoes/sessoes.module';
import { JevService } from './jev.service';
import { SugestoesService } from './sugestoes.service';

@Module({ imports: [IaModule, SessoesModule], providers: [JevService, SugestoesService] })
export class SugestoesModule {}
