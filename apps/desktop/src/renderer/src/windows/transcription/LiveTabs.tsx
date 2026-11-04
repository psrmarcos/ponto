import { useEffect, useState, type ReactElement } from 'react';
import { create } from 'zustand';
import { ArrowClockwise, ChatText, CircleNotch, Lightbulb, ListBullets, Microphone, Smiley, Sparkle, TrendUp, Warning } from '@phosphor-icons/react';
import type { ConversationMood, Insight, InsightType, LiveAnalysis, LiveSection } from '@ponto/shared';
import { api } from '../../api/client';
import { useDomain } from '../../state/domain';
import { useTranscription } from '../../state/transcription';
import { Toggle } from '../../ui/Toggle';
import { Markdown } from '../../ui/Markdown';

export type TranscriptionTab = 'raw' | 'summary' | 'insights';

const EMPTY_LIVE: LiveAnalysis = {
  summary: null,
  insights: [],
  tone: null,
  metrics: { yourShare: 0, yourPace: null, yourLongestTurn: 0 },
  active: { summary: false, insights: false },
};

/** Live summary, insights, and voice metrics for the current (or last) session. */
const useLiveStore = create<{ sessionId: string | null; data: LiveAnalysis; generating: Record<LiveSection, boolean> }>(() => ({
  sessionId: null,
  data: EMPTY_LIVE,
  generating: { summary: false, insights: false },
}));

/** First time a tab is opened in the session: activates live analysis and awaits initial results. */
function activatePart(part: LiveSection): void {
  const { sessionId, data, generating } = useLiveStore.getState();
  if (!sessionId || data.active[part] || generating[part]) return;
  useLiveStore.setState((s) => ({ generating: { ...s.generating, [part]: true } }));
  api
    .post<LiveAnalysis>(`/sessions/${sessionId}/live/${part}`)
    .then((d) => {
      if (useLiveStore.getState().sessionId === sessionId) useLiveStore.setState({ data: d });
    })
    .catch(() => undefined)
    .finally(() => useLiveStore.setState((s) => ({ generating: { ...s.generating, [part]: false } })));
}

/** "Regenerate" button on the summary tab: rebuilds from scratch using all utterances so far. */
function regenerateSummary(): void {
  const { sessionId, generating } = useLiveStore.getState();
  if (!sessionId || generating.summary) return;
  useLiveStore.setState((s) => ({ generating: { ...s.generating, summary: true } }));
  api
    .post<LiveAnalysis>(`/sessions/${sessionId}/live/summary/regenerate`)
    .then((d) => {
      if (useLiveStore.getState().sessionId === sessionId) useLiveStore.setState({ data: d });
    })
    .catch(() => undefined)
    .finally(() => useLiveStore.setState((s) => ({ generating: { ...s.generating, summary: false } })));
}

function loadLive(sessionId: string): void {
  api
    .get<LiveAnalysis>(`/sessions/${sessionId}/live`)
    .then((data) => {
      if (useLiveStore.getState().sessionId === sessionId) useLiveStore.setState({ data });
    })
    .catch(() => undefined);
}

/** Connects live analysis to the active transcription session. Call once inside the Transcription window. */
export function useConnectLive(): void {
  const sessionId = useTranscription((s) => s.sessionId);
  const totalUtterances = useTranscription((s) => s.utterances.length);

  useEffect(() => {
    useLiveStore.setState({ sessionId, data: EMPTY_LIVE, generating: { summary: false, insights: false } });
    if (!sessionId) return;
    const stopConnect = api.onConnect(() => loadLive(sessionId));
    const stopEvents = api.on((e) => {
      if (e.type !== 'session.live' || e.sessionId !== sessionId) return;
      useLiveStore.setState(({ data }) => ({
        data: {
          ...data,
          summary: e.summary ?? data.summary,
          tone: e.tone ?? data.tone,
          insights: e.insight ? [...data.insights, e.insight] : data.insights,
        },
      }));
    });
    return () => {
      stopConnect();
      stopEvents();
    };
  }, [sessionId]);

  // Voice metrics are computed on the API without AI: refresh every 5 utterances.
  useEffect(() => {
    if (sessionId && totalUtterances && totalUtterances % 5 === 0) loadLive(sessionId);
  }, [sessionId, totalUtterances]);
}

export function TabSelector({ tab, onChange }: { tab: TranscriptionTab; onChange: (t: TranscriptionTab) => void }) {
  const unseen = useUnseenInsights(tab);
  return (
    <div className="tabs transcription-tabs" role="tablist">
      <button type="button" role="tab" className="tab" aria-selected={tab === 'raw'} onClick={() => onChange('raw')}>
        <ChatText size={13} /> Transcrição
      </button>
      <button type="button" role="tab" className="tab" aria-selected={tab === 'summary'} onClick={() => onChange('summary')}>
        <ListBullets size={13} /> Resumo
      </button>
      <button type="button" role="tab" className="tab" aria-selected={tab === 'insights'} onClick={() => onChange('insights')}>
        <Lightbulb size={13} /> Insights{unseen > 0 && <span className="tab-badge">{unseen}</span>}
      </button>
    </div>
  );
}

/** Insights that arrived while the Insights tab was closed. */
function useUnseenInsights(tab: TranscriptionTab): number {
  const total = useLiveStore((s) => s.data.insights.length);
  const [seen, setSeen] = useState(0);
  useEffect(() => {
    if (tab === 'insights' || total < seen) setSeen(total);
  }, [tab, total, seen]);
  return Math.max(0, total - seen);
}

