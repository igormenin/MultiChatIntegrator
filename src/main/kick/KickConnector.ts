import { net } from 'electron'
import { getValidTokens, KickTokens, refreshAccessToken } from './KickAuth'
import { ChatMessage } from '../../common/types/ChatMessage'
import Store from 'electron-store'

type AnyStore = Store<Record<string, unknown>>

interface KickSenderBadge {
  type?: string
  icon?: string
}

interface KickMessageSender {
  slug?: string
  username?: string
  avatar?: string
  identity?: {
    color?: string
    badges?: KickSenderBadge[]
  }
}

interface KickMessagePayload {
  id: string
  content?: string
  created_at?: string
  sender?: KickMessageSender
}

const KICK_API_BASE = 'https://api.kick.com/public/v1'
// Pusher público da Kick
const PUSHER_KEY = '32cbd69e4b950bf97679'
const PUSHER_CLUSTER = 'us2'
const PUSHER_URL = `wss://ws-${PUSHER_CLUSTER}.pusher.com/app/${PUSHER_KEY}?protocol=7&client=js&version=7.4.0&flash=false`

export class KickConnector {
  private store: AnyStore
  private isStopped: boolean = false
  private ws: WebSocket | null = null
  private tokens: KickTokens | null = null
  private channelSlug: string = ''
  private broadcasterUserId: string = ''
  private chatroomId: string = ''

  private reconnectTimer: NodeJS.Timeout | null = null
  private statsTimer: NodeJS.Timeout | null = null
  private reconnectDelay: number = 5000 // 5s

  // Callbacks
  onMessage: ((msg: ChatMessage) => void) | null = null
  onStatusChange:
    | ((status: 'connecting' | 'connected' | 'disconnected', info?: string, error?: string) => void)
    | null = null
  onViewerCount: ((viewers: number) => void) | null = null

  constructor(store: AnyStore) {
    this.store = store
  }

  // ----------------------------------------------------------------
  // Conectar ao canal da Kick
  // ----------------------------------------------------------------
  async connect(channelSlug: string): Promise<void> {
    this.tokens = await getValidTokens(this.store)
    if (!this.tokens) {
      this.onStatusChange?.(
        'disconnected',
        undefined,
        'Não autenticado. Por favor, faça o login com a Kick primeiro.'
      )
      return
    }

    const activeSlug = (channelSlug || this.tokens.username || '').toLowerCase().trim()
    if (!activeSlug) {
      this.onStatusChange?.(
        'disconnected',
        undefined,
        'Nome do canal não disponível. Reautentique-se.'
      )
      return
    }

    this.channelSlug = activeSlug
    this.isStopped = false
    this.onStatusChange?.('connecting', this.channelSlug)

    try {
      // 1. Resolver o ID do canal (broadcaster_user_id) e do chatroom
      await this.resolveChannelInfo()

      // 2. Conectar ao WebSocket Pusher da Kick
      this.openWebSocket()

      // 3. Iniciar polling de estatísticas (viewers)
      this.startStatsLoop()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[Kick] Erro ao conectar:', errorMsg)
      this.onStatusChange?.('disconnected', undefined, errorMsg)
      this.disconnect()
    }
  }

