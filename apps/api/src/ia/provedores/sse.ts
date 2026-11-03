/** Lê um corpo Server-Sent Events e devolve o JSON de cada linha `data:`. Ignora comentários (`: ...`). */
export async function* lerSse(corpo: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const decodificador = new TextDecoder();
  let resto = '';
  for await (const pedaco of corpo as unknown as AsyncIterable<Uint8Array>) {
    resto += decodificador.decode(pedaco, { stream: true });
    let fim: number;
    while ((fim = resto.indexOf('\n')) >= 0) {
      const linha = resto.slice(0, fim).trim();
      resto = resto.slice(fim + 1);
      if (!linha.startsWith('data:')) continue;
      const dados = linha.slice(5).trim();
      if (dados === '[DONE]') return;
      try {
        yield JSON.parse(dados);
      } catch {
        // linha quebrada: ignora
      }
    }
  }
}
