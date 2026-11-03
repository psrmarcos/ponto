import { globalShortcut } from 'electron';
import { AcaoAtalho } from '@ponto/shared';
import type { PreferenciasService } from './preferencias';

/** Atalhos globais (funcionam com qualquer app em foco). Configuráveis na Home. */
export class AtalhosService {
  private comErro = new Set<AcaoAtalho>();

  constructor(
    private readonly prefs: PreferenciasService,
    private readonly acoes: Record<AcaoAtalho, () => void>,
    private readonly aoMudar: () => void,
  ) {}

  get erros(): AcaoAtalho[] {
    return [...this.comErro];
  }

  registrarTodos(): void {
    globalShortcut.unregisterAll();
    this.comErro.clear();
    for (const [acao, accel] of Object.entries(this.prefs.atalhos()) as [AcaoAtalho, string][]) {
      if (!this.tentar(accel, acao)) this.comErro.add(acao);
    }
    this.aoMudar();
  }

  definir(acao: AcaoAtalho, accel: string): { ok: boolean; erro?: string } {
    const atuais = this.prefs.atalhos();
    const dono = (Object.keys(atuais) as AcaoAtalho[]).find((a) => a !== acao && atuais[a] === accel);
    if (dono) return { ok: false, erro: 'Esse atalho já é usado por outra ação do Ponto.' };
    const anterior = atuais[acao];
    if (anterior) globalShortcut.unregister(anterior);
    if (!this.tentar(accel, acao)) {
      if (anterior) this.tentar(anterior, acao);
      return { ok: false, erro: 'Atalho inválido ou já usado por outro programa.' };
    }
    this.comErro.delete(acao);
    this.prefs.alterar((p) => (p.atalhos[acao] = accel));
    this.aoMudar();
    return { ok: true };
  }

  restaurarPadrao(): void {
    this.prefs.alterar((p) => (p.atalhos = {}));
    this.registrarTodos();
  }

  private tentar(accel: string, acao: AcaoAtalho): boolean {
    try {
      return globalShortcut.register(accel, this.acoes[acao]);
    } catch {
      return false;
    }
  }
}
