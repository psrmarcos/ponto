import { app, utilityProcess, type UtilityProcess } from 'electron';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { MessageFromApi, DEFAULT_API_PORT, type ApiConnection, type ApiStatus } from '@ponto/shared';
import type { SecretsService } from './secrets';

const BACKOFF_MS = [1000, 2000, 5000, 10_000, 30_000];

export class ApiHost {
  private proc: UtilityProcess | null = null;
  private readonly token = randomBytes(24).toString('hex');
  private port = 0;
  private attempts = 0;
  private _status: ApiStatus = 'starting';
  private stopping = false;

  constructor(
    private readonly secrets: SecretsService,
    private readonly onStatusChange: () => void,
  ) {
    secrets.onChange(() => this.sendSecrets());
  }

  get status(): ApiStatus {
    return this._status;
  }

  connection(): ApiConnection | null {
    if (this._status !== 'ready') return null;
    return { url: `http://127.0.0.1:${this.port}`, ws: `ws://127.0.0.1:${this.port}/ws`, token: this.token };
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.port = await findFreePort(DEFAULT_API_PORT);
    const entry = require.resolve('@ponto/api');
    const proc = utilityProcess.fork(entry, [], {
      serviceName: 'Ponto API',
      stdio: 'inherit',
      env: {
        ...process.env,
        PONTO_PORT: String(this.port),
        PONTO_TOKEN: this.token,
        PONTO_DB: join(app.getPath('userData'), 'data', 'ponto.db'),
        PONTO_VERSION: app.getVersion(),
      },
    });
    this.proc = proc;
    this.setStatus('starting');

    proc.on('message', (raw: unknown) => {
      const r = MessageFromApi.safeParse(raw);
      if (!r.success) return;
      if (r.data.type === 'ready') {
        this.attempts = 0;
        this.sendSecrets();
        this.setStatus('ready');
      } else {
        console.error('[api] failed to start:', r.data.message);
      }
    });
    proc.on('exit', (code) => {
      if (this.proc !== proc) return;
      this.proc = null;
      if (this.stopping) return;
      this.setStatus('crashed');
      const delay = BACKOFF_MS[Math.min(this.attempts++, BACKOFF_MS.length - 1)] ?? 30_000;
      console.error(`[api] exited with code ${code}; restarting in ${delay} ms`);
      setTimeout(() => void this.start(), delay);
    });
  }

  stop(): void {
    this.stopping = true;
    this.proc?.kill();
    this.proc = null;
  }

  private sendSecrets(): void {
    this.proc?.postMessage({ type: 'secrets', values: this.secrets.all() });
  }

  private setStatus(s: ApiStatus): void {
    this._status = s;
    this.onStatusChange();
  }
}

async function findFreePort(preferred: number): Promise<number> {
  for (let p = preferred; p < preferred + 50; p++) {
    const free = await new Promise<boolean>((ok) => {
      const s = createServer();
      s.once('error', () => ok(false));
      s.listen(p, '127.0.0.1', () => s.close(() => ok(true)));
    });
    if (free) return p;
  }
  throw new Error('no free port available for the API');
}
