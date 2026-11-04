import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwise, CaretRight, Copy, DownloadSimple, FolderOpen, Trash } from '@phosphor-icons/react';
import type { SavedMessage, Session, SessionListItem, SpendBySource } from '@ponto/shared';
import { api } from '../../api/client';
import { Markdown } from '../../ui/Markdown';

/**
 * Call history: each session with its minutes (generated when the session ends)
 * and transcript. Exporting saves a `.md` file directly to `Documents/Ponto`
 * without an OS file dialog, since native dialogs show up in screen recordings.
 */
export function Sessions() {
  const [list, setList] = useState<SessionListItem[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .get<SessionListItem[]>('/sessions')
      .then(setList)
      .catch(() => setList((l) => l ?? []));
  }, []);

  useEffect(() => {
    const stopConnect = api.onConnect(load);
    const stopEvents = api.on((e) => {
      if (e.type === 'session.summary') load();
    });
    return () => {
      stopConnect();
      stopEvents();
    };
  }, [load]);

  return (
    <>
      <h2>Sessões</h2>
      <p className="lead">A ata de cada call fica pronta quando você encerra a transcrição. Tudo salvo só no seu PC.</p>
      <div className="list">
        {list === null && (
          <div className="empty" style={{ padding: 32 }}>
            Carregando…
          </div>
        )}
        {list?.length === 0 && (
          <div className="empty" style={{ padding: 32 }}>
            <span className="t1">Nenhuma sessão ainda</span>
            <span>Comece uma transcrição (Ctrl+Shift+G). Ao encerrar, a ata aparece aqui.</span>
          </div>
        )}
        {list?.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            open={openId === s.id}
            toggle={() => setOpenId((a) => (a === s.id ? null : s.id))}
            onChange={load}
          />
        ))}
      </div>
    </>
  );
}

