import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AgentInput, type Agent } from '@ponto/shared';
import { ZodPipe } from '../common/zod.pipe';
import { AgentsService } from './agents.service';

@Controller('agents')
export class AgentsController {
  constructor(private readonly service: AgentsService) {}

  @Get()
  list(): Promise<Agent[]> {
    return this.service.list();
  }

  @Post()
  create(@Body(new ZodPipe(AgentInput)) body: AgentInput): Promise<Agent> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(new ZodPipe(AgentInput)) body: AgentInput): Promise<Agent> {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.service.remove(id);
  }
}
