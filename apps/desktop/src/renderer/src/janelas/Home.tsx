import { useEffect, useState, type ReactNode } from 'react';
import { CopySimple, House, ListBullets, Minus, Robot, SlidersHorizontal, Square, User, X } from '@phosphor-icons/react';
import { useEstadoApp, useStatusApi, useStealth } from '../estado/app';
import { useDominio } from '../estado/dominio';
import { Logo } from '../ui/Logo';
import { Configuracoes } from './home/Configuracoes';
import { Perfil } from './home/Perfil';
import { Sessoes } from './home/Sessoes';
import { Agentes } from './home/Agentes';
import { Estatisticas } from './home/Estatisticas';

type Secao = 'inicio' | 'sessoes' | 'agentes' | 'config' | 'perfil';

const NAV: Array<{ id: Secao; rotulo: string; icone: ReactNode }> = [
  { id: 'inicio', rotulo: 'Início', icone: <House size={16} /> },
  { id: 'sessoes', rotulo: 'Sessões', icone: <ListBullets size={16} /> },
  { id: 'agentes', rotulo: 'Agentes', icone: <Robot size={16} /> },
  { id: 'config', rotulo: 'Configurações', icone: <SlidersHorizontal size={16} /> },
  { id: 'perfil', rotulo: 'Perfil e conta', icone: <User size={16} /> },
];

export function Home() {
  const [secao, setSecao] = useState<Secao>('inicio');

  return (
    <div className="janela-painel janela-home" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <BarraJanela />
        <div className="home">
          <nav className="lateral" aria-label="Seções">
            {NAV.map((n) => (
              <button
                type="button"
                key={n.id}
                className="nav"
                aria-current={secao === n.id ? 'page' : undefined}
                onClick={() => setSecao(n.id)}
              >
                {n.icone}
                {n.rotulo}
              </button>
            ))}
          </nav>
          <div className="conteudo">
            <section className="secao ativa">
              {secao === 'inicio' && <Inicio irPara={setSecao} />}
              {secao === 'sessoes' && <Sessoes />}
              {secao === 'agentes' && <Agentes />}
              {secao === 'config' && <Configuracoes />}
              {secao === 'perfil' && <Perfil />}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Barra de título de janela normal: arrasta pela barra toda, duplo clique maximiza. */
function BarraJanela() {
  const [maximizada, setMaximizada] = useState(false);
  const controlar = (acao: 'minimizar' | 'maximizar' | 'estado') =>
    void window.ponto.invocar('janela.controlar', { acao }).then((r) => setMaximizada(r.maximizada));

  useEffect(() => {
    controlar('estado');
    // Maximizar pelo Windows (Win+↑, arrastar ao topo) também troca o ícone.
    const aoRedimensionar = () => controlar('estado');
    window.addEventListener('resize', aoRedimensionar);
    return () => window.removeEventListener('resize', aoRedimensionar);
  }, []);

  return (
    <div className="barra-janela" onDoubleClick={() => controlar('maximizar')}>
      <Logo tamanho={22} />
      <div className="espaco" />
      <button type="button" className="botao-janela" aria-label="Minimizar" onClick={() => controlar('minimizar')} onDoubleClick={(e) => e.stopPropagation()}>
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="botao-janela"
        aria-label={maximizada ? 'Restaurar' : 'Maximizar'}
        onClick={() => controlar('maximizar')}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {maximizada ? <CopySimple size={13} /> : <Square size={12} />}
      </button>
      <button
        type="button"
        className="botao-janela fechar"
        aria-label="Fechar"
        onClick={() => void window.ponto.invocar('janela.alternar', { id: 'home', visivel: false })}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function saudacao(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function Inicio({ irPara }: { irPara: (s: Secao) => void }) {
  const nome = useDominio((s) => s.configuracoes?.nomeUsuario);
  const stealth = useStealth();
  const statusApi = useStatusApi();
  const temChave = useEstadoApp((s) => s.estado?.chavesConfiguradas.includes('openrouter') ?? false);

  return (
    <>
      <h2>
        {saudacao()}
        {nome ? `, ${nome}` : ''}
      </h2>
      <p className="lead">
        {stealth.ligado ? 'O app está invisível em gravações e prints.' : 'Atenção: o app está visível em gravações e prints.'}
        {statusApi !== 'pronta' && ' O motor local está iniciando…'}
      </p>
      {!temChave && (
        <div className="destaque">
          <div className="txt">
            <div className="t1">Cadastre sua chave de IA</div>
            <div className="t2">Com uma chave do OpenRouter o chat já funciona com qualquer modelo. Ela fica cifrada só neste PC.</div>
          </div>
          <button type="button" className="botao-primario" onClick={() => irPara('perfil')}>
            Cadastrar chave
          </button>
        </div>
      )}
      <Estatisticas />
    </>
  );
}

