import { Injectable } from '@nestjs/common';
import { canalPai } from '../canal-pai';

/**
 * Chaves de API em memória. Quem guarda de verdade (cifrado com o cofre do SO) é
 * o processo principal, que manda o conjunto atualizado sempre que muda.
 * Rodando a API fora do Electron, as chaves vêm de variáveis de ambiente
 * (PONTO_CHAVE_OPENROUTER etc.), útil para testes.
 */
@Injectable()
export class SegredosService {
  private valores = new Map<string, string>();
  private ouvintes: Array<() => void> = [];

  constructor() {
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith('PONTO_CHAVE_') && v) this.valores.set(k.slice(12).toLowerCase(), v);
    }
    canalPai.aoReceber((m) => {
      if (m.tipo !== 'segredos') return;
      this.valores = new Map(Object.entries(m.valores));
      this.ouvintes.forEach((o) => o());
    });
  }

  obter(id: string): string | null {
    return this.valores.get(id) ?? null;
  }

  tem(id: string): boolean {
    return this.valores.has(id);
  }

  aoMudar(o: () => void): void {
    this.ouvintes.push(o);
  }
}
