import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { EdicaoAgente, type Agente } from '@ponto/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { AgentesService } from './agentes.service';

@Controller('agentes')
export class AgentesController {
  constructor(private readonly servico: AgentesService) {}

  @Get()
  listar(): Promise<Agente[]> {
    return this.servico.listar();
  }

  @Post()
  criar(@Body(new ZodPipe(EdicaoAgente)) corpo: EdicaoAgente): Promise<Agente> {
    return this.servico.criar(corpo);
  }

  @Patch(':id')
  editar(@Param('id') id: string, @Body(new ZodPipe(EdicaoAgente)) corpo: EdicaoAgente): Promise<Agente> {
    return this.servico.editar(id, corpo);
  }

  @Delete(':id')
  @HttpCode(204)
  async apagar(@Param('id') id: string): Promise<void> {
    await this.servico.apagar(id);
  }
}
