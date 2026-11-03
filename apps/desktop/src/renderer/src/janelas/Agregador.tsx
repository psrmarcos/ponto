import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import {
  ArrowRight,
  Brain,
  CaretDown,
  CaretUp,
  ChatDots,
  Check,
  DotsSixVertical,
  DotsThree,
  Eye,
  EyeSlash,
  GearSix,
  Globe,
  House,
  Image as IconeImagem,
  MagicWand,
  Monitor,
  NotePencil,
  Play,
  Power,
  Robot,
  ScanSmiley,
  SignOut,
  Sparkle,
  Stop,
  Waveform,
  X,
} from '@phosphor-icons/react';
import { useEstadoApp, useJanelaVisivel, useStealth } from '../estado/app';
import { useChat, type Mensagem } from '../estado/chat';
import { useDominio } from '../estado/dominio';
import { Logo } from '../ui/Logo';
import { Markdown } from '../ui/Markdown';
import { Menu } from '../ui/Menu';
import { SeletorModelo } from '../ui/SeletorModelo';

const abrir = (id: 'home' | 'transcricao' | 'tela', visivel?: boolean) =>
  void window.ponto.invocar('janela.alternar', { id, visivel });

export function Agregador() {
  const [chatVisivel, setChatVisivel] = useState(true);
  useEffect(() => window.ponto.ouvir('chat.alternar', () => setChatVisivel((v) => !v)), []);

  return (
    <div className="palco">
      <Pilula chatVisivel={chatVisivel} alternarChat={() => setChatVisivel((v) => !v)} />
      <Chat visivel={chatVisivel} />
    </div>
  );
}

function Pilula({ chatVisivel, alternarChat }: { chatVisivel: boolean; alternarChat: () => void }) {
  const stealth = useStealth();
  const home = useJanelaVisivel('home');
  const transcricao = useJanelaVisivel('transcricao');
  const tela = useJanelaVisivel('tela');
  // A captura de áudio entra no M1; por enquanto o botão só alterna o estado visual.
  const [pausado, setPausado] = useState(false);

  return (
    <div className="pilula solido">
      <div className="alca" title="Arraste para mover" aria-label="Mover">
        <DotsSixVertical size={16} weight="bold" />
      </div>
      <Logo />
      <button type="button" className="btn-redondo" aria-pressed={home} title="Home e configurações" onClick={() => abrir('home')}>
        <House size={15} weight="bold" />
      </button>
      <span className={`ponto${pausado ? ' pausado' : ''}`} aria-hidden="true" />
      <button type="button" className="btn-pilula" aria-pressed={chatVisivel} title="Mostrar/esconder chat" onClick={alternarChat}>
        {chatVisivel ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
        <span>{chatVisivel ? 'Esconder' : 'Mostrar'}</span>
      </button>
      <button
        type="button"
        className={`btn-redondo ${pausado ? 'pausado' : 'gravando'}`}
        aria-label={pausado ? 'Iniciar' : 'Pausar'}
        title="Pausar / iniciar (a captura de áudio chega no próximo passo)"
        onClick={() => setPausado((v) => !v)}
      >
        {pausado ? <Play size={12} weight="fill" /> : <Stop size={12} weight="fill" />}
      </button>

      <span className="div-pilula" aria-hidden="true" />
      <button
        type="button"
        className="btn-redondo"
        aria-pressed={stealth.ligado}
        aria-label="Invisibilidade"
        title={stealth.ligado ? 'Invisível em gravações e prints' : 'Visível em gravações e prints'}
        onClick={() => void window.ponto.invocar('stealth.definir', { ligado: !stealth.ligado })}
      >
        {stealth.ligado ? <EyeSlash size={15} weight="bold" /> : <Eye size={15} weight="bold" />}
      </button>
      <button type="button" className="btn-redondo" aria-pressed={transcricao} title="Transcrição" onClick={() => abrir('transcricao')}>
        <Waveform size={15} weight="bold" />
      </button>
      <button type="button" className="btn-redondo" aria-pressed={tela} title="Tela" onClick={() => abrir('tela')}>
        <Monitor size={15} weight="bold" />
      </button>
      <span className="div-pilula" aria-hidden="true" />
      <button
        type="button"
        className="btn-redondo sair"
        aria-label="Fechar o app"
        title="Fechar o app (Ctrl+Shift+Q)"
        onClick={() => void window.ponto.invocar('app.sair')}
      >
        <Power size={15} weight="bold" />
      </button>
    </div>
  );
}

function Chat({ visivel }: { visivel: boolean }) {
  const enviar = useChat((s) => s.enviar);
  const temChave = useEstadoApp((s) => s.estado?.chavesConfiguradas.includes('openrouter') ?? true);

  return (
    <div className={`chat solido${visivel ? '' : ' escondido'}`}>
      <div className="atalhos">
        <button type="button" className="atalho" onClick={() => void enviar('', 'assist')}>
          <Sparkle size={16} /> Assist
        </button>
        <span className="sep">·</span>
        <button type="button" className="atalho" onClick={() => void enviar('', 'oQueDizer')}>
          <MagicWand size={16} /> O que devo dizer?
        </button>
        <span className="sep">·</span>
        <button type="button" className="atalho" onClick={() => void enviar('', 'followUp')}>
          <ChatDots size={16} /> Perguntas de follow-up
        </button>
      </div>
      {!temChave && (
        <div className="aviso">
          Cadastre sua chave do OpenRouter para o chat funcionar.{' '}
          <button type="button" className="btn-sec" style={{ height: 24, marginLeft: 6 }} onClick={() => abrir('home', true)}>
            Abrir Home
          </button>
        </div>
      )}
      <Mensagens />
      <Caixa />
    </div>
  );
}

function Mensagens() {
  const mensagens = useChat((s) => s.mensagens);
  const ref = useRef<HTMLDivElement>(null);
  const ultima = mensagens.at(-1);

  // Rola para o fim enquanto a resposta chega, a menos que a pessoa tenha subido para ler.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (perto) el.scrollTop = el.scrollHeight;
  }, [mensagens.length, ultima?.texto]);

  return (
    <div className="mensagens" ref={ref}>
      {mensagens.map((m) => (
        <Balao key={m.id} m={m} />
      ))}
    </div>
  );
}

