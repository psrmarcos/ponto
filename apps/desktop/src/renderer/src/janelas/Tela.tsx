import { useEffect, useState } from 'react';
import { CaretLeft, CaretRight, Monitor, Scan } from '@phosphor-icons/react';
import { useEstadoApp, useStealth } from '../estado/app';
import { Cabecalho } from '../ui/Cabecalho';
import { Chave } from '../ui/Chave';

type Origem = 'manual' | 'recorte' | 'auto';
interface Leitura {
  dataUrl: string;
  em: number;
  origem: Origem;
}
/** O histórico vive só nesta janela, na memória: fechar o app apaga. */
const MAX_HISTORICO = 12;

const ROTULO: Record<Origem, string> = {
  manual: 'Tela inteira',
  recorte: 'Recorte',
  auto: 'Automática',
};

/**
 * Leitura da tela: print inteiro (Ctrl+Shift+S) ou leitura automática quando a
 * tela muda. A resposta aparece no chat; aqui ficam as
 * capturas desta sessão do app, com setas para voltar.
 */
export function Tela() {
  const [historico, setHistorico] = useState<Leitura[]>([]);
  const [indice, setIndice] = useState(0);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
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

  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho
          janela="tela"
          icone={<Monitor size={16} weight="bold" />}
          titulo="Tela"
          meta={
            atual && (
              <span className="meta">
                {ROTULO[atual.origem]} ·{' '}
                {new Date(atual.em).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            )
          }
        />
        <div className="corpo">
          {atual ? (
            <>
              <img className="previa-tela" src={atual.dataUrl} alt="Captura enviada para a IA" />
              {historico.length > 1 && (
                <div className="navegar-historico">
                  <button
                    type="button"
                    className="icone"
                    aria-label="Captura anterior"
                    disabled={posicao <= 0}
                    onClick={() => setIndice(posicao - 1)}
                  >
                    <CaretLeft size={14} weight="bold" />
                  </button>
                  <span>
                    {posicao + 1}/{historico.length}
                  </span>
                  <button
                    type="button"
                    className="icone"
                    aria-label="Próxima captura"
                    disabled={posicao >= historico.length - 1}
                    onClick={() => setIndice(posicao + 1)}
                  >
                    <CaretRight size={14} weight="bold" />
                  </button>
                </div>
              )}
              <span className="dica-tela">
                A resposta aparece no chat.{' '}
                {stealth.ligado
                  ? 'As janelas do Ponto não entram no print.'
                  : 'Atenção: com a invisibilidade desligada, as janelas do Ponto aparecem no print.'}
              </span>
            </>
          ) : (
            <div className="vazio">
              <Monitor size={28} />
              <span className="t1">Nenhuma leitura ainda</span>
              <span>Leia a tela agora ou ligue a leitura automática.</span>
            </div>
          )}
          {erro && <span className="aviso">{erro}</span>}
        </div>
        <div className="rodape rodape-tela">
          <Chave
            ligada={auto}
            rotulo="Leitura automática"
            desabilitada={!stealth.ligado}
            aoMudar={(v) => void window.ponto.invocar('tela.auto', { ligado: v })}
          />
          <span
            className="rotulo-auto"
            title={
              stealth.ligado
                ? 'Opcional: lê sozinho quando a tela muda, no máximo a cada 20 s. Cada leitura gasta tokens.'
                : 'Precisa da invisibilidade ligada'
            }
          >
            Automática
          </span>
          <div className="espaco" />
          <button type="button" className="botao-primario" disabled={lendo} onClick={() => void ler()}>
            <Scan size={14} weight="bold" /> {lendo ? 'Lendo…' : 'Ler agora'} <kbd>Ctrl</kbd>
            <kbd>⇧</kbd>
            <kbd>S</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
