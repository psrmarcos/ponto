import { Controller, Get } from '@nestjs/common';
import type { Estatisticas } from '@ponto/shared';
import { EstatisticasService } from './estatisticas.service';

@Controller('estatisticas')
export class EstatisticasController {
  constructor(private readonly estatisticas: EstatisticasService) {}

  @Get()
  obter(): Promise<Estatisticas> {
    return this.estatisticas.obter();
  }
}
