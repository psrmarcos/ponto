import { Injectable, NotFoundException } from '@nestjs/common';
import type { IdProvedorIa, InfoProvedor } from '@ponto/shared';
import { OpenRouterProvider } from './openrouter.provider';
import type { ProvedorIa } from './provedor';

/** Provedores ainda não implementados aparecem na lista para o usuário saber que vêm aí. */
const FUTUROS: Array<{ id: IdProvedorIa; nome: string }> = [
  { id: 'openai', nome: 'OpenAI' },
  { id: 'anthropic', nome: 'Anthropic' },
];

@Injectable()
export class ProvedoresService {
  private readonly provedores: Map<IdProvedorIa, ProvedorIa>;

  constructor(openrouter: OpenRouterProvider) {
    this.provedores = new Map<IdProvedorIa, ProvedorIa>([[openrouter.id, openrouter]]);
  }

  obter(id: IdProvedorIa): ProvedorIa {
    const p = this.provedores.get(id);
    if (!p) throw new NotFoundException(`O provedor ${id} ainda não está disponível.`);
    return p;
  }

  listar(): InfoProvedor[] {
    const reais = [...this.provedores.values()].map((p) => ({
      id: p.id,
      nome: p.nome,
      implementado: p.implementado,
      configurado: p.configurado(),
    }));
    return [...reais, ...FUTUROS.map((f) => ({ ...f, implementado: false, configurado: false }))];
  }
}
