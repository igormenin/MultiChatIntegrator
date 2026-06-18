/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly MAIN_VITE_TWITCH_CLIENT_ID: string
  readonly MAIN_VITE_TWITCH_CLIENT_SECRET: string
  readonly MAIN_VITE_YOUTUBE_API_KEY: string
  readonly MAIN_VITE_YOUTUBE_CLIENT_ID: string
  readonly MAIN_VITE_YOUTUBE_CLIENT_SECRET: string
  readonly MAIN_VITE_KICK_CLIENT_ID: string
  readonly MAIN_VITE_KICK_CLIENT_SECRET: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
