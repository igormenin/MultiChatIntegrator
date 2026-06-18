import { net } from 'electron'
import { TwitchTokens, getValidTokens, refreshAccessToken } from './TwitchAuth'
import { ChatMessage } from '../../common/types/ChatMessage'
import Store from 'electron-store'

type AnyStore = Store<Record<string, unknown>>

const CLIENT_ID = import.meta.env.MAIN_VITE_TWITCH_CLIENT_ID || ''
const EVENTSUB_URL = 'wss://eventsub.wss.twitch.tv/ws'
const HELIX_BASE = 'https://api.twitch.tv/helix'
const KEEPALIVE_TIMEOUT_SEC = 30

// ----------------------------------------------------------------
// Tipos de mensagens EventSub
// ----------------------------------------------------------------
interface EventSubSessionWelcome {
  metadata: { message_type: string }
  payload: {
    session: {
      id: string
      keepalive_timeout_seconds: number
      reconnect_url?: string
    }
  }
}

interface EventSubNotification {
  metadata: { message_type: string; subscription_type?: string }
  payload: {
    event?: {
      broadcaster_user_id: string
      chatter_user_id: string
      chatter_user_login: string
      chatter_user_name: string
      message: {
        text: string
        fragments: Array<{
          type: string
          text: string
          emote?: { id: string; emote_set_id: string }
        }>
      }
      color: string
      badges: Array<{ set_id: string; id: string; info: string }>
      message_id: string
    }
  }
}

type AnyEventSubMessage =
  | EventSubSessionWelcome
  | EventSubNotification
  | { metadata: { message_type: string }; payload: object }

// ----------------------------------------------------------------
// Conector principal
// ----------------------------------------------------------------
export class TwitchConnector {
  private ws: WebSocket | null = null
  private sessionId: string | null = null
  private channel: string = ''
  private broadcasterId: string = ''
  private tokens: TwitchTokens | null = null
  private store: AnyStore
  private keepaliveTimer: NodeJS.Timeout | null = null
  private reconnectTimer: NodeJS.Timeout | null = null
  private viewerPollingTimer: NodeJS.Timeout | null = null
  private isStopped: boolean = false

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
  // Conectar ao canal
  // ----------------------------------------------------------------
  async connect(channel: string): Promise<void> {
    this.channel = channel.toLowerCase().trim()
    this.isStopped = false
    this.onStatusChange?.('connecting', this.channel)

    this.tokens = await getValidTokens(this.store)
    if (!this.tokens) {
      this.onStatusChange?.(
        'disconnected',
        undefined,
        'Não autenticado. Faça o login com Twitch primeiro.'
      )
      return
    }

    try {
      this.broadcasterId = await this.resolveUserId(this.channel)
    } catch {
      this.onStatusChange?.(
        'disconnected',
        undefined,
        `Canal "${this.channel}" não encontrado na Twitch`
      )
      return
    }

    this.openWebSocket()
  }

  // ----------------------------------------------------------------
  // Abrir WebSocket EventSub usando API nativa do Node 22+
  // ----------------------------------------------------------------
  private openWebSocket(url: string = EVENTSUB_URL): void {
    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }

    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = (): void => {
      console.log('[Twitch] WebSocket conectado')
      this.resetKeepalive()
    }

    ws.onmessage = (event: MessageEvent): void => {
      this.resetKeepalive()
      try {
        const data = JSON.parse(event.data as string) as AnyEventSubMessage
        void this.handleMessage(data)
      } catch {
        // Ignorar mensagens malformadas
      }
    }

    ws.onclose = (): void => {
      console.log('[Twitch] WebSocket fechado')
      this.clearKeepalive()
      if (!this.isStopped) {
        this.scheduleReconnect()
      }
    }

