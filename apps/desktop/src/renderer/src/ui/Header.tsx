import { DotsSixVertical, X } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import type { WindowId } from '@ponto/shared';

interface Props {
  windowId: WindowId;
  icon?: ReactNode;
  title: string;
  meta?: ReactNode;
}

/** Panel header: the left area drags the window; the X button hides it. */
export function Header({ windowId, icon, title, meta }: Props) {
  return (
    <div className="header">
      <div className="drag-area">
        <DotsSixVertical size={16} weight="bold" style={{ color: 'var(--text-3)', flex: 'none' }} aria-hidden />
        {icon}
        <span className="title">{title}</span>
        {meta}
      </div>
      <button
        type="button"
        className="icon-btn"
        aria-label="Fechar painel"
        title="Fechar painel"
        onClick={() => void window.ponto.invoke('window.toggle', { id: windowId, visible: false })}
      >
        <X size={14} weight="bold" />
      </button>
    </div>
  );
}
