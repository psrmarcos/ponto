import { useEffect, useState, type ReactElement } from 'react';
import { create } from 'zustand';
import { Lightbulb, Microphone, Sparkle, TrendUp, Warning } from '@phosphor-icons/react';
import type { AoVivo, Insight, TipoInsight } from '@ponto/shared';
import { api } from '../../api/cliente';
import { useDominio } from '../../estado/dominio';
import { useTranscricao } from '../../estado/transcricao';
import { Chave } from '../../ui/Chave';
import { Markdown } from '../../ui/Markdown';

export type AbaTranscricao = 'bruta' | 'resumo' | 'insights';

const VAZIO: AoVivo = { resumo: null, insights: [], metricas: { suaParte: 0, seuRitmo: null, suaMaiorFala: 0 } };

/** Resumo, insights e métricas da sessão atual (ou da última). Vem da API e cresce pelo WebSocket. */
const useAoVivo = create<{ sessaoId: string | null; dados: AoVivo }>(() => ({ sessaoId: null, dados: VAZIO }));

function carregar(sessaoId: string): void {
  api
    .get<AoVivo>(`/sessoes/${sessaoId}/ao-vivo`)
    .then((dados) => {
      if (useAoVivo.getState().sessaoId === sessaoId) useAoVivo.setState({ dados });
    })
    .catch(() => undefined);
}

/** Liga a análise ao vivo à sessão da transcrição. Chamar uma vez na janela Transcrição. */
export function useLigarAoVivo(): void {
  const sessaoId = useTranscricao((s) => s.sessaoId);
  const totalFalas = useTranscricao((s) => s.falas.length);

  useEffect(() => {
    useAoVivo.setState({ sessaoId, dados: VAZIO });
    if (!sessaoId) return;
    const parar = api.quandoConectar(() => carregar(sessaoId));
    const pararEventos = api.ouvir((e) => {
      if (e.tipo !== 'sessao.aoVivo' || e.sessaoId !== sessaoId) return;
      useAoVivo.setState(({ dados }) => ({
        dados: {
          ...dados,
          resumo: e.resumo ?? dados.resumo,
          insights: e.insight ? [...dados.insights, e.insight] : dados.insights,
        },
      }));
    });
    return () => {
      parar();
      pararEventos();
    };
  }, [sessaoId]);

  // Métricas de voz são calculadas na API sem IA: atualiza a cada 5 falas.
  useEffect(() => {
    if (sessaoId && totalFalas && totalFalas % 5 === 0) carregar(sessaoId);
  }, [sessaoId, totalFalas]);
}

export function SeletorAbas({ aba, mudar }: { aba: AbaTranscricao; mudar: (a: AbaTranscricao) => void }) {
  const novos = useInsightsNovos(aba);
  return (
    <div className="abas abas-transcricao" role="tablist">
      <button type="button" role="tab" className="aba" aria-selected={aba === 'bruta'} onClick={() => mudar('bruta')}>
        Transcrição
      </button>
      <button type="button" role="tab" className="aba" aria-selected={aba === 'resumo'} onClick={() => mudar('resumo')}>
        Resumo
      </button>
      <button type="button" role="tab" className="aba" aria-selected={aba === 'insights'} onClick={() => mudar('insights')}>
        Insights{novos > 0 && <span className="contador-aba">{novos}</span>}
      </button>
    </div>
  );
}

/** Insights que chegaram enquanto a aba Insights estava fechada. */
function useInsightsNovos(aba: AbaTranscricao): number {
  const total = useAoVivo((s) => s.dados.insights.length);
  const [vistos, setVistos] = useState(0);
  useEffect(() => {
    if (aba === 'insights' || total < vistos) setVistos(total);
  }, [aba, total, vistos]);
  return Math.max(0, total - vistos);
}

export function AbaResumo() {
  const resumo = useAoVivo((s) => s.dados.resumo);
  const ligado = useDominio((s) => s.configuracoes?.resumoAoVivo ?? true);
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const agora = useAgora();
  return (
    <div className="corpo-aba">
      <div className="topo-aba">
        <span className="t2">{resumo ? `Atualizado ${haQuanto(agora - resumo.em)}` : 'Atualiza sozinho a cada minuto de conversa.'}</span>
        <Chave ligada={ligado} rotulo="Resumo ao vivo" aoMudar={(v) => void salvar({ resumoAoVivo: v })} />
      </div>
      {resumo ? (
        <div className="resumo-ao-vivo">
          <Markdown texto={resumo.texto} />
        </div>
      ) : (
        <p className="vazio-aba">{ligado ? 'O resumo aparece depois de alguns trechos de conversa.' : 'Resumo ao vivo desligado.'}</p>
      )}
    </div>
  );
}

const ICONES: Record<TipoInsight, ReactElement> = {
  oportunidade: <TrendUp size={13} weight="bold" />,
  risco: <Warning size={13} weight="bold" />,
  voz: <Microphone size={13} weight="bold" />,
  dica: <Lightbulb size={13} weight="bold" />,
};
const NOMES: Record<TipoInsight, string> = { oportunidade: 'Oportunidade', risco: 'Atenção', voz: 'Sua voz', dica: 'Dica' };

export function AbaInsights() {
  const dados = useAoVivo((s) => s.dados);
  const ligado = useDominio((s) => s.configuracoes?.insightsAoVivo ?? false);
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const m = dados.metricas;
  const lista: Insight[] = [...dados.insights].reverse();
  return (
    <div className="corpo-aba">
      <div className="topo-aba">
        <span className="t2">Só o que vale a pena. Usa um pouco de IA a cada ~40 s de conversa.</span>
        <Chave ligada={ligado} rotulo="Insights ao vivo" aoMudar={(v) => void salvar({ insightsAoVivo: v })} />
      </div>
      {(m.suaParte > 0 || m.seuRitmo) && (
        <div className="metricas-voz">
          <div className="metrica">
            <span className="rot">Sua parte da fala</span>
            <div className="trilho">
              <span style={{ width: `${Math.round(m.suaParte * 100)}%`, background: m.suaParte > 0.7 ? 'var(--vermelho)' : 'var(--verde)' }} />
            </div>
            <span className="val">{Math.round(m.suaParte * 100)}%</span>
          </div>
          <div className="metrica">
            <span className="rot">Seu ritmo</span>
            <span className="val">{m.seuRitmo ? `${Math.round(m.seuRitmo)} palavras/min` : '—'}</span>
          </div>
        </div>
      )}
      {lista.length ? (
        <div className="lista-insights">
          {lista.map((i) => (
            <div key={i.id} className={`insight insight-${i.tipo}`}>
              <span className="tipo">
                {ICONES[i.tipo]} {NOMES[i.tipo]}
              </span>
              <span className="texto">{i.texto}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="vazio-aba">
          <Sparkle size={14} /> {ligado ? 'Nenhum insight ainda. Eles aparecem quando houver algo útil.' : 'Ligue para receber insights durante a call.'}
        </p>
      )}
    </div>
  );
}

function useAgora(): number {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  return agora;
}

function haQuanto(ms: number): string {
  if (ms < 60_000) return 'agora há pouco';
  return `há ${Math.round(ms / 60_000)} min`;
}
