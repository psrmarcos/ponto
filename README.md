# Ponto

Copiloto de IA para calls (Zoom, Meet, Teams, Discord), local-first e open-source.
Não entra na reunião como bot: escuta o seu microfone e o áudio do computador, lê a
tela quando você pede, e mostra as respostas em janelas que **não aparecem em
gravações nem no compartilhamento de tela**.

> Nome provisório.

## Rodar

Precisa de Node 22.13+ e pnpm 10.

```bash
pnpm install
pnpm build          # shared + api + desktop
pnpm --filter @ponto/desktop start   # abre o app (build de produção)
pnpm dev            # modo desenvolvimento com recarga do renderer
```

Depois de abrir, vá na Home (botão da casinha na pílula) → **Perfil e conta** e cole
sua chave do OpenRouter. O chat já funciona com qualquer modelo do OpenRouter.

## Como está organizado

```
packages/shared   contratos tipados (Zod): IPC, eventos do WebSocket, DTOs da API
apps/api          backend local NestJS 11: SQLite (node:sqlite + Drizzle ORM), IA, uso/custo
apps/desktop      Electron 35 + React 19 + Vite 6 + Tailwind 4
  src/main        processo principal: janelas, stealth, z-order, atalhos, cofre, sobe a API
  src/preload     ponte segura window.ponto (gerada a partir do contrato)
  src/renderer    as janelas em React (overlay, transcription, screen, home)
docs/             decisões e pesquisas (token-economy, Jev)
```

- **Só o processo principal fala com o SO.** As janelas não têm Node; pedem coisas por
  `window.ponto.invoke(channel, payload)`. Os canais estão todos em
  `packages/shared/src/ipc.ts`: adicionar um canal novo é editar só esse arquivo e
  implementar o handler em `apps/desktop/src/main/ipc.ts` (o TypeScript obriga).
- **A API roda como utilityProcess** do Electron, em `127.0.0.1`, com um token aleatório
  por execução. As janelas falam com ela por HTTP e recebem streaming pelo WebSocket.
- **Chaves de API** ficam no processo principal, cifradas com o cofre do SO (safeStorage),
  e vão para a API por um canal privado (nunca pela rede, nunca para as janelas).
- **Stealth** (`src/main/windows/stealth.ts`) é o único lugar que decide a invisibilidade,
  vale para todas as janelas e tem um interruptor global (Ctrl+Shift+I).
- **Janelas**: para criar uma nova, adicione o id em `packages/shared/src/windows.ts`, a
  definição em `src/main/windows/definitions.ts` e o componente no renderer.
- **Banco**: o esquema está em `apps/api/src/db/schema.ts`. Depois de mudar, rode
  `pnpm db:generate` para criar a migração; ela roda sozinha quando a API sobe.

## Atalhos padrão

| Ação | Atalho |
| --- | --- |
| Invisibilidade | Ctrl+Shift+I |
| Mostrar/esconder o chat | Ctrl+Shift+H |
| Transcrição | Ctrl+Shift+T |
| Tela | Ctrl+Shift+E |
| Home | Ctrl+Shift+O |
| Ler a tela | Ctrl+Shift+S |
| Gravar / pausar a transcrição | Ctrl+Shift+G |
| Fechar o app | Ctrl+Shift+Q |

Todos podem ser trocados em Home → Configurações.

## Roadmap

- **M0** (feito): base, janelas, stealth, Home, chave de API e chat com OpenRouter.
- **M1** (feito): captura de áudio (microfone + sistema, sem entrar na reunião) e transcrição ao vivo.
  Cada fala é cortada no PC (detector de silêncio) e transcrita por OpenRouter (Whisper turbo) ou
  Deepgram (Nova-3). O trecho recente da call vai como contexto para o chat. Use fone: sem ele o
  microfone ouve o alto-falante (o app descarta o eco mais óbvio).
- **M2** (feito): o Jev percebe quando perguntam algo para você e a resposta começa sozinha;
  leitura da tela (Ctrl+Shift+S); controle de gasto (ver `docs/token-economy.md`).
- **M3** (feito): ata da call ao encerrar, página Sessões na Home e exportação em .md
  (Documentos/Ponto). No chat a transcrição vai em pedaços, só acrescentando (o provedor
  reaproveita o cache), e o começo de calls longas vira um resumo contínuo.
- **Modo invisível**: não use `<select>`, `<datalist>` nem `title` no renderer. Essas
  janelinhas nativas aparecem na gravação mesmo com o modo ligado; use `ui/Select.tsx` e as
  dicas de `ui/tooltips.ts`.
- **M4**: instalador para Windows/macOS/Linux.
