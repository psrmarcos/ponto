import { app } from 'electron';
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ShortcutAction, DEFAULT_SHORTCUTS, WindowId, Rect } from '@ponto/shared';

const Preferences = z.object({
  stealth: z.boolean().default(true),
  windows: z
    .record(WindowId, z.object({ bounds: Rect.optional(), visible: z.boolean().optional() }))
    .default({}),
  shortcuts: z.record(ShortcutAction, z.string()).default({}),
});
export type Preferences = z.infer<typeof Preferences>;

const SAVE_DEBOUNCE_MS = 400;

export class PreferencesService {
  private readonly file = join(app.getPath('userData'), 'preferences.json');
  private data: Preferences;
  private timer: NodeJS.Timeout | null = null;

  constructor() {
    this.data = this.read();
  }

  get value(): Readonly<Preferences> {
    return this.data;
  }

  shortcuts(): Record<ShortcutAction, string> {
    return { ...DEFAULT_SHORTCUTS, ...this.data.shortcuts };
  }

  update(fn: (p: Preferences) => void): void {
    fn(this.data);
    this.scheduleSave();
  }

  saveNow(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    mkdirSync(app.getPath('userData'), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file);
  }

  private scheduleSave(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.saveNow(), SAVE_DEBOUNCE_MS);
  }

  private read(): Preferences {
    try {
      const r = Preferences.safeParse(JSON.parse(readFileSync(this.file, 'utf8')));
      if (r.success) return r.data;
      console.warn('[preferences] invalid file, falling back to defaults');
    } catch {
    }
    return Preferences.parse({});
  }
}
