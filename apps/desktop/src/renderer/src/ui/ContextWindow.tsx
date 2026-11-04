import { useCallback, useEffect, useState } from 'react';
import { ArrowsInLineVertical } from '@phosphor-icons/react';
import type { ContextPart, ConversationContext } from '@ponto/shared';
import { api } from '../api/client';
import { useAppState } from '../state/app';
import { useChat } from '../state/chat';
import { useDomain } from '../state/domain';
import { Menu } from './Menu';

const PARTS: Record<ContextPart, { name: string; color: string }> = {
  instructions: { name: 'Instruções do agente', color: '#5B95FF' },
  profile: { name: 'Seu perfil', color: '#8A7CFF' },
  callSummary: { name: 'Resumo do começo da call', color: '#3CC8A8' },
  conversationSummary: { name: 'Resumo da conversa', color: '#F2B84B' },
  history: { name: 'Mensagens anteriores', color: '#E879A6' },
  transcription: { name: 'Falas da call no histórico', color: '#56C46B' },
};

export function ContextWindow() {
  const conversationId = useChat((s) => s.conversationId);
  const busy = useChat((s) => s.busy);
  const total = useChat((s) => s.messages.length);
  const agent = useDomain((s) => s.settings?.activeAgentId);
  const sessionId = useAppState((s) => s.state?.capture.sessionId ?? null);
  const [data, setData] = useState<ConversationContext | null>(null);
  const [compacting, setCompacting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<ConversationContext>(`/chat/conversations/${conversationId}/context${agent ? `?agent=${encodeURIComponent(agent)}` : ''}`)
      .then(setData)
      .catch(() => undefined);
  }, [conversationId, agent]);

  useEffect(() => {
    if (!busy) load();
  }, [busy, total, load]);

  const compact = async () => {
    setCompacting(true);
    setError(null);
    try {
      setData(await api.post<ConversationContext>(`/chat/conversations/${conversationId}/compress${sessionId ? `?session=${sessionId}` : ''}`));
    } catch {
      setError('Não consegui comprimir agora. Tente de novo.');
    } finally {
      setCompacting(false);
    }
  };

  const used = data ? Math.max(data.lastUsage?.inputTokens ?? 0, data.estimatedTotal) : 0;
  const fraction = data?.limit ? Math.min(1, used / data.limit) : 0;
  const partsSum = data?.parts.reduce((n, p) => n + p.tokens, 0) || 1;

  return (
    <Menu
      className="context"
      align="right"
      direction="up"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className="chip icon-only context-ring"
          aria-label="Janela de contexto"
          aria-expanded={open}
          aria-haspopup="dialog"
          title="Janela de contexto"
          onClick={() => {
            if (!open) load();
            toggle();
          }}
        >
          <Ring fraction={fraction} />
        </button>
      )}
    >
      {() => (
        <div className="context-panel">
          <div className="menu-title">Janela de contexto</div>
          {!data ? (
            <p className="menu-empty">Carregando…</p>
          ) : (
            <>
              <div className="context-total">
                <strong>{formatThousands(used)}</strong>
                <span>
                  {data.limit ? ` de ${formatThousands(data.limit)} tokens (${formatPercent(fraction)})` : ' tokens'}
                </span>
              </div>
              <div className="context-bar" aria-hidden="true">
                {data.parts
                  .filter((p) => p.tokens > 0)
                  .map((p) => (
                    <span key={p.part} style={{ flexGrow: p.tokens, background: PARTS[p.part].color }} />
                  ))}
              </div>
              <ul className="context-parts">
                {data.parts
                  .filter((p) => p.tokens > 0)
                  .map((p) => (
                    <li key={p.part}>
                      <span className="dot-color" style={{ background: PARTS[p.part].color }} />
                      <span className="name">{PARTS[p.part].name}</span>
                      <span className="num">
                        {formatThousands(p.tokens)} · {formatPercent(p.tokens / partsSum)}
                      </span>
                    </li>
                  ))}
              </ul>
              <div className="context-row">
                <span>Modelo</span>
                <span className="num model-id">{data.model}</span>
              </div>
              {data.lastUsage && (
                <div className="context-row">
                  <span>Última resposta</span>
                  <span className="num">
                    {formatThousands(data.lastUsage.inputTokens)} entrada
                    {data.lastUsage.inputTokens > 0 && ` (${formatPercent(data.lastUsage.cachedTokens / data.lastUsage.inputTokens)} em cache)`} ·{' '}
                    {formatThousands(data.lastUsage.outputTokens)} saída
                  </span>
                </div>
              )}
              <div className="context-row">
                <span>Trocas na memória</span>
                <span className="num">
                  {data.turns}
                  {data.compacted && ' + resumo'}
                </span>
              </div>
              {data.spendUsd > 0 && (
                <div className="context-row">
                  <span>Gasto nesta conversa</span>
                  <span className="num">US$ {data.spendUsd >= 1 ? data.spendUsd.toFixed(2) : data.spendUsd.toFixed(4)}</span>
                </div>
              )}
              <div className="divider" />
              <button
                type="button"
                className="item"
                disabled={compacting || data.turns === 0}
                onClick={() => void compact()}
              >
                <ArrowsInLineVertical size={16} />
                <span className="label">
                  {compacting ? 'Comprimindo…' : 'Comprimir conversa'}
                  <br />
                  <span className="sub">
                    {data.turns === 0
                      ? 'Nada para comprimir ainda.'
                      : 'As mensagens antigas viram um resumo curto. As próximas respostas ficam mais baratas.'}
                  </span>
                </span>
              </button>
              {error && <p className="menu-empty context-warning">{error}</p>}
            </>
          )}
        </div>
      )}
    </Menu>
  );
}

function Ring({ fraction }: { fraction: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  const filled = fraction > 0 ? Math.max(0.04, fraction) : 0;
  const color = fraction > 0.8 ? 'var(--red)' : fraction > 0.5 ? '#F2B84B' : '#8FB0FF';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray={`${filled * c} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

function formatThousands(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
}

function formatPercent(f: number): string {
  if (f > 0 && f < 0.01) return '<1%';
  return `${Math.round(f * 100)}%`;
}
