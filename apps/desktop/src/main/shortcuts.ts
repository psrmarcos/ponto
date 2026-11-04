import { globalShortcut } from 'electron';
import { ShortcutAction } from '@ponto/shared';
import type { PreferencesService } from './preferences';

/** Global shortcuts (work with any app focused). Configurable on Home. */
export class ShortcutsService {
  private failed = new Set<ShortcutAction>();

  constructor(
    private readonly prefs: PreferencesService,
    private readonly actions: Record<ShortcutAction, () => void>,
    private readonly onChange: () => void,
  ) {}

  get errors(): ShortcutAction[] {
    return [...this.failed];
  }

  registerAll(): void {
    globalShortcut.unregisterAll();
    this.failed.clear();
    for (const [action, accel] of Object.entries(this.prefs.shortcuts()) as [ShortcutAction, string][]) {
      if (!this.tryRegister(accel, action)) this.failed.add(action);
    }
    this.onChange();
  }

  set(action: ShortcutAction, accel: string): { ok: boolean; error?: string } {
    const current = this.prefs.shortcuts();
    const owner = (Object.keys(current) as ShortcutAction[]).find((a) => a !== action && current[a] === accel);
    if (owner) return { ok: false, error: 'Esse atalho já é usado por outra ação do Ponto.' };
    const previous = current[action];
    if (previous) globalShortcut.unregister(previous);
    if (!this.tryRegister(accel, action)) {
      if (previous) this.tryRegister(previous, action);
      return { ok: false, error: 'Atalho inválido ou já usado por outro programa.' };
    }
    this.failed.delete(action);
    this.prefs.update((p) => (p.shortcuts[action] = accel));
    this.onChange();
    return { ok: true };
  }

  resetDefaults(): void {
    this.prefs.update((p) => (p.shortcuts = {}));
    this.registerAll();
  }

  private tryRegister(accel: string, action: ShortcutAction): boolean {
    try {
      return globalShortcut.register(accel, this.actions[action]);
    } catch {
      return false;
    }
  }
}
