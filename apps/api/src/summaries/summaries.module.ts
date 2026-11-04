import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SessionsModule } from '../sessions/sessions.module';
import { MinutesService } from './minutes.service';
import { LiveAnalysisService } from './live-analysis.service';
import { CompactionService } from './compaction.service';
import { SummariesController } from './summaries.controller';

@Module({
  imports: [AiModule, SessionsModule],
  controllers: [SummariesController],
  providers: [MinutesService, CompactionService, LiveAnalysisService],
})
export class SummariesModule {}
