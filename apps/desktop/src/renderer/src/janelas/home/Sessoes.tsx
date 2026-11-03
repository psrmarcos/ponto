import { useCallback, useEffect, useState } from 'react';
import { ArrowClockwise, CaretRight, Copy, DownloadSimple, FolderOpen, Trash } from '@phosphor-icons/react';
import type { Sessao, SessaoNaLista } from '@ponto/shared';
import { api } from '../../api/cliente';
import { Markdown } from '../../ui/Markdown';

/**
 * Histórico das calls: cada sessão com a ata (gerada ao encerrar) e a
 * transcrição. Exportar salva um .md em Documentos/Ponto, sem diálogo do
 * sistema, porque diálogos nativos aparecem em gravações de tela.
 */
export function Sessoes() {
  const [lista, setLista] = useState<SessaoNaLista[] | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);

  const carregar = useCallback(() => {
    api
      .get<SessaoNaLista[]>('/sessoes')
      .then(setLista)
      .catch(() => setLista((l) => l ?? []));
  }, []);

  useEffect(() => {
    const parar = api.quandoConectar(carregar);
    const pararEventos = api.ouvir((e) => {
      if (e.tipo === 'sessao.resumo') carregar();
    });
    return () => {
      parar();
      pararEventos();
    };
  }, [carregar]);

  return (
    <>
      <h2>Sessões</h2>
      <p className="lead">A ata de cada call fica pronta quando você encerra a transcrição. Tudo salvo só no seu PC.</p>
      <div className="lista">
        {lista === null && <div className="vazio" style={{ padding: 32 }}>Carregando…</div>}
        {lista?.length === 0 && (
          <div className="vazio" style={{ padding: 32 }}>
            <span className="t1">Nenhuma sessão ainda</span>
            <span>Comece uma transcrição (Ctrl+Shift+G). Ao encerrar, a ata aparece aqui.</span>
          </div>
        )}
        {lista?.map((s) => (
          <ItemSessao
            key={s.id}
            sessao={s}
            aberta={aberta === s.id}
            alternar={() => setAberta((a) => (a === s.id ? null : s.id))}
            aoMudar={carregar}
          />
        ))}
      </div>
    </>
  );
}

function ItemSessao({
  sessao,
  aberta,
  alternar,
  aoMudar,
}: {
  sessao: SessaoNaLista;
  aberta: boolean;
  alternar: () => void;
  aoMudar: () => void;
}) {
  const [detalhe, setDetalhe] = useState<Sessao | null>(null);
  const [aviso, setAviso] = useState<{ texto: string; caminho?: string } | null>(null);
  const [confirmarApagar, setConfirmarApagar] = useState(false);

  // Recarrega a ata quando abre e quando ela muda (gerada ou refeita).
  useEffect(() => {
    if (!aberta) return;
    api.get<Sessao>(`/sessoes/${sessao.id}`).then(setDetalhe).catch(() => setDetalhe(null));
  }, [aberta, sessao.id, sessao.temResumo, sessao.gerandoResumo, sessao.titulo]);

  const markdown = () => api.get<string>(`/sessoes/${sessao.id}/markdown`);

  const exportar = async () => {
    try {
      const conteudo = await markdown();
      const { caminho } = await window.ponto.invocar('arquivo.salvarMarkdown', { nome: nomeArquivo(sessao), conteudo });
      setAviso({ texto: 'Salvo em Documentos/Ponto.', caminho });
    } catch {
      setAviso({ texto: 'Não consegui salvar o arquivo.' });
    }
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(await markdown());
      setAviso({ texto: 'Copiado em Markdown.' });
    } catch {
      setAviso({ texto: 'Não consegui copiar.' });
    }
  };

  const refazer = () => {
    setAviso(null);
    void api.post(`/sessoes/${sessao.id}/resumo`).then(aoMudar);
  };

  const apagar = async () => {
    await api.delete(`/sessoes/${sessao.id}`).catch(() => undefined);
    aoMudar();
  };

  return (
    <div className={`sessao-item${aberta ? ' aberta' : ''}`}>
      <button type="button" className="linha-lista sessao-cabeca" aria-expanded={aberta} onClick={alternar}>
        <CaretRight className="seta" size={14} weight="bold" />
        <span className="principal">
          <span className="t1">{sessao.titulo}</span>
          <span className="t2">
            {quando(sessao.iniciadaEm)} · {relogio(sessao.duracaoMs)} · {sessao.totalFalas} falas
            {!sessao.encerradaEm && ' · em andamento'}
          </span>
        </span>
        {sessao.gerandoResumo ? (
          <span className="tag">Escrevendo a ata…</span>
        ) : sessao.temResumo ? (
          <span className="tag tag-ok">Ata pronta</span>
        ) : null}
      </button>
      {aberta && (
        <div className="sessao-corpo">
          <div className="sessao-acoes">
            <button type="button" className="btn-sec" onClick={() => void exportar()}>
              <DownloadSimple size={14} /> Exportar .md
            </button>
            <button type="button" className="btn-sec" onClick={() => void copiar()}>
              <Copy size={14} /> Copiar
            </button>
            <button type="button" className="btn-sec" disabled={sessao.gerandoResumo || !sessao.totalFalas} onClick={refazer}>
              <ArrowClockwise size={14} /> {sessao.temResumo ? 'Refazer ata' : 'Gerar ata'}
            </button>
            <span className="espaco" />
            {confirmarApagar ? (
              <>
                <span className="t2">Apagar de vez?</span>
                <button type="button" className="btn-sec perigo" onClick={() => void apagar()}>
                  Apagar
                </button>
                <button type="button" className="btn-sec" onClick={() => setConfirmarApagar(false)}>
                  Cancelar
                </button>
              </>
            ) : (
              <button type="button" className="btn-sec" aria-label="Apagar sessão" onClick={() => setConfirmarApagar(true)}>
                <Trash size={14} />
              </button>
            )}
          </div>
          {aviso && (
            <div className="sessao-aviso">
              {aviso.texto}
              {aviso.caminho && (
                <button type="button" className="link" onClick={() => void window.ponto.invocar('arquivo.mostrar', { caminho: aviso.caminho! })}>
                  <FolderOpen size={13} /> Mostrar na pasta
                </button>
              )}
            </div>
          )}
          <div className="sessao-ata">
            {detalhe?.resumo ? (
              <Markdown texto={detalhe.resumo} />
            ) : sessao.gerandoResumo ? (
              <p className="t2">Escrevendo a ata da call…</p>
            ) : (
              <p className="t2">
                {sessao.totalFalas < 4 ? 'Call curta demais para uma ata automática. Dá para gerar mesmo assim.' : 'Sem ata ainda.'}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function nomeArquivo(s: SessaoNaLista): string {
  const d = new Date(s.iniciadaEm);
  const data = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${data} ${s.titulo}`;
}

function quando(ms: number): string {
  const d = new Date(ms);
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}, ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function relogio(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h${String(m).padStart(2, '0')}` : `${m} min`;
}
