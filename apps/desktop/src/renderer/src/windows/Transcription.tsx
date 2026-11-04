import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  ArrowCounterClockwise,
  ArrowDown,
  Broom,
  CheckCircle,
  Microphone,
  Pause,
  Play,
  Record,
  SpeakerHigh,
  Stop,
  Translate,
  Waveform,
} from '@phosphor-icons/react';
import type { Utterance, UtteranceTranslation } from '@ponto/shared';
import { useAppState, useCapture } from '../state/app';
import { api } from '../api/client';
import { InsightsTab, SummaryTab, TabSelector, useConnectLive, type TranscriptionTab } from './transcription/LiveTabs';
import { useDomain } from '../state/domain';
import { useTranscription } from '../state/transcription';
import { Header } from '../ui/Header';
import { Toggle } from '../ui/Toggle';
import { LANGUAGES, TARGET_LANGUAGES } from '../ui/languages';
import { Menu } from '../ui/Menu';
import { Select } from '../ui/Select';

const sendCommand = (action: 'start' | 'pause' | 'resume' | 'stop') => void window.ponto.invoke('capture.command', { action });

export function Transcription() {
  const capture = useCapture();
  const utterances = useTranscription((s) => s.utterances);
  const notice = useTranscription((s) => s.notice);
  const recording = capture.status === 'recording';
  const [tab, setTab] = useState<TranscriptionTab>('raw');
  useConnectLive();

  return (
    <div className="panel-window" style={{ flexDirection: 'column' }}>
      <div className="panel solid">
        <Header
          windowId="transcription"
          icon={<Waveform size={16} weight="bold" />}
          title="Transcrição"
          meta={capture.status !== 'stopped' && <LiveBadge paused={capture.status === 'paused'} since={capture.startedAt} />}
        />
        <TabSelector tab={tab} onChange={setTab} />
        {tab === 'raw' && <UtteranceList utterances={utterances} recording={recording} stopped={capture.status === 'stopped'} />}
        {tab === 'summary' && <SummaryTab />}
        {tab === 'insights' && <InsightsTab />}
        <UndoBar />
        {notice && (
          <div className="transcription-notice" role="status">
            {notice}
          </div>
        )}
        {capture.status !== 'stopped' && <Meters sources={capture.sources} />}
        <MinutesNotice />
        <Footer />
      </div>
    </div>
  );
}

function MinutesNotice() {
  const [status, setStatus] = useState<'generating' | 'ready' | 'error' | null>(null);
  useEffect(
    () =>
      api.on((e) => {
        if (e.type === 'session.summary') setStatus(e.status);
        if (e.type === 'transcription.utterance') setStatus(null);
      }),
    [],
  );
  useEffect(() => {
    if (status !== 'ready' && status !== 'error') return;
    const t = setTimeout(() => setStatus(null), 20_000);
    return () => clearTimeout(t);
  }, [status]);
  if (!status) return null;
  return (
    <div className="transcription-notice" role="status">
      {status === 'generating' && 'Escrevendo a ata da call…'}
      {status === 'error' && 'Não consegui escrever a ata. Dá para tentar de novo em Sessões, na Home.'}
      {status === 'ready' && (
        <>
          Ata pronta.{' '}
          <button type="button" className="notice-link" onClick={() => void window.ponto.invoke('window.toggle', { id: 'home', visible: true })}>
            Ver em Sessões
          </button>
        </>
      )}
    </div>
  );
}

function LiveBadge({ paused, since }: { paused: boolean; since: number | null }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="live-badge">
      <span className={`dot${paused ? ' paused' : ''}`} aria-hidden="true" />
      {paused ? 'Pausada' : 'Ao vivo'}
      {since && <span className="meta">{formatClock(now - since)}</span>}
    </span>
  );
}

