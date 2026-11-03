import type { IdJanela } from '@ponto/shared';
import { useCliqueAtraves } from './hooks/useCliqueAtraves';
import { Agregador } from './janelas/Agregador';
import { Home } from './janelas/Home';
import { Tela } from './janelas/Tela';
import { Transcricao } from './janelas/Transcricao';

const JANELAS: Record<IdJanela, () => React.JSX.Element> = {
  agregador: Agregador,
  transcricao: Transcricao,
  tela: Tela,
  home: Home,
};

export function App({ janela }: { janela: IdJanela }) {
  // A Home é opaca e recebe todo clique; as outras deixam o clique atravessar fora das áreas sólidas.
  useCliqueAtraves(janela !== 'home');
  const Janela = JANELAS[janela] ?? Agregador;
  return <Janela />;
}
