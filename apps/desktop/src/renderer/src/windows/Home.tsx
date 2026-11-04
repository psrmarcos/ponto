import { useEffect, useState, type ReactNode } from 'react';
import { CopySimple, House, ListBullets, Minus, Robot, SlidersHorizontal, Square, User, X } from '@phosphor-icons/react';
import { useApiStatus, useAppState, useStealth } from '../state/app';
import { useDomain } from '../state/domain';
import { Logo } from '../ui/Logo';
import { Settings } from './home/Settings';
import { Profile } from './home/Profile';
import { Sessions } from './home/Sessions';
import { Agents } from './home/Agents';
import { Stats } from './home/Stats';

type Section = 'overview' | 'sessions' | 'agents' | 'settings' | 'profile';

const NAV: Array<{ id: Section; label: string; icon: ReactNode }> = [
  { id: 'overview', label: 'Início', icon: <House size={16} /> },
  { id: 'sessions', label: 'Sessões', icon: <ListBullets size={16} /> },
  { id: 'agents', label: 'Agentes', icon: <Robot size={16} /> },
  { id: 'settings', label: 'Configurações', icon: <SlidersHorizontal size={16} /> },
  { id: 'profile', label: 'Perfil e conta', icon: <User size={16} /> },
];

export function Home() {
  const [section, setSection] = useState<Section>('overview');

  return (
    <div className="panel-window home-window" style={{ flexDirection: 'column' }}>
      <div className="panel solid">
        <WindowBar />
        <div className="home">
          <nav className="sidebar" aria-label="Seções">
            {NAV.map((n) => (
              <button
                type="button"
                key={n.id}
                className="nav-item"
                aria-current={section === n.id ? 'page' : undefined}
                onClick={() => setSection(n.id)}
              >
                {n.icon}
                {n.label}
              </button>
            ))}
          </nav>
          <div className="content">
            <section className="section active">
              {section === 'overview' && <Overview goTo={setSection} />}
              {section === 'sessions' && <Sessions />}
              {section === 'agents' && <Agents />}
              {section === 'settings' && <Settings />}
              {section === 'profile' && <Profile />}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}

function WindowBar() {
  const [maximized, setMaximized] = useState(false);
  const control = (action: 'minimize' | 'maximize' | 'state') =>
    void window.ponto.invoke('window.control', { action }).then((r) => setMaximized(r.maximized));

  useEffect(() => {
    control('state');
    const onResize = () => control('state');
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  return (
    <div className="window-bar" onDoubleClick={() => control('maximize')}>
      <Logo size={22} />
      <div className="spacer" />
      <button
        type="button"
        className="window-btn"
        aria-label="Minimizar"
        onClick={() => control('minimize')}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label={maximized ? 'Restaurar' : 'Maximizar'}
        onClick={() => control('maximize')}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        {maximized ? <CopySimple size={13} /> : <Square size={12} />}
      </button>
      <button
        type="button"
        className="window-btn close"
        aria-label="Fechar"
        onClick={() => void window.ponto.invoke('window.toggle', { id: 'home', visible: false })}
        onDoubleClick={(e) => e.stopPropagation()}
      >
        <X size={14} />
      </button>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

function Overview({ goTo }: { goTo: (s: Section) => void }) {
  const userName = useDomain((s) => s.settings?.userName);
  const stealth = useStealth();
  const apiStatus = useApiStatus();
  const hasKey = useAppState((s) => s.state?.configuredSecrets.includes('openrouter') ?? false);

  return (
    <>
      <h2>
        {greeting()}
        {userName ? `, ${userName}` : ''}
      </h2>
      <p className="lead">
        {stealth.enabled ? 'O app está invisível em gravações e prints.' : 'Atenção: o app está visível em gravações e prints.'}
        {apiStatus !== 'ready' && ' O motor local está iniciando…'}
      </p>
      {!hasKey && (
        <div className="callout">
          <div className="txt">
            <div className="t1">Cadastre sua chave de IA</div>
            <div className="t2">
              Com uma chave do OpenRouter o chat já funciona com qualquer modelo. Ela fica cifrada só neste PC.
            </div>
          </div>
          <button type="button" className="primary-btn" onClick={() => goTo('profile')}>
            Cadastrar chave
          </button>
        </div>
      )}
      <Stats />
    </>
  );
}
