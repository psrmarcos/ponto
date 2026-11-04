import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  Brain,
  CaretDown,
  CaretUp,
  ChatDots,
  Check,
  DotsSixVertical,
  DotsThree,
  Ear,
  Eye,
  EyeSlash,
  GearSix,
  Globe,
  House,
  Image as ImageIcon,
  MagicWand,
  Monitor,
  NotePencil,
  Pause,
  Play,
  Power,
  Robot,
  ScanSmiley,
  SignOut,
  Sparkle,
  Stop,
  Waveform,
  X,
} from '@phosphor-icons/react';
import { useAppState, useCapture, useStealth, useWindowVisible } from '../state/app';
import { useChat, type Message } from '../state/chat';
import { useDomain } from '../state/domain';
import { api } from '../api/client';
import { Logo } from '../ui/Logo';
import { Markdown } from '../ui/Markdown';
import { ContextWindow } from '../ui/ContextWindow';
import { Menu } from '../ui/Menu';
import { ModelSelect } from '../ui/ModelSelect';

const statusLabel = (s: string) =>
  s === 'recording' ? 'Transcrevendo' : s === 'paused' ? 'Transcrição pausada' : s === 'starting' ? 'Abrindo o áudio…' : 'Sem transcrição';

const openWindow = (id: 'home' | 'transcription' | 'screen', visible?: boolean) =>
  void window.ponto.invoke('window.toggle', { id, visible });

export function Overlay() {
  const [chatVisible, setChatVisible] = useState(true);
  useEffect(() => window.ponto.on('chat.toggle', () => setChatVisible((v) => !v)), []);
  useEffect(() => api.on((e) => e.type === 'suggestion.new' && setChatVisible(true)), []);
  useEffect(() => window.ponto.on('screen.read', () => setChatVisible(true)), []);
  useEffect(() => window.ponto.on('selection.read', () => setChatVisible(true)), []);

  return (
    <div className="stage">
      <Pill chatVisible={chatVisible} toggleChat={() => setChatVisible((v) => !v)} />
      <Chat visible={chatVisible} />
    </div>
  );
}

function Pill({ chatVisible, toggleChat }: { chatVisible: boolean; toggleChat: () => void }) {
  const stealth = useStealth();
  const home = useWindowVisible('home');
  const transcription = useWindowVisible('transcription');
  const screen = useWindowVisible('screen');
  const { status } = useCapture();
  const recording = status === 'recording';

  return (
    <div className="pill solid">
      <div className="drag-handle" title="Arraste para mover" aria-label="Mover">
        <DotsSixVertical size={16} weight="bold" />
      </div>
      <Logo />
      <button type="button" className="round-btn" aria-pressed={home} title="Home e configurações" onClick={() => openWindow('home')}>
        <House size={15} weight="bold" />
      </button>
      <span className={`dot${recording ? '' : ' paused'}`} aria-hidden="true" title={statusLabel(status)} />
      <button type="button" className="pill-btn" aria-pressed={chatVisible} title="Mostrar/esconder chat" onClick={toggleChat}>
        {chatVisible ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
        <span>{chatVisible ? 'Esconder' : 'Mostrar'}</span>
      </button>
      <button
        type="button"
        className={`round-btn ${recording ? 'recording' : 'paused'}`}
        aria-label={recording ? 'Pausar transcrição' : status === 'paused' ? 'Retomar transcrição' : 'Começar a transcrever'}
        title={`${recording ? 'Pausar' : status === 'paused' ? 'Retomar' : 'Começar a transcrever'} (Ctrl+Shift+G)`}
        disabled={status === 'starting'}
        onClick={() =>
          void window.ponto.invoke('capture.command', {
            action: recording ? 'pause' : status === 'paused' ? 'resume' : 'start',
          })
        }
      >
        {recording ? <Pause size={12} weight="fill" /> : <Play size={12} weight="fill" />}
      </button>

      <span className="pill-divider" aria-hidden="true" />
      <button
        type="button"
        className="round-btn"
        aria-pressed={stealth.enabled}
        aria-label="Invisibilidade"
        title={stealth.enabled ? 'Invisível em gravações e prints' : 'Visível em gravações e prints'}
        onClick={() => void window.ponto.invoke('stealth.set', { enabled: !stealth.enabled })}
      >
        {stealth.enabled ? <EyeSlash size={15} weight="bold" /> : <Eye size={15} weight="bold" />}
      </button>
      <button type="button" className="round-btn" aria-pressed={transcription} title="Transcrição" onClick={() => openWindow('transcription')}>
        <Waveform size={15} weight="bold" />
      </button>
      <button type="button" className="round-btn" aria-pressed={screen} title="Tela" onClick={() => openWindow('screen')}>
        <Monitor size={15} weight="bold" />
      </button>
      <span className="pill-divider" aria-hidden="true" />
      <button
        type="button"
        className="round-btn quit"
        aria-label="Fechar o app"
        title="Fechar o app (Ctrl+Shift+Q)"
        onClick={() => void window.ponto.invoke('app.quit')}
      >
        <Power size={15} weight="bold" />
      </button>
    </div>
  );
}

function Chat({ visible }: { visible: boolean }) {
  const send = useChat((s) => s.send);
  const hasKey = useAppState((s) => s.state?.configuredSecrets.includes('openrouter') ?? true);

  return (
    <div className={`chat solid${visible ? '' : ' hidden'}`}>
      <div className="shortcuts">
        <button type="button" className="shortcut" onClick={() => void send('', 'assist')}>
          <Sparkle size={16} /> Assist
        </button>
        <span className="sep">·</span>
        <button type="button" className="shortcut" onClick={() => void send('', 'whatToSay')}>
          <MagicWand size={16} /> O que devo dizer?
        </button>
        <span className="sep">·</span>
        <button type="button" className="shortcut" onClick={() => void send('', 'followUp')}>
          <ChatDots size={16} /> Perguntas de follow-up
        </button>
      </div>
      {!hasKey && (
        <div className="warning">
          Cadastre sua chave do OpenRouter para o chat funcionar.{' '}
          <button type="button" className="sec-btn" style={{ height: 24, marginLeft: 6 }} onClick={() => openWindow('home', true)}>
            Abrir Home
          </button>
        </div>
      )}
      <Messages />
      <Composer />
    </div>
  );
}

function Messages() {
  const messages = useChat((s) => s.messages);
  const ref = useRef<HTMLDivElement>(null);
  const last = messages.at(-1);

  useLayoutEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom) el.scrollTop = el.scrollHeight;
  }, [last?.text]);

  return (
    <div className="messages" ref={ref}>
      {messages.map((m) => (
        <Bubble key={m.id} m={m} />
      ))}
    </div>
  );
}

