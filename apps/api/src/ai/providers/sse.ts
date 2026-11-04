export async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const decoder = new TextDecoder();
  let rest = '';
  for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
    rest += decoder.decode(chunk, { stream: true });
    let end: number;
    while ((end = rest.indexOf('\n')) >= 0) {
      const line = rest.slice(0, end).trim();
      rest = rest.slice(end + 1);
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data === '[DONE]') return;
      try {
        yield JSON.parse(data);
      } catch {
      }
    }
  }
}
