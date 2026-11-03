import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import type { AcaoAtalho, ModeloIa } from '@ponto/shared';
import { api } from '../../api/cliente';
import { useEstadoApp, useStealth } from '../../estado/app';
import { useDominio } from '../../estado/dominio';
import { Chave } from '../../ui/Chave';

const ROTULOS_ATALHO: Record<AcaoAtalho, string> = {
  alternarStealth: 'Ligar/desligar invisibilidade',
  alternarChat: 'Mostrar/esconder o chat',
  alternarTranscricao: 'Painel de transcrição',
  alternarTela: 'Painel da tela',
  alternarHome: 'Abrir a Home',
  lerTela: 'Ler a tela agora',
};

export function Configuracoes() {
  const config = useDominio((s) => s.configuracoes);
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const stealth = useStealth();
  const modelos = useModelos();

  if (!config) return <p className="lead">Carregando…</p>;

  return (
    <>
      <h2>Configurações</h2>

      <span className="grupo-titulo">Inteligência</span>
      <div className="grupo">
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Modelo das respostas</div>
            <div className="t2">Quem escreve no chat. Pode ser qualquer modelo do OpenRouter. {preco(modelos, config.modeloPadrao)}</div>
          </div>
          <CampoModelo valor={config.modeloPadrao} modelos={modelos} aoSalvar={(m) => void salvar({ modeloPadrao: m })} />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Modelo rápido</div>
            <div className="t2">Tarefas internas e baratas (títulos, resumir o histórico). {preco(modelos, config.modeloRapido)}</div>
          </div>
          <CampoModelo valor={config.modeloRapido} modelos={modelos} aoSalvar={(m) => void salvar({ modeloRapido: m })} />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Teto de gasto por conversa</div>
            <div className="t2">Para de chamar a IA ao chegar nesse valor. 0 desliga o teto.</div>
          </div>
          <span className="opcao">US$</span>
          <input
            className="campo-texto"
            style={{ width: 90 }}
            type="number"
            min={0}
            max={100}
            step={0.5}
            defaultValue={config.tetoSessaoUsd}
            aria-label="Teto de gasto em dólares"
            onBlur={(e) => {
              const v = Number(e.target.value);
              if (Number.isFinite(v) && v >= 0 && v <= 100) void salvar({ tetoSessaoUsd: v });
            }}
          />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Sugestões automáticas</div>
            <div className="t2">O copiloto responde sozinho quando surgir uma pergunta (com a transcrição).</div>
          </div>
          <Chave ligada={config.sugestoesAutomaticas} rotulo="Sugestões automáticas" aoMudar={(v) => void salvar({ sugestoesAutomaticas: v })} />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Pesquisa na web por padrão</div>
            <div className="t2">Pode ser ligada em cada pergunta pelo chip Web. Cada busca custa tokens.</div>
          </div>
          <Chave ligada={config.webPorPadrao} rotulo="Web por padrão" aoMudar={(v) => void salvar({ webPorPadrao: v })} />
        </div>
      </div>

      <span className="grupo-titulo">Privacidade e janelas</span>
      <div className="grupo">
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Invisível em gravações e prints</div>
            <div className="t2">
              {stealth.suportado
                ? 'Vale para todas as janelas do Ponto, inclusive esta.'
                : 'Este sistema operacional não permite esconder janelas de gravações.'}
            </div>
          </div>
          <Chave
            ligada={stealth.ligado}
            rotulo="Invisibilidade"
            desabilitada={!stealth.suportado}
            aoMudar={(ligado) => void window.ponto.invocar('stealth.definir', { ligado })}
          />
        </div>
      </div>

      <Atalhos />
    </>
  );
}

