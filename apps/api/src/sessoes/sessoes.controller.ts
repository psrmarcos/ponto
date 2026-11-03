import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
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

  @Delete(':id/falas')
  @HttpCode(204)
  async limpar(@Param('id') id: string, @Query('ateMs') ateMs: string): Promise<void> {
    const limite = Number(ateMs);
    if (!Number.isFinite(limite)) throw new BadRequestException({ mensagem: 'Informe ateMs.' });
    await this.sessoes.limparFalas(id, limite);
  }

  @Post(':id/encerrar')
  @HttpCode(204)
  async encerrar(@Param('id') id: string): Promise<void> {
    await this.sessoes.encerrar(id);
  }
}
