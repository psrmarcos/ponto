import { Microphone, Pause, Stop, Waveform } from '@phosphor-icons/react';
import { Cabecalho } from '../ui/Cabecalho';

/**
 * Transcrição ao vivo. A captura (microfone = você, áudio do sistema = os outros)
 * e o STT entram no M1; esta tela já está pronta para receber as falas.
 */
export function Transcricao() {
  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho janela="transcricao" icone={<Waveform size={16} weight="bold" />} titulo="Transcrição" />
        <div className="corpo">
          <div className="vazio">
            <Microphone size={28} />
            <span className="t1">Ainda não está ouvindo</span>
            <span>
              Quando a captura de áudio entrar, as falas aparecem aqui: o que vem do seu microfone como "Você" e o
              áudio do computador como os outros participantes. Não precisa entrar na reunião.
            </span>
          </div>
        </div>
        <div className="rodape">
          <button type="button" className="icone" aria-label="Pausar transcrição" title="Pausar" disabled>
            <Pause size={14} weight="fill" />
          </button>
          <button type="button" className="icone" aria-label="Parar e salvar" title="Parar e salvar" disabled>
            <Stop size={12} weight="fill" />
          </button>
          <select aria-label="Idioma" defaultValue="auto" disabled>
            <option value="auto">Detectar idioma</option>
            <option value="pt-BR">Português (BR)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </select>
          <div className="espaco" />
        </div>
      </div>
    </div>
  );
}
