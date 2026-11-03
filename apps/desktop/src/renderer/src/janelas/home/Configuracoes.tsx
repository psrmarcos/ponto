import { useEffect, useMemo, useState, type KeyboardEvent } from 'react';
import { INFO_PROVEDORES_STT, IdProvedorStt, type AcaoAtalho, type Configuracoes as Config, type ModeloIa } from '@ponto/shared';
import { api } from '../../api/cliente';
import { useEstadoApp, useStealth } from '../../estado/app';
import { useDominio } from '../../estado/dominio';
import { Chave } from '../../ui/Chave';
import { IDIOMAS } from '../../ui/idiomas';
import { Seletor } from '../../ui/Seletor';

const ROTULOS_ATALHO: Record<AcaoAtalho, string> = {
  alternarStealth: 'Ligar/desligar invisibilidade',
  alternarChat: 'Mostrar/esconder o chat',
  alternarTranscricao: 'Painel de transcrição',
  alternarTela: 'Painel da tela',
  alternarHome: 'Abrir a Home',
  lerTela: 'Ler a tela agora',
  alternarCaptura: 'Gravar / pausar a transcrição',
  sair: 'Fechar o app',
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
            <div className="t1">Resumo ao vivo</div>
            <div className="t2">A aba Resumo da Transcrição se atualiza sozinha durante a call (modelo rápido, centavos por hora).</div>
          </div>
          <Chave ligada={config.resumoAoVivo} rotulo="Resumo ao vivo" aoMudar={(v) => void salvar({ resumoAoVivo: v })} />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Insights ao vivo</div>
            <div className="t2">Dicas, oportunidades, riscos e como está sua voz, só quando valer a pena.</div>
          </div>
          <Chave ligada={config.insightsAoVivo} rotulo="Insights ao vivo" aoMudar={(v) => void salvar({ insightsAoVivo: v })} />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Pesquisa na web por padrão</div>
            <div className="t2">Pode ser ligada em cada pergunta pelo chip Web. Cada busca custa tokens.</div>
          </div>
          <Chave ligada={config.webPorPadrao} rotulo="Web por padrão" aoMudar={(v) => void salvar({ webPorPadrao: v })} />
        </div>
      </div>

      <span className="grupo-titulo">Transcrição</span>
      <div className="grupo">
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Serviço de transcrição</div>
            <div className="t2">
              {config.provedorStt === 'openrouter'
                ? 'Usa a mesma chave do chat. Whisper turbo custa cerca de US$ 0,01 por hora de call.'
                : 'Usa a chave do Deepgram (cadastre em Perfil). Cerca de US$ 0,26 por hora de call.'}
            </div>
          </div>
          <Seletor
            rotulo="Serviço de transcrição"
            alinhar="direita"
            valor={config.provedorStt}
            opcoes={IdProvedorStt.options.map((p) => ({ valor: p, rotulo: INFO_PROVEDORES_STT[p].nome }))}
            aoMudar={(p) => void salvar({ provedorStt: p, modeloStt: INFO_PROVEDORES_STT[p].modeloPadrao })}
          />
        </div>
        {config.provedorStt === 'deepgram' && (
          <div className="ajuste">
            <div className="principal">
              <div className="t1">Texto enquanto a pessoa fala</div>
              <div className="t2">
                Streaming: o balão aparece e cresce em tempo real. Só manda o áudio quando há fala. Cerca de US$ 0,46 por hora de fala por
                canal. Desligado, cada fala chega uns 2 s depois de terminar.
              </div>
            </div>
            <Chave ligada={config.sttStreaming} rotulo="Texto enquanto a pessoa fala" aoMudar={(v) => void salvar({ sttStreaming: v })} />
          </div>
        )}
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Modelo de transcrição</div>
            <div className="t2">Padrão: {INFO_PROVEDORES_STT[config.provedorStt].modeloPadrao}.</div>
          </div>
          <input
            className="campo-texto"
            key={config.provedorStt}
            defaultValue={config.modeloStt}
            spellCheck={false}
            aria-label="Modelo de transcrição"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== config.modeloStt) void salvar({ modeloStt: v });
            }}
          />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Idioma da conversa</div>
            <div className="t2">Fixar o idioma deixa a transcrição mais precisa que a detecção automática.</div>
          </div>
          <Seletor rotulo="Idioma da conversa" alinhar="direita" valor={config.idioma} opcoes={IDIOMAS} aoMudar={(v) => void salvar({ idioma: v })} />
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

/** Campo de id de modelo com sugestões desenhadas na página (o <datalist> nativo vaza na gravação). */
function CampoModelo({ valor, modelos, aoSalvar }: { valor: string; modelos: ModeloIa[]; aoSalvar: (m: string) => void }) {
  const [texto, setTexto] = useState(valor);
  const [aberto, setAberto] = useState(false);
  useEffect(() => setTexto(valor), [valor]);
  const invalido = modelos.length > 0 && !modelos.some((m) => m.id === texto);
  const sugestoes = useMemo(() => {
    const termos = texto.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!termos.length || !invalido) return [];
    return modelos.filter((m) => termos.every((t) => m.id.toLowerCase().includes(t) || m.nome.toLowerCase().includes(t))).slice(0, 8);
  }, [texto, modelos, invalido]);
  const escolher = (id: string) => {
    setTexto(id);
    setAberto(false);
    if (id !== valor) aoSalvar(id);
  };

  return (
    <div className="ancora">
      <input
        className={`campo-texto${invalido ? ' erro' : ''}`}
        value={texto}
        spellCheck={false}
        autoComplete="off"
        aria-label="Modelo"
        onFocus={() => setAberto(true)}
        onChange={(e) => {
          setTexto(e.target.value);
          setAberto(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && sugestoes[0]) escolher(sugestoes[0].id);
          if (e.key === 'Escape') setAberto(false);
        }}
        onBlur={() => {
          // Deixa o clique na sugestão acontecer antes de fechar.
          setTimeout(() => setAberto(false), 150);
          if (!invalido && texto !== valor) aoSalvar(texto);
        }}
      />
      <div className={`menu seletor direita${aberto && sugestoes.length ? ' aberto' : ''}`} role="listbox">
        {sugestoes.map((m) => (
          <button type="button" key={m.id} className="item" role="option" aria-selected={false} onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(m.id)}>
            <span className="rotulo">
              {m.nome}
              <span className="sub" style={{ display: 'block' }}>{m.id}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
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
