import { useEffect, useState } from 'react';
import { Monitor, Scan } from '@phosphor-icons/react';
import { useStealth } from '../estado/app';
import { Cabecalho } from '../ui/Cabecalho';

/**
 * Leitura da tela: tira um print do monitor em que está o cursor e manda para a
 * IA junto com a conversa. A resposta aparece no chat; aqui fica a prévia do que
 * foi enviado.
 */
export function Tela() {
  const [ultima, setUltima] = useState<{ dataUrl: string; em: number } | null>(null);
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const stealth = useStealth();
  useEffect(
    () =>
      window.ponto.ouvir('tela.lida', (d) => {
        setUltima(d);
        setLendo(false);
      }),
    [],
  );

  const ler = async () => {
    setLendo(true);
    setErro(null);
    try {
      await window.ponto.invocar('tela.ler');
    } catch (e) {
      setErro((e as Error).message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
      setLendo(false);
    }
  };

  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho
          janela="tela"
          icone={<Monitor size={16} weight="bold" />}
          titulo="Tela"
          meta={ultima && <span className="meta">lida às {new Date(ultima.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>}
        />
        <div className="corpo">
          {ultima ? (
            <>
              <img className="previa-tela" src={ultima.dataUrl} alt="Último print enviado para a IA" />
              <span className="dica-tela">A resposta aparece no chat. {stealth.ligado ? 'As janelas do Ponto não entram no print.' : 'Atenção: com a invisibilidade desligada, as janelas do Ponto aparecem no print.'}</span>
            </>
          ) : (
            <div className="vazio">
              <Monitor size={28} />
              <span className="t1">Nenhuma leitura ainda</span>
              <span>
                Tira um print do monitor em que está o mouse (slide, código, enunciado) e a IA responde no chat, junto
                com o que está sendo falado.
              </span>
            </div>
          )}
          {erro && <span className="aviso">{erro}</span>}
        </div>
        <div className="rodape">
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
