import { useState, type ReactNode } from 'react';
import { House, Info, ListBullets, Robot, SlidersHorizontal, User } from '@phosphor-icons/react';
import { useEstadoApp, useStatusApi, useStealth } from '../estado/app';
import { useDominio } from '../estado/dominio';
import { Cabecalho } from '../ui/Cabecalho';
import { Logo } from '../ui/Logo';
import { Configuracoes } from './home/Configuracoes';
import { Perfil } from './home/Perfil';

type Secao = 'inicio' | 'sessoes' | 'agentes' | 'config' | 'perfil' | 'sobre';

const NAV: Array<{ id: Secao; rotulo: string; icone: ReactNode }> = [
  { id: 'inicio', rotulo: 'Início', icone: <House size={16} /> },
  { id: 'sessoes', rotulo: 'Sessões', icone: <ListBullets size={16} /> },
  { id: 'agentes', rotulo: 'Agentes', icone: <Robot size={16} /> },
  { id: 'config', rotulo: 'Configurações', icone: <SlidersHorizontal size={16} /> },
  { id: 'perfil', rotulo: 'Perfil e conta', icone: <User size={16} /> },
  { id: 'sobre', rotulo: 'Sobre', icone: <Info size={16} /> },
];

export function Home() {
  const [secao, setSecao] = useState<Secao>('inicio');
  const nome = useDominio((s) => s.configuracoes?.nomeUsuario);

  return (
    <div className="janela-painel" style={{ flexDirection: 'column' }}>
      <div className="painel solido">
        <Cabecalho janela="home" icone={<Logo tamanho={26} />} titulo="Ponto" meta={<span className="meta">Home</span>} />
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
            <div className="rodape-lateral">
              <span className="avatar">{(nome || '?').slice(0, 1).toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{nome || 'Sem nome'}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-3)' }}>Open-source · local</div>
              </div>
            </div>
          </nav>
          <div className="conteudo">
            <section className="secao ativa">
              {secao === 'inicio' && <Inicio irPara={setSecao} />}
              {secao === 'sessoes' && <Sessoes />}
              {secao === 'agentes' && <Agentes />}
              {secao === 'config' && <Configuracoes />}
              {secao === 'perfil' && <Perfil />}
              {secao === 'sobre' && <Sobre />}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function saudacao(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function Inicio({ irPara }: { irPara: (s: Secao) => void }) {
  const nome = useDominio((s) => s.configuracoes?.nomeUsuario);
  const uso = useDominio((s) => s.uso);
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
      <div className="cartoes">
        <div className="cartao">
          <span className="rot">Custo de IA no mês</span>
          <span className="val">US$ {(uso?.custoMesUsd ?? 0).toFixed(2)}</span>
        </div>
        <div className="cartao">
          <span className="rot">Chamadas no mês</span>
          <span className="val">{uso?.chamadasMes ?? 0}</span>
        </div>
        <div className="cartao">
          <span className="rot">Tokens no mês</span>
          <span className="val">{formatarNumero(uso?.tokensMes ?? 0)}</span>
        </div>
      </div>
    </>
  );
}

function Sessoes() {
  return (
    <>
      <h2>Sessões</h2>
      <p className="lead">Transcrições, resumos e action items de cada call. Tudo salvo só no seu PC.</p>
      <div className="lista">
        <div className="vazio" style={{ padding: 32 }}>
          <span className="t1">Nenhuma sessão ainda</span>
          <span>As sessões aparecem aqui quando a captura de áudio entrar.</span>
        </div>
      </div>
    </>
  );
}

function Agentes() {
  const agentes = useDominio((s) => s.agentes);
  const ativo = useDominio((s) => s.configuracoes?.agenteAtivo);
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  return (
    <>
      <h2>Agentes</h2>
      <p className="lead">Cada agente tem seu próprio prompt e pode usar um modelo diferente. Criar e editar agentes vem em breve.</p>
      <div className="agentes-grid">
        {agentes.map((a) => (
          <div className="agente-card" key={a.id}>
            <div className="topo">
              <span className="ico">
                <Robot size={16} />
              </span>
              <span className="t1">{a.nome}</span>
              <span className="espaco" />
              <span className="tag">{a.embutido ? 'Built-in' : 'Seu'}</span>
            </div>
            <div className="t2">{a.descricao}</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button type="button" className="btn-sec" disabled={a.id === ativo} onClick={() => void salvar({ agenteAtivo: a.id })}>
                {a.id === ativo ? 'Em uso' : 'Usar'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function Sobre() {
  const versao = useEstadoApp((s) => s.estado?.versao);
  return (
    <>
      <h2>Sobre</h2>
      <p className="lead">Ponto {versao} · copiloto de IA local-first e open-source para calls.</p>
      <div className="grupo">
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Seus dados</div>
            <div className="t2">Transcrições, sessões e configurações ficam num banco SQLite no seu PC. Só o texto enviado para a IA sai da máquina.</div>
          </div>
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Código-fonte</div>
            <div className="t2">Repositório ainda não publicado.</div>
          </div>
        </div>
      </div>
    </>
  );
}

const formatarNumero = (n: number) => new Intl.NumberFormat('pt-BR', { notation: 'compact' }).format(n);