export function SummaryTab() {
  const summary = useLiveStore((s) => s.data.summary);
  const sessionId = useLiveStore((s) => s.sessionId);
  const generating = useLiveStore((s) => s.generating.summary);
  const enabled = useDomain((s) => s.settings?.liveSummary ?? true);
  const saveSettings = useDomain((s) => s.saveSettings);
  const now = useNow();
  useEffect(() => {
    if (enabled) activatePart('summary');
  }, [enabled, sessionId]);
  return (
    <div className="tab-body">
      <div className="tab-header">
        <span className="t2">
          {summary ? `Atualizado ${formatAgo(now - summary.at)}` : 'Começa quando você abre esta aba e depois se atualiza sozinho.'}
        </span>
        {summary && enabled && (
          <button type="button" className="icon-btn regenerate" data-tooltip="Gerar o resumo de novo" disabled={generating} onClick={regenerateSummary}>
            <ArrowClockwise size={14} className={generating ? 'spinning' : undefined} />
          </button>
        )}
        <Toggle checked={enabled} label="Resumo ao vivo" onChange={(v) => void saveSettings({ liveSummary: v })} />
      </div>
      {generating && !summary ? (
        <Loading text="Resumindo o que já foi falado…" />
      ) : summary ? (
        <div className="live-summary">
          <Markdown text={summary.text} />
        </div>
      ) : (
        <p className="tab-empty">
          {!enabled
            ? 'Resumo ao vivo desligado.'
            : sessionId
              ? 'O resumo aparece depois das primeiras falas.'
              : 'Comece uma transcrição para ver o resumo.'}
        </p>
      )}
    </div>
  );
}

const INSIGHT_ICONS: Record<InsightType, ReactElement> = {
  opportunity: <TrendUp size={13} weight="bold" />,
  risk: <Warning size={13} weight="bold" />,
  voice: <Microphone size={13} weight="bold" />,
  tip: <Lightbulb size={13} weight="bold" />,
};
const INSIGHT_LABELS: Record<InsightType, string> = {
  opportunity: 'Oportunidade',
  risk: 'Atenção',
  voice: 'Sua voz',
  tip: 'Dica',
};

const MOOD_LABELS: Record<ConversationMood, string> = {
  positive: 'positivo',
  neutral: 'neutro',
  tense: 'tenso',
  negative: 'negativo',
};

export function InsightsTab() {
  const data = useLiveStore((s) => s.data);
  const sessionId = useLiveStore((s) => s.sessionId);
  const generating = useLiveStore((s) => s.generating.insights);
  const enabled = useDomain((s) => s.settings?.liveInsights ?? false);
  const saveSettings = useDomain((s) => s.saveSettings);
  const m = data.metrics;
  const list: Insight[] = [...data.insights].reverse();
  useEffect(() => {
    if (enabled) activatePart('insights');
  }, [enabled, sessionId]);
  return (
    <div className="tab-body">
      <div className="tab-header">
        <span className="t2">Só o que vale a pena. Usa um pouco de IA a cada ~40 s de conversa.</span>
        <Toggle checked={enabled} label="Insights ao vivo" onChange={(v) => void saveSettings({ liveInsights: v })} />
      </div>
      {(m.yourShare > 0 || m.yourPace) && (
        <div className="voice-metrics">
          <div className="metric">
            <span className="lbl">Sua parte da fala</span>
            <div className="track">
              <span style={{ width: `${Math.round(m.yourShare * 100)}%`, background: m.yourShare > 0.7 ? 'var(--red)' : 'var(--green)' }} />
            </div>
            <span className="val">{Math.round(m.yourShare * 100)}%</span>
          </div>
          <div className="metric">
            <span className="lbl">Seu ritmo</span>
            <span className="val">{m.yourPace ? `${Math.round(m.yourPace)} palavras/min` : '—'}</span>
          </div>
        </div>
      )}
      {data.tone && (
        <div className={`conversation-tone tone-${data.tone.mood}`}>
          <span className="kind">
            <Smiley size={13} weight="bold" /> Tom: {MOOD_LABELS[data.tone.mood]}
          </span>
          {data.tone.others && (
            <span className="text">
              <span className="t2">Outros:</span> {data.tone.others}
            </span>
          )}
          {data.tone.you && (
            <span className="text">
              <span className="t2">Você:</span> {data.tone.you}
            </span>
          )}
        </div>
      )}
      {generating && !list.length ? (
        <Loading text="Lendo a conversa atrás de algo útil…" />
      ) : list.length ? (
        <div className="insights-list">
          {list.map((i) => (
            <div key={i.id} className={`insight insight-${i.type}`}>
              <span className="kind">
                {INSIGHT_ICONS[i.type]} {INSIGHT_LABELS[i.type]}
              </span>
              <span className="text">{i.text}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="tab-empty">
          <Sparkle size={14} />{' '}
          {enabled ? 'Nenhum insight ainda. Eles aparecem quando houver algo útil.' : 'Ligue para receber insights durante a call.'}
        </p>
      )}
    </div>
  );
}

function Loading({ text }: { text: string }) {
  return (
    <p className="tab-empty tab-loading">
      <CircleNotch size={14} className="spinning" /> {text}
    </p>
  );
}

function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function formatAgo(ms: number): string {
  if (ms < 60_000) return 'agora há pouco';
  return `há ${Math.round(ms / 60_000)} min`;
}
