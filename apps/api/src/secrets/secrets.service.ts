import { Injectable } from '@nestjs/common';
import { parentChannel } from '../parent-channel';

@Injectable()
export class SecretsService {
  private values = new Map<string, string>();
  private listeners: Array<() => void> = [];

  constructor() {
    for (const [k, v] of Object.entries(process.env)) {
      if (k.startsWith('PONTO_KEY_') && v) this.values.set(k.slice(10).toLowerCase(), v);
    }
    parentChannel.onReceive((m) => {
      if (m.type !== 'secrets') return;
      this.values = new Map(Object.entries(m.values));
      this.listeners.forEach((l) => l());
    });
  }

  get(id: string): string | null {
    return this.values.get(id) ?? null;
  }

  has(id: string): boolean {
    return this.values.has(id);
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }
}
