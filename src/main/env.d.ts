/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_TWITCH_CLIENT_ID: string
  readonly MAIN_VITE_TWITCH_CLIENT_SECRET: string
  readonly MAIN_VITE_YOUTUBE_API_KEY: string
  readonly MAIN_VITE_YOUTUBE_CLIENT_ID: string
  readonly MAIN_VITE_YOUTUBE_CLIENT_SECRET: string
  readonly MAIN_VITE_KICK_CLIENT_ID: string
  readonly MAIN_VITE_KICK_CLIENT_SECRET: string
  // YouTube ChatPopup tuning (opcional — possuem valores padrão no código)
  readonly MAIN_VITE_YOUTUBE_CHATPOPUP_POLL_MIN_MS: string
  readonly MAIN_VITE_YOUTUBE_CHATPOPUP_POLL_MAX_MS: string
  readonly MAIN_VITE_YOUTUBE_CHATPOPUP_INITIAL_TIMEOUT_MS: string
  readonly MAIN_VITE_YOUTUBE_CHATPOPUP_MAX_RETRIES: string
  readonly MAIN_VITE_YOUTUBE_CHATPOPUP_FILTER_MODE: string
  // YouTube Official API Polling (opcional - limites adaptativos)
  readonly MAIN_VITE_YOUTUBE_POLL_INTERVAL_MIN: string
  readonly MAIN_VITE_YOUTUBE_POLL_INTERVAL_MAX: string
  readonly MAIN_VITE_YOUTUBE_POLL_EMPTY_THRESHOLD: string
  readonly MAIN_VITE_YOUTUBE_POLL_INCREMENT_STEP: string
  readonly MAIN_VITE_YOUTUBE_POLL_DECREMENT_STEP: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
