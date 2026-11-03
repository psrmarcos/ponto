import { Controller, Get } from '@nestjs/common';
import type { ResumoUso } from '@ponto/shared';
import { UsoService } from './uso.service';

@Controller('uso')
export class UsoController {
  constructor(private readonly uso: UsoService) {}

  @Get('resumo')
  resumo(): Promise<ResumoUso> {
    return this.uso.resumoMes();
  }
}
