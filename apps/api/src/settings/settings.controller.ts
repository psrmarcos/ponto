import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Settings } from '@ponto/shared';
import { ZodPipe } from '../common/zod.pipe';
import { SettingsService } from './settings.service';

const PartialSettings = Settings.partial();

@Controller('settings')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  get(): Promise<Settings> {
    return this.service.get();
  }

  @Patch()
  update(@Body(new ZodPipe(PartialSettings)) body: Partial<Settings>): Promise<Settings> {
    return this.service.update(body);
  }
}
