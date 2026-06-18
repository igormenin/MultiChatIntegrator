export type PlatformName = 'twitch' | 'youtube' | 'kick'

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected'

export interface PlatformConnection {
  platform: PlatformName
  status: ConnectionStatus
  channelInfo?: string // canal, videoId ou slug conectado
  error?: string
}
