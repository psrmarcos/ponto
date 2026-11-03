import { useCallback, useEffect, useState } from 'react';
import { ArrowsInLineVertical } from '@phosphor-icons/react';
import type { ContextoConversa, ParteContexto } from '@ponto/shared';
import { api } from '../api/cliente';
import { useEstadoApp } from '../estado/app';
import { useChat } from '../estado/chat';
import { useDominio } from '../estado/dominio';
import { Menu } from './Menu';

const PARTES: Record<ParteContexto, { nome: string; cor: string }> = {
  instrucoes: { nome: 'Instruções do agente', cor: '#5B95FF' },
  perfil: { nome: 'Seu perfil', cor: '#8A7CFF' },
  resumoCall: { nome: 'Resumo do começo da call', cor: '#3CC8A8' },
  resumoConversa: { nome: 'Resumo da conversa', cor: '#F2B84B' },
  historico: { nome: 'Mensagens anteriores', cor: '#E879A6' },
  transcricao: { nome: 'Falas da call no histórico', cor: '#56C46B' },
};

/**
 * Anel no rodapé do chat com o tamanho do contexto. Abre um painel com o que
 * vai em cada chamada e o botão de comprimir a conversa.
 */
export function JanelaContexto() {
  const conversaId = useChat((s) => s.conversaId);
  const ocupado = useChat((s) => s.ocupado);
  const total = useChat((s) => s.mensagens.length);
  const agente = useDominio((s) => s.configuracoes?.agenteAtivo);
  const sessaoId = useEstadoApp((s) => s.estado?.captura.sessaoId ?? null);
  const [dados, setDados] = useState<ContextoConversa | null>(null);
  const [comprimindo, setComprimindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api
      .get<ContextoConversa>(`/chat/conversas/${conversaId}/contexto${agente ? `?agente=${encodeURIComponent(agente)}` : ''}`)
      .then(setDados)
      .catch(() => undefined);
  }, [conversaId, agente]);

  // Atualiza quando uma resposta termina (ocupado volta a false) e ao trocar de conversa.
  useEffect(() => {
    if (!ocupado) carregar();
  }, [ocupado, total, carregar]);

  const comprimir = async () => {
    setComprimindo(true);
    setErro(null);
    try {
      setDados(await api.post<ContextoConversa>(`/chat/conversas/${conversaId}/comprimir${sessaoId ? `?sessao=${sessaoId}` : ''}`));
    } catch {
      setErro('Não consegui comprimir agora. Tente de novo.');
    } finally {
      setComprimindo(false);
    }
  };

  // O número real da última chamada vale mais que a estimativa.
  const usado = dados ? Math.max(dados.ultima?.tokensEntrada ?? 0, dados.totalEstimado) : 0;
  const fracao = dados?.limite ? Math.min(1, usado / dados.limite) : 0;
  const somaPartes = dados?.partes.reduce((n, p) => n + p.tokens, 0) || 1;

  return (
    <Menu
      className="contexto"
      botao={({ aberto, alternar }) => (
        <button
          type="button"
          className="chip so-icone anel-contexto"
          aria-label="Janela de contexto"
          aria-expanded={aberto}
          aria-haspopup="dialog"
          title="Janela de contexto"
          onClick={() => {
            if (!aberto) carregar();
            alternar();
          }}
        >
          <Anel fracao={fracao} />
        </button>
      )}
    >
      {() => (
        <div className="painel-contexto">
          <div className="menu-titulo">Janela de contexto</div>
          {!dados ? (
            <p className="vazio-menu">Carregando…</p>
          ) : (
            <>
              <div className="contexto-total">
                <strong>{milhares(usado)}</strong>
                <span>
                  {dados.limite ? ` de ${milhares(dados.limite)} tokens (${porcento(fracao)})` : ' tokens'}
                </span>
              </div>
              <div className="barra-contexto" aria-hidden="true">
                {dados.partes
                  .filter((p) => p.tokens > 0)
                  .map((p) => (
                    <span key={p.parte} style={{ flexGrow: p.tokens, background: PARTES[p.parte].cor }} />
                  ))}
              </div>
              <ul className="partes-contexto">
                {dados.partes
                  .filter((p) => p.tokens > 0)
                  .map((p) => (
                    <li key={p.parte}>
                      <span className="bolinha" style={{ background: PARTES[p.parte].cor }} />
                      <span className="nome">{PARTES[p.parte].nome}</span>
                      <span className="num">
                        {milhares(p.tokens)} · {porcento(p.tokens / somaPartes)}
                      </span>
                    </li>
                  ))}
              </ul>
              <div className="linha-contexto">
                <span>Modelo</span>
                <span className="num id-modelo">{dados.modelo}</span>
              </div>
              {dados.ultima && (
                <div className="linha-contexto">
                  <span>Última resposta</span>
                  <span className="num">
                    {milhares(dados.ultima.tokensEntrada)} entrada
                    {dados.ultima.tokensEntrada > 0 && ` (${porcento(dados.ultima.tokensCache / dados.ultima.tokensEntrada)} em cache)`} ·{' '}
                    {milhares(dados.ultima.tokensSaida)} saída
                  </span>
                </div>
              )}
              <div className="linha-contexto">
                <span>Trocas na memória</span>
                <span className="num">{dados.trocas}{dados.compactada && ' + resumo'}</span>
              </div>
              {dados.gastoUsd > 0 && (
                <div className="linha-contexto">
                  <span>Gasto nesta conversa</span>
                  <span className="num">US$ {dados.gastoUsd >= 1 ? dados.gastoUsd.toFixed(2) : dados.gastoUsd.toFixed(4)}</span>
                </div>
              )}
              <div className="divisor" />
              <button
                type="button"
                className="item"
                disabled={comprimindo || dados.trocas === 0}
                onClick={() => void comprimir()}
              >
                <ArrowsInLineVertical size={16} />
                <span className="rotulo">
                  {comprimindo ? 'Comprimindo…' : 'Comprimir conversa'}
                  <br />
                  <span className="sub">
                    {dados.trocas === 0
                      ? 'Nada para comprimir ainda.'
                      : 'As mensagens antigas viram um resumo curto. As próximas respostas ficam mais baratas.'}
                  </span>
                </span>
              </button>
              {erro && <p className="vazio-menu aviso-contexto">{erro}</p>}
            </>
          )}
        </div>
      )}
    </Menu>
  );
}

function Anel({ fracao }: { fracao: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  // Mostra pelo menos um tracinho quando há algo, para o anel não parecer vazio.
  const cheio = fracao > 0 ? Math.max(0.04, fracao) : 0;
  const cor = fracao > 0.8 ? 'var(--vermelho)' : fracao > 0.5 ? '#F2B84B' : '#8FB0FF';
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <circle cx="9" cy="9" r={r} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="2.2" />
      <circle
        cx="9"
        cy="9"
        r={r}
        fill="none"
        stroke={cor}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeDasharray={`${cheio * c} ${c}`}
        transform="rotate(-90 9 9)"
      />
    </svg>
  );
}

function milhares(n: number): string {
  if (n < 1000) return String(Math.round(n));
  if (n < 1_000_000) return `${(n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return `${(n / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
}

function porcento(f: number): string {
  if (f > 0 && f < 0.01) return '<1%';
  return `${Math.round(f * 100)}%`;
}
