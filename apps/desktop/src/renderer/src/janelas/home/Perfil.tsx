import { useEffect, useState } from 'react';
import type { IdSegredo, ResultadoTesteChave, StatusSegredo } from '@ponto/shared';
import { api } from '../../api/cliente';
import { useDominio } from '../../estado/dominio';

const CHAVES: Array<{ id: IdSegredo; nome: string; dica: string; placeholder: string; testavel: boolean }> = [
  { id: 'openrouter', nome: 'OpenRouter', dica: 'Usada para todos os modelos de IA por enquanto.', placeholder: 'sk-or-...', testavel: true },
  { id: 'deepgram', nome: 'Deepgram', dica: 'Transcrição na nuvem (entra com a captura de áudio).', placeholder: 'Cole sua chave', testavel: false },
];

export function Perfil() {
  const config = useDominio((s) => s.configuracoes);
  const salvar = useDominio((s) => s.salvarConfiguracoes);
  const [status, setStatus] = useState<Partial<Record<IdSegredo, StatusSegredo>> | null>(null);

  useEffect(() => {
    void window.ponto.invocar('segredos.status').then(setStatus);
  }, []);

  return (
    <>
      <h2>Perfil e conta</h2>
      <span className="grupo-titulo">Você</span>
      <div className="grupo">
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Nome</div>
            <div className="t2">O copiloto usa para saber quem é "Você" na conversa.</div>
          </div>
          <input
            className="campo-texto"
            defaultValue={config?.nomeUsuario ?? ''}
            key={`n-${config ? 1 : 0}`}
            maxLength={80}
            aria-label="Nome"
            onBlur={(e) => void salvar({ nomeUsuario: e.target.value.trim() })}
          />
        </div>
        <div className="ajuste">
          <div className="principal">
            <div className="t1">Cargo e contexto</div>
            <div className="t2">Ajuda o agente a responder como você. Ex.: dev full-stack, 6 anos, React e Node.</div>
          </div>
          <input
            className="campo-texto"
            defaultValue={config?.contextoUsuario ?? ''}
            key={`c-${config ? 1 : 0}`}
            maxLength={2000}
            aria-label="Cargo e contexto"
            onBlur={(e) => void salvar({ contextoUsuario: e.target.value.trim() })}
          />
        </div>
      </div>

      <span className="grupo-titulo">Chaves de API</span>
      <div className="grupo">
        {CHAVES.map((c) => (
          <LinhaChave key={c.id} {...c} status={status?.[c.id]} aoMudar={(s) => setStatus((st) => (st ? { ...st, [c.id]: s } : st))} />
        ))}
      </div>
      <p className="lead" style={{ margin: 0, fontSize: 12.5 }}>
        As chaves ficam só neste PC, cifradas pelo cofre do sistema. Nenhuma janela consegue ler o valor depois de salvo.
      </p>
    </>
  );
}

function LinhaChave(props: {
  id: IdSegredo;
  nome: string;
  dica: string;
  placeholder: string;
  testavel: boolean;
  status?: StatusSegredo;
  aoMudar: (s: StatusSegredo) => void;
}) {
  const [valor, setValor] = useState('');
  const [teste, setTeste] = useState<ResultadoTesteChave | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const salvar = async (v: string | null) => {
    setOcupado(true);
    setErro(null);
    setTeste(null);
    try {
      props.aoMudar(await window.ponto.invocar('segredos.definir', { id: props.id, valor: v }));
      setValor('');
      // A API recebe a chave nova pelo canal privado; um instante depois já dá para testar.
      if (v && props.testavel) setTimeout(() => void testar(), 300);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  };

  const testar = async () => {
    setOcupado(true);
    try {
      setTeste(await api.post<ResultadoTesteChave>(`/ia/provedores/${props.id}/testar`));
    } catch (e) {
      setTeste({ ok: false, mensagem: (e as Error).message });
    } finally {
      setOcupado(false);
    }
  };

  const configurada = props.status?.configurado;
  return (
    <div className="ajuste">
      <div className="principal">
        <div className="t1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {props.nome}
          {configurada ? <span className="selo-status ok">salva ····{props.status?.final}</span> : <span className="selo-status">não configurada</span>}
          {teste && <span className={`selo-status ${teste.ok ? 'ok' : 'ruim'}`}>{teste.mensagem}{teste.creditoRestanteUsd != null ? ` · crédito US$ ${teste.creditoRestanteUsd.toFixed(2)}` : ''}</span>}
        </div>
        <div className="t2">{erro ?? props.dica}</div>
      </div>
      <input
        className="campo-texto"
        type="password"
        placeholder={configurada ? 'Trocar a chave' : props.placeholder}
        value={valor}
        autoComplete="off"
        aria-label={`Chave do ${props.nome}`}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && valor.trim() && void salvar(valor.trim())}
      />
      <button type="button" className="btn-sec" disabled={ocupado || !valor.trim()} onClick={() => void salvar(valor.trim())}>
        Salvar
      </button>
      {configurada && props.testavel && (
        <button type="button" className="btn-sec" disabled={ocupado} onClick={() => void testar()}>
          Testar
        </button>
      )}
      {configurada && (
        <button type="button" className="btn-sec" disabled={ocupado} style={{ color: 'var(--vermelho)' }} onClick={() => void salvar(null)}>
          Remover
        </button>
      )}
    </div>
  );
}
