import { Module } from '@nestjs/common';
import { SessionsModule } from '../sessions/sessions.module';
import { DeepgramStt } from './stt/deepgram-stt';
import { OpenRouterStt } from './stt/openrouter-stt';
import { AudioGateway } from './streaming/audio.gateway';
import { StreamingService } from './streaming/streaming.service';
import { TranscriptionController } from './transcription.controller';
import { TranscriptionService } from './transcription.service';

@Module({
  imports: [SessionsModule],
  controllers: [TranscriptionController],
  providers: [TranscriptionService, OpenRouterStt, DeepgramStt, StreamingService, AudioGateway],
  exports: [TranscriptionService],
})
export class TranscriptionModule {}