  // ----------------------------------------------------------------
  // Obter IDs do canal usando a API da Kick ou fallback público
  // ----------------------------------------------------------------
  private async resolveChannelInfo(): Promise<void> {
    if (!this.tokens) throw new Error('Tokens ausentes.')

    // Tentar pela API oficial
    try {
      console.log('[Kick] Buscando informações do canal pela API oficial...')
      const url = `${KICK_API_BASE}/channels`
      const res = await net.fetch(url, {
        headers: { Authorization: `Bearer ${this.tokens.accessToken}` }
      })

      if (res.ok) {
        const data = (await res.json()) as {
          data?: {
            id?: string | number
            broadcaster_user_id?: string | number
            chatroom?: { id?: string | number }
            chatroom_id?: string | number
          }
          id?: string | number
          broadcaster_user_id?: string | number
          chatroom?: { id?: string | number }
          chatroom_id?: string | number
        }
        const channelObj = data.data || data
        this.broadcasterUserId = String(channelObj.id || channelObj.broadcaster_user_id || '')
        this.chatroomId = String(channelObj.chatroom?.id || channelObj.chatroom_id || '')
      }
    } catch (err) {
      console.warn('[Kick API] Erro ao buscar canal via API Oficial, tentando fallback...', err)
    }

    // Se falhar a oficial ou vier em branco, usar a API v2 pública (fallback robusto)
    if (!this.chatroomId) {
      console.log(`[Kick Fallback] Buscando chatroomId via canal público: ${this.channelSlug}`)
      const fallbackUrl = `https://kick.com/api/v2/channels/${encodeURIComponent(this.channelSlug)}`
      const res = await net.fetch(fallbackUrl, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      if (!res.ok) {
        throw new Error(`Canal "${this.channelSlug}" não encontrado na Kick (HTTP ${res.status}).`)
      }

      const data = (await res.json()) as {
        id?: string | number
        chatroom?: {
          id?: string | number
        }
      }
      this.broadcasterUserId = String(data.id || '')
      this.chatroomId = String(data.chatroom?.id || '')
    }

    if (!this.chatroomId) {
      throw new Error('Não foi possível obter o ID da sala de chat (chatroomId) para a Kick.')
    }

    console.log(
      `[Kick] Canal resolvido. BroadcasterId: ${this.broadcasterUserId}, ChatroomId: ${this.chatroomId}`
    )
  }

  // ----------------------------------------------------------------
  // Conectar ao WebSocket do Pusher
  // ----------------------------------------------------------------
  private openWebSocket(): void {
    this.closeWebSocket()

    if (this.isStopped) return

    console.log(`[Kick] Conectando ao Pusher WebSocket: ${PUSHER_URL}`)
    const ws = new WebSocket(PUSHER_URL)
    this.ws = ws

    ws.onopen = (): void => {
      if (this.isStopped) {
        ws.close()
        return
      }
      console.log('[Kick] Pusher WebSocket conectado.')

      // Inscrever-se no canal da sala de chat da Kick
      const subscribeFrame = {
        event: 'pusher:subscribe',
        data: {
          auth: '',
          channel: `chatrooms.${this.chatroomId}.v2`
        }
      }
      ws.send(JSON.stringify(subscribeFrame))
      this.onStatusChange?.('connected', this.channelSlug)
    }

    ws.onmessage = (event: MessageEvent): void => {
      try {
        const payload = JSON.parse(event.data as string)

        // Responder ao Ping do Pusher para manter conexão ativa
        if (payload.event === 'pusher:ping') {
          ws.send(JSON.stringify({ event: 'pusher:pong', data: {} }))
          return
        }

        // Tratar evento de mensagem do chat da Kick
        if (payload.event === 'App\\Events\\ChatMessageEvent') {
          // O data do Pusher vem stringificado
          const messageData = (
            typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data
          ) as KickMessagePayload
          const chatMsg = this.normalizeMessage(messageData)
          this.onMessage?.(chatMsg)
        }
      } catch {
        // Ignorar erros de parsing
      }
    }

    ws.onclose = (event: CloseEvent): void => {
      console.log(`[Kick] WebSocket fechado. Código: ${event.code}. Motivo: ${event.reason}`)
      this.ws = null
      if (!this.isStopped) {
        this.onStatusChange?.('connecting', this.channelSlug, 'Reconectando WebSocket...')
        this.scheduleReconnect()
      }
    }

    ws.onerror = (err: Event): void => {
      console.error('[Kick] Erro no WebSocket:', err)
    }
  }

  private closeWebSocket(): void {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => {
      if (!this.isStopped) {
        this.openWebSocket()
      }
    }, this.reconnectDelay)
  }

