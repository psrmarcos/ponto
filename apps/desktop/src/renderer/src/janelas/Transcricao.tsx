import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowCounterClockwise, Broom, Microphone, Pause, Play, Record, SpeakerHigh, Stop, Waveform } from '@phosphor-icons/react';
import type { Configuracoes, Fala } from '@ponto/shared';
import { useCaptura, useEstadoApp } from '../estado/app';
import { useDominio } from '../estado/dominio';
import { useTranscricao } from '../estado/transcricao';
import { Cabecalho } from '../ui/Cabecalho';

const comandar = (acao: 'iniciar' | 'pausar' | 'retomar' | 'parar') => void window.ponto.invocar('captura.comandar', { acao });

/**
 * Transcrição ao vivo: o microfone aparece como você, o áudio do computador
 * como os outros participantes. Não precisa entrar na reunião.
 */
export function Transcricao() {
  const captura = useCaptura();
  const falas = useTranscricao((s) => s.falas);
  const aviso = useTranscricao((s) => s.aviso);
  const gravando = captura.status === 'gravando';

  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho
          janela="transcricao"
          icone={<Waveform size={16} weight="bold" />}
          titulo="Transcrição"
          meta={captura.status !== 'parada' && <AoVivo pausada={captura.status === 'pausada'} desde={captura.iniciadaEm} />}
        />
        <ListaFalas falas={falas} gravando={gravando} parada={captura.status === 'parada'} />
        <Desfazer />
        {aviso && <div className="aviso-transcricao" role="status">{aviso}</div>}
        {captura.status !== 'parada' && <Medidores fontes={captura.fontes} />}
        <Rodape />
      </div>
    </div>
  );
}

function AoVivo({ pausada, desde }: { pausada: boolean; desde: number | null }) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="ao-vivo">
      <span className={`ponto${pausada ? ' pausado' : ''}`} aria-hidden="true" />
      {pausada ? 'Pausada' : 'Ao vivo'}
      {desde && <span className="meta">{relogio(agora - desde)}</span>}
    </span>
  );
}