function Bubble({ m }: { m: Message }) {
  if (m.automatic) {
    return (
      <div className="msg detected">
        <span className="detected-label">
          <Ear size={12} weight="bold" /> Te perguntaram
        </span>
        {m.text}
      </div>
    );
  }
  if (m.role === 'user') {
    return (
      <div className="msg user">
        {m.images?.length ? (
          <div className="thumbnails">
            {m.images.map((src, i) => (
              <Thumbnail key={i} src={src} />
            ))}
          </div>
        ) : null}
        {m.text}
      </div>
    );
  }
  const streaming = m.state === 'sending' || m.state === 'streaming';
  return (
    <div className={`msg ai${m.state === 'error' ? ' error' : ''}`}>
      {m.state === 'error' ? m.text : m.text ? <Markdown text={m.text} /> : null}
      {m.state === 'error' && m.cap && <UnlockCap />}
      {streaming && <span className="typing" />}
      {m.state === 'ready' && m.usage && (
        <div className="msg-footer">
          {m.usage.model} · {m.usage.inputTokens + m.usage.outputTokens} tokens · US$ {m.usage.costUsd.toFixed(4)}
        </div>
      )}
    </div>
  );
}

function UnlockCap() {
  const [done, setDone] = useState(false);
  const unlock = async (usd: number) => {
    const { conversationId, messages, send } = useChat.getState();
    await api.post(`/chat/conversations/${conversationId}/unlock`, { usd }).catch(() => undefined);
    setDone(true);
    const lastUserMsg = [...messages].reverse().find((x) => x.role === 'user' && !x.automatic);
    if (lastUserMsg?.text) void send(lastUserMsg.text);
  };
  if (done) return <div className="msg-footer">Liberado. Mandei a pergunta de novo.</div>;
  return (
    <div className="cap-actions">
      {[0.5, 1, 2].map((v) => (
        <button type="button" key={v} className="sec-btn" onClick={() => void unlock(v)}>
          + US$ {v.toFixed(2).replace('.', ',')}
        </button>
      ))}
    </div>
  );
}

function Thumbnail({ src }: { src: string }) {
  const [large, setLarge] = useState(false);
  return (
    <button
      type="button"
      className={`thumbnail${large ? ' large' : ''}`}
      aria-label={large ? 'Reduzir imagem' : 'Ampliar imagem'}
      onClick={() => setLarge((g) => !g)}
    >
      <img alt="" src={src} />
    </button>
  );
}

