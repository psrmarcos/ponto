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
  src/renderer    as janelas em React (agregador, transcrição, tela, home)
docs/             decisões e pesquisas (economia de tokens, Jev)
```

- **Só o processo principal fala com o SO.** As janelas não têm Node; pedem coisas por
  `window.ponto.invocar(canal, dados)`. Os canais estão todos em
  `packages/shared/src/ipc.ts`: adicionar um canal novo é editar só esse arquivo e
  implementar o handler em `apps/desktop/src/main/index.ts` (o TypeScript obriga).
- **A API roda como utilityProcess** do Electron, em `127.0.0.1`, com um token aleatório
  por execução. As janelas falam com ela por HTTP e recebem streaming pelo WebSocket.
- **Chaves de API** ficam no processo principal, cifradas com o cofre do SO (safeStorage),
  e vão para a API por um canal privado (nunca pela rede, nunca para as janelas).
- **Stealth** (`src/main/janelas/stealth.ts`) é o único lugar que decide a invisibilidade,
  vale para todas as janelas e tem um interruptor global (Ctrl+Shift+I).
- **Janelas**: para criar uma nova, adicione o id em `packages/shared/src/janelas.ts`, a
  definição em `src/main/janelas/definicoes.ts` e o componente no renderer.
- **Banco**: o esquema está em `apps/api/src/db/schema.ts`. Depois de mudar, rode
  `pnpm db:gerar` para criar a migração; ela roda sozinha quando a API sobe.

## Atalhos padrão

| Ação | Atalho |
| --- | --- |
| Invisibilidade | Ctrl+Shift+I |
| Mostrar/esconder o chat | Ctrl+Shift+H |
| Transcrição | Ctrl+Shift+T |
| Tela | Ctrl+Shift+E |
| Home | Ctrl+Shift+O |
| Ler a tela | Ctrl+Shift+S |
| Fechar o app | Ctrl+Shift+Q |

Todos podem ser trocados em Home → Configurações.

## Roadmap

- **M0** (este): base, janelas, stealth, Home, chave de API e chat com OpenRouter.
- **M1**: captura de áudio (microfone + sistema, sem entrar na reunião) e transcrição ao vivo.
- **M2**: cérebro em dois níveis: Jev decide quando e como responder, o modelo escolhido
  escreve; leitura da tela; controle de gasto (ver `docs/economia-de-tokens.md`).
- **M3**: resumo da reunião e exportação em .md.
- **M4**: instalador para Windows/macOS/Linux.