function SessionRow({
  session,
  open,
  toggle,
  onChange,
}: {
  session: SessionListItem;
  open: boolean;
  toggle: () => void;
  onChange: () => void;
}) {
  const [detail, setDetail] = useState<Session | null>(null);
  const [notice, setNotice] = useState<{ text: string; path?: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [tab, setTab] = useState<'minutes' | 'conversation' | 'spending'>('minutes');

  // Reload minutes when expanded and whenever summary state changes.
  useEffect(() => {
    if (!open) return;
    api
      .get<Session>(`/sessions/${session.id}`)
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [open, session.id, session.hasSummary, session.generatingSummary, session.title]);

  const fetchMarkdown = () => api.get<string>(`/sessions/${session.id}/markdown`);

  const exportMarkdown = async () => {
    try {
      const content = await fetchMarkdown();
      const { path } = await window.ponto.invoke('file.saveMarkdown', { name: buildFileName(session), content });
      setNotice({ text: 'Salvo em Documentos/Ponto.', path });
    } catch {
      setNotice({ text: 'Não consegui salvar o arquivo.' });
    }
  };

  const copyMarkdown = async () => {
    try {
      await navigator.clipboard.writeText(await fetchMarkdown());
      setNotice({ text: 'Copiado em Markdown.' });
    } catch {
      setNotice({ text: 'Não consegui copiar.' });
    }
  };

  const regenerate = () => {
    setNotice(null);
    void api.post(`/sessions/${session.id}/summary`).then(onChange);
  };

  const remove = async () => {
    await api.delete(`/sessions/${session.id}`).catch(() => undefined);
    onChange();
  };

  return (
    <div className={`session-item${open ? ' open' : ''}`}>
      <button type="button" className="list-row session-header" aria-expanded={open} onClick={toggle}>
        <CaretRight className="arrow" size={14} weight="bold" />
        <span className="main-col">
          <span className="t1">{session.title}</span>
          <span className="t2">
            {formatWhen(session.startedAt)} · {formatDuration(session.durationMs)} · {session.totalUtterances} falas
            {session.costUsd > 0 && ` · US$ ${formatCurrency(session.costUsd)}`}
            {!session.endedAt && ' · em andamento'}
          </span>
        </span>
        {session.generatingSummary ? (
          <span className="tag">Escrevendo a ata…</span>
        ) : session.hasSummary ? (
          <span className="tag tag-ok">Ata pronta</span>
        ) : null}
      </button>
      {open && (
        <div className="session-body">
          <div className="session-actions">
            <button type="button" className="sec-btn" onClick={() => void exportMarkdown()}>
              <DownloadSimple size={14} /> Exportar .md
            </button>
            <button type="button" className="sec-btn" onClick={() => void copyMarkdown()}>
              <Copy size={14} /> Copiar
            </button>
            <button type="button" className="sec-btn" disabled={session.generatingSummary || !session.totalUtterances} onClick={regenerate}>
              <ArrowClockwise size={14} /> {session.hasSummary ? 'Refazer ata' : 'Gerar ata'}
            </button>
            <span className="spacer" />
            {confirmDelete ? (
              <>
                <span className="t2">Apagar de vez?</span>
                <button type="button" className="sec-btn danger" onClick={() => void remove()}>
                  Apagar
                </button>
                <button type="button" className="sec-btn" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="sec-btn" aria-label="Apagar sessão" onClick={() => setConfirmDelete(true)}>
                <Trash size={14} />
              </button>
            )}
          </div>
          {notice && (
            <div className="session-notice">
              {notice.text}
              {notice.path && (
                <button type="button" className="link" onClick={() => void window.ponto.invoke('file.reveal', { path: notice.path! })}>
                  <FolderOpen size={13} /> Mostrar na pasta
                </button>
              )}
            </div>
          )}
          <div className="tabs" role="tablist">
            {(['minutes', 'conversation', 'spending'] as const).map((t) => (
              <button type="button" key={t} role="tab" aria-selected={tab === t} className="tab" onClick={() => setTab(t)}>
                {t === 'minutes' ? 'Ata' : t === 'conversation' ? 'Conversa com a IA' : `Gastos · US$ ${formatCurrency(session.costUsd)}`}
              </button>
            ))}
          </div>
          {tab === 'minutes' && (
            <div className="session-minutes">
              {detail?.summary ? (
                <Markdown text={detail.summary} />
              ) : session.generatingSummary ? (
                <p className="t2">Escrevendo a ata da call…</p>
              ) : (
                <p className="t2">
                  {session.totalUtterances < 4
                    ? 'Call curta demais para uma ata automática. Dá para gerar mesmo assim.'
                    : 'Sem ata ainda.'}
                </p>
              )}
            </div>
          )}
          {tab === 'conversation' && <SessionConversation sessionId={session.id} />}
          {tab === 'spending' && <SessionSpending sessionId={session.id} total={session.costUsd} />}
        </div>
      )}
    </div>
  );
}

function SessionConversation({ sessionId }: { sessionId: string }) {
  const [msgs, setMsgs] = useState<SavedMessage[] | null>(null);
  useEffect(() => {
    api
      .get<SavedMessage[]>(`/sessions/${sessionId}/conversation`)
      .then(setMsgs)
      .catch(() => setMsgs([]));
  }, [sessionId]);
  if (!msgs) return <p className="t2">Carregando…</p>;
  if (!msgs.length) return <p className="t2 session-empty">Nenhuma pergunta ao chat durante esta sessão.</p>;
  return (
    <div className="saved-chat">
      {msgs.map((m) => (
        <div key={m.id} className={`msg ${m.role === 'assistant' ? 'ai' : 'user'}${m.automatic && m.role === 'user' ? ' detected' : ''}`}>
          {m.role === 'assistant' ? <Markdown text={m.text || '(sem resposta)'} /> : m.text}
          <div className="msg-footer">
            {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            {m.model && ` · ${m.model}`}
            {m.costUsd !== null && ` · US$ ${formatCurrency(m.costUsd)}`}
          </div>
        </div>
      ))}
    </div>
  );
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat (suas perguntas e sugestões)',
  transcription: 'Transcrição',
  decision: 'Jev (detectar perguntas)',
  summary: 'Ata',
  compaction: 'Contexto da call para o chat',
  live_summary: 'Resumo ao vivo',
  insights: 'Insights ao vivo',
  chat_compression: 'Comprimir conversa do chat',
  translation: 'Tradução',
};

function SessionSpending({ sessionId, total }: { sessionId: string; total: number }) {
  const [rows, setRows] = useState<SpendBySource[] | null>(null);
  useEffect(() => {
    api
      .get<SpendBySource[]>(`/sessions/${sessionId}/spend`)
      .then(setRows)
      .catch(() => setRows([]));
  }, [sessionId, total]);
  if (!rows) return <p className="t2">Carregando…</p>;
  if (!rows.length) return <p className="t2 session-empty">Nada gasto nesta sessão.</p>;
  return (
    <table className="spending-table">
      <tbody>
        {rows.map((r) => (
          <tr key={r.source}>
            <td>{SOURCE_LABELS[r.source] ?? r.source}</td>
            <td className="num">
              {r.calls} {r.calls === 1 ? 'chamada' : 'chamadas'}
            </td>
            <td className="num">{r.tokens.toLocaleString('pt-BR')} tokens</td>
            <td className="num strong">US$ {formatCurrency(r.costUsd)}</td>
          </tr>
        ))}
        <tr className="total">
          <td>Total</td>
          <td />
          <td />
          <td className="num strong">US$ {formatCurrency(rows.reduce((n, r) => n + r.costUsd, 0))}</td>
        </tr>
      </tbody>
    </table>
  );
}

/** Sub-cent USD values disappear with 2 decimals; show 4 decimals when under $1. */
function formatCurrency(v: number): string {
  return v >= 1 ? v.toFixed(2) : v.toFixed(4);
}

function buildFileName(s: SessionListItem): string {
  const d = new Date(s.startedAt);
  const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${date} ${s.title}`;
}

function formatWhen(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
