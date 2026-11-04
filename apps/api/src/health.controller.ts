import { Controller, Get } from '@nestjs/common';
import { env } from './env';

@Controller('health')
export class HealthController {
  @Get()
  health(): { ok: true; version: string } {
    return { ok: true, version: env.version };
  }
}
