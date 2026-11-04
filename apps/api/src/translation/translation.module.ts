import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module';
import { SessionsModule } from '../sessions/sessions.module';
import { TranslationController } from './translation.controller';
import { TranslationService } from './translation.service';

@Module({
  imports: [AiModule, SessionsModule],
  controllers: [TranslationController],
  providers: [TranslationService],
})
export class TranslationModule {}
