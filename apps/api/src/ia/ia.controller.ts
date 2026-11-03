import { Controller, Get, Param, Post } from '@nestjs/common';
import { IdProvedorIa, type InfoProvedor, type ModeloIa, type ResultadoTesteChave } from '@ponto/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { ProvedoresService } from './provedores/provedores.service';

@Controller('ia/provedores')
export class IaController {
  constructor(private readonly provedores: ProvedoresService) {}

  @Get()
  listar(): InfoProvedor[] {
    return this.provedores.listar();
  }

  @Post(':id/testar')
  testar(@Param('id', new ZodPipe(IdProvedorIa)) id: IdProvedorIa): Promise<ResultadoTesteChave> {
    return this.provedores.obter(id).testarChave();
  }

  @Get(':id/modelos')
  modelos(@Param('id', new ZodPipe(IdProvedorIa)) id: IdProvedorIa): Promise<ModeloIa[]> {
    return this.provedores.obter(id).listarModelos();
  }
}
