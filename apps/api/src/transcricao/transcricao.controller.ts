import { BadRequestException, Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { TrechoAudio } from '@ponto/shared';
import { ZodPipe } from '../comum/zod.pipe';
import { TranscricaoService } from './transcricao.service';

/** WAV de 16 kHz mono: 8 MB dá mais de 4 minutos, bem acima do maior trecho que a captura corta. */
export const MAX_BYTES_TRECHO = 8 * 1024 * 1024;

@Controller('transcricao')
export class TranscricaoController {
  constructor(private readonly transcricao: TranscricaoService) {}

  /** Corpo: o WAV cru (`content-type: audio/wav`). Responde na hora; o texto chega pelo WebSocket. */
  @Post('trechos')
  @HttpCode(202)
  enviar(@Query(new ZodPipe(TrechoAudio)) trecho: TrechoAudio, @Body() corpo: unknown): void {
    if (!Buffer.isBuffer(corpo) || corpo.length < 44 || corpo.subarray(0, 4).toString('ascii') !== 'RIFF') {
      throw new BadRequestException({ mensagem: 'Envie um WAV no corpo, com content-type audio/wav.' });
    }
    if (trecho.fimMs < trecho.inicioMs) throw new BadRequestException({ mensagem: 'fimMs antes de inicioMs.' });
    this.transcricao.enfileirar(trecho, corpo);
  }
}
