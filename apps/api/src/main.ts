import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { WsAdapter } from '@nestjs/platform-ws';
import { TOKEN_HEADER } from '@ponto/shared';
import { env } from './env';
import { AppModule } from './app.module';
import { parentChannel } from './parent-channel';
import { MAX_CHUNK_BYTES } from './transcription/transcription.controller';

async function start(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: env.insideElectron ? ['error', 'warn', 'log'] : ['error', 'warn', 'log', 'debug'],
  });
  app.useWebSocketAdapter(new WsAdapter(app));
  // Audio chunks arrive as raw WAV (no base64: 33% smaller and zero conversion overhead).
  app.useBodyParser('raw', { type: 'audio/wav', limit: MAX_CHUNK_BYTES });
  // Chat requests may carry base64 images (screenshots, attachments up to 8 MB).
  app.useBodyParser('json', { limit: '40mb' });
  // Windows load from file:// (origin "null") or Vite in dev. The token header is what actually protects the API.
  app.enableCors({
    origin: (origin: string | undefined, ok: (err: Error | null, allow?: boolean) => void) =>
      ok(null, !origin || origin === 'null' || /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)),
    allowedHeaders: ['content-type', TOKEN_HEADER],
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
  });
  app.enableShutdownHooks();
  // Local loopback only: nothing is exposed on the network.
  await app.listen(env.port, '127.0.0.1');

  const log = new Logger('Ponto');
  log.log(`API listening on http://127.0.0.1:${env.port}`);
  if (env.tokenGenerated) log.log(`session token: ${env.token}`);
  parentChannel.send({ type: 'ready', port: env.port });
}

start().catch((e: unknown) => {
  const message = e instanceof Error ? e.message : String(e);
  parentChannel.send({ type: 'error', message });
  console.error(e);
  process.exit(1);
});