  // ----------------------------------------------------------------
  // Normalizar payload da Kick para o padrão ChatMessage
  // ----------------------------------------------------------------
  private normalizeMessage(data: KickMessagePayload): ChatMessage {
    const sender = data.sender || {}
    const identity = sender.identity || {}
    const badges = identity.badges || []

    const isModerator = badges.some(
      (b) => b.type === 'moderator' || b.type === 'broadcaster' || b.type === 'creator'
    )
    const isSubscriber = badges.some((b) => b.type === 'subscriber' || b.type === 'founder')

    const normalizedBadges = badges
      .filter((b) => !!b.type)
      .map((b) => ({
        name: b.type as string,
        url: b.icon || undefined
      }))

    return {
      id: `kick-${data.id}`,
      platform: 'kick',
      username: sender.slug || sender.username || '',
      displayName: sender.username || '',
      text: data.content || '',
      timestamp: new Date(data.created_at || Date.now()).getTime(),
      color: identity.color || '#53FC18', // Verde Kick padrão
      avatarUrl: sender.avatar || undefined,
      isModerator,
      isSubscriber,
      badges: normalizedBadges.length > 0 ? normalizedBadges : undefined,
      messageId: data.id
    }
  }

  // ----------------------------------------------------------------
  // Polling de viewers a cada 60s
  // ----------------------------------------------------------------
  private startStatsLoop(): void {
    if (this.statsTimer) clearInterval(this.statsTimer)
    if (this.isStopped) return

    const runStats = async (): Promise<void> => {
      if (this.isStopped || !this.channelSlug) return
      try {
        await this.pollStats()
      } catch {
        // Silencioso
      }
    }

    void runStats()
    this.statsTimer = setInterval(runStats, 60_000)
  }

  private async pollStats(): Promise<void> {
    if (!this.channelSlug || this.isStopped) return

    // Garantir tokens
    this.tokens = await getValidTokens(this.store)
    if (!this.tokens) return

    // Consultar API de livestreams oficial
    try {
      const url = `${KICK_API_BASE}/livestreams`
      const res = await net.fetch(url, {
        headers: { Authorization: `Bearer ${this.tokens.accessToken}` }
      })

      if (res.ok) {
        const data = (await res.json()) as {
          data?: {
            viewer_count?: string | number
          }
          viewer_count?: string | number
        }
        const streamData = data.data || data
        const viewers = parseInt(String(streamData.viewer_count || '0'), 10)
        this.onViewerCount?.(viewers)
        return
      }
    } catch {
      // Ignorar e tentar fallback
    }

    // Fallback: Consultar API v2 do canal que retorna info da live atual
    try {
      const url = `https://kick.com/api/v2/channels/${encodeURIComponent(this.channelSlug)}`
      const res = await net.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      if (res.ok) {
        const data = (await res.json()) as {
          livestream?: {
            viewer_count?: string | number
          }
        }
        if (data.livestream) {
          const viewers = parseInt(String(data.livestream.viewer_count || '0'), 10)
          this.onViewerCount?.(viewers)
        } else {
          this.onViewerCount?.(0) // offline
        }
      }
    } catch {
      // Silencioso
    }
  }

  // ----------------------------------------------------------------
  // Enviar mensagem no chat via API Oficial
  // ----------------------------------------------------------------
  async sendMessage(text: string): Promise<boolean> {
    this.tokens = await getValidTokens(this.store)
    if (!this.tokens || !this.broadcasterUserId) return false

    try {
      const url = `${KICK_API_BASE}/chat`
      const body = JSON.stringify({
        broadcaster_user_id: parseInt(this.broadcasterUserId, 10),
        content: text,
        type: 'user'
      })

      const res = await net.fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body
      })

      if (!res.ok) {
        if (res.status === 401) {
          // Token expirado, renovar uma vez e re-enviar
          this.tokens = await refreshAccessToken(this.store, this.tokens)
          return this.sendMessage(text)
        }
        const errText = await res.text()
        console.error('[Kick Send] Falha ao enviar mensagem:', errText)
        return false
      }

      return true
    } catch (err) {
      console.error('[Kick Send] Erro ao enviar mensagem:', err)
      return false
    }
  }

  // ----------------------------------------------------------------
  // Desconectar e limpar timers
  // ----------------------------------------------------------------
  disconnect(): void {
    this.isStopped = true
    this.closeWebSocket()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }

    this.chatroomId = ''
    this.broadcasterUserId = ''
  }
}
