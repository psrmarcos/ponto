import { Controller, Get, Param, Post } from '@nestjs/common';
import { AiProviderId, type ProviderInfo, type AiModel, type KeyTestResult } from '@ponto/shared';
import { ZodPipe } from '../common/zod.pipe';
import { ProvidersService } from './providers/providers.service';

@Controller('ai/providers')
export class AiController {
  constructor(private readonly providers: ProvidersService) {}

  @Get()
  list(): ProviderInfo[] {
    return this.providers.list();
  }

  @Post(':id/test')
  test(@Param('id', new ZodPipe(AiProviderId)) id: AiProviderId): Promise<KeyTestResult> {
    return this.providers.get(id).testKey();
  }

  @Get(':id/models')
  models(@Param('id', new ZodPipe(AiProviderId)) id: AiProviderId): Promise<AiModel[]> {
    return this.providers.get(id).listModels();
  }
}
