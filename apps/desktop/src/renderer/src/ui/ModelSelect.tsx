import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, Check, Cpu, Image as ImageIcon, MagnifyingGlass } from '@phosphor-icons/react';
import type { AiModel } from '@ponto/shared';
import { api } from '../api/client';
import { useDomain } from '../state/domain';
import { Menu } from './Menu';

const RECENT_MODELS_KEY = 'ponto.recentModels';
const MAX_RECENT = 6;
const MAX_RESULTS = 40;

/**
 * Chip in the chat toolbar to switch the response model without opening Home.
 * Updates the default model (applies to subsequent questions across all windows).
 */
export function ModelSelect() {
  const current = useDomain((s) => s.settings?.defaultModel ?? '');
  const saveSettings = useDomain((s) => s.saveSettings);
  const [models, setModels] = useState<AiModel[] | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>(readRecentModels);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    if (models) return;
    setError(false);
    api
      .get<AiModel[]>('/ai/providers/openrouter/models')
      .then(setModels)
      .catch(() => setError(true));
  };
  // Load in the background so the friendly display name appears on the chip.
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map((models ?? []).map((m) => [m.id, m])), [models]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      const ids = [current, ...recent.filter((r) => r !== current)];
      return ids.map((id) => byId.get(id) ?? { id, name: id, contextLength: null, inputPrice: null, outputPrice: null, supportsImages: false });
    }
    const terms = q.split(/\s+/);
    return (models ?? [])
      .filter((m) => terms.every((t) => m.id.toLowerCase().includes(t) || m.name.toLowerCase().includes(t)))
      .slice(0, MAX_RESULTS);
  }, [query, models, byId, current, recent]);

  const choose = (id: string, close: () => void) => {
    const next = [id, ...recent.filter((r) => r !== id)].slice(0, MAX_RECENT);
    setRecent(next);
    writeRecentModels(next);
    if (id !== current) void saveSettings({ defaultModel: id });
    setQuery('');
    close();
  };

  return (
    <Menu
      className="models"
      trigger={({ open, toggle }) => (
        <button
          type="button"
          className="chip"
          aria-haspopup="menu"
          aria-expanded={open}
          title={`Modelo: ${current}`}
          onClick={() => {
            toggle();
            load();
            if (!open) setTimeout(() => inputRef.current?.focus(), 0);
          }}
        >
          <Cpu size={14} />
          <span className="chip-text">{shortName(byId.get(current)?.name ?? current)}</span>
          <CaretDown size={12} weight="bold" />
        </button>
      )}
    >
      {(close) => (
        <>
          <label className="model-search">
            <MagnifyingGlass size={14} />
            <input
              ref={inputRef}
              value={query}
              placeholder={models ? `Buscar entre ${models.length} modelos` : 'Buscar modelo'}
              spellCheck={false}
              aria-label="Buscar modelo"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && list[0]) choose(list[0].id, close);
              }}
            />
          </label>
          {!query.trim() && <div className="menu-title">Atual e recentes</div>}
          <div className="model-list">
            {list.map((m) => (
              <button
                type="button"
                key={m.id}
                className="item agent-item"
                role="menuitemradio"
                aria-checked={m.id === current}
                onClick={() => choose(m.id, close)}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="name">{shortName(m.name)}</span>
                  <span className="meta">
                    <span className="model-id">{m.id}</span>
                    {m.inputPrice !== null && m.outputPrice !== null && (
                      <span title="Dólares por 1 milhão de tokens (entrada / saída)">
                        ${fmtPrice(m.inputPrice)} / ${fmtPrice(m.outputPrice)}
                      </span>
                    )}
                    {m.supportsImages && <ImageIcon size={12} aria-label="Aceita imagem" />}
                  </span>
                </span>
                <Check className="check" size={14} weight="bold" />
              </button>
            ))}
            {query.trim() && models && list.length === 0 && <p className="menu-empty">Nenhum modelo com esse nome.</p>}
            {error && <p className="menu-empty">Não consegui carregar a lista. Confira a chave em Perfil.</p>}
            {!models && !error && query.trim() && <p className="menu-empty">Carregando modelos…</p>}
          </div>
        </>
      )}
    </Menu>
  );
}

/** "Google: Gemini 3.8 Flash" becomes "Gemini 3.8 Flash"; a raw id becomes the part after the slash. */
function shortName(name: string): string {
  const withoutProvider = name.includes(': ') ? name.slice(name.indexOf(': ') + 2) : name;
  return withoutProvider.includes('/') ? withoutProvider.slice(withoutProvider.indexOf('/') + 1) : withoutProvider;
}

const fmtPrice = (v: number) => (v === 0 ? '0' : v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 0));

function readRecentModels(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_MODELS_KEY) ?? localStorage.getItem('ponto.modelosRecentes') ?? '[]';
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

function writeRecentModels(ids: string[]): void {
  try {
    localStorage.setItem(RECENT_MODELS_KEY, JSON.stringify(ids));
  } catch {
    /* storage unavailable: simply don't persist recent models */
  }
}
