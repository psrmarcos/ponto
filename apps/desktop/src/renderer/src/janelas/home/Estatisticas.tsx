import { useCallback, useEffect, useState } from 'react';
import type { Estatisticas as Dados } from '@ponto/shared';
import { api } from '../../api/cliente';
import { useDominio } from '../../estado/dominio';

const NOMES_ORIGEM: Record<string, string> = {
  chat: 'Chat',
  transcricao: 'Transcrição',
  decisao: 'Detectar perguntas',
  resumo: 'Atas',
  compactacao: 'Contexto da call',
  resumo_ao_vivo: 'Resumo ao vivo',
  insights: 'Insights',
  compressao_chat: 'Comprimir conversa',
  traducao: 'Tradução',
};

/** Números do Início: sessões, horas, sua parte da fala, custos e os últimos 14 dias. */
export function Estatisticas() {
  const [d, setD] = useState<Dados | null>(null);
  const agentes = useDominio((s) => s.agentes);
  const carregar = useCallback(() => void api.get<Dados>('/estatisticas').then(setD).catch(() => undefined), []);

  useEffect(() => {
    const parar = api.quandoConectar(carregar);
    const pararEventos = api.ouvir((e) => {
      if (e.tipo === 'sessao.resumo' || e.tipo === 'uso') carregar();
    });
    return () => {
      parar();
      pararEventos();
    };
  }, [carregar]);

  if (!d) return null;
  const maxMin = Math.max(1, ...d.porDia.map((x) => x.minutos));
  const totalOrigem = d.custo.porOrigemMes.reduce((n, o) => n + o.custoUsd, 0) || 1;
  const nomeAgente = (id: string) => agentes.find((a) => a.id === id)?.nome ?? id;

  return (
    <>
      <div className="cartoes cartoes-4">
        <Cartao rotulo="Sessões no mês" valor={String(d.sessoes.noMes)} sub={`${d.sessoes.naSemana} nos últimos 7 dias · ${d.sessoes.total} no total`} />
        <Cartao rotulo="Horas de call no mês" valor={horas(d.horasGravadas.noMes)} sub={`${horas(d.horasGravadas.total)} no total`} />
        <Cartao
          rotulo="Sua parte da fala"
          valor={`${Math.round(d.falas.suaParte * 100)}%`}
          sub={`${milhar(d.palavras.suas)} palavras suas · ${milhar(d.palavras.outros)} dos outros`}
        />
        <Cartao rotulo="Custo de IA no mês" valor={`US$ ${d.custo.mesUsd.toFixed(2)}`} sub={`média de US$ ${d.custo.mediaPorSessaoUsd.toFixed(3)} por sessão`} />
      </div>

      <div className="paineis-inicio">
        <div className="cartao">
          <span className="rot">Minutos de call nos últimos 14 dias</span>
          <div className="grafico-dias" role="img" aria-label="Minutos de call por dia">
            {d.porDia.map((x) => (
              <div key={x.dia} className="coluna-dia" data-dica={`${diaCurto(x.dia)}: ${Math.round(x.minutos)} min, ${x.sessoes} ${x.sessoes === 1 ? 'sessão' : 'sessões'}, US$ ${x.custoUsd.toFixed(3)}`}>
                <span className="barra-dia" style={{ height: `${Math.max(x.minutos > 0 ? 6 : 2, (x.minutos / maxMin) * 100)}%` }} />
                <span className="rotulo-dia">{diaCurto(x.dia).slice(0, 2)}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="cartao">
          <span className="rot">Onde o dinheiro foi (mês)</span>
          {d.custo.porOrigemMes.length ? (
            <ul className="lista-origem">
              {d.custo.porOrigemMes.slice(0, 6).map((o) => (
                <li key={o.origem}>
                  <span className="nome">{NOMES_ORIGEM[o.origem] ?? o.origem}</span>
                  <span className="trilho">
                    <span style={{ width: `${(o.custoUsd / totalOrigem) * 100}%` }} />
                  </span>
                  <span className="num">US$ {o.custoUsd.toFixed(3)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <span className="t2">Nada gasto ainda este mês.</span>
          )}
        </div>
      </div>

      <div className="cartoes cartoes-3">
        <Cartao rotulo="Perguntas ao chat" valor={milhar(d.perguntasAoChat.total)} sub={`${d.perguntasAoChat.detectadas} detectadas sozinhas na call`} />
        <Cartao rotulo="Falas transcritas" valor={milhar(d.falas.total)} />
        <Cartao rotulo="Agente mais usado" valor={d.agentes[0] ? nomeAgente(d.agentes[0].agenteId) : '—'} sub={d.agentes[0] ? `${d.agentes[0].sessoes} sessões` : undefined} />
      </div>
    </>
  );
}

function Cartao({ rotulo, valor, sub }: { rotulo: string; valor: string; sub?: string }) {
  return (
    <div className="cartao">
      <span className="rot">{rotulo}</span>
      <span className="val">{valor}</span>
      {sub && <span className="sub">{sub}</span>}
    </div>
  );
}

function horas(h: number): string {
  if (h < 1) return `${Math.round(h * 60)} min`;
  return `${h.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h`;
}

const milhar = (n: number) => n.toLocaleString('pt-BR');

function diaCurto(dia: string): string {
  const [a, m, d] = dia.split('-').map(Number) as [number, number, number];
  return new Date(a, m - 1, d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
}
