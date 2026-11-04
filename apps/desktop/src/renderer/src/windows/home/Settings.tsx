import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { STT_PROVIDERS_INFO, SttProviderId, type AiModel, type ShortcutAction } from '@ponto/shared';
import { api } from '../../api/client';
import { useAppState, useStealth } from '../../state/app';
import { useDomain } from '../../state/domain';
import { Toggle } from '../../ui/Toggle';
import { LANGUAGES } from '../../ui/languages';
import { Select } from '../../ui/Select';

const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  toggleStealth: 'Ligar/desligar invisibilidade',
  toggleChat: 'Mostrar/esconder o chat',
  toggleTranscription: 'Painel de transcrição',
  toggleScreen: 'Painel da tela',
  toggleHome: 'Abrir a Home',
  readScreen: 'Ler a tela agora',
  askSelection: 'Perguntar sobre o texto selecionado',
  toggleCapture: 'Gravar / pausar a transcrição',
  quit: 'Fechar o app',
};

export function Settings() {
  const settings = useDomain((s) => s.settings);
  const saveSettings = useDomain((s) => s.saveSettings);
  const stealth = useStealth();
  const models = useModels();

  if (!settings) return <p className="lead">Carregando…</p>;

  return (
    <>
      <h2>Configurações</h2>

      <span className="group-title">Inteligência</span>
      <div className="group">
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Modelo das respostas</div>
            <div className="t2">
              Quem escreve no chat. Pode ser qualquer modelo do OpenRouter. {priceInfo(models, settings.defaultModel)}
            </div>
          </div>
          <ModelField value={settings.defaultModel} models={models} onSave={(m) => void saveSettings({ defaultModel: m })} />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Modelo rápido</div>
            <div className="t2">
              Tarefas internas e baratas (títulos, resumir o histórico). {priceInfo(models, settings.fastModel)}
            </div>
          </div>
          <ModelField value={settings.fastModel} models={models} onSave={(m) => void saveSettings({ fastModel: m })} />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Teto de gasto por conversa</div>
            <div className="t2">Para de chamar a IA ao chegar nesse valor. 0 desliga o teto.</div>
          </div>
          <span className="option-label">US$</span>
          <input
            className="text-input"
            style={{ width: 90 }}
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={settings.sessionBudgetUsd}
            aria-label="Teto de gasto em dólares"
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0 && v <= 100) void saveSettings({ sessionBudgetUsd: v });
            }}
          />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Sugestões automáticas</div>
            <div className="t2">O copiloto responde sozinho quando surgir uma pergunta (com a transcrição).</div>
          </div>
          <Toggle
            checked={settings.autoSuggestions}
            label="Sugestões automáticas"
            onChange={(v) => void saveSettings({ autoSuggestions: v })}
          />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Resumo ao vivo</div>
            <div className="t2">A aba Resumo da Transcrição se atualiza sozinha durante a call (modelo rápido, centavos por hora).</div>
          </div>
          <Toggle checked={settings.liveSummary} label="Resumo ao vivo" onChange={(v) => void saveSettings({ liveSummary: v })} />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Insights ao vivo</div>
            <div className="t2">Dicas, oportunidades, riscos e como está sua voz, só quando valer a pena.</div>
          </div>
          <Toggle checked={settings.liveInsights} label="Insights ao vivo" onChange={(v) => void saveSettings({ liveInsights: v })} />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Pesquisa na web por padrão</div>
            <div className="t2">Pode ser ligada em cada pergunta pelo chip Web. Cada busca custa tokens.</div>
          </div>
          <Toggle checked={settings.webByDefault} label="Web por padrão" onChange={(v) => void saveSettings({ webByDefault: v })} />
        </div>
      </div>

      <span className="group-title">Transcrição</span>
      <div className="group">
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Serviço de transcrição</div>
            <div className="t2">
              {settings.sttProvider === 'openrouter'
                ? 'Usa a mesma chave do chat. Whisper turbo custa cerca de US$ 0,01 por hora de call.'
                : 'Usa a chave do Deepgram (cadastre em Perfil). Cerca de US$ 0,26 por hora de call.'}
            </div>
          </div>
          <Select
            label="Serviço de transcrição"
            align="right"
            value={settings.sttProvider}
            options={SttProviderId.options.map((p) => ({ value: p, label: STT_PROVIDERS_INFO[p].name }))}
            onChange={(p) => void saveSettings({ sttProvider: p, sttModel: STT_PROVIDERS_INFO[p].defaultModel })}
          />
        </div>
        {settings.sttProvider === 'deepgram' && (
          <div className="setting-row">
            <div className="main-col">
              <div className="t1">Texto enquanto a pessoa fala</div>
              <div className="t2">
                Streaming: o balão aparece e cresce em tempo real. Só manda o áudio quando há fala. Cerca de US$ 0,46 por hora de fala por
                canal. Desligado, cada fala chega uns 2 s depois de terminar.
              </div>
            </div>
            <Toggle
              checked={settings.sttStreaming}
              label="Texto enquanto a pessoa fala"
              onChange={(v) => void saveSettings({ sttStreaming: v })}
            />
          </div>
        )}
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Modelo de transcrição</div>
            <div className="t2">Padrão: {STT_PROVIDERS_INFO[settings.sttProvider].defaultModel}.</div>
          </div>
          <input
            className="text-input"
            key={settings.sttProvider}
            defaultValue={settings.sttModel}
            spellCheck={false}
            aria-label="Modelo de transcrição"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== settings.sttModel) void saveSettings({ sttModel: v });
            }}
          />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Idioma da conversa</div>
            <div className="t2">Fixar o idioma deixa a transcrição mais precisa que a detecção automática.</div>
          </div>
          <Select
            label="Idioma da conversa"
            align="right"
            value={settings.language}
            options={LANGUAGES}
            onChange={(v) => void saveSettings({ language: v })}
          />
        </div>
      </div>

      <span className="group-title">Privacidade e janelas</span>
      <div className="group">
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Invisível em gravações e prints</div>
            <div className="t2">
              {stealth.supported
                ? 'Vale para todas as janelas do Ponto, inclusive esta.'
                : 'Este sistema operacional não permite esconder janelas de gravações.'}
            </div>
          </div>
          <Toggle
            checked={stealth.enabled}
            label="Invisibilidade"
            disabled={!stealth.supported}
            onChange={(enabled) => void window.ponto.invoke('stealth.set', { enabled })}
          />
        </div>
      </div>

      <Shortcuts />
    </>
  );
}

