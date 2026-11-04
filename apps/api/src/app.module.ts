import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AgentsModule } from './agents/agents.module';
import { TokenGuard } from './common/token.guard';
import { SettingsModule } from './settings/settings.module';
import { DbModule } from './db/db.module';
import { EventsModule } from './events/events.module';
import { AiModule } from './ai/ai.module';
import { HealthController } from './health.controller';
import { SecretsModule } from './secrets/secrets.module';
import { UsageModule } from './usage/usage.module';
import { SessionsModule } from './sessions/sessions.module';
import { TranscriptionModule } from './transcription/transcription.module';
import { SuggestionsModule } from './suggestions/suggestions.module';
import { SummariesModule } from './summaries/summaries.module';
import { StatsModule } from './stats/stats.module';
import { TranslationModule } from './translation/translation.module';

@Module({
  imports: [
    DbModule,
    SecretsModule,
    EventsModule,
    SettingsModule,
    UsageModule,
    AgentsModule,
    AiModule,
    SessionsModule,
    TranscriptionModule,
    SuggestionsModule,
    SummariesModule,
    StatsModule,
    TranslationModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: TokenGuard }],
})
export class AppModule {}
