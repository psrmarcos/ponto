import { execFile } from 'node:child_process';
import { clipboard } from 'electron';

const MAX_CHARS = 6000;
const MARKER = '⁣ponto-selection⁣';

const WINDOWS_SCRIPT = `
Add-Type -Namespace P -Name K -MemberDefinition '
[DllImport("user32.dll")] public static extern short GetAsyncKeyState(int k);
[DllImport("user32.dll")] public static extern void keybd_event(byte k, byte s, uint f, System.UIntPtr e);'
$end = (Get-Date).AddMilliseconds(1500)
while ((Get-Date) -lt $end) {
  $held = $false
  foreach ($k in 0x10,0x11,0x12,0x5B) { if ([P.K]::GetAsyncKeyState($k) -band 0x8000) { $held = $true } }
  if (-not $held) { break }
  Start-Sleep -Milliseconds 30
}
[P.K]::keybd_event(0x11,0,0,[UIntPtr]::Zero)
[P.K]::keybd_event(0x43,0,0,[UIntPtr]::Zero)
[P.K]::keybd_event(0x43,0,2,[UIntPtr]::Zero)
[P.K]::keybd_event(0x11,0,2,[UIntPtr]::Zero)
`;

function copySelectionOnWindows(): Promise<void> {
  return new Promise((ok) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', WINDOWS_SCRIPT],
      { windowsHide: true, timeout: 4000 },
      () => ok(),
    );
  });
}

const sleep = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

export async function readSelectedText(): Promise<string | null> {
  const before = clipboard.readText();
  if (process.platform === 'win32') {
    clipboard.writeText(MARKER);
    await copySelectionOnWindows();
    let copied = '';
    for (let i = 0; i < 10; i++) {
      await sleep(40);
      copied = clipboard.readText();
      if (copied !== MARKER) break;
    }
    clipboard.writeText(before);
    const text = copied && copied !== MARKER ? copied : before;
    return clean(text);
  }
  return clean(before);
}

function clean(t: string): string | null {
  const s = t.trim();
  if (!s) return null;
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}…` : s;
}
