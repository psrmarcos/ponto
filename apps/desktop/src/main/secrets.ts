import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { SecretId, type SecretStatus } from '@ponto/shared';

export class SecretsService {
  private readonly file = join(app.getPath('userData'), 'secrets.json');
  private encrypted: Partial<Record<SecretId, string>> = {};
  private readonly listeners: Array<() => void> = [];

  constructor() {
    try {
      const legacyFile = join(app.getPath('userData'), 'segredos.json');
      const sourceFile = !existsSync(this.file) && existsSync(legacyFile) ? legacyFile : this.file;
      const raw = JSON.parse(readFileSync(sourceFile, 'utf8')) as Record<string, string>;
      for (const [k, v] of Object.entries(raw)) {
        if (SecretId.safeParse(k).success) this.encrypted[k as SecretId] = v;
      }
      if (sourceFile === legacyFile) this.save();
    } catch {
    }
  }

  get available(): boolean {
    return safeStorage.isEncryptionAvailable();
  }

  onChange(l: () => void): void {
    this.listeners.push(l);
  }

  status(): Record<SecretId, SecretStatus> {
    const r = {} as Record<SecretId, SecretStatus>;
    for (const id of SecretId.options) {
      const v = this.value(id);
      r[id] = { configured: !!v, lastFour: v ? v.slice(-4) : null };
    }
    return r;
  }

  set(id: SecretId, value: string | null): SecretStatus {
    if (value === null) {
      delete this.encrypted[id];
    } else {
      if (!this.available) throw new Error('O cofre do sistema não está disponível para guardar a chave com segurança.');
      this.encrypted[id] = safeStorage.encryptString(value).toString('base64');
    }
    this.save();
    this.listeners.forEach((l) => l());
    return this.status()[id];
  }

  all(): Record<string, string> {
    const r: Record<string, string> = {};
    for (const id of SecretId.options) {
      const v = this.value(id);
      if (v) r[id] = v;
    }
    return r;
  }

  private value(id: SecretId): string | null {
    const c = this.encrypted[id];
    if (!c || !this.available) return null;
    try {
      return safeStorage.decryptString(Buffer.from(c, 'base64'));
    } catch {
      return null;
    }
  }

  private save(): void {
    mkdirSync(app.getPath('userData'), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.encrypted));
    renameSync(tmp, this.file);
  }
}