function useModels(): AiModel[] {
  const [models, setModels] = useState<AiModel[]>([]);
  useEffect(() => {
    let alive = true;
    void api
      .get<AiModel[]>('/ai/providers/openrouter/models')
      .then((m) => alive && setModels(m))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return models;
}

function priceInfo(models: AiModel[], id: string): string {
  const m = models.find((x) => x.id === id);
  if (!m || m.inputPrice === null || m.outputPrice === null) return '';
  return `US$ ${fmt(m.inputPrice)} entrada / ${fmt(m.outputPrice)} saída por 1M tokens.`;
}
const fmt = (v: number) => (v < 1 ? v.toFixed(3) : v.toFixed(2));

function ModelField({ value, models, onSave }: { value: string; models: AiModel[]; onSave: (m: string) => void }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => setText(value), [value]);
  const invalid = models.length > 0 && !models.some((m) => m.id === text);
  const suggestions = useMemo(() => {
    const terms = text.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length || !invalid) return [];
    return models
      .filter((m) => terms.every((t) => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)))
      .slice(0, 8);
  }, [text, models, invalid]);
  const choose = (id: string) => {
    setText(id);
    setOpen(false);
    if (id !== value) onSave(id);
  };

  return (
    <div className="anchor">
      <input
        className={`text-input${invalid ? ' error' : ''}`}
        value={text}
        spellCheck={false}
        autoComplete="off"
        aria-label="Modelo"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setText(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && suggestions[0]) choose(suggestions[0].id);
          if (e.key === 'Escape') setOpen(false);
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
          if (!invalid && text !== value) onSave(text);
        }}
      />
      <div className={`menu select-menu right${open && suggestions.length ? ' open' : ''}`} role="listbox">
        {suggestions.map((m) => (
          <button
            type="button"
            key={m.id}
            className="item"
            role="option"
            aria-selected={false}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(m.id)}
          >
            <span className="label">
              {m.name}
              <span className="sub" style={{ display: 'block' }}>
                {m.id}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Shortcuts() {
  const shortcuts = useAppState((s) => s.state?.shortcuts);
  const failedShortcuts = useAppState((s) => s.state?.failedShortcuts ?? []);
  if (!shortcuts) return null;
  return (
    <>
      <span className="group-title">Atalhos (funcionam em qualquer app)</span>
      <div className="group">
        {(Object.keys(SHORTCUT_LABELS) as ShortcutAction[]).map((action) => (
          <div className="setting-row" key={action}>
            <div className="main-col">
              <div className="t1">{SHORTCUT_LABELS[action]}</div>
              {failedShortcuts.includes(action) && (
                <div className="t2" style={{ color: 'var(--red)' }}>
                  Outro programa já usa este atalho.
                </div>
              )}
            </div>
            <ShortcutRecorder action={action} current={shortcuts[action] ?? ''} />
          </div>
        ))}
        <div className="setting-row">
          <div className="main-col">
            <div className="t2">Clique num atalho e aperte a nova combinação. Esc cancela.</div>
          </div>
          <button type="button" className="sec-btn" onClick={() => void window.ponto.invoke('shortcuts.resetDefaults')}>
            Restaurar padrão
          </button>
        </div>
      </div>
    </>
  );
}

function ShortcutRecorder({ action, current }: { action: ShortcutAction; current: string }) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onKeyDown = async (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    e.preventDefault();
    if (e.key === 'Escape') return setRecording(false);
    const accel = toAccelerator(e);
    if (!accel) return;
    setRecording(false);
    const res = await window.ponto.invoke('shortcuts.set', { action, accelerator: accel });
    setError(res.ok ? null : (res.error ?? 'Não foi possível usar esse atalho.'));
  };

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        className={`sec-btn shortcut-recorder${recording ? ' recording' : ''}`}
        onClick={() => setRecording(true)}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => void onKeyDown(e)}
      >
        {recording ? (
          'Aperte as teclas…'
        ) : (
          <span className="keys">
            {readableKeys(current).map((k, i) => (
              <kbd key={i}>{k}</kbd>
            ))}
          </span>
        )}
      </button>
      {error && <span style={{ fontSize: 11.5, color: 'var(--red)' }}>{error}</span>}
    </span>
  );
}

function toAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k) || mods.length === 0) return null;
  let key: string;
  if (/^[a-z0-9]$/i.test(k)) key = k.toUpperCase();
  else if (/^F\d{1,2}$/.test(k)) key = k;
  else if (k === ' ') key = 'Space';
  else if (k === 'Enter') key = 'Enter';
  else if (k.startsWith('Arrow')) key = k.slice(5);
  else if (/^Digit\d$/.test(e.code)) key = e.code.slice(5);
  else if (/^Key[A-Z]$/.test(e.code)) key = e.code.slice(3);
  else return null;
  return [...mods, key].join('+');
}

const KEY_NAMES: Record<string, string> = {
  CommandOrControl: 'Ctrl',
  Control: 'Ctrl',
  Shift: '⇧ Shift',
  Space: 'Espaço',
  Up: '↑',
  Down: '↓',
  Left: '←',
  Right: '→',
};

function readableKeys(accel: string): string[] {
  return accel
    .split('+')
    .filter(Boolean)
    .map((k) => KEY_NAMES[k] ?? k);
}
