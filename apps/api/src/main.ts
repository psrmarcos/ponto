import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { CABECALHO_TOKEN } from '@ponto/shared';
import { ambiente } from './ambiente';
import { AppModule } from './app.module';
import { canalPai } from './canal-pai';
import { MAX_BYTES_TRECHO } from './transcricao/transcricao.controller';

async function iniciar(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ambiente.dentroDoElectron ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  // Os trechos de áudio chegam como WAV cru (sem base64: 33% menor e sem custo de conversão).
  app.useBodyParser('raw', { type: 'audio/wav', limit: MAX_BYTES_TRECHO });
  // As janelas carregam de file:// (origem "null") ou do Vite em dev. O token é o que protege de fato.
  app.enableCors({
    origin: (origem: string | undefined, ok: (erro: Error | null, permitir?: boolean) => void) => ok(null, !origem || origem === 'null' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origem)),
    allowedHeaders: ['content-type', CABECALHO_TOKEN],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.enableShutdownHooks();
  // Só na interface local: nada fica exposto na rede.
  await app.listen(ambiente.porta, '127.0.0.1');

  const log = new Logger('Ponto');
  log.log(`API em http://127.0.0.1:${ambiente.porta}`);
  if (ambiente.tokenGerado) log.log(`token desta execução: ${ambiente.token}`);
  canalPai.enviar({ tipo: 'pronta', porta: ambiente.porta });
}

iniciar().catch((e: unknown) => {
  const mensagem = e instanceof Error ? e.message : String(e);
  canalPai.enviar({ tipo: 'erro', mensagem });
  console.error(e);
  process.exit(1);
});
