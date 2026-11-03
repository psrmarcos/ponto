import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { NovaSessao, type Fala, type Sessao } from '@ponto/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { SessoesService } from './sessoes.service';

@Controller('sessoes')
export class SessoesController {
  constructor(private readonly sessoes: SessoesService) {}

  @Post()
  criar(@Body(new ZodPipe(NovaSessao)) corpo: NovaSessao): Promise<Sessao> {
    return this.sessoes.criar(corpo.agenteId);
  }

  @Get(':id')
  obter(@Param('id') id: string): Promise<Sessao> {
    return this.sessoes.obter(id);
  }

  @Get(':id/falas')
  falas(@Param('id') id: string): Promise<Fala[]> {
    return this.sessoes.falas(id);
  }

  @Post(':id/encerrar')
  @HttpCode(204)
  async encerrar(@Param('id') id: string): Promise<void> {
    await this.sessoes.encerrar(id);
  }
}
