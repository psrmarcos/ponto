import { Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { EdicaoSessao, type SessaoNaLista } from '@ponto/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { SessoesService } from '../sessoes/sessoes.service';
import { AtaService, sessaoEmMarkdown } from './ata.service';

/** Histórico de sessões na Home: lista, ata, exportação e limpeza. */
@Controller('sessoes')
export class ResumosController {
  constructor(
    private readonly sessoes: SessoesService,
    private readonly ata: AtaService,
    private readonly config: ConfiguracoesService,
  ) {}

  @Get()
  listar(): Promise<SessaoNaLista[]> {
    return this.sessoes.listar();
  }

  @Patch(':id')
  @HttpCode(204)
  async editar(@Param('id') id: string, @Body(new ZodPipe(EdicaoSessao)) corpo: EdicaoSessao): Promise<void> {
    await this.sessoes.renomear(id, corpo.titulo);
  }

  @Delete(':id')
  @HttpCode(204)
  async apagar(@Param('id') id: string): Promise<void> {
    await this.sessoes.apagar(id);
  }

  /** Gera (ou refaz) a ata. Responde na hora; o resultado chega pelo evento sessao.resumo. */
  @Post(':id/resumo')
  @HttpCode(202)
  gerarResumo(@Param('id') id: string): void {
    void this.ata.gerar(id, true);
  }

  @Get(':id/markdown')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async markdown(@Param('id') id: string): Promise<string> {
    const [sessao, falas, config] = await Promise.all([this.sessoes.obter(id), this.sessoes.falas(id), this.config.obter()]);
    return sessaoEmMarkdown(sessao, falas, config.nomeUsuario);
  }
}
