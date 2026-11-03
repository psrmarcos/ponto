import { Module } from '@nestjs/common';
import { SessoesModule } from '../sessoes/sessoes.module';
import { DeepgramStt } from './stt/deepgram-stt';
import { OpenRouterStt } from './stt/openrouter-stt';
import { AudioGateway } from './streaming/audio.gateway';
import { StreamingService } from './streaming/streaming.service';
import { TranscricaoController } from './transcricao.controller';
import { TranscricaoService } from './transcricao.service';

@Module({
  imports: [SessoesModule],
  controllers: [TranscricaoController],
  providers: [TranscricaoService, OpenRouterStt, DeepgramStt, StreamingService, AudioGateway],
  exports: [TranscricaoService],
})
export class TranscricaoModule {}
