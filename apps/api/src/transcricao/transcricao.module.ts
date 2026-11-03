import { Module } from '@nestjs/common';
import { SessoesModule } from '../sessoes/sessoes.module';
import { DeepgramStt } from './stt/deepgram-stt';
import { OpenRouterStt } from './stt/openrouter-stt';
import { TranscricaoController } from './transcricao.controller';
import { TranscricaoService } from './transcricao.service';

@Module({
  imports: [SessoesModule],
  controllers: [TranscricaoController],
  providers: [TranscricaoService, OpenRouterStt, DeepgramStt],
})
export class TranscricaoModule {}
