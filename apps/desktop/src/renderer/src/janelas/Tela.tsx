import { useEffect, useState } from 'react';
import { Monitor } from '@phosphor-icons/react';
import { Cabecalho } from '../ui/Cabecalho';
import { Chave } from '../ui/Chave';

/** Leitura da tela (print + visão). A captura e a análise entram no M2. */
export function Tela() {
  const [auto, setAuto] = useState(false);
  const [pedido, setPedido] = useState(0);
  useEffect(() => window.ponto.ouvir('tela.ler', () => setPedido((n) => n + 1)), []);

  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho janela="tela" icone={<Monitor size={16} weight="bold" />} titulo="Tela" />
        <div className="corpo">
          <div className="vazio">
            <Monitor size={28} />
            <span className="t1">Nenhuma leitura ainda</span>
            <span>
              Aqui vai aparecer um resumo do que está na sua tela (slide, código, documento), para o copiloto usar nas
              respostas. A imagem é reduzida antes de ir para a IA para gastar pouco.
            </span>
            {pedido > 0 && <span className="aviso">A leitura da tela chega no próximo passo.</span>}
          </div>
        </div>
        <div className="rodape">
          <Chave ligada={auto} aoMudar={setAuto} rotulo="Ler sozinho" desabilitada />
          <span className="opcao">Ler a cada 30 s</span>
          <div className="espaco" />
          <button type="button" className="botao-primario" disabled>
            Ler agora <kbd>Ctrl</kbd>
            <kbd>⇧</kbd>
            <kbd>S</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
