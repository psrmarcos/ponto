interface Props {
  ligada: boolean;
  aoMudar: (v: boolean) => void;
  rotulo: string;
  desabilitada?: boolean;
}

/** Interruptor liga/desliga no estilo do app. */
export function Chave({ ligada, aoMudar, rotulo, desabilitada }: Props) {
  return (
    <button
      type="button"
      className="chave-btn"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      disabled={desabilitada}
      onClick={() => aoMudar(!ligada)}
    >
      <span className={`chave${ligada ? ' ligada' : ''}`} aria-hidden="true" />
    </button>
  );
}
