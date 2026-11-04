import { useEffect, useState } from 'react';
import { CaretLeft, CaretRight, Monitor, Scan } from '@phosphor-icons/react';
import { useAppState, useStealth } from '../state/app';
import { Header } from '../ui/Header';
import { Toggle } from '../ui/Toggle';

type Source = 'manual' | 'crop' | 'auto';
interface CaptureItem {
  dataUrl: string;
  at: number;
  source: Source;
}
const MAX_HISTORY = 12;

const SOURCE_LABEL: Record<Source, string> = {
  manual: 'Tela inteira',
  crop: 'Recorte',
  auto: 'Automática',
};

export function Screen() {
  const [history, setHistory] = useState<CaptureItem[]>([]);
  const [index, setIndex] = useState(0);
  const [capturing, setCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stealth = useStealth();
  const auto = useAppState((s) => s.state?.screenAuto ?? false);

  useEffect(
    () =>
      window.ponto.on('screen.read', (d) => {
        setHistory((h) => [...h, d].slice(-MAX_HISTORY));
        setIndex(Number.MAX_SAFE_INTEGER);
        setCapturing(false);
      }),
    [],
  );

  const current = history.length ? history[Math.min(index, history.length - 1)]! : null;
  const position = current ? history.indexOf(current) : -1;

  const onFailed = (err: unknown) => {
    setError((err as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
    setCapturing(false);
  };

  const captureNow = async () => {
    setCapturing(true);
    setError(null);
    await window.ponto.invoke('screen.read').catch(onFailed);
  };

  return (
    <div className="panel-window" style={{ flexDirection: 'column' }}>
      <div className="panel solid">
        <Header
          windowId="screen"
          icon={<Monitor size={16} weight="bold" />}
          title="Tela"
          meta={
            current && (
              <span className="meta">
                {SOURCE_LABEL[current.source]} ·{' '}
                {new Date(current.at).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )
          }
        />
        <div className="body">
          {current ? (
            <>
              <img className="screen-preview" src={current.dataUrl} alt="Captura enviada para a IA" />
              {history.length > 1 && (
                <div className="history-nav">
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Captura anterior"
                    disabled={position <= 0}
                    onClick={() => setIndex(position - 1)}
                  >
                    <CaretLeft size={14} weight="bold" />
                  </button>
                  <span>
                    {position + 1}/{history.length}
                  </span>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Próxima captura"
                    disabled={position >= history.length - 1}
                    onClick={() => setIndex(position + 1)}
                  >
                    <CaretRight size={14} weight="bold" />
                  </button>
                </div>
              )}
              <span className="screen-hint">
                A resposta aparece no chat.{' '}
                {stealth.enabled
                  ? 'As janelas do Ponto não entram no print.'
                  : 'Atenção: com a invisibilidade desligada, as janelas do Ponto aparecem no print.'}
              </span>
            </>
          ) : (
            <div className="empty">
              <Monitor size={28} />
              <span className="t1">Nenhuma leitura ainda</span>
              <span>Leia a tela agora ou ligue a leitura automática.</span>
            </div>
          )}
          {error && <span className="warning">{error}</span>}
        </div>
        <div className="footer screen-footer">
          <Toggle
            checked={auto}
            label="Leitura automática"
            disabled={!stealth.enabled}
            onChange={(v) => void window.ponto.invoke('screen.auto', { enabled: v })}
          />
          <span
            className="auto-label"
            title={
              stealth.enabled
                ? 'Opcional: lê sozinho quando a tela muda, no máximo a cada 20 s. Cada leitura gasta tokens.'
                : 'Precisa da invisibilidade ligada'
            }
          >
            Automática
          </span>
          <div className="spacer" />
          <button type="button" className="primary-btn" disabled={capturing} onClick={() => void captureNow()}>
            <Scan size={14} weight="bold" /> {capturing ? 'Lendo…' : 'Ler agora'} <kbd>Ctrl</kbd>
            <kbd>⇧</kbd>
            <kbd>S</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
