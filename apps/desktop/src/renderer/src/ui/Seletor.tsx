import { CaretDown, Check } from '@phosphor-icons/react';
import { Menu } from './Menu';

/**
 * Lista de opções desenhada dentro da janela. Substitui o <select> nativo: a
 * lista aberta do <select> é uma janela separada do sistema e, por isso, NÃO fica
 * de fora da gravação de tela como o resto do app. Não use <select> no Ponto.
 */
export function Seletor<T extends string>({
  valor,
  opcoes,
  aoMudar,
  rotulo,
  abrirPara = 'baixo',
  alinhar = 'esquerda',
}: {
  valor: T;
  opcoes: ReadonlyArray<{ valor: T; rotulo: string }>;
  aoMudar: (v: T) => void;
  rotulo: string;
  abrirPara?: 'baixo' | 'cima';
  alinhar?: 'esquerda' | 'direita';
}) {
  const atual = opcoes.find((o) => o.valor === valor);
  return (
    <Menu
      className="seletor"
      abrirPara={abrirPara}
      alinhar={alinhar}
      botao={({ aberto, alternar }) => (
        <button type="button" className="botao-seletor" aria-label={rotulo} aria-haspopup="listbox" aria-expanded={aberto} onClick={alternar}>
          <span>{atual?.rotulo ?? valor}</span>
          <CaretDown size={11} weight="bold" />
        </button>
      )}
    >
      {(fechar) =>
        opcoes.map((o) => (
          <button
            type="button"
            key={o.valor}
            className="item"
            role="option"
            aria-selected={o.valor === valor}
            onClick={() => {
              if (o.valor !== valor) aoMudar(o.valor);
              fechar();
            }}
          >
            <span className="rotulo">{o.rotulo}</span>
            {o.valor === valor && <Check size={13} weight="bold" />}
          </button>
        ))
      }
    </Menu>
  );
}
