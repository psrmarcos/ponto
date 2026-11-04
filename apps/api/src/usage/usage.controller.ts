import { Controller, Get } from '@nestjs/common';
import type { UsageSummary } from '@ponto/shared';
import { UsageService } from './usage.service';

@Controller('usage')
export class UsageController {
  constructor(private readonly usage: UsageService) {}

  @Get('summary')
  summary(): Promise<UsageSummary> {
    return this.usage.monthSummary();
  }
}
