import { Module } from '@nestjs/common';
import { IaModule } from '../ia/ia.module';
import { SessoesModule } from '../sessoes/sessoes.module';
import { AtaService } from './ata.service';
import { AoVivoService } from './ao-vivo.service';
import { CompactacaoService } from './compactacao.service';
import { ResumosController } from './resumos.controller';

@Module({ imports: [IaModule, SessoesModule], controllers: [ResumosController], providers: [AtaService, CompactacaoService, AoVivoService] })
export class ResumosModule {}
