import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CreateSession, type Utterance, type Session } from '@ponto/shared';
import { ZodPipe } from '../common/zod.pipe';
import { SessionsService } from './sessions.service';

@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  @Post()
  create(@Body(new ZodPipe(CreateSession)) body: CreateSession): Promise<Session> {
    return this.sessions.create(body.agentId);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Session> {
    return this.sessions.get(id);
  }

  @Get(':id/utterances')
  utterances(@Param('id') id: string): Promise<Utterance[]> {
    return this.sessions.utterances(id);
  }

  @Delete(':id/utterances')
  @HttpCode(204)
  async clear(@Param('id') id: string, @Query('upToMs') upToMs: string): Promise<void> {
    const limit = Number(upToMs);
    if (!Number.isFinite(limit)) throw new BadRequestException({ message: 'Provide upToMs.' });
    await this.sessions.clearUtterances(id, limit);
  }

  @Post(':id/finish')
  @HttpCode(204)
  async finish(@Param('id') id: string): Promise<void> {
    await this.sessions.finish(id);
  }
}
