import { Controller, Get } from '@nestjs/common';
import type { Agente } from '@ponto/shared';
import { AgentesService } from './agentes.service';

@Controller('agentes')
export class AgentesController {
  constructor(private readonly servico: AgentesService) {}

  @Get()
  listar(): Promise<Agente[]> {
    return this.servico.listar();
  }
}