function Balao({ m }: { m: Mensagem }) {
  if (m.papel === 'eu') {
    return (
      <div className="msg eu">
        {m.imagens?.length ? `🖼 ${m.imagens.length} imagem(ns) · ` : ''}
        {m.texto}
      </div>
    );
  }
  const escrevendo = m.estado === 'enviando' || m.estado === 'escrevendo';
  return (
    <div className={`msg ia${m.estado === 'erro' ? ' erro' : ''}`}>
      {m.estado === 'erro' ? m.texto : m.texto ? <Markdown texto={m.texto} /> : null}
      {escrevendo && <span className="digitando" />}
      {m.estado === 'pronta' && m.uso && (
        <div className="rodape-msg">
          {m.uso.modelo} · {m.uso.tokensEntrada + m.uso.tokensSaida} tokens · US$ {m.uso.custoUsd.toFixed(4)}
        </div>
      )}
    </div>
  );
}

function Caixa() {
  const { enviar, anexos, anexar, removerAnexo, web, raciocinio, alternarWeb, alternarRaciocinio, novaConversa } = useChat();
  const [texto, setTexto] = useState('');
  const entrada = useRef<HTMLTextAreaElement>(null);
  const stealth = useStealth();

  useEffect(() => {
    const el = entrada.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [texto]);

  const mandar = (atalho: 'assist' | null = null) => {
    void enviar(texto, atalho);
    setTexto('');
  };

  const teclas = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      mandar('assist');
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      mandar();
    }
  };

  const escolherImagem = async () => {
    const img = await window.ponto.invocar('arquivo.escolherImagem');
    if (img) anexar({ nome: img.nome, dataUrl: img.dataUrl });
  };

  return (
    <div className="caixa">
      {anexos.length > 0 && (
        <div className="anexos">
          {anexos.map((a) => (
            <div className="anexo" key={a.id}>
              <img alt="" src={a.dataUrl} />
              <span>{a.nome}</span>
              <button type="button" aria-label="Remover anexo" onClick={() => removerAnexo(a.id)}>
                <X size={12} weight="bold" />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea
        ref={entrada}
        rows={1}
        value={texto}
        placeholder="Pergunte sobre a tela ou a conversa..."
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={teclas}
      />
      <div className="dica">
        <kbd>Ctrl</kbd>
        <kbd>↵</kbd> para Assist · <kbd>↵</kbd> para enviar
      </div>
      <div className="barra">
        <SeletorAgente />
        <SeletorModelo />
        <button type="button" className="chip" aria-pressed={web} title="Pesquisa na web" onClick={alternarWeb}>
          <Globe size={14} /> Web
        </button>
        <button type="button" className="chip" aria-pressed={raciocinio} title="Pensar mais antes de responder" onClick={alternarRaciocinio}>
          <Brain size={14} /> Raciocínio
        </button>

        <Menu
          botao={({ aberto, alternar }) => (
            <button type="button" className="icone" aria-label="Mais opções" aria-expanded={aberto} aria-haspopup="menu" onClick={alternar}>
              <DotsThree size={18} weight="bold" />
            </button>
          )}
        >
          {(fechar) => (
            <>
              <button
                type="button"
                className="item"
                role="menuitemcheckbox"
                aria-checked={stealth.ligado}
                onClick={() => void window.ponto.invocar('stealth.definir', { ligado: !stealth.ligado })}
              >
                <EyeSlash size={16} />
                <span className="rotulo">
                  Invisibilidade
                  <br />
                  <span className="sub">Some de gravações e da tela compartilhada</span>
                </span>
                <span className={`chave${stealth.ligado ? ' ligada' : ''}`} aria-hidden="true" />
              </button>
              <div className="divisor" />
              <button type="button" className="item" role="menuitem" onClick={() => { novaConversa(); fechar(); }}>
                <NotePencil size={16} />
                <span className="rotulo">Nova conversa</span>
              </button>
              <button type="button" className="item" role="menuitem" onClick={() => { abrir('home', true); fechar(); }}>
                <GearSix size={16} />
                <span className="rotulo">Configurações</span>
              </button>
              <div className="divisor" />
              <button type="button" className="item" role="menuitem" onClick={() => void window.ponto.invocar('app.sair')}>
                <SignOut size={16} />
                <span className="rotulo">Fechar o app</span>
              </button>
            </>
          )}
        </Menu>

        <div className="espaco" />
        <button type="button" className="icone" aria-label="Tirar print da tela" title="Print da tela (chega com a janela Tela)" disabled>
          <ScanSmiley size={17} />
        </button>
        <button type="button" className="icone" aria-label="Adicionar imagem" title="Adicionar imagem" onClick={() => void escolherImagem()}>
          <IconeImagem size={17} />
        </button>
        <button type="button" className="enviar" aria-label="Enviar" onClick={() => mandar()}>
          <ArrowRight size={15} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function SeletorAgente() {
  const agentes = useDominio((s) => s.agentes);
  const ativo = useDominio((s) => s.configuracoes?.agenteAtivo ?? 'geral');
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const atual = agentes.find((a) => a.id === ativo);

  return (
    <Menu
      className="agentes"
      botao={({ aberto, alternar }) => (
        <button type="button" className="chip" aria-haspopup="menu" aria-expanded={aberto} title="Agente" onClick={alternar}>
          <Robot size={14} />
          <span>{atual?.nome ?? 'Geral'}</span>
          <CaretDown size={12} weight="bold" />
        </button>
      )}
    >
      {(fechar) => (
        <>
          <div className="menu-titulo">Selecionar agente</div>
          {agentes.map((a) => (
            <button
              type="button"
              key={a.id}
              className="item agente"
              role="menuitemradio"
              aria-checked={a.id === ativo}
              onClick={() => {
                void salvar({ agenteAtivo: a.id });
                fechar();
              }}
            >
              <span>
                <span className="nome">{a.nome}</span>
                <span className="meta">
                  <span className="selo">{a.embutido ? 'Built-in' : 'Seu'}</span>
                  {a.categoria}
                </span>
              </span>
              <Check className="check" size={14} weight="bold" />
            </button>
          ))}
          <div className="divisor" />
          <button type="button" className="item" role="menuitem" onClick={() => { abrir('home', true); fechar(); }}>
            <span className="rotulo">Gerenciar agentes</span>
          </button>
        </>
      )}
    </Menu>
  );
}
