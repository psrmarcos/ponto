import { Controller, Get } from '@nestjs/common';
import { ambiente } from './ambiente';

@Controller('saude')
export class SaudeController {
  @Get()
  saude(): { ok: true; versao: string } {
    return { ok: true, versao: ambiente.versao };
  }
}
