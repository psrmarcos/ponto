import { Module } from '@nestjs/common';
import { EstatisticasController } from './estatisticas.controller';
import { EstatisticasService } from './estatisticas.service';

/** Números de uso para o Início (sessões, horas, sua parte da fala, custos). */
@Module({ controllers: [EstatisticasController], providers: [EstatisticasService] })
export class EstatisticasModule {}