function ListaFalas({ falas, gravando, parada }: { falas: Fala[]; gravando: boolean; parada: boolean }) {
  const nome = useDominio((s) => s.configuracoes?.nomeUsuario);
  const corpo = useRef<HTMLDivElement>(null);
  const [colado, setColado] = useState(true);

  // Acompanha o fim da conversa, a não ser que a pessoa tenha rolado para ler algo antes.
  useLayoutEffect(() => {
    const el = corpo.current;
    if (el && colado) el.scrollTop = el.scrollHeight;
  }, [falas, colado]);

  if (!falas.length) {
    return (
      <div className="corpo">
        <div className="vazio">
          <Microphone size={28} />
          {parada ? (
            <>
              <span className="t1">Pronto para ouvir</span>
              <span>O que você fala aparece como "Você" e o áudio do computador como os outros participantes. Não precisa entrar na reunião.</span>
              <button type="button" className="botao-primario" onClick={() => comandar('iniciar')}>
                <Record size={14} weight="fill" /> Começar a transcrever
              </button>
            </>
          ) : (
            <>
              <span className="t1">{gravando ? 'Ouvindo…' : 'Pausada'}</span>
              <span>A primeira fala aparece uns 2 segundos depois que a pessoa para de falar.</span>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="corpo-wrap">
      <div
        className="corpo"
        ref={corpo}
        onScroll={(e) => {
          const el = e.currentTarget;
          setColado(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
        }}
      >
        {agrupar(falas).map((g) => (
          <div key={g[0]!.id} className={`fala${g[0]!.canal === 'microfone' ? ' voce' : ''}`}>
            <span className="quem">
              {quem(g[0]!, nome)} <span className="hora">{relogio(g[0]!.inicioMs)}</span>
            </span>
            <span className="txt">{g.map((f) => f.texto).join(' ')}</span>
          </div>
        ))}
      </div>
      {!colado && (
        <button type="button" className="ir-fim" onClick={() => setColado(true)}>
          <ArrowDown size={12} weight="bold" /> Ir para o fim
        </button>
      )}
    </div>
  );
}

function Medidores({ fontes }: { fontes: { microfone: boolean; sistema: boolean } }) {
  const niveis = useTranscricao((s) => s.niveis);
  const linha = (rotulo: string, icone: React.ReactNode, ativo: boolean, nivel: number) => (
    <div className="barra-audio" title={ativo ? undefined : 'Esta fonte não está chegando'}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {icone} {rotulo}
      </span>
      <div className={`trilho${ativo ? '' : ' inativo'}`}>
        <span style={{ width: `${Math.round((ativo ? nivel : 0) * 100)}%` }} />
      </div>
    </div>
  );
  return (
    <div className="medidores">
      <div className="barras">
        {linha('Você', <Microphone size={12} />, fontes.microfone, niveis.microfone)}
        {linha('Outros', <SpeakerHigh size={12} />, fontes.sistema, niveis.sistema)}
      </div>
    </div>
  );
}

function Rodape() {
  const captura = useCaptura();
  const idioma = useDominio((s) => s.configuracoes?.idioma ?? 'auto');
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const temChave = useEstadoApp((s) => {
    const p = s.estado?.chavesConfiguradas ?? [];
    return p.length > 0;
  });
  const { status } = captura;

  return (
    <div className="rodape">
      {status === 'parada' ? (
        <button type="button" className="icone" aria-label="Começar a transcrever" title="Começar (Ctrl+Shift+G)" disabled={!temChave} onClick={() => comandar('iniciar')}>
          <Record size={14} weight="fill" style={{ color: 'var(--vermelho)' }} />
        </button>
      ) : (
        <button
          type="button"
          className="icone"
          aria-label={status === 'pausada' ? 'Retomar' : 'Pausar'}
          title={status === 'pausada' ? 'Retomar (Ctrl+Shift+G)' : 'Pausar (Ctrl+Shift+G)'}
          disabled={status === 'iniciando'}
          onClick={() => comandar(status === 'pausada' ? 'retomar' : 'pausar')}
        >
          {status === 'pausada' ? <Play size={14} weight="fill" /> : <Pause size={14} weight="fill" />}
        </button>
      )}
      <button type="button" className="icone" aria-label="Encerrar sessão" title="Encerrar sessão" disabled={status === 'parada'} onClick={() => comandar('parar')}>
        <Stop size={12} weight="fill" />
      </button>
      <BotaoLimpar />
      <select
        aria-label="Idioma da conversa"
        value={idioma}
        onChange={(e) => void salvar({ idioma: e.target.value as Configuracoes['idioma'] })}
      >
        <option value="auto">Detectar idioma</option>
        <option value="pt-BR">Português (BR)</option>
        <option value="en">English</option>
        <option value="es">Español</option>
      </select>
      <div className="espaco" />
    </div>
  );
}

/**
 * Limpar apaga a conversa (inclusive do contexto do chat), então pede um segundo
 * clique para confirmar e ainda deixa desfazer por alguns segundos.
 */
function BotaoLimpar() {
  const temFalas = useTranscricao((s) => s.falas.length > 0);
  const limpar = useTranscricao((s) => s.limpar);
  const [confirmando, setConfirmando] = useState(false);
  useEffect(() => {
    if (!confirmando) return;
    const t = setTimeout(() => setConfirmando(false), 3000);
    return () => clearTimeout(t);
  }, [confirmando]);

  if (confirmando) {
    return (
      <button
        type="button"
        className="btn-limpar confirmar"
        onClick={() => {
          setConfirmando(false);
          limpar();
        }}
        onBlur={() => setConfirmando(false)}
        autoFocus
      >
        <Broom size={13} /> Limpar tudo?
      </button>
    );
  }
  return (
    <button type="button" className="icone" aria-label="Limpar transcrição" title="Limpar transcrição" disabled={!temFalas} onClick={() => setConfirmando(true)}>
      <Broom size={14} />
    </button>
  );
}

function Desfazer() {
  const desfazivel = useTranscricao((s) => s.desfazivel);
  const desfazer = useTranscricao((s) => s.desfazer);
  if (!desfazivel) return null;
  return (
    <div className="desfazer-transcricao" role="status">
      <span>Transcrição limpa ({desfazivel.falas.length} {desfazivel.falas.length === 1 ? 'fala' : 'falas'}).</span>
      <button type="button" onClick={desfazer}>
        <ArrowCounterClockwise size={12} weight="bold" /> Desfazer
      </button>
    </div>
  );
}

/** Falas seguidas do mesmo canal, com menos de 4 s entre elas, viram um balão só. */
function agrupar(falas: Fala[]): Fala[][] {
  const grupos: Fala[][] = [];
  for (const f of falas) {
    const g = grupos.at(-1);
    const ultima = g?.at(-1);
    if (g && ultima && ultima.canal === f.canal && ultima.falante === f.falante && f.inicioMs - ultima.fimMs < 4000) g.push(f);
    else grupos.push([f]);
  }
  return grupos;
}

function quem(f: Fala, nome?: string): string {
  if (f.falante) return f.falante;
  return f.canal === 'microfone' ? nome || 'Você' : 'Participante';
}

function relogio(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
