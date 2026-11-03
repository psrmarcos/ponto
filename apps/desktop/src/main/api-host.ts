import { app, utilityProcess, type UtilityProcess } from 'electron';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { MensagemDaApi, PORTA_API_PADRAO, type ConexaoApi, type StatusApi } from '@ponto/shared';
import type { SegredosService } from './segredos';

const ESPERAS_MS = [1000, 2000, 5000, 10_000, 30_000];

/**
 * Sobe a API (NestJS) como utilityProcess, vigia e reinicia se cair. A cada
 * execução gera um token novo: só quem tem o token (as nossas janelas) fala com ela.
 */
export class ApiHost {
  private processo: UtilityProcess | null = null;
  private readonly token = randomBytes(24).toString('hex');
  private porta = 0;
  private tentativas = 0;
  private _status: StatusApi = 'iniciando';
  private parando = false;

  constructor(
    private readonly segredos: SegredosService,
    private readonly aoMudarStatus: () => void,
  ) {
    segredos.aoMudar(() => this.enviarSegredos());
  }

  get status(): StatusApi {
    return this._status;
  }

  conexao(): ConexaoApi | null {
    if (this._status !== 'pronta') return null;
    return { url: `http://127.0.0.1:${this.porta}`, ws: `ws://127.0.0.1:${this.porta}/ws`, token: this.token };
  }

  async iniciar(): Promise<void> {
    this.parando = false;
    this.porta = await portaLivre(PORTA_API_PADRAO);
    const entrada = require.resolve('@ponto/api');
    const proc = utilityProcess.fork(entrada, [], {
      serviceName: 'Ponto API',
      stdio: 'inherit',
      env: {
        ...process.env,
        PONTO_PORTA: String(this.porta),
        PONTO_TOKEN: this.token,
        PONTO_BANCO: join(app.getPath('userData'), 'dados', 'ponto.db'),
        PONTO_VERSAO: app.getVersion(),
      },
    });
    this.processo = proc;
    this.definirStatus('iniciando');

    proc.on('message', (bruto: unknown) => {
      const r = MensagemDaApi.safeParse(bruto);
      if (!r.success) return;
      if (r.data.tipo === 'pronta') {
        this.tentativas = 0;
        this.enviarSegredos();
        this.definirStatus('pronta');
      } else {
        console.error('[api] falhou ao iniciar:', r.data.mensagem);
      }
    });
    proc.on('exit', (codigo) => {
      if (this.processo !== proc) return;
      this.processo = null;
      if (this.parando) return;
      this.definirStatus('caiu');
      const espera = ESPERAS_MS[Math.min(this.tentativas++, ESPERAS_MS.length - 1)] ?? 30_000;
      console.error(`[api] saiu com código ${codigo}; reiniciando em ${espera} ms`);
      setTimeout(() => void this.iniciar(), espera);
    });
  }

  parar(): void {
    this.parando = true;
    this.processo?.kill();
    this.processo = null;
  }

  private enviarSegredos(): void {
    this.processo?.postMessage({ tipo: 'segredos', valores: this.segredos.todos() });
  }

  private definirStatus(s: StatusApi): void {
    this._status = s;
    this.aoMudarStatus();
  }
}

/** A partir da porta preferida, acha a primeira livre em 127.0.0.1. */
async function portaLivre(preferida: number): Promise<number> {
  for (let p = preferida; p < preferida + 50; p++) {
    const livre = await new Promise<boolean>((ok) => {
      const s = createServer();
      s.once('error', () => ok(false));
      s.listen(p, '127.0.0.1', () => s.close(() => ok(true)));
    });
    if (livre) return p;
  }
  throw new Error('nenhuma porta livre para a API');
}
