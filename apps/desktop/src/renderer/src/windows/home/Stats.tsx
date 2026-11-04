import { useCallback, useEffect, useState } from 'react';
import type { Stats as StatsData } from '@ponto/shared';
import { api } from '../../api/client';
import { useDomain } from '../../state/domain';

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  transcription: 'Transcrição',
  decision: 'Detectar perguntas',
  summary: 'Atas',
  compaction: 'Contexto da call',
  live_summary: 'Resumo ao vivo',
  insights: 'Insights',
  chat_compression: 'Comprimir conversa',
  translation: 'Tradução',
};

/** Home overview numbers: sessions, recorded hours, speaking share, costs, and last 14 days. */
export function Stats() {
  const [data, setData] = useState<StatsData | null>(null);
  const agents = useDomain((s) => s.agents);
  const load = useCallback(() => void api.get<StatsData>('/stats').then(setData).catch(() => undefined), []);

  useEffect(() => {
    const stopConnect = api.onConnect(load);
    const stopEvents = api.on((e) => {
      if (e.type === 'session.summary' || e.type === 'usage') load();
    });
    return () => {
      stopConnect();
      stopEvents();
    };
  }, [load]);

  if (!data) return null;
  const maxMin = Math.max(1, ...data.byDay.map((x) => x.minutes));
  const totalBySource = data.cost.bySourceMonth.reduce((n, o) => n + o.costUsd, 0) || 1;
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name ?? id;

  return (
    <>
      <div className="cards cards-4">
        <Card
          label="Sessões no mês"
          value={String(data.sessions.thisMonth)}
          sub={`${data.sessions.thisWeek} nos últimos 7 dias · ${data.sessions.total} no total`}
        />
        <Card label="Horas de call no mês" value={formatHours(data.recordedHours.thisMonth)} sub={`${formatHours(data.recordedHours.total)} no total`} />
        <Card
          label="Sua parte da fala"
          value={`${Math.round(data.utterances.yourShare * 100)}%`}
          sub={`${formatNumber(data.words.yours)} palavras suas · ${formatNumber(data.words.others)} dos outros`}
        />
        <Card
          label="Custo de IA no mês"
          value={`US$ ${data.cost.monthUsd.toFixed(2)}`}
          sub={`média de US$ ${data.cost.avgPerSessionUsd.toFixed(3)} por sessão`}
        />
      </div>

      <div className="home-panels">
        <div className="card">
          <span className="lbl">Minutos de call nos últimos 14 dias</span>
          <div className="days-chart" role="img" aria-label="Minutos de call por dia">
            {data.byDay.map((x) => (
              <div
                key={x.day}
                className="day-col"
                data-tooltip={`${shortDay(x.day)}: ${Math.round(x.minutes)} min, ${x.sessions} ${x.sessions === 1 ? 'sessão' : 'sessões'}, US$ ${x.costUsd.toFixed(3)}`}
              >
                <span className="day-bar" style={{ height: `${Math.max(x.minutes > 0 ? 6 : 2, (x.minutes / maxMin) * 100)}%` }} />
                <span className="day-label">{shortDay(x.day).slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <span className="lbl">Onde o dinheiro foi (mês)</span>
          {data.cost.bySourceMonth.length ? (
            <ul className="source-list">
              {data.cost.bySourceMonth.slice(0, 6).map((o) => (
                <li key={o.source}>
                  <span className="name">{SOURCE_LABELS[o.source] ?? o.source}</span>
                  <span className="track">
                    <span style={{ width: `${(o.costUsd / totalBySource) * 100}%` }} />
                  </span>
                  <span className="num">US$ {o.costUsd.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="t2">Nada gasto ainda este mês.</span>
          )}
        </div>
      </div>

      <div className="cards cards-3">
        <Card
          label="Perguntas ao chat"
          value={formatNumber(data.chatQuestions.total)}
          sub={`${data.chatQuestions.detected} detectadas sozinhas na call`}
        />
        <Card label="Falas transcritas" value={formatNumber(data.utterances.total)} />
        <Card
          label="Agente mais usado"
          value={data.agents[0] ? agentName(data.agents[0].agentId) : '—'}
          sub={data.agents[0] ? `${data.agents[0].sessions} sessões` : undefined}
        />
      </div>
    </>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card">
      <span className="lbl">{label}</span>
      <span className="val">{value}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

const formatNumber = (n: number) => n.toLocaleString('pt-BR');

function shortDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
