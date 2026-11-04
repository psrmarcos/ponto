import { useState } from 'react';
import { Copy, PencilSimple, Plus, Robot, Trash } from '@phosphor-icons/react';
import type { Agent, AgentInput } from '@ponto/shared';
import { api } from '../../api/client';
import { useDomain } from '../../state/domain';

type Draft = { id: string | null; name: string; description: string; prompt: string; model: string };

const EMPTY_DRAFT: Draft = { id: null, name: '', description: '', prompt: '', model: '' };

/**
 * Agents: built-in agents come with the app and cannot be modified directly
 * (you can duplicate and edit the copy). Custom agents can be created, edited,
 * and deleted. Response format rules (bold idea + short phrasing) apply to all
 * agents; the agent prompt defines the role and context.
 */
export function Agents() {
  const agents = useDomain((s) => s.agents);
  const active = useDomain((s) => s.settings?.activeAgentId);
  const saveSettings = useDomain((s) => s.saveSettings);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const edit = (a: Agent, copy = false) =>
    setDraft({
      id: copy ? null : a.id,
      name: copy ? `${a.name} (cópia)`.slice(0, 60) : a.name,
      description: a.description,
      prompt: a.prompt,
      model: a.model ?? '',
    });

  const save = async () => {
    if (!draft) return;
    const body: AgentInput = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      prompt: draft.prompt.trim(),
      model: draft.model.trim() || null,
    };
    setError(null);
    try {
      if (draft.id) await api.patch(`/agents/${draft.id}`, body);
      else await api.post('/agents', body);
      setDraft(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    await api.delete(`/agents/${id}`).catch((err: Error) => setError(err.message));
    setDeleting(null);
  };

  const canSave = !!draft && draft.name.trim() && draft.prompt.trim();

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ flex: 1 }}>Agentes</h2>
        <button
          type="button"
          className="sec-btn"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          onClick={() => setDraft(EMPTY_DRAFT)}
        >
          <Plus size={14} /> Novo agente
        </button>
      </div>
      <p className="lead">
        O prompt do agente diz quem você é na call e o que importa. O formato da resposta (ideia em negrito e fala curta) vale para todos.
      </p>
      {error && (
        <div className="session-notice" style={{ color: 'var(--red)' }}>
          {error}
        </div>
      )}

      {draft && (
        <div className="group agent-editor">
          <div className="setting-row">
            <div className="main-col">
              <div className="t1">{draft.id ? 'Editar agente' : 'Novo agente'}</div>
            </div>
          </div>
          <label className="agent-field">
            <span>Nome</span>
            <input
              className="text-input"
              maxLength={60}
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              autoFocus
            />
          </label>
          <label className="agent-field">
            <span>Descrição curta</span>
            <input
              className="text-input"
              maxLength={200}
              value={draft.description}
              placeholder="Ex.: Reunião de vendas B2B de software"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
          <label className="agent-field">
            <span>Prompt</span>
            <textarea
              className="text-input agent-prompt"
              maxLength={8000}
              value={draft.prompt}
              placeholder="Ex.: Você me ajuda em calls de vendas. Eu vendo um CRM para clínicas. Quando o cliente trouxer objeção de preço, sugira..."
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
            />
            <small>{draft.prompt.length}/8000</small>
          </label>
          <label className="agent-field">
            <span>Modelo (opcional)</span>
            <input
              className="text-input"
              spellCheck={false}
              autoComplete="off"
              value={draft.model}
              placeholder="Vazio = usa o modelo escolhido no chat"
              onChange={(e) => setDraft({ ...draft, model: e.target.value })}
            />
          </label>
          <div className="session-actions" style={{ padding: '4px 14px 14px' }}>
            <button type="button" className="primary-btn" disabled={!canSave} onClick={() => void save()}>
              Salvar
            </button>
            <button type="button" className="sec-btn" onClick={() => setDraft(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="agents-grid">
        {agents.map((a) => (
          <div className="agent-card" key={a.id}>
            <div className="top">
              <span className="ico">
                <Robot size={16} />
              </span>
              <span className="t1">{a.name}</span>
              <span className="spacer" />
              <span className="tag">{a.builtIn ? 'Do app' : 'Seu'}</span>
            </div>
            <div className="t2">{a.description || 'Sem descrição.'}</div>
            <div className="session-actions">
              <button type="button" className="sec-btn" disabled={a.id === active} onClick={() => void saveSettings({ activeAgentId: a.id })}>
                {a.id === active ? 'Em uso' : 'Usar'}
              </button>
              {!a.builtIn && (
                <button type="button" className="sec-btn" aria-label="Editar" title="Editar" onClick={() => edit(a)}>
                  <PencilSimple size={14} />
                </button>
              )}
              <button type="button" className="sec-btn" aria-label="Duplicar" title="Duplicar e editar a cópia" onClick={() => edit(a, true)}>
                <Copy size={14} />
              </button>
              {!a.builtIn &&
                (deleting === a.id ? (
                  <>
                    <button type="button" className="sec-btn danger" onClick={() => void remove(a.id)}>
                      Apagar
                    </button>
                    <button type="button" className="sec-btn" onClick={() => setDeleting(null)}>
                      Não
                    </button>
                  </>
                ) : (
                  <button type="button" className="sec-btn" aria-label="Apagar" title="Apagar" onClick={() => setDeleting(a.id)}>
                    <Trash size={14} />
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
