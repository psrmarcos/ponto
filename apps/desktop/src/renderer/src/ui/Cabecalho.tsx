import { DotsSixVertical, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { IdJanela } from '@ponto/shared';

interface Props {
  janela: IdJanela;
  icone?: ReactNode;
  titulo: string;
  meta?: ReactNode;
}

/** Cabeçalho dos painéis: a área da esquerda arrasta a janela; o X esconde. */
export function Cabecalho({ janela, icone, titulo, meta }: Props) {
  return (
    <div className="cabecalho">
      <div className="arrastar">
        <DotsSixVertical size={16} weight="bold" style={{ color: 'var(--texto-3)', flex: 'none' }} aria-hidden />
        {icone}
        <span className="titulo">{titulo}</span>
        {meta}
      </div>
      <button
        type="button"
        className="icone"
        aria-label="Fechar painel"
        title="Fechar painel"
        onClick={() => void window.ponto.invocar('janela.alternar', { id: janela, visivel: false })}
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
