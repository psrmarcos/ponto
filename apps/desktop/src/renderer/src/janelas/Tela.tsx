import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { CaretLeft, CaretRight, Crop, Monitor, Scan, X } from '@phosphor-icons/react';
import { useEstadoApp, useStealth } from '../estado/app';
import { Cabecalho } from '../ui/Cabecalho';
import { Chave } from '../ui/Chave';

type Origem = 'manual' | 'recorte' | 'auto';
interface Leitura {
  dataUrl: string;
  em: number;
  origem: Origem;
}
/** Retângulo em fração da imagem (0 a 1), independente do tamanho em que ela aparece. */
interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** O histórico vive só nesta janela, na memória: fechar o app apaga. */
const MAX_HISTORICO = 12;
/** O recorte vai para a IA com no máximo este lado (mais que isso só gasta). */
const LADO_RECORTE = 1600;

const ROTULO: Record<Origem, string> = { manual: 'Tela inteira', recorte: 'Recorte', auto: 'Automática' };

/**
 * Leitura da tela: print inteiro (Ctrl+Shift+S), recorte de uma área ou leitura
 * automática quando a tela muda. A resposta aparece no chat; aqui ficam as
 * capturas desta sessão do app, com setas para voltar.
 */
export function Tela() {
  const [historico, setHistorico] = useState<Leitura[]>([]);
  const [indice, setIndice] = useState(0);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [recorte, setRecorte] = useState<{ dataUrl: string } | null>(null);
  const stealth = useStealth();
  const auto = useEstadoApp((s) => s.estado?.telaAuto ?? false);

  useEffect(
    () =>
      window.ponto.ouvir('tela.lida', (d) => {
        setHistorico((h) => [...h, d].slice(-MAX_HISTORICO));
        setIndice(Number.MAX_SAFE_INTEGER); // vai para a mais nova
        setLendo(false);
      }),
    [],
  );

  const atual = historico.length ? historico[Math.min(indice, historico.length - 1)]! : null;
  const posicao = atual ? historico.indexOf(atual) : -1;

  const falhou = (e: unknown) => {
    setErro((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    setLendo(false);
  };

  const ler = async () => {
    setLendo(true);
    setErro(null);
    await window.ponto.invocar('tela.ler').catch(falhou);
  };

  const comecarRecorte = async () => {
    setErro(null);
    try {
      setRecorte(await window.ponto.invocar('tela.capturar'));
    } catch (e) {
      falhou(e);
    }
  };

  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho
          janela="tela"
          icone={<Monitor size={16} weight="bold" />}
          titulo="Tela"
          meta={
            atual &&
            !recorte && (
              <span className="meta">
                {ROTULO[atual.origem]} · {new Date(atual.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )
          }
        />
        <div className="corpo">
          {recorte ? (
            <Recortador
              dataUrl={recorte.dataUrl}
              cancelar={() => setRecorte(null)}
              enviar={(img) => {
                setRecorte(null);
                setLendo(true);
                void window.ponto.invocar('tela.enviar', { dataUrl: img }).catch(falhou);
              }}
            />
          ) : atual ? (
            <>
              <img className="previa-tela" src={atual.dataUrl} alt="Captura enviada para a IA" />
              {historico.length > 1 && (
                <div className="navegar-historico">
                  <button type="button" className="icone" aria-label="Captura anterior" disabled={posicao <= 0} onClick={() => setIndice(posicao - 1)}>
                    <CaretLeft size={14} weight="bold" />
                  </button>
                  <span>
                    {posicao + 1}/{historico.length}
                  </span>
                  <button type="button" className="icone" aria-label="Próxima captura" disabled={posicao >= historico.length - 1} onClick={() => setIndice(posicao + 1)}>
                    <CaretRight size={14} weight="bold" />
                  </button>
                </div>
              )}
              <span className="dica-tela">
                A resposta aparece no chat.{' '}
                {stealth.ligado ? 'As janelas do Ponto não entram no print.' : 'Atenção: com a invisibilidade desligada, as janelas do Ponto aparecem no print.'}
              </span>
            </>
          ) : (
            <div className="vazio">
              <Monitor size={28} />
              <span className="t1">Nenhuma leitura ainda</span>
              <span>Leia a tela inteira, recorte só um pedaço (código, gráfico) ou deixe a leitura automática ligada.</span>
            </div>
          )}
          {erro && <span className="aviso">{erro}</span>}
        </div>
        {!recorte && (
          <div className="rodape rodape-tela">
            <Chave
              ligada={auto}
              rotulo="Leitura automática"
              desabilitada={!stealth.ligado}
              aoMudar={(v) => void window.ponto.invocar('tela.auto', { ligado: v })}
            />
            <span className="rotulo-auto" title={stealth.ligado ? 'Opcional: lê sozinho quando a tela muda, no máximo a cada 20 s. Cada leitura gasta tokens.' : 'Precisa da invisibilidade ligada'}>
              Automática
            </span>
            <div className="espaco" />
            <button type="button" className="btn-sec" onClick={() => void comecarRecorte()} title="Escolher uma área da tela">
              <Crop size={14} /> Recortar
            </button>
            <button type="button" className="botao-primario" disabled={lendo} onClick={() => void ler()}>
              <Scan size={14} weight="bold" /> {lendo ? 'Lendo…' : 'Ler agora'} <kbd>Ctrl</kbd>
              <kbd>⇧</kbd>
              <kbd>S</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/** Arraste na imagem para marcar a área. A imagem é cortada aqui mesmo e só o pedaço vai para a IA. */
function Recortador({ dataUrl, cancelar, enviar }: { dataUrl: string; cancelar: () => void; enviar: (img: string) => void }) {
  const img = useRef<HTMLImageElement>(null);
  const [area, setArea] = useState<Area | null>(null);
  const inicio = useRef<{ x: number; y: number } | null>(null);

  const ponto = (e: PointerEvent) => {
    const r = img.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  const recortar = () => {
    const el = img.current;
    if (!el || !area) return;
    const sx = area.x * el.naturalWidth;
    const sy = area.y * el.naturalHeight;
    const sw = area.w * el.naturalWidth;
    const sh = area.h * el.naturalHeight;
    const escala = Math.min(1, LADO_RECORTE / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * escala));
    canvas.height = Math.max(1, Math.round(sh * escala));
    canvas.getContext('2d')!.drawImage(el, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    enviar(canvas.toDataURL('image/jpeg', 0.85));
  };

  const pequena = !area || area.w < 0.02 || area.h < 0.02;

  return (
    <div className="recortador">
      <span className="dica-tela">Arraste sobre a imagem para marcar o pedaço que a IA deve ler.</span>
      <div
        className="area-recorte"
        onPointerDown={(e) => {
          (e.target as Element).setPointerCapture?.(e.pointerId);
          const p = ponto(e);
          inicio.current = p;
          setArea({ x: p.x, y: p.y, w: 0, h: 0 });
        }}
        onPointerMove={(e) => {
          if (!inicio.current) return;
          const p = ponto(e);
          const a = inicio.current;
          setArea({ x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) });
        }}
        onPointerUp={() => (inicio.current = null)}
      >
        <img ref={img} src={dataUrl} alt="Tela para recortar" draggable={false} />
        {area && (
          <span
            className="selecao"
            style={{ left: `${area.x * 100}%`, top: `${area.y * 100}%`, width: `${area.w * 100}%`, height: `${area.h * 100}%` }}
          />
        )}
      </div>
      <div className="sessao-acoes">
        <button type="button" className="btn-sec" onClick={cancelar}>
          <X size={13} /> Cancelar
        </button>
        <div className="espaco" />
        <button type="button" className="botao-primario" disabled={pequena} onClick={recortar}>
          <Crop size={14} weight="bold" /> Ler este pedaço
        </button>
      </div>
    </div>
  );
}
