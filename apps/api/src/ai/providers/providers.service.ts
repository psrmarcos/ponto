import { Injectable, NotFoundException } from '@nestjs/common';
import type { AiProviderId, ProviderInfo } from '@ponto/shared';
import { OpenRouterProvider } from './openrouter.provider';
import type { AiProvider } from './provider';

/** Providers not yet implemented appear in the list so the user knows they are coming. */
const UPCOMING: Array<{ id: AiProviderId; name: string }> = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
];

@Injectable()
export class ProvidersService {
  private readonly providers: Map<AiProviderId, AiProvider>;

  constructor(openrouter: OpenRouterProvider) {
    this.providers = new Map<AiProviderId, AiProvider>([[openrouter.id, openrouter]]);
  }

  get(id: AiProviderId): AiProvider {
    const p = this.providers.get(id);
    if (!p) throw new NotFoundException(`O provedor ${id} ainda não está disponível.`);
    return p;
  }

  list(): ProviderInfo[] {
    const real = [...this.providers.values()].map((p) => ({
      id: p.id,
      name: p.name,
      implemented: p.implemented,
      configured: p.isConfigured(),
    }));
    return [...real, ...UPCOMING.map((u) => ({ ...u, implemented: false, configured: false }))];
  }
}
