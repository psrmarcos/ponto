import { useEffect, useMemo, useRef, useState } from 'react';
import { CaretDown, Check, Cpu, Image as IconeImagem, MagnifyingGlass } from '@phosphor-icons/react';
import type { ModeloIa } from '@ponto/shared';
import { api } from '../api/cliente';
import { useDominio } from '../estado/dominio';
import { Menu } from './Menu';

const CHAVE_RECENTES = 'ponto.modelosRecentes';
const MAX_RECENTES = 6;
const MAX_RESULTADOS = 40;

/**
 * Chip na barra do chat para trocar o modelo das respostas sem abrir a Home.
 * Troca o modelo padrão (vale para as próximas perguntas em todas as janelas).
 */
export function SeletorModelo() {
  const atual = useDominio((s) => s.configuracoes?.modeloPadrao ?? '');
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const [modelos, setModelos] = useState<ModeloIa[] | null>(null);
  const [erro, setErro] = useState(false);
  const [busca, setBusca] = useState('');
  const [recentes, setRecentes] = useState<string[]>(lerRecentes);
  const campo = useRef<HTMLInputElement>(null);

  const carregar = () => {
    if (modelos) return;
    setErro(false);
    api
      .get<ModeloIa[]>('/ia/provedores/openrouter/modelos')
      .then(setModelos)
      .catch(() => setErro(true));
  };
  // Carrega em segundo plano para o nome bonito aparecer no chip.
  useEffect(carregar, []); // eslint-disable-line react-hooks/exhaustive-deps

  const porId = useMemo(() => new Map((modelos ?? []).map((m) => [m.id, m])), [modelos]);

  const lista = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) {
      const ids = [atual, ...recentes.filter((r) => r !== atual)];
      return ids.map((id) => porId.get(id) ?? { id, nome: id, contexto: null, precoEntrada: null, precoSaida: null, aceitaImagem: false });
    }
    const termos = q.split(/\s+/);
    return (modelos ?? [])
      .filter((m) => termos.every((t) => m.id.toLowerCase().includes(t) || m.nome.toLowerCase().includes(t)))
      .slice(0, MAX_RESULTADOS);
  }, [busca, modelos, porId, atual, recentes]);

  const escolher = (id: string, fechar: () => void) => {
    const novos = [id, ...recentes.filter((r) => r !== id)].slice(0, MAX_RECENTES);
    setRecentes(novos);
    gravarRecentes(novos);
    if (id !== atual) void salvar({ modeloPadrao: id });
    setBusca('');
    fechar();
  };

  return (
    <Menu
      className="modelos"
      botao={({ aberto, alternar }) => (
        <button
          type="button"
          className="chip"
          aria-haspopup="menu"
          aria-expanded={aberto}
          title={`Modelo: ${atual}`}
          onClick={() => {
            alternar();
            carregar();
            if (!aberto) setTimeout(() => campo.current?.focus(), 0);
          }}
        >
          <Cpu size={14} />
          <span className="chip-texto">{nomeCurto(porId.get(atual)?.nome ?? atual)}</span>
          <CaretDown size={12} weight="bold" />
        </button>
      )}
    >
      {(fechar) => (
        <>
          <label className="busca-modelo">
            <MagnifyingGlass size={14} />
            <input
              ref={campo}
              value={busca}
              placeholder={modelos ? `Buscar entre ${modelos.length} modelos` : 'Buscar modelo'}
              spellCheck={false}
              aria-label="Buscar modelo"
              onChange={(e) => setBusca(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && lista[0]) escolher(lista[0].id, fechar);
              }}
            />
          </label>
          {!busca.trim() && <div className="menu-titulo">Atual e recentes</div>}
          <div className="lista-modelos">
            {lista.map((m) => (
              <button
                type="button"
                key={m.id}
                className="item agente"
                role="menuitemradio"
                aria-checked={m.id === atual}
                onClick={() => escolher(m.id, fechar)}
              >
                <span style={{ minWidth: 0 }}>
                  <span className="nome">{nomeCurto(m.nome)}</span>
                  <span className="meta">
                    <span className="id-modelo">{m.id}</span>
                    {m.precoEntrada !== null && m.precoSaida !== null && (
                      <span title="Dólares por 1 milhão de tokens (entrada / saída)">
                        ${fmt(m.precoEntrada)} / ${fmt(m.precoSaida)}
                      </span>
                    )}
                    {m.aceitaImagem && <IconeImagem size={12} aria-label="Aceita imagem" />}
                  </span>
                </span>
                <Check className="check" size={14} weight="bold" />
              </button>
            ))}
            {busca.trim() && modelos && lista.length === 0 && <p className="vazio-menu">Nenhum modelo com esse nome.</p>}
            {erro && <p className="vazio-menu">Não consegui carregar a lista. Confira a chave em Perfil.</p>}
            {!modelos && !erro && busca.trim() && <p className="vazio-menu">Carregando modelos…</p>}
          </div>
        </>
      )}
    </Menu>
  );
}

/** "Google: Gemini 3.8 Flash" vira "Gemini 3.8 Flash"; um id cru vira o trecho depois da barra. */
function nomeCurto(nome: string): string {
  const semProvedor = nome.includes(': ') ? nome.slice(nome.indexOf(': ') + 2) : nome;
  return semProvedor.includes('/') ? semProvedor.slice(semProvedor.indexOf('/') + 1) : semProvedor;
}

const fmt = (v: number) => (v === 0 ? '0' : v < 1 ? v.toFixed(2) : v.toFixed(v < 10 ? 2 : 0));

function lerRecentes(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENTES) : [];
  } catch {
    return [];
  }
}

function gravarRecentes(ids: string[]): void {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(ids));
  } catch {
    /* sem armazenamento: só não lembra os recentes */
  }
}
