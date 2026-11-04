import { Module } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';

/** Usage numbers for Home (sessions, hours, talk share, costs). */
@Module({ controllers: [StatsController], providers: [StatsService] })
export class StatsModule {}
