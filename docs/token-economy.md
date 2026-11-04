# Economia de tokens e latência: o que aprendemos com apps parecidos

Pesquisa feita em 2026-11-03 lendo o código de três copilotos open-source:
Natively (o mais completo), cheating-daddy e free-cluely. É a base das decisões do
"cérebro" (System 1 + System 2). Cada item diz o que vamos fazer no Ponto.

## Decisões para o Ponto (em ordem de prioridade)

1. **Dois canais rotulados na origem.** Microfone = você, áudio do sistema = os outros.
   Não precisa diarização paga para "eu x eles", e o canal "você" nunca dispara resposta.
   A diarização (separar Pessoa 1, Pessoa 2...) fica só no canal do sistema, pelo próprio STT.
2. **Uma decisão por pausa, não por trecho.** Espera ~900 ms de silêncio do outro lado
   (350 ms se o STT sinalizar fim de fala), filtro grátis antes (regex de "ok / sim / uhum",
   mínimo de 4 palavras novas) e só então uma chamada barata ao **Jev** (System 1):
   "é uma pergunta para mim?", "qual agente?", "precisa de web/tela?", "nível de modelo".
   Jev custa ~US$0,00002 por chamada e responde em ~0,13 s.
3. **Estado curto para o Jev.** Trecho atual + últimas ~8 falas, 400 caracteres cada,
   e a última pergunta já respondida (para não responder de novo). Abaixo de 32 KB sempre.
4. **Dedupe.** Pergunta idêntica à última respondida não dispara.
5. **Cancelar o que ficou velho.** Fala nova aborta (AbortController) a decisão e a resposta
   em andamento; cada geração tem um id e resultados atrasados são descartados.
6. **Prefixo estável para cache.** System prompt do agente sempre igual e primeiro; tudo que
   muda (transcrição, pergunta, idioma) vai no fim. No OpenRouter, `cache_control` para
   modelos Anthropic/Gemini quando o prompt passa do mínimo do modelo; registrar
   `cached_tokens` para provar que o cache pegou.
7. **Janela de fala de ~6000 caracteres** (≈1300 tokens) sem as respostas antigas da IA,
   mais resumos em tópicos das partes antigas, feitos em segundo plano com o modelo rápido.
8. **Resposta especulativa** (opcional, depois): começar a responder num parcial estável e
   reaproveitar se o final for parecido (Jaccard ≥ 0,75), no máximo 1 a cada 25 s.
9. **Prints baratos.** Lado maior 1280 px, JPEG ~80, teto de 350 KB (requisito do spec),
   hash 16×16 para pular tela que não mudou, e descrição em texto da tela guardada para
   não mandar a imagem de novo.
10. **Fallback de streaming.** 2,5 s para o primeiro token; troca de modelo sem o usuário
    ver só antes do primeiro token.
11. **Silêncio não vai para o STT** (VAD local), mas manter silêncio real logo depois da fala
    para o fim-de-fala do servidor não atrasar.
12. **Teto de gasto por sessão** (configurável, padrão US$1) e rebaixar para o modelo rápido
    quando chegar perto. Todo custo vem do `usage.cost` do OpenRouter e vai para `ai_usage`.

## Detalhes e constantes encontrados

- Natively `SimpleAutoAnswer.ts`: STABILITY_MS=900, EARLY_JUDGE_MS=120, ENDPOINT_CONFIRM_MS=350,
  MIN_NEW_WORDS=4, ANSWER_FLOOR=0.30, PENDING_MAX_AGE_MS=90 000.
- Natively `AutoAnswerJudge.ts`: prazo 2,5 s, 8 falas de contexto, 400 caracteres por fala.
  Latência medida cresce com o tamanho da entrada (1,0 s em 2k tokens, 3,8 s em 28k).
- Natively `conversationHistoryPolicy.ts`: SPEECH_WINDOW_MAX_CHARS=6000; tirar as sugestões
  antigas da IA liberou 57% do espaço.
- Natively `SessionTracker.ts`: resumo a cada 400 falas em 3–6 tópicos, em segundo plano.
- Natively `GeminiPromptCache.ts` / `LLMHelper.ts`: cache explícito só acima do mínimo do
  modelo; abaixo disso o provedor ignora e cobra preço cheio. Prompt pequeno não cacheia.
- Natively `ImageOptimizer.ts`: perfis 1024/78, 1280/85, 1536/88; `ImageHashService.ts` hash 16×16.
- Natively áudio: 16 kHz, quadros de 20 ms; VAD com limiar adaptativo; Deepgram com
  `endpointing:300`, `utterance_end_ms:1000`, `interim_results`, `vad_events`.
- cheating-daddy: Gemini Live só para transcrição + uma chamada de resposta por turno;
  orçamento diário de caracteres com troca para modelo mais barato.
