import { execFile } from 'node:child_process';
import { clipboard } from 'electron';

/** Selected text longer than this is truncated (chat doesn't need a whole book). */
const MAX_CHARS = 6000;
const MARKER = '⁣ponto-selection⁣';

/**
 * Windows script: waits for the user to release the shortcut keys (otherwise
 * simulated Ctrl+C becomes Ctrl+Shift+C), presses Ctrl+C in the focused app,
 * and returns immediately. `keybd_event` is the simplest way without a native module.
 */
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

/**
 * Grabs the selected text in the focused app: copies (simulated Ctrl+C), reads
 * the clipboard, and restores whatever was in the clipboard before. If nothing
 * was selected, uses whatever was already copied.
 */
export async function readSelectedText(): Promise<string | null> {
  const before = clipboard.readText();
  if (process.platform === 'win32') {
    clipboard.writeText(MARKER);
    await copySelectionOnWindows();
    // Target app takes a moment to place the copy on the clipboard.
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
  // macOS/Linux: uses what you copied (select and press Ctrl/Cmd+C before the shortcut).
  return clean(before);
}

function clean(t: string): string | null {
  const s = t.trim();
  if (!s) return null;
  return s.length > MAX_CHARS ? `${s.slice(0, MAX_CHARS)}…` : s;
}