function Composer() {
  const { send, attachments, attach, removeAttachment, web, reasoning, toggleWeb, toggleReasoning, newConversation } = useChat();
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const capture = useCapture();
  const stealth = useStealth();

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [text]);

  const submit = (shortcut: 'assist' | null = null) => {
    void send(text, shortcut);
    setText('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      submit('assist');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const pickImage = async () => {
    const img = await window.ponto.invoke('file.pickImage');
    if (img) attach({ name: img.name, dataUrl: img.dataUrl });
  };

  return (
    <div className="composer">
      {attachments.length > 0 && (
        <div className="attachments">
          {attachments.map((a) => (
            <div className="attachment" key={a.id}>
              <img alt="" src={a.dataUrl} />
              <span>{a.name}</span>
              <button type="button" aria-label="Remover anexo" onClick={() => removeAttachment(a.id)}>
                <X size={12} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={inputRef}
        rows={1}
        value={text}
        placeholder="Pergunte sobre a tela ou a conversa..."
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="hint">
        <kbd>Ctrl</kbd>
        <kbd>↵</kbd> para Assist · <kbd>↵</kbd> para enviar
      </div>
      <div className="toolbar">
        <AgentSelect />
        <ModelSelect />
        <button type="button" className="chip icon-only" aria-pressed={web} aria-label="Pesquisa na web" title="Pesquisa na web" onClick={toggleWeb}>
          <Globe size={15} />
        </button>
        <button
          type="button"
          className="chip icon-only"
          aria-pressed={reasoning}
          aria-label="Raciocínio"
          title="Raciocínio: pensa mais antes de responder (mais lento e caro)"
          onClick={toggleReasoning}
        >
          <Brain size={15} />
        </button>

        <Menu
          trigger={({ open, toggle }) => (
            <button type="button" className="icon-btn" aria-label="Mais opções" aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
              <DotsThree size={18} weight="bold" />
            </button>
          )}
        >
          {(close) => (
            <>
              <button
                type="button"
                className="item"
                role="menuitemcheckbox"
                aria-checked={stealth.enabled}
                onClick={() => void window.ponto.invoke('stealth.set', { enabled: !stealth.enabled })}
              >
                <EyeSlash size={16} />
                <span className="label">
                  Invisibilidade
                  <br />
                  <span className="sub">Some de gravações e da tela compartilhada</span>
                </span>
                <span className={`toggle${stealth.enabled ? ' on' : ''}`} aria-hidden="true" />
              </button>
              <div className="divider" />
              {capture.status !== 'stopped' && (
                <button
                  type="button"
                  className="item"
                  role="menuitem"
                  onClick={() => {
                    void window.ponto.invoke('capture.command', { action: 'stop' });
                    close();
                  }}
                >
                  <Stop size={16} />
                  <span className="label">Encerrar transcrição</span>
                </button>
              )}
              <button type="button" className="item" role="menuitem" onClick={() => { newConversation(); close(); }}>
                <NotePencil size={16} />
                <span className="label">Nova conversa</span>
              </button>
              <button type="button" className="item" role="menuitem" onClick={() => { openWindow('home', true); close(); }}>
                <GearSix size={16} />
                <span className="label">Configurações</span>
              </button>
              <div className="divider" />
              <button type="button" className="item" role="menuitem" onClick={() => void window.ponto.invoke('app.quit')}>
                <SignOut size={16} />
                <span className="label">Fechar o app</span>
              </button>
            </>
          )}
        </Menu>

        <div className="spacer" />
        <ContextWindow />
        <button
          type="button"
          className="icon-btn"
          aria-label="Ler a tela"
          title="Ler a tela (Ctrl+Shift+S)"
          onClick={() => void window.ponto.invoke('screen.read').catch(() => {})}
        >
          <ScanSmiley size={17} />
        </button>
        <button type="button" className="icon-btn" aria-label="Adicionar imagem" title="Adicionar imagem" onClick={() => void pickImage()}>
          <ImageIcon size={17} />
        </button>
        <button type="button" className="send-btn" aria-label="Enviar" onClick={() => submit()}>
          <ArrowRight size={15} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function AgentSelect() {
  const agents = useDomain((s) => s.agents);
  const active = useDomain((s) => s.settings?.activeAgentId ?? 'general');
  const saveSettings = useDomain((s) => s.saveSettings);
  const current = agents.find((a) => a.id === active);

  return (
    <Menu
      className="agents"
      trigger={({ open, toggle }) => (
        <button type="button" className="chip" aria-haspopup="menu" aria-expanded={open} title="Agente" onClick={toggle}>
          <Robot size={14} />
          <span className="chip-text">{current?.name ?? 'Geral'}</span>
          <CaretDown size={12} weight="bold" />
        </button>
      )}
    >
      {(close) => (
        <>
          <div className="menu-title">Selecionar agente</div>
          {agents.map((a) => (
            <button
              type="button"
              key={a.id}
              className="item agent-item"
              role="menuitemradio"
              aria-checked={a.id === active}
              onClick={() => {
                void saveSettings({ activeAgentId: a.id });
                close();
              }}
            >
              <span>
                <span className="name">{a.name}</span>
                <span className="meta">
                  <span className="badge">{a.builtIn ? 'Built-in' : 'Seu'}</span>
                  {a.category}
                </span>
              </span>
              <Check className="check" size={14} weight="bold" />
            </button>
          ))}
          <div className="divider" />
          <button type="button" className="item" role="menuitem" onClick={() => { openWindow('home', true); close(); }}>
            <span className="label">Gerenciar agentes</span>
          </button>
        </>
      )}
    </Menu>
  );
}
