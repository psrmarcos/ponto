import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AcaoAtalho, ATALHOS_PADRAO, IdJanela, Retangulo } from '@ponto/shared';

/**
 * Preferências do desktop (o que o processo principal precisa antes da API subir):
 * invisibilidade, posição/tamanho de cada janela e atalhos. Ficam num JSON no
 * userData. Configurações do domínio (agentes, modelo...) ficam no SQLite da API.
 */
const Preferencias = z.object({
  stealth: z.boolean().default(true),
  janelas: z
    .record(IdJanela, z.object({ retangulo: Retangulo.optional(), visivel: z.boolean().optional() }))
    .default({}),
  atalhos: z.record(AcaoAtalho, z.string()).default({}),
});
export type Preferencias = z.infer<typeof Preferencias>;

const ESPERA_SALVAR_MS = 400;

export class PreferenciasService {
  private readonly arquivo = join(app.getPath('userData'), 'preferencias.json');
  private dados: Preferencias;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.dados = this.ler();
  }

  get valor(): Readonly<Preferencias> {
    return this.dados;
  }

  atalhos(): Record<AcaoAtalho, string> {
    return { ...ATALHOS_PADRAO, ...this.dados.atalhos };
  }

  alterar(fn: (p: Preferencias) => void): void {
    fn(this.dados);
    this.agendarSalvar();
  }

  /** Grava já (usado ao fechar o app). */
  salvarAgora(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(app.getPath('userData'), { recursive: true });
    // Escreve num temporário e renomeia: nunca deixa o arquivo pela metade.
    const tmp = `${this.arquivo}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.dados, null, 2));
    renameSync(tmp, this.arquivo);
  }

  private agendarSalvar(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.salvarAgora(), ESPERA_SALVAR_MS);
  }

  private ler(): Preferencias {
    try {
      const r = Preferencias.safeParse(JSON.parse(readFileSync(this.arquivo, 'utf8')));
      if (r.success) return r.data;
      console.warn('[preferencias] arquivo inválido, usando o padrão');
    } catch {
      // primeira execução
    }
    return Preferencias.parse({});
  }
}