function useModelos(): ModeloIa[] {
  const [modelos, setModelos] = useState<ModeloIa[]>([]);
  useEffect(() => {
    let vivo = true;
    void api
      .get<ModeloIa[]>('/ia/provedores/openrouter/modelos')
      .then((m) => vivo && setModelos(m))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  return modelos;
}

function preco(modelos: ModeloIa[], id: string): string {
  const m = modelos.find((x) => x.id === id);
  if (!m || m.precoEntrada === null || m.precoSaida === null) return '';
  return `US$ ${fmt(m.precoEntrada)} entrada / ${fmt(m.precoSaida)} saída por 1M tokens.`;
}
const fmt = (v: number) => (v < 1 ? v.toFixed(3) : v.toFixed(2));

function CampoModelo({ valor, modelos, aoSalvar }: { valor: string; modelos: ModeloIa[]; aoSalvar: (m: string) => void }) {
  const [texto, setTexto] = useState(valor);
  useEffect(() => setTexto(valor), [valor]);
  const id = useMemo(() => `modelos-${Math.random().toString(36).slice(2)}`, []);
  const invalido = modelos.length > 0 && !modelos.some((m) => m.id === texto);

  return (
    <>
      <input
        className={`campo-texto${invalido ? ' erro' : ''}`}
        list={id}
        value={texto}
        spellCheck={false}
        aria-label="Modelo"
        onChange={(e) => setTexto(e.target.value)}
        onBlur={() => {
          if (!invalido && texto !== valor) aoSalvar(texto);
        }}
      />
      <datalist id={id}>
        {modelos.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nome}
          </option>
        ))}
      </datalist>
    </>
  );
}

function Atalhos() {
  const atalhos = useEstadoApp((s) => s.estado?.atalhos);
  const comErro = useEstadoApp((s) => s.estado?.atalhosComErro ?? []);
  if (!atalhos) return null;
  return (
    <>
      <span className="grupo-titulo">Atalhos (funcionam em qualquer app)</span>
      <div className="grupo">
        {(Object.keys(ROTULOS_ATALHO) as AcaoAtalho[]).map((acao) => (
          <div className="ajuste" key={acao}>
            <div className="principal">
              <div className="t1">{ROTULOS_ATALHO[acao]}</div>
              {comErro.includes(acao) && <div className="t2" style={{ color: 'var(--vermelho)' }}>Outro programa já usa este atalho.</div>}
            </div>
            <GravadorAtalho acao={acao} atual={atalhos[acao] ?? ''} />
          </div>
        ))}
        <div className="ajuste">
          <div className="principal">
            <div className="t2">Clique num atalho e aperte a nova combinação. Esc cancela.</div>
          </div>
          <button type="button" className="btn-sec" onClick={() => void window.ponto.invocar('atalhos.restaurarPadrao')}>
            Restaurar padrão
          </button>
        </div>
      </div>
    </>
  );
}

function GravadorAtalho({ acao, atual }: { acao: AcaoAtalho; atual: string }) {
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const tecla = async (e: KeyboardEvent<HTMLButtonElement>) => {
    if (!gravando) return;
    e.preventDefault();
    if (e.key === 'Escape') return setGravando(false);
    const accel = paraAccelerator(e);
    if (!accel) return; // só modificadores até agora
    setGravando(false);
    const r = await window.ponto.invocar('atalhos.definir', { acao, accelerator: accel });
    setErro(r.ok ? null : (r.erro ?? 'Não foi possível usar esse atalho.'));
  };

  return (
    <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
      <button
        type="button"
        className={`btn-sec gravador-atalho${gravando ? ' gravando' : ''}`}
        onClick={() => setGravando(true)}
        onBlur={() => setGravando(false)}
        onKeyDown={(e) => void tecla(e)}
      >
        {gravando ? 'Aperte as teclas…' : legivel(atual)}
      </button>
      {erro && <span style={{ fontSize: 11.5, color: 'var(--vermelho)' }}>{erro}</span>}
    </span>
  );
}

/** Converte o evento de teclado para o formato Accelerator do Electron. Exige ao menos um modificador. */
function paraAccelerator(e: KeyboardEvent): string | null {
  const mods: string[] = [];
  if (e.ctrlKey || e.metaKey) mods.push('CommandOrControl');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  const k = e.key;
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(k) || mods.length === 0) return null;
  let tecla: string;
  if (/^[a-z0-9]$/i.test(k)) tecla = k.toUpperCase();
  else if (/^F\d{1,2}$/.test(k)) tecla = k;
  else if (k === ' ') tecla = 'Space';
  else if (k === 'Enter') tecla = 'Enter';
  else if (k.startsWith('Arrow')) tecla = k.slice(5);
  else if (/^Digit\d$/.test(e.code)) tecla = e.code.slice(5);
  else if (/^Key[A-Z]$/.test(e.code)) tecla = e.code.slice(3);
  else return null;
  return [...mods, tecla].join('+');
}

function legivel(accel: string): string {
  return accel.replace('CommandOrControl', 'Ctrl').split('+').join(' + ');
}