function UtteranceList({ utterances, recording, stopped }: { utterances: Utterance[]; recording: boolean; stopped: boolean }) {
  const userName = useDomain((s) => s.settings?.userName);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const partials = useTranscription((s) => s.partials);
  const translations = useTranscription((s) => s.translations);
  const inProgress = (Object.entries(partials) as Array<[Utterance['channel'], { text: string; startMs: number }]>).sort(
    (a, b) => a[1].startMs - b[1].startMs,
  );

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && pinnedToBottom) el.scrollTop = el.scrollHeight;
  }, [utterances, partials, translations, pinnedToBottom]);

  if (!utterances.length && !inProgress.length) {
    return (
      <div className="body">
        <div className="empty">
          <Microphone size={28} />
          {stopped ? (
            <>
              <span className="t1">Pronto para ouvir</span>
              <span>
                O que você fala aparece como "Você" e o áudio do computador como os outros participantes. Não precisa entrar na reunião.
              </span>
              <button type="button" className="primary-btn" onClick={() => sendCommand('start')}>
                <Record size={14} weight="fill" /> Começar a transcrever
              </button>
            </>
          ) : (
            <>
              <span className="t1">{recording ? 'Ouvindo…' : 'Pausada'}</span>
              <span>A primeira fala aparece uns 2 segundos depois que a pessoa para de falar.</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="body-wrap">
      <div
        className="body"
        ref={bodyRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          setPinnedToBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {groupUtterances(utterances).map((group) => (
          <div key={group[0]!.id} className={`utterance${group[0]!.channel === 'microphone' ? ' you' : ''}`}>
            <span className="speaker">
              {speakerLabel(group[0]!, userName)} <span className="time">{formatClock(group[0]!.startMs)}</span>
            </span>
            <span className="txt">
              {group.map((u) => u.text).join(' ')}
              <Translations utterances={group} translations={translations} />
            </span>
          </div>
        ))}
        {inProgress.map(([channel, p]) => (
          <div key={`partial-${channel}`} className={`utterance partial${channel === 'microphone' ? ' you' : ''}`} aria-live="polite">
            <span className="speaker">
              {channel === 'microphone' ? userName || 'Você' : 'Participante'} <span className="time">{formatClock(p.startMs)}</span>
            </span>
            <span className="txt">{p.text}</span>
          </div>
        ))}
      </div>
      {!pinnedToBottom && (
        <button type="button" className="scroll-bottom" onClick={() => setPinnedToBottom(true)}>
          <ArrowDown size={12} weight="bold" /> Ir para o fim
        </button>
      )}
    </div>
  );
}

function Translations({ utterances, translations }: { utterances: Utterance[]; translations: Record<string, UtteranceTranslation> }) {
  const items = utterances.map((u) => translations[u.id]).filter((t): t is UtteranceTranslation => !!t);
  const text = items.map((t) => t.text).filter(Boolean).join(' ');
  const corrections = items.map((t) => t.correction).filter(Boolean);
  if (!text && !corrections.length) return null;
  return (
    <>
      {text && (
        <span className="translation">
          <Translate size={12} /> {text}
        </span>
      )}
      {corrections.map((c, i) => (
        <span key={i} className="correction">
          <CheckCircle size={12} /> Melhor dizer: {c}
        </span>
      ))}
    </>
  );
}

function TranslationMenu() {
  const settings = useDomain((s) => s.settings);
  const saveSettings = useDomain((s) => s.saveSettings);
  if (!settings) return null;
  return (
    <Menu
      className="translation-menu"
      direction="up"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className={`icon-btn${settings.translationEnabled ? ' active' : ''}`}
          aria-label="Tradução"
          aria-expanded={open}
          aria-pressed={settings.translationEnabled}
          title="Tradução em tempo real"
          onClick={toggle}
        >
          <Translate size={15} />
        </button>
      )}
    >
      {() => (
        <div className="translation-panel">
          <div className="menu-title">Tradução em tempo real</div>
          <div className="setting-line">
            <span>Traduzir as falas</span>
            <Toggle
              checked={settings.translationEnabled}
              label="Traduzir as falas"
              onChange={(v) => void saveSettings({ translationEnabled: v })}
            />
          </div>
          <div className="setting-line">
            <span>Para</span>
            <Select
              label="Traduzir para"
              align="right"
              value={settings.translationTarget}
              options={TARGET_LANGUAGES}
              onChange={(v) => void saveSettings({ translationTarget: v })}
            />
          </div>
          <div className="setting-line">
            <span>De quem</span>
            <Select
              label="De quem traduzir"
              align="right"
              value={settings.translationSource}
              options={[
                { value: 'others', label: 'Só os outros' },
                { value: 'me', label: 'Só eu' },
                { value: 'all', label: 'Todos' },
              ]}
              onChange={(v) => void saveSettings({ translationSource: v })}
            />
          </div>
          <div className="setting-line">
            <span>
              Modo aprendizado
              <br />
              <span className="sub">Corrige as suas frases no idioma da conversa</span>
            </span>
            <Toggle
              checked={settings.translationLearning}
              label="Modo aprendizado"
              onChange={(v) => void saveSettings({ translationLearning: v })}
            />
          </div>
          <p className="menu-empty">
            Cada fala vira uma chamada curta ao modelo rápido. Falas que já estão no idioma escolhido não são traduzidas.
          </p>
        </div>
      )}
    </Menu>
  );
}

function Meters({ sources }: { sources: { microphone: boolean; system: boolean } }) {
  const levels = useTranscription((s) => s.levels);
  const row = (label: string, icon: React.ReactNode, active: boolean, level: number) => (
    <div className="audio-bar" title={active ? undefined : 'Esta fonte não está chegando'}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {icon} {label}
      </span>
      <div className={`track${active ? '' : ' inactive'}`}>
        <span style={{ width: `${Math.round((active ? level : 0) * 100)}%` }} />
      </div>
    </div>
  );
  return (
    <div className="meters">
      <div className="bars">
        {row('Você', <Microphone size={12} />, sources.microphone, levels.microphone)}
        {row('Outros', <SpeakerHigh size={12} />, sources.system, levels.system)}
      </div>
    </div>
  );
}

function Footer() {
  const capture = useCapture();
  const language = useDomain((s) => s.settings?.language ?? 'auto');
  const saveSettings = useDomain((s) => s.saveSettings);
  const hasKey = useAppState((s) => {
    const keys = s.state?.configuredSecrets ?? [];
    return keys.length > 0;
  });
  const { status } = capture;

  return (
    <div className="footer">
      {status === 'stopped' ? (
        <button
          type="button"
          className="icon-btn"
          aria-label="Começar a transcrever"
          title="Começar (Ctrl+Shift+G)"
          disabled={!hasKey}
          onClick={() => sendCommand('start')}
        >
          <Record size={14} weight="fill" style={{ color: 'var(--red)' }} />
        </button>
      ) : (
        <button
          type="button"
          className="icon-btn"
          aria-label={status === 'paused' ? 'Retomar' : 'Pausar'}
          title={status === 'paused' ? 'Retomar (Ctrl+Shift+G)' : 'Pausar (Ctrl+Shift+G)'}
          disabled={status === 'starting'}
          onClick={() => sendCommand(status === 'paused' ? 'resume' : 'pause')}
        >
          {status === 'paused' ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
        </button>
      )}
      <button type="button" className="icon-btn" aria-label="Encerrar sessão" title="Encerrar sessão" disabled={status === 'stopped'} onClick={() => sendCommand('stop')}>
        <Stop size={12} weight="fill" />
      </button>
      <ClearButton />
      <Select label="Idioma da conversa" value={language} options={LANGUAGES} direction="up" onChange={(v) => void saveSettings({ language: v })} />
      <TranslationMenu />
      <div className="spacer" />
    </div>
  );
}

function ClearButton() {
  const hasUtterances = useTranscription((s) => s.utterances.length > 0);
  const clear = useTranscription((s) => s.clear);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (confirming) {
    return (
      <button
        type="button"
        className="clear-btn confirm"
        onClick={() => {
          setConfirming(false);
          clear();
        }}
        onBlur={() => setConfirming(false)}
        autoFocus
      >
        <Broom size={13} /> Limpar tudo?
      </button>
    );
  }
  return (
    <button type="button" className="icon-btn" aria-label="Limpar transcrição" title="Limpar transcrição" disabled={!hasUtterances} onClick={() => setConfirming(true)}>
      <Broom size={14} />
    </button>
  );
}

function UndoBar() {
  const undoable = useTranscription((s) => s.undoable);
  const undo = useTranscription((s) => s.undo);
  if (!undoable) return null;
  return (
    <div className="transcription-undo" role="status">
      <span>
        Transcrição limpa ({undoable.utterances.length} {undoable.utterances.length === 1 ? 'fala' : 'falas'}).
      </span>
      <button type="button" onClick={undo}>
        <ArrowCounterClockwise size={12} weight="bold" /> Desfazer
      </button>
    </div>
  );
}

function groupUtterances(utterances: Utterance[]): Utterance[][] {
  const groups: Utterance[][] = [];
  for (const u of utterances) {
    const g = groups.at(-1);
    const last = g?.at(-1);
    if (g && last && last.channel === u.channel && last.speaker === u.speaker && u.startMs - last.endMs < 4000) g.push(u);
    else groups.push([u]);
  }
  return groups;
}

function speakerLabel(u: Utterance, userName?: string): string {
  if (u.speaker) return u.speaker;
  return u.channel === 'microphone' ? userName || 'Você' : 'Participante';
}

function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
