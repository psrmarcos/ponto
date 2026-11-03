import { Injectable } from '@nestjs/common';
import type { UsoIa } from '@ponto/shared';
import { ConfiguracoesService } from '../configuracoes/configuracoes.service';
import { UsoService } from '../uso/uso.service';
import { ProvedoresService } from './provedores/provedores.service';
import type { MensagemIa } from './provedores/provedor';

/**
 * Gera um texto inteiro de uma vez (sem streaming para a tela), para tarefas de
 * bastidor: ata da reunião, resumo do começo da call. Usa o modelo rápido por
 * padrão e registra o gasto.
 */
@Injectable()
export class TextoIaService {
  constructor(
    private readonly config: ConfiguracoesService,
    private readonly provedores: ProvedoresService,
    private readonly uso: UsoService,
  ) {}

  async gerar(args: {
    mensagens: MensagemIa[];
    origem: string;
    sessaoId?: string | null;
    modelo?: string;
    maxTokens?: number;
    timeoutMs?: number;
  }): Promise<string> {
    const config = await this.config.obter();
    const provedor = this.provedores.obter(config.provedorPadrao);
    const sinal = AbortSignal.timeout(args.timeoutMs ?? 90_000);
    let texto = '';
    let uso: UsoIa | null = null;
    for await (const p of provedor.gerar(
      { modelo: args.modelo ?? config.modeloRapido, mensagens: args.mensagens, maxTokens: args.maxTokens ?? 1500, temperatura: 0.2, web: false, raciocinio: false },
      sinal,
    )) {
      if (p.tipo === 'texto') texto += p.texto;
      else uso = p.uso;
    }
    if (uso) await this.uso.registrar({ provedor: provedor.id, origem: args.origem, sessaoId: args.sessaoId ?? null, uso });
    return texto.trim();
  }
}
