/**
 * Roda na thread de áudio. Recebe o áudio na taxa da placa (44,1/48 kHz),
 * converte para mono 16 kHz (média por bloco, que já filtra o que passaria de
 * 8 kHz) e entrega quadros de 20 ms (320 amostras) para a página.
 */
const TAXA_SAIDA = 16000;
const AMOSTRAS_QUADRO = 320;

class Coletor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.passo = sampleRate / TAXA_SAIDA;
    this.posicao = 0;
    this.soma = 0;
    this.n = 0;
    this.quadro = new Float32Array(AMOSTRAS_QUADRO);
    this.i = 0;
  }

  process(entradas) {
    const canais = entradas[0];
    if (!canais || canais.length === 0) return true;
    const tamanho = canais[0].length;
    for (let s = 0; s < tamanho; s++) {
      let v = 0;
      for (let c = 0; c < canais.length; c++) v += canais[c][s];
      this.soma += v / canais.length;
      this.n++;
      this.posicao += 1;
      if (this.posicao >= this.passo) {
        this.posicao -= this.passo;
        this.quadro[this.i++] = this.soma / this.n;
        this.soma = 0;
        this.n = 0;
        if (this.i === AMOSTRAS_QUADRO) {
          this.port.postMessage(this.quadro, [this.quadro.buffer]);
          this.quadro = new Float32Array(AMOSTRAS_QUADRO);
          this.i = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('ponto-coletor', Coletor);
