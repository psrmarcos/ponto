import { BadRequestException, Body, Controller, Delete, Get, Header, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { SessionUpdate, LiveSection, type LiveAnalysis, type SpendBySource, type SavedMessage, type SessionListItem } from '@ponto/shared';
import { ZodPipe } from '../common/zod.pipe';
import { SettingsService } from '../settings/settings.service';
import { SessionsService } from '../sessions/sessions.service';
import { MinutesService, sessionToMarkdown } from './minutes.service';
import { LiveAnalysisService } from './live-analysis.service';

/** Session history on Home: listing, minutes, export, and cleanup. */
@Controller('sessions')
export class SummariesController {
  constructor(
    private readonly sessions: SessionsService,
    private readonly minutes: MinutesService,
    private readonly settings: SettingsService,
    private readonly liveAnalysis: LiveAnalysisService,
  ) {}

  @Get()
  list(): Promise<SessionListItem[]> {
    return this.sessions.list();
  }

  @Patch(':id')
  @HttpCode(204)
  async update(@Param('id') id: string, @Body(new ZodPipe(SessionUpdate)) body: SessionUpdate): Promise<void> {
    await this.sessions.rename(id, body.title);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id') id: string): Promise<void> {
    await this.sessions.remove(id);
  }

  /** Generates (or regenerates) the minutes. Responds immediately; result arrives via session.summary event. */
  @Post(':id/summary')
  @HttpCode(202)
  generateSummary(@Param('id') id: string): void {
    void this.minutes.generate(id, true);
  }

  @Get(':id/live')
  getLiveAnalysis(@Param('id') id: string): Promise<LiveAnalysis> {
    return this.liveAnalysis.get(id);
  }

  @Post(':id/live/summary/regenerate')
  regenerateSummary(@Param('id') id: string): Promise<LiveAnalysis> {
    return this.liveAnalysis.regenerateSummary(id);
  }

  /** User opened the Summary or Insights tab: starts that analysis and returns the initial version. */
  @Post(':id/live/:section')
  activateLive(@Param('id') id: string, @Param('section') section: string): Promise<LiveAnalysis> {
    const p = LiveSection.safeParse(section);
    if (!p.success) throw new BadRequestException({ message: 'Invalid section.' });
    return this.liveAnalysis.activate(id, p.data);
  }

  @Get(':id/spend')
  spend(@Param('id') id: string): Promise<SpendBySource[]> {
    return this.sessions.spend(id);
  }

  @Get(':id/conversation')
  conversation(@Param('id') id: string): Promise<SavedMessage[]> {
    return this.sessions.conversation(id);
  }

  @Get(':id/markdown')
  @Header('Content-Type', 'text/markdown; charset=utf-8')
  async markdown(@Param('id') id: string): Promise<string> {
    const [session, utterances, cfg] = await Promise.all([
      this.sessions.get(id),
      this.sessions.utterances(id),
      this.settings.get(),
    ]);
    return sessionToMarkdown(session, utterances, cfg.userName);
  }
}
