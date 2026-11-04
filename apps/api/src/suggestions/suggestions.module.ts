import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SessionsModule } from '../sessions/sessions.module';
import { JevService } from './jev.service';
import { SuggestionsService } from './suggestions.service';

@Module({
  imports: [AiModule, SessionsModule],
  providers: [JevService, SuggestionsService],
})
export class SuggestionsModule {}
