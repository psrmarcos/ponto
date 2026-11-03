import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Configuracoes } from '@ponto/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { ConfiguracoesService } from './configuracoes.service';

const Parcial = Configuracoes.partial();

@Controller('configuracoes')
export class ConfiguracoesController {
  constructor(private readonly servico: ConfiguracoesService) {}

  @Get()
  obter(): Promise<Configuracoes> {
    return this.servico.obter();
  }

  @Patch()
  atualizar(@Body(new ZodPipe(Parcial)) corpo: Partial<Configuracoes>): Promise<Configuracoes> {
    return this.servico.atualizar(corpo);
  }
}