    ws.onerror = (event: Event): void => {
      console.error('[Twitch] WebSocket erro:', event)
    }
  }

  // ----------------------------------------------------------------
  // Dispatcher de mensagens WebSocket
  // ----------------------------------------------------------------
  private async handleMessage(data: AnyEventSubMessage): Promise<void> {
    const type = data.metadata?.message_type

    switch (type) {
      case 'session_welcome': {
        const welcome = data as EventSubSessionWelcome
        this.sessionId = welcome.payload.session.id
        console.log(`[Twitch] Session ID: ${this.sessionId}`)

        await this.subscribe('channel.chat.message', '1', {
          broadcaster_user_id: this.broadcasterId,
          user_id: this.tokens!.userId!
        })

        this.onStatusChange?.('connected', this.channel)
        this.startViewerPolling()
        break
      }

      case 'session_reconnect': {
        const reconnect = data as EventSubSessionWelcome
        const newUrl = reconnect.payload.session.reconnect_url
        if (newUrl) {
          console.log('[Twitch] Reconnect solicitado, nova URL:', newUrl)
          this.openWebSocket(newUrl)
        }
        break
      }

      case 'notification': {
        const notification = data as EventSubNotification
        if (
          notification.metadata.subscription_type === 'channel.chat.message' &&
          notification.payload.event
        ) {
          const msg = this.normalizeMessage(notification.payload.event)
          this.onMessage?.(msg)
        }
        break
      }

      case 'session_keepalive':
        // Heartbeat recebido — timer já resetado no onmessage
        break

      default:
        break
    }
  }

  // ----------------------------------------------------------------
  // Assinar evento no EventSub
  // ----------------------------------------------------------------
  private async subscribe(
    type: string,
    version: string,
    condition: Record<string, string>
  ): Promise<void> {
    if (!this.tokens || !this.sessionId) return

    const body = JSON.stringify({
      type,
      version,
      condition,
      transport: { method: 'websocket', session_id: this.sessionId }
    })

    const res = await net.fetch(`${HELIX_BASE}/eventsub/subscriptions`, {
      method: 'POST',
      headers: {
        'Client-Id': CLIENT_ID,
        Authorization: `Bearer ${this.tokens.accessToken}`,
        'Content-Type': 'application/json'
      },
      body
    })

    if (!res.ok) {
      if (res.status === 401) {
        this.tokens = await refreshAccessToken(this.store, this.tokens)
        await this.subscribe(type, version, condition)
        return
      }
      const text = await res.text()
      console.error(`[Twitch] Falha ao assinar ${type}: ${text}`)
    }
  }

  // ----------------------------------------------------------------
  // Normalizar evento EventSub para ChatMessage
  // ----------------------------------------------------------------
  private normalizeMessage(
    event: NonNullable<EventSubNotification['payload']['event']>
  ): ChatMessage {
    const badges = event.badges || []
    const isModerator = badges.some((b) => b.set_id === 'moderator')
    const isSubscriber = badges.some((b) => b.set_id === 'subscriber' || b.set_id === 'founder')

    return {
      id: `twitch-${event.message_id}`,
      platform: 'twitch',
      username: event.chatter_user_login,
      displayName: event.chatter_user_name,
      text: event.message.text,
      timestamp: Date.now(),
      color: event.color || '#9146FF',
      isModerator,
      isSubscriber,
      messageId: event.message_id
    }
  }

  // ----------------------------------------------------------------
  // Resolver user_id a partir do login name
  // ----------------------------------------------------------------
  private async resolveUserId(login: string): Promise<string> {
    if (!this.tokens) throw new Error('Sem tokens')

    const res = await net.fetch(`${HELIX_BASE}/users?login=${encodeURIComponent(login)}`, {
      headers: {
        'Client-Id': CLIENT_ID,
        Authorization: `Bearer ${this.tokens.accessToken}`
      }
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)

    const data = (await res.json()) as { data: Array<{ id: string; login: string }> }
    if (!data.data.length) throw new Error(`Usuário não encontrado: ${login}`)

    return data.data[0].id
  }

  // ----------------------------------------------------------------
  // Polling de viewers a cada 60s
  // ----------------------------------------------------------------
  private startViewerPolling(): void {
    this.stopViewerPolling()
    void this.pollViewers()
    this.viewerPollingTimer = setInterval(() => void this.pollViewers(), 60_000)
  }

  private stopViewerPolling(): void {
    if (this.viewerPollingTimer) {
      clearInterval(this.viewerPollingTimer)
      this.viewerPollingTimer = null
    }
  }

  private async pollViewers(): Promise<void> {
    if (!this.tokens || !this.channel) return

    try {
      const res = await net.fetch(
        `${HELIX_BASE}/streams?user_login=${encodeURIComponent(this.channel)}`,
        {
          headers: {
            'Client-Id': CLIENT_ID,
            Authorization: `Bearer ${this.tokens.accessToken}`
          }
        }
      )

      if (!res.ok) return

      const data = (await res.json()) as { data: Array<{ viewer_count: number }> }
      const viewers = data.data[0]?.viewer_count ?? 0
      this.onViewerCount?.(viewers)
    } catch {
      // Silencioso em falha de rede
    }
  }

  // ----------------------------------------------------------------
  // Enviar mensagem no chat via Helix API
  // ----------------------------------------------------------------
  async sendMessage(text: string): Promise<boolean> {
    this.tokens = await getValidTokens(this.store)
    if (!this.tokens || !this.broadcasterId) return false

    try {
      const body = JSON.stringify({
        broadcaster_id: this.broadcasterId,
        sender_id: this.tokens.userId,
        message: text
      })

      const res = await net.fetch(`${HELIX_BASE}/chat/messages`, {
        method: 'POST',
        headers: {
          'Client-Id': CLIENT_ID,
          Authorization: `Bearer ${this.tokens.accessToken}`,
          'Content-Type': 'application/json'
        },
        body
      })

      if (!res.ok) {
        console.error('[Twitch] Falha ao enviar mensagem:', await res.text())
        return false
      }

      return true
    } catch (err) {
      console.error('[Twitch] Erro ao enviar mensagem:', err)
      return false
    }
  }

  // ----------------------------------------------------------------
  // Keepalive timer
  // ----------------------------------------------------------------
  private resetKeepalive(): void {
    this.clearKeepalive()
    this.keepaliveTimer = setTimeout(
      () => {
        console.warn('[Twitch] Keepalive timeout — reconectando...')
        this.scheduleReconnect(0)
      },
      (KEEPALIVE_TIMEOUT_SEC + 5) * 1000
    )
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimer) {
      clearTimeout(this.keepaliveTimer)
      this.keepaliveTimer = null
    }
  }

  // ----------------------------------------------------------------
  // Reconexão automática com backoff de 5s
  // ----------------------------------------------------------------
  private scheduleReconnect(delayMs: number = 5000): void {
    if (this.reconnectTimer) return
    console.log(`[Twitch] Reconectando em ${delayMs / 1000}s...`)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      if (!this.isStopped && this.channel) {
        void this.connect(this.channel)
      }
    }, delayMs)
  }

  // ----------------------------------------------------------------
  // Desconectar e limpar todos os recursos
  // ----------------------------------------------------------------
  disconnect(): void {
    this.isStopped = true
    this.clearKeepalive()
    this.stopViewerPolling()

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    if (this.ws) {
      this.ws.onclose = null
      this.ws.onerror = null
      this.ws.onmessage = null
      this.ws.close()
      this.ws = null
    }

    this.sessionId = null
  }
}
