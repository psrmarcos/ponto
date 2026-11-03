import { execFile } from 'node:child_process';
import { clipboard } from 'electron';

/** Texto selecionado maior que isso é cortado (o chat não precisa de um livro). */
const MAX_CHARS = 6000;
const MARCA = '⁣ponto-selecao⁣';

/**
 * Script do Windows: espera você soltar as teclas do atalho (senão o Ctrl+C sai
 * como Ctrl+Shift+C), aperta Ctrl+C no app em foco e devolve na hora.
 * keybd_event é a forma mais simples sem módulo nativo.
 */
const SCRIPT_WINDOWS = `
Add-Type -Namespace P -Name K -MemberDefinition '
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);'
$fim = (Get-Date).AddMilliseconds(1500)
while ((Get-Date) -lt $fim) {
  $preso = $false
  foreach ($k in 0x10,0x11,0x12,0x5B) { if ([P.K]::GetAsyncKeyState($k) -band 0x8000) { $preso = $true } }
  if (-not $preso) { break }
  Start-Sleep -Milliseconds 30
}
[P.K]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
[P.K]::keybd_event(0x43,0,0,[UIntPtr]::Zero)
[P.K]::keybd_event(0x43,0,2,[UIntPtr]::Zero)
[P.K]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
`;

function copiarSelecaoNoWindows(): Promise<void> {
  return new Promise((ok) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', SCRIPT_WINDOWS],
      { windowsHide: true, timeout: 4000 },
      () => ok(),
    );
  });
}

const esperar = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

/**
 * Pega o texto selecionado no app em foco: copia (Ctrl+C simulado), lê a área
 * de transferência e devolve o que estava nela antes. Se nada estava
 * selecionado, usa o que você já tinha copiado.
 */
export async function lerTextoSelecionado(): Promise<string | null> {
  const antes = clipboard.readText();
  if (process.platform === 'win32') {
    clipboard.writeText(MARCA);
    await copiarSelecaoNoWindows();
    // O app de destino leva um instante para pôr a cópia na área de transferência.
    let copiado = '';
    for (let i = 0; i < 10; i++) {
      await esperar(40);
      copiado = clipboard.readText();
      if (copiado !== MARCA) break;
    }
    clipboard.writeText(antes);
    const texto = copiado && copiado !== MARCA ? copiado : antes;
    return limpar(texto);
  }
  // macOS/Linux: por enquanto, o que você copiou (selecione e Ctrl/Cmd+C antes do atalho).
  return limpar(antes);
}

function limpar(t: string): string | null {
  const s = t.trim();
  if (!s) return null;
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}…` : s;
}
