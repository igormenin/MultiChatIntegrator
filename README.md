# MultiChatIntegrator - (BETA)

An Electron application with React and TypeScript.

### Release for Beta Users

## Recommended IDE Setup

- [VSCode](https://code.visualstudio.com/) + [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint) + [Prettier](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)

## Project Setup

### Install

```bash
$ npm install
```

### Development

```bash
$ npm run dev
```

### Build

```bash
# For windows
$ npm run build:win

# For macOS
$ npm run build:mac

# For Linux
$ npm run build:linux
```

## YouTube — Modos de Leitura de Mensagens

O MultiChatIntegrator suporta dois modos de ingestão do chat do YouTube. A troca é feita em tempo real via toggle na aba de configurações, abaixo do campo "Video ID".

### Modo `official_api` (padrão)

- Usa a [YouTube Data API v3](https://developers.google.com/youtube/v3) oficialmente.
- Requer autenticação OAuth ou API Key configurada no `.env`.
- Sujeito à cota diária da API do Google.
- Estável e suportado oficialmente pelo Google.

### Modo `chat_popup`

- Lê mensagens usando o endpoint interno do YouTube (`youtubei/v1/live_chat/get_live_chat`), da mesma forma que a janela de chat popout do YouTube faz no browser.
- **Não consome cota da API oficial.**
- Autenticação OAuth e envio de mensagens (`sendMessage`) continuam funcionando normalmente através da API oficial — apenas a **leitura de mensagens** usa o endpoint alternativo.
- Requer que o `videoId` seja fornecido manualmente (não suporta auto-detecção de live ativa).

#### ⚠️ Aviso de Instabilidade

> O modo `chat_popup` utiliza um endpoint **interno e não documentado** do YouTube.
> Pode parar de funcionar a qualquer momento caso o YouTube altere sua estrutura interna,
> sem aviso prévio. Use por sua conta e risco em ambientes de produção.

#### Principais mensagens vs Chat ao vivo

O YouTube distingue dois fluxos de chat:

| Fluxo | Descrição | Tipo de continuation |
|---|---|---|
| **Chat ao vivo** | Todas as mensagens em tempo real | `invalidationContinuationData` |
| **Principais mensagens** | Filtrado pelo YouTube (destaques) | `timedContinuationData` |

O modo `chat_popup` tenta priorizar o **Chat ao vivo** (todas as mensagens) usando uma heurística baseada no tipo de continuation encontrado no HTML. Esta heurística pode não funcionar corretamente em todos os casos — quando isso acontece, um aviso é registrado nos logs do aplicativo.

#### Tuning opcional (`.env`)

```env
# Intervalo mínimo entre polls (ms) — padrão: 1500
MAIN_VITE_YOUTUBE_CHATPOPUP_POLL_MIN_MS=1500

# Intervalo máximo entre polls (ms) — padrão: 8000
MAIN_VITE_YOUTUBE_CHATPOPUP_POLL_MAX_MS=8000

# Timeout por requisição (ms) — padrão: 12000
MAIN_VITE_YOUTUBE_CHATPOPUP_INITIAL_TIMEOUT_MS=12000

# Máximo de retries em erros transitórios — padrão: 5
MAIN_VITE_YOUTUBE_CHATPOPUP_MAX_RETRIES=5

# Preferência de fluxo: live_all | top_chat — padrão: live_all
MAIN_VITE_YOUTUBE_CHATPOPUP_FILTER_MODE=live_all
```
