export interface Badge {
  name: string
  url?: string
}

export interface Emote {
  id: string
  code: string
  url: string
}

export interface ChatMessage {
  id: string // UUID único gerado na normalização
  platform: 'twitch' | 'youtube' | 'kick'
  username: string
  displayName: string
  text: string
  timestamp: number // ms epoch
  avatarUrl?: string
  color?: string // Cor do nick (Twitch)
  badges?: Badge[] // Subscriber, moderator, etc.
  emotes?: Emote[]
  isModerator?: boolean
  isSubscriber?: boolean
  messageId: string // ID original da plataforma
}
