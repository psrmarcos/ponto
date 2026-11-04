import { desktopCapturer, screen } from 'electron';

/** Longest side of the screenshot. Larger resolutions only waste tokens: slide text and code remain readable. */
const MAX_SIDE = 1600;
/** Above this size the image is heavy to upload and expensive; step down JPEG quality. */
const MAX_BYTES = 350 * 1024;

/**
 * Captures a screenshot of the display under the cursor (multi-monitor users
 * usually look at the display they are interacting with). Ponto windows do not
 * appear when stealth mode is enabled, because Windows/macOS excludes them from capture.
 */
export async function captureScreen(options: { maxSide?: number; maxBytes?: number } = {}): Promise<string> {
  const side = options.maxSide ?? MAX_SIDE;
  const source = await screenSource(side);
  const limit = options.maxBytes ?? MAX_BYTES;
  for (const quality of [72, 55, 40]) {
    const jpeg = source.thumbnail.toJPEG(quality);
    if (jpeg.byteLength <= limit || quality === 40) return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  }
  throw new Error('unreachable');
}

async function screenSource(side: number) {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height } = display.size;
  const scale = Math.min(1, side / Math.max(width, height)) * display.scaleFactor;
  const size = {
    width: Math.round(Math.min(width * scale, side)),
    height: Math.round(Math.min(height * scale, side)),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  const source = sources.find((s) => s.display_id === String(display.id)) ?? sources[0];
  if (!source || source.thumbnail.isEmpty()) throw new Error('Não consegui capturar a tela.');
  return source;
}

/** Grayscale thumbnail (64x36) to check whether the screen changed locally without sending anything to AI. */
export async function screenSignature(): Promise<Uint8Array> {
  const source = await screenSource(64);
  const img = source.thumbnail.resize({ width: 64, height: 36, quality: 'good' });
  const bgra = img.toBitmap();
  const gray = new Uint8Array(64 * 36);
  for (let i = 0; i < gray.length; i++) gray[i] = (bgra[i * 4]! + bgra[i * 4 + 1]! + bgra[i * 4 + 2]!) / 3;
  return gray;
}

/** Fraction of pixels (0 to 1) that changed significantly. Cursor and clock movements barely register. */
export function difference(a: Uint8Array, b: Uint8Array): number {
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 24) changed++;
  return changed / a.length;
}

const AUTO_INTERVAL_MS = 2500;
const MIN_CHANGE = 0.08;
const MIN_BETWEEN_READS_MS = 20_000;

/**
 * Automatic screen reading: checks the screen every 2.5s (local thumbnail, free)
 * and, when it changes significantly and then settles (new slide, another code file),
 * performs a full read. At most one read every 20s to avoid unnecessary spend.
 */
export class AutoScreenReader {
  private timer: NodeJS.Timeout | null = null;
  private baseline: Uint8Array | null = null;
  private previous: Uint8Array | null = null;
  private pending = false;
  private lastReadAt = 0;

  /**
   * `canInspect`: when stealth mode is off, Ponto's own windows appear in the
   * screenshot, so a streaming chat response would count as "screen changed"
   * (causing an infinite loop).
   */
  constructor(
    private readonly read: () => Promise<void>,
    private readonly canInspect: () => boolean,
  ) {}

  get enabled(): boolean {
    return this.timer !== null;
  }

  set(enabled: boolean): void {
    if (enabled === this.enabled) return;
    if (!enabled) {
      clearInterval(this.timer!);
      this.timer = null;
      this.baseline = this.previous = null;
      this.pending = false;
      return;
    }
    this.timer = setInterval(() => void this.inspect(), AUTO_INTERVAL_MS);
    void this.inspect();
  }

  private async inspect(): Promise<void> {
    if (!this.canInspect()) {
      this.baseline = this.previous = null;
      return;
    }
    let current: Uint8Array;
    try {
      current = await screenSignature();
    } catch {
      return;
    }
    const previous = this.previous;
    this.previous = current;
    if (!this.baseline) {
      this.baseline = current;
      return;
    }
    if (difference(this.baseline, current) >= MIN_CHANGE) this.pending = true;
    // Only reads once the screen has settled (scrolling or animation finished).
    const settled = previous !== null && difference(previous, current) < 0.02;
    if (!this.pending || !settled || Date.now() - this.lastReadAt < MIN_BETWEEN_READS_MS) return;
    this.pending = false;
    this.baseline = current;
    this.lastReadAt = Date.now();
    await this.read().catch(() => undefined);
  }
}
