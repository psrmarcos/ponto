import { Controller, Get, Param } from '@nestjs/common';
import type { UtteranceTranslation } from '@ponto/shared';
import { TranslationService } from './translation.service';

@Controller('sessions')
export class TranslationController {
  constructor(private readonly translation: TranslationService) {}

  @Get(':id/translations')
  list(@Param('id') id: string): UtteranceTranslation[] {
    return this.translation.list(id);
  }
}
