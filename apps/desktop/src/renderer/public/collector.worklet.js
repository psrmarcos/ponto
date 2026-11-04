/**
 * Runs on the audio thread. Receives audio at the sound card's native sample rate
 * (44.1/48 kHz), downmixes to 16 kHz mono (block average, acting as a basic low-pass
 * filter above 8 kHz), and emits 20 ms frames (320 samples) to the page.
 */
const OUTPUT_SAMPLE_RATE = 16000;
const FRAME_SAMPLES = 320;

class Collector extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = sampleRate / OUTPUT_SAMPLE_RATE;
    this.position = 0;
    this.sum = 0;
    this.count = 0;
    this.frame = new Float32Array(FRAME_SAMPLES);
    this.index = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels || channels.length === 0) return true;
    const length = channels[0].length;
    for (let s = 0; s < length; s++) {
      let value = 0;
      for (let c = 0; c < channels.length; c++) value += channels[c][s];
      this.sum += value / channels.length;
      this.count++;
      this.position += 1;
      if (this.position >= this.step) {
        this.position -= this.step;
        this.frame[this.index++] = this.sum / this.count;
        this.sum = 0;
        this.count = 0;
        if (this.index === FRAME_SAMPLES) {
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(FRAME_SAMPLES);
          this.index = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('ponto-collector', Collector);
