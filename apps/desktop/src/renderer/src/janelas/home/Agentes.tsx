import { useState } from 'react';
import { Copy, PencilSimple, Plus, Robot, Trash } from '@phosphor-icons/react';
import type { Agente, EdicaoAgente } from '@ponto/shared';
import { api } from '../../api/cliente';
import { useDominio } from '../../estado/dominio';

type Rascunho = { id: string | null; nome: string; descricao: string; prompt: string; modelo: string };

const VAZIO: Rascunho = { id: null, nome: '', descricao: '', prompt: '', modelo: '' };

/**
 * Agentes: os embutidos vêm com o app e não mudam (dá para duplicar e editar a
 * cópia). Os seus dá para criar, editar e apagar. As regras de formato da
 * resposta (ideia em negrito + fala curta) valem para todos; o prompt do agente
 * diz o papel e o contexto.
 */
export function Agentes() {
  const agentes = useDominio((s) => s.agentes);
  const ativo = useDominio((s) => s.configuracoes?.agenteAtivo);
  const salvarConfig = useDominio((s) => s.salvarConfiguracoes);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const editar = (a: Agente, copia = false) =>
    setRascunho({
      id: copia ? null : a.id,
      nome: copia ? `${a.nome} (cópia)`.slice(0, 60) : a.nome,
      descricao: a.descricao,
      prompt: a.prompt,
      modelo: a.modelo ?? '',
    });

  const salvar = async () => {
    if (!rascunho) return;
    const corpo: EdicaoAgente = {
      nome: rascunho.nome.trim(),
      descricao: rascunho.descricao.trim(),
      prompt: rascunho.prompt.trim(),
      modelo: rascunho.modelo.trim() || null,
    };
    setErro(null);
    try {
      if (rascunho.id) await api.patch(`/agentes/${rascunho.id}`, corpo);
      else await api.post('/agentes', corpo);
      setRascunho(null);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const apagar = async (id: string) => {
    await api.delete(`/agentes/${id}`).catch((e: Error) => setErro(e.message));
    setApagando(null);
  };

  const podeSalvar = !!rascunho && rascunho.nome.trim() && rascunho.prompt.trim();

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h2 style={{ flex: 1 }}>Agentes</h2>
        <button type="button" className="btn-sec" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => setRascunho(VAZIO)}>
          <Plus size={14} /> Novo agente
        </button>
      </div>
      <p className="lead">O prompt do agente diz quem você é na call e o que importa. O formato da resposta (ideia em negrito e fala curta) vale para todos.</p>
      {erro && <div className="sessao-aviso" style={{ color: 'var(--vermelho)' }}>{erro}</div>}

      {rascunho && (
        <div className="grupo editor-agente">
          <div className="ajuste">
            <div className="principal">
              <div className="t1">{rascunho.id ? 'Editar agente' : 'Novo agente'}</div>
            </div>
          </div>
          <label className="campo-agente">
            <span>Nome</span>
            <input className="campo-texto" maxLength={60} value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} autoFocus />
          </label>
          <label className="campo-agente">
            <span>Descrição curta</span>
            <input className="campo-texto" maxLength={200} value={rascunho.descricao} placeholder="Ex.: Reunião de vendas B2B de software" onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} />
          </label>
          <label className="campo-agente">
            <span>Prompt</span>
            <textarea
              className="campo-texto prompt-agente"
              maxLength={8000}
              value={rascunho.prompt}
              placeholder="Ex.: Você me ajuda em calls de vendas. Eu vendo um CRM para clínicas. Quando o cliente trouxer objeção de preço, sugira..."
              onChange={(e) => setRascunho({ ...rascunho, prompt: e.target.value })}
            />
            <small>{rascunho.prompt.length}/8000</small>
          </label>
          <label className="campo-agente">
            <span>Modelo (opcional)</span>
            <input
              className="campo-texto"
              spellCheck={false}
              autoComplete="off"
              value={rascunho.modelo}
              placeholder="Vazio = usa o modelo escolhido no chat"
              onChange={(e) => setRascunho({ ...rascunho, modelo: e.target.value })}
            />
          </label>
          <div className="sessao-acoes" style={{ padding: '4px 14px 14px' }}>
            <button type="button" className="botao-primario" disabled={!podeSalvar} onClick={() => void salvar()}>
              Salvar
            </button>
            <button type="button" className="btn-sec" onClick={() => setRascunho(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="agentes-grid">
        {agentes.map((a) => (
          <div className="agente-card" key={a.id}>
            <div className="topo">
              <span className="ico">
                <Robot size={16} />
              </span>
              <span className="t1">{a.nome}</span>
              <span className="espaco" />
              <span className="tag">{a.embutido ? 'Do app' : 'Seu'}</span>
            </div>
            <div className="t2">{a.descricao || 'Sem descrição.'}</div>
            <div className="sessao-acoes">
              <button type="button" className="btn-sec" disabled={a.id === ativo} onClick={() => void salvarConfig({ agenteAtivo: a.id })}>
                {a.id === ativo ? 'Em uso' : 'Usar'}
              </button>
              {!a.embutido && (
                <button type="button" className="btn-sec" aria-label="Editar" title="Editar" onClick={() => editar(a)}>
                  <PencilSimple size={14} />
                </button>
              )}
              <button type="button" className="btn-sec" aria-label="Duplicar" title="Duplicar e editar a cópia" onClick={() => editar(a, true)}>
                <Copy size={14} />
              </button>
              {!a.embutido &&
                (apagando === a.id ? (
                  <>
                    <button type="button" className="btn-sec perigo" onClick={() => void apagar(a.id)}>
                      Apagar
                    </button>
                    <button type="button" className="btn-sec" onClick={() => setApagando(null)}>
                      Não
                    </button>
                  </>
                ) : (
                  <button type="button" className="btn-sec" aria-label="Apagar" title="Apagar" onClick={() => setApagando(a.id)}>
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
