import { useEffect, useState } from 'react';
import type { KeyTestResult, SecretId, SecretStatus } from '@ponto/shared';
import { api } from '../../api/client';
import { useDomain } from '../../state/domain';

const KEYS: Array<{ id: SecretId; name: string; hint: string; placeholder: string; testable: boolean }> = [
  { id: 'openrouter', name: 'OpenRouter', hint: 'Usada para todos os modelos de IA por enquanto.', placeholder: 'sk-or-...', testable: true },
  { id: 'deepgram', name: 'Deepgram', hint: 'Opcional: outro serviço de transcrição (escolha em Configurações).', placeholder: 'Cole sua chave', testable: false },
];

export function Profile() {
  const settings = useDomain((s) => s.settings);
  const saveSettings = useDomain((s) => s.saveSettings);
  const [status, setStatus] = useState<Partial<Record<SecretId, SecretStatus>> | null>(null);

  useEffect(() => {
    void window.ponto.invoke('secrets.status').then(setStatus);
  }, []);

  return (
    <>
      <h2>Perfil e conta</h2>
      <span className="group-title">Você</span>
      <div className="group">
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Nome</div>
            <div className="t2">O copiloto usa para saber quem é "Você" na conversa.</div>
          </div>
          <input
            className="text-input"
            defaultValue={settings?.userName ?? ''}
            key={`n-${settings ? 1 : 0}`}
            maxLength={80}
            aria-label="Nome"
            onBlur={(e) => void saveSettings({ userName: e.target.value.trim() })}
          />
        </div>
        <div className="setting-row">
          <div className="main-col">
            <div className="t1">Cargo e contexto</div>
            <div className="t2">Ajuda o agente a responder como você. Ex.: dev full-stack, 6 anos, React e Node.</div>
          </div>
          <input
            className="text-input"
            defaultValue={settings?.userContext ?? ''}
            key={`c-${settings ? 1 : 0}`}
            maxLength={2000}
            aria-label="Cargo e contexto"
            onBlur={(e) => void saveSettings({ userContext: e.target.value.trim() })}
          />
        </div>
      </div>

      <span className="group-title">Chaves de API</span>
      <div className="group">
        {KEYS.map((k) => (
          <KeyRow key={k.id} {...k} status={status?.[k.id]} onChange={(s) => setStatus((st) => (st ? { ...st, [k.id]: s } : st))} />
        ))}
      </div>
      <p className="lead" style={{ margin: 0, fontSize: 12.5 }}>
        As chaves ficam só neste PC, cifradas pelo cofre do sistema. Nenhuma janela consegue ler o valor depois de salvo.
      </p>
    </>
  );
}

function KeyRow(props: {
  id: SecretId;
  name: string;
  hint: string;
  placeholder: string;
  testable: boolean;
  status?: SecretStatus;
  onChange: (s: SecretStatus) => void;
}) {
  const [value, setValue] = useState('');
  const [testResult, setTestResult] = useState<KeyTestResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (v: string | null) => {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      props.onChange(await window.ponto.invoke('secrets.set', { id: props.id, value: v }));
      setValue('');
      // The API receives the new key over the private parent channel; a brief moment later it can be tested.
      if (v && props.testable) setTimeout(() => void testKey(), 300);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const testKey = async () => {
    setBusy(true);
    try {
      setTestResult(await api.post<KeyTestResult>(`/ai/providers/${props.id}/test`));
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const configured = props.status?.configured;
  return (
    <div className="setting-row">
      <div className="main-col">
        <div className="t1" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {props.name}
          {configured ? (
            <span className="status-badge ok">salva ····{props.status?.lastFour}</span>
          ) : (
            <span className="status-badge">não configurada</span>
          )}
          {testResult && (
            <span className={`status-badge ${testResult.ok ? 'ok' : 'bad'}`}>
              {testResult.message}
              {testResult.remainingCreditUsd != null ? ` · crédito US$ ${testResult.remainingCreditUsd.toFixed(2)}` : ''}
            </span>
          )}
        </div>
        <div className="t2">{error ?? props.hint}</div>
      </div>
      <input
        className="text-input"
        type="password"
        placeholder={configured ? 'Trocar a chave' : props.placeholder}
        value={value}
        autoComplete="off"
        aria-label={`Chave do ${props.name}`}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && value.trim() && void save(value.trim())}
      />
      <button type="button" className="sec-btn" disabled={busy || !value.trim()} onClick={() => void save(value.trim())}>
        Salvar
      </button>
      {configured && props.testable && (
        <button type="button" className="sec-btn" disabled={busy} onClick={() => void testKey()}>
          Testar
        </button>
      )}
      {configured && (
        <button type="button" className="sec-btn" disabled={busy} style={{ color: 'var(--red)' }} onClick={() => void save(null)}>
          Remover
        </button>
      )}
    </div>
  );
}
