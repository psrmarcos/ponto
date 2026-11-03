import { Controller, Get, Param } from '@nestjs/common';
import type { TraducaoFala } from '@ponto/shared';
import { TraducaoService } from './traducao.service';

@Controller('sessoes')
export class TraducaoController {
  constructor(private readonly traducao: TraducaoService) {}

  /** Traduções já feitas nesta sessão (para a janela que abriu depois). */
  @Get(':id/traducoes')
  listar(@Param('id') id: string): TraducaoFala[] {
    return this.traducao.listar(id);
  }
}
