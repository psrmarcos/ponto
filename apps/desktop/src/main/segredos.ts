import { app, safeStorage } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { IdSegredo, type StatusSegredo } from '@ponto/shared';

/**
 * Cofre das chaves de API. Cada valor é cifrado com o safeStorage (DPAPI no
 * Windows, Keychain no macOS, libsecret no Linux) e só então gravado em disco.
 * O valor nunca vai para o renderer; para a API ele vai pelo canal privado do
 * utilityProcess.
 */
export class SegredosService {
  private readonly arquivo = join(app.getPath('userData'), 'segredos.json');
  private cifrados: Partial<Record<IdSegredo, string>> = {};
  private readonly ouvintes: Array<() => void> = [];

  constructor() {
    try {
      const bruto = JSON.parse(readFileSync(this.arquivo, 'utf8')) as Record<string, string>;
      for (const [k, v] of Object.entries(bruto)) if (IdSegredo.safeParse(k).success) this.cifrados[k as IdSegredo] = v;
    } catch {
      // ainda não há chaves
    }
  }

  get disponivel(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  aoMudar(o: () => void): void {
    this.ouvintes.push(o);
  }

  status(): Record<IdSegredo, StatusSegredo> {
    const r = {} as Record<IdSegredo, StatusSegredo>;
    for (const id of IdSegredo.options) {
      const v = this.valor(id);
      r[id] = { configurado: !!v, final: v ? v.slice(-4) : null };
    }
    return r;
  }

  definir(id: IdSegredo, valor: string | null): StatusSegredo {
    if (valor === null) {
      delete this.cifrados[id];
    } else {
      if (!this.disponivel) throw new Error('O cofre do sistema não está disponível para guardar a chave com segurança.');
      this.cifrados[id] = safeStorage.encryptString(valor).toString('base64');
    }
    this.gravar();
    this.ouvintes.forEach((o) => o());
    return this.status()[id];
  }

  /** Todas as chaves em texto puro: só para mandar à API pelo canal privado. */
  todos(): Record<string, string> {
    const r: Record<string, string> = {};
    for (const id of IdSegredo.options) {
      const v = this.valor(id);
      if (v) r[id] = v;
    }
    return r;
  }

  private valor(id: IdSegredo): string | null {
    const c = this.cifrados[id];
    if (!c || !this.disponivel) return null;
    try {
      return safeStorage.decryptString(Buffer.from(c, 'base64'));
    } catch {
      return null; // cifrado em outro usuário/máquina
    }
  }

  private gravar(): void {
    mkdirSync(app.getPath('userData'), { recursive: true });
    const tmp = `${this.arquivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.cifrados));
    renameSync(tmp, this.arquivo);
  }
}
