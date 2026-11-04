import { BadRequestException, Body, Controller, HttpCode, Post, Query } from '@nestjs/common';
import { AudioChunkQuery } from '@ponto/shared';
import { ZodPipe } from '../common/zod.pipe';
import { TranscriptionService } from './transcription.service';

export const MAX_CHUNK_BYTES = 8 * 1024 * 1024;

@Controller('transcription')
export class TranscriptionController {
  constructor(private readonly transcription: TranscriptionService) {}

  @Post('chunks')
  @HttpCode(202)
  send(@Query(new ZodPipe(AudioChunkQuery)) chunk: AudioChunkQuery, @Body() body: unknown): void {
    if (!Buffer.isBuffer(body) || body.length < 44 || body.subarray(0, 4).toString('ascii') !== 'RIFF') {
      throw new BadRequestException({ message: 'Send a WAV in the body with content-type audio/wav.' });
    }
    if (chunk.endMs < chunk.startMs) throw new BadRequestException({ message: 'endMs before startMs.' });
    this.transcription.enqueue(chunk, body);
  }
}
