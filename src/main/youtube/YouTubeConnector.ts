import { net } from 'electron'
import { getValidTokens, YouTubeTokens, refreshAccessToken } from './YouTubeAuth'
import { ChatMessage } from '../../common/types/ChatMessage'
import Store from 'electron-store'

type AnyStore = Store<Record<string, unknown>>

const API_KEY = import.meta.env.MAIN_VITE_YOUTUBE_API_KEY || ''
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3'

interface YouTubeLiveChatMessage {
  id: string
  snippet: {
    liveChatId: string
    type: string
    publishedAt: string
    displayMessage?: string
    textMessageDetails?: {
      messageText: string
    }
  }
  authorDetails: {
    channelId: string
    displayName: string
    profileImageUrl: string
    isChatOwner: boolean
    isChatModerator: boolean
    isChatSponsor: boolean
  }
}

interface LiveChatMessagesResponse {
  nextPageToken?: string
  pollingIntervalMillis?: number
  items?: YouTubeLiveChatMessage[]
  error?: {
    code: number
    message: string
  }
}

export class YouTubeConnector {
  private store: AnyStore
  private isStopped: boolean = false
  private pollingTimer: NodeJS.Timeout | null = null
  private statsTimer: NodeJS.Timeout | null = null

  private liveChatId: string = ''
  private videoId: string = ''
  private nextPageToken: string = ''
  private basePollingInterval: number = 3000 // default 3s
  private currentPollingInterval: number = 3000
  private consecutiveEmptyPolls: number = 0

  private tokens: YouTubeTokens | null = null
  private customEmojis: Map<string, string> = new Map()

  // Callbacks
  onMessage: ((msg: ChatMessage) => void) | null = null
  onStatusChange:
    | ((status: 'connecting' | 'connected' | 'disconnected', info?: string, error?: string) => void)
    | null = null
  onViewerCount: ((viewers: number, likeCount?: number) => void) | null = null

  constructor(store: AnyStore) {
    this.store = store
  }

  // ----------------------------------------------------------------
  // Conectar ao YouTube
  // ----------------------------------------------------------------
  async connect(channelOrVideoId: string): Promise<void> {
    this.isStopped = false
    this.videoId = channelOrVideoId.trim()
    this.onStatusChange?.('connecting', this.videoId || 'Auto-detect')

    // Tentar obter tokens válidos (OAuth)
    this.tokens = await getValidTokens(this.store)

    try {
      if (!this.videoId) {
        // Opção B: Detecção de Live Ativa (Video ID vazio)
        if (!this.tokens) {
          throw new Error('Nenhum login feito no YouTube e nenhum Video ID fornecido.')
        }
        console.log('[YouTube] Buscando transmissão ao vivo ativa para o usuário autenticado...')
        const broadcastInfo = await this.fetchActiveBroadcast(this.tokens.accessToken)
        this.videoId = broadcastInfo.videoId
        this.liveChatId = broadcastInfo.liveChatId
      } else {
        // Video ID fornecido manualmente
        console.log(`[YouTube] Resolvendo liveChatId para o vídeo: ${this.videoId}`)
        this.liveChatId = await this.resolveLiveChatId(this.videoId)
      }

      console.log(
        `[YouTube] Conectado com sucesso. liveChatId: ${this.liveChatId}, videoId: ${this.videoId}`
      )
      this.onStatusChange?.('connected', this.videoId)

      // Buscar emojis personalizados da live
      await this.fetchCustomEmojis()

      // Resetar tokens de polling e começar loops
      this.nextPageToken = ''
      this.consecutiveEmptyPolls = 0
      this.currentPollingInterval = this.basePollingInterval

      this.startPollingLoop()
      this.startStatsLoop()
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.error('[YouTube] Erro ao conectar:', errorMsg)
      this.onStatusChange?.('disconnected', undefined, errorMsg)
      this.disconnect()
    }
  }

  // ----------------------------------------------------------------
  // Buscar transmissão ao vivo ativa do usuário autenticado
  // ----------------------------------------------------------------
  private async fetchActiveBroadcast(
    accessToken: string
  ): Promise<{ videoId: string; liveChatId: string }> {
    const url = `${YOUTUBE_API_BASE}/liveBroadcasts?part=id,snippet&broadcastStatus=active&type=all`
    const res = await net.fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })

    if (!res.ok) {
      if (res.status === 401) {
        // Tentar renovar token uma vez
        this.tokens = await refreshAccessToken(this.store, this.tokens!)
        return this.fetchActiveBroadcast(this.tokens.accessToken)
      }
      const errText = await res.text()
      throw new Error(`Erro ao buscar transmissões ativas: ${errText}`)
    }

    const data = (await res.json()) as {
      items?: Array<{ id: string; snippet: { liveChatId?: string; title: string } }>
    }

    if (!data.items || data.items.length === 0) {
      throw new Error(
        'Nenhuma transmissão ao vivo (Live) ativa encontrada no seu canal no momento.'
      )
    }

    const activeItem = data.items[0]
    const liveChatId = activeItem.snippet.liveChatId
    if (!liveChatId) {
      throw new Error('A transmissão ativa não possui um chat ao vivo ativado.')
    }

    return {
      videoId: activeItem.id,
      liveChatId
    }
  }

  // ----------------------------------------------------------------
  // Resolver liveChatId a partir de um videoId
  // ----------------------------------------------------------------
  private async resolveLiveChatId(videoId: string): Promise<string> {
    const url = `${YOUTUBE_API_BASE}/videos?part=liveStreamingDetails&id=${encodeURIComponent(videoId)}${this.tokens ? '' : `&key=${API_KEY}`}`
    const headers: Record<string, string> = {}
    if (this.tokens) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`
    }

    const res = await net.fetch(url, { headers })

    if (!res.ok) {
      if (res.status === 401 && this.tokens) {
        this.tokens = await refreshAccessToken(this.store, this.tokens)
        return this.resolveLiveChatId(videoId)
      }
      const errText = await res.text()
      throw new Error(`Erro ao buscar detalhes do vídeo: ${errText}`)
    }

    const data = (await res.json()) as {
      items?: Array<{ liveStreamingDetails?: { activeLiveChatId?: string } }>
    }

    if (!data.items || data.items.length === 0) {
      throw new Error('Vídeo não encontrado ou inválido.')
    }

    const liveChatId = data.items[0].liveStreamingDetails?.activeLiveChatId
    if (!liveChatId) {
      throw new Error('Este vídeo não é uma transmissão ao vivo ativa (sem liveStreamingDetails).')
    }

    return liveChatId
  }

  // ----------------------------------------------------------------
  // Polling de mensagens
  // ----------------------------------------------------------------
  private startPollingLoop(): void {
    if (this.pollingTimer) clearTimeout(this.pollingTimer)
    if (this.isStopped) return

    const runPoll = async (): Promise<void> => {
      if (this.isStopped) return

      try {
        await this.pollMessages()
      } catch (err) {
        console.error('[YouTube Poll] Erro no loop de polling:', err)
      }

      // Re-agendar próximo poll usando o intervalo corrente (adaptativo)
      this.pollingTimer = setTimeout(runPoll, this.currentPollingInterval)
    }

    // Primeiro poll imediatamente
    this.pollingTimer = setTimeout(runPoll, 100)
  }

  private async pollMessages(): Promise<void> {
    if (!this.liveChatId || this.isStopped) return

    // Garantir token atualizado se estiver autenticado
    if (this.tokens) {
      this.tokens = await getValidTokens(this.store)
    }

    const params = new URLSearchParams({
      part: 'snippet,authorDetails',
      liveChatId: this.liveChatId,
      maxResults: '200'
    })

    if (this.nextPageToken) {
      params.append('pageToken', this.nextPageToken)
    }

    if (!this.tokens) {
      params.append('key', API_KEY)
    }

    const url = `${YOUTUBE_API_BASE}/liveChat/messages?${params.toString()}`
    const headers: Record<string, string> = {}
    if (this.tokens) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`
    }

    const res = await net.fetch(url, { headers })

    if (!res.ok) {
      if (res.status === 401 && this.tokens) {
        // Token expirado, forçar renovação no próximo ciclo
        this.tokens = null
        return
      }
      const errText = await res.text()
      console.warn(`[YouTube Poll] Erro HTTP ${res.status}: ${errText}`)
      return
    }

    const data = (await res.json()) as LiveChatMessagesResponse
    if (data.error) {
      console.warn(`[YouTube Poll] Erro retornado pela API: ${data.error.message}`)
      return
    }

    // 1. Atualizar nextPageToken para o próximo poll
    if (data.nextPageToken) {
      this.nextPageToken = data.nextPageToken
    }

    // 2. Atualizar intervalo base recomendado pela API
    if (data.pollingIntervalMillis) {
      this.basePollingInterval = Math.max(2000, data.pollingIntervalMillis)
    }

    const messages = data.items || []

    // 3. Otimização de cota adaptativa (Opção B)
    if (messages.length === 0) {
      this.consecutiveEmptyPolls++
      // A cada poll vazio após 10 seguidos (aproximadamente 30s), aumentamos em 500ms o intervalo até o teto de 6s
      if (this.consecutiveEmptyPolls > 10) {
        this.currentPollingInterval = Math.min(
          6000,
          this.basePollingInterval + (this.consecutiveEmptyPolls - 10) * 500
        )
      } else {
        this.currentPollingInterval = this.basePollingInterval
      }
    } else {
      // Resetar se chegarem novas mensagens
      this.consecutiveEmptyPolls = 0
      this.currentPollingInterval = this.basePollingInterval

      // Processar e emitir mensagens (Apenas se não for a primeira chamada para evitar flooding de histórico)
      if (this.nextPageToken) {
        for (const item of messages) {
          const chatMsg = this.normalizeMessage(item)
          this.onMessage?.(chatMsg)
        }
      }
    }
  }

  // ----------------------------------------------------------------
  // Normalizar objeto da API do YouTube para o padrão ChatMessage
  // ----------------------------------------------------------------
  private normalizeMessage(item: YouTubeLiveChatMessage): ChatMessage {
    const author = item.authorDetails
    const snippet = item.snippet
    const text = snippet.textMessageDetails?.messageText || snippet.displayMessage || ''

    const isModerator = author.isChatModerator || author.isChatOwner
    const isSubscriber = author.isChatSponsor

    // Identificar e popular emotes
    const emotes: Array<{ id: string; code: string; url: string }> = []
    if (this.customEmojis.size > 0) {
      for (const [shortcut, url] of this.customEmojis.entries()) {
        if (text.includes(shortcut)) {
          emotes.push({
            id: shortcut,
            code: shortcut,
            url
          })
        }
      }
    }

    return {
      id: `youtube-${item.id}`,
      platform: 'youtube',
      username: author.displayName.toLowerCase().replace(/\s+/g, ''),
      displayName: author.displayName,
      text,
      timestamp: new Date(snippet.publishedAt).getTime(),
      color: '#FF0000', // Vermelho padrão YouTube
      avatarUrl: author.profileImageUrl,
      isModerator,
      isSubscriber,
      emotes: emotes.length > 0 ? emotes : undefined,
      messageId: item.id
    }
  }

  // ----------------------------------------------------------------
  // Polling de visualizadores e likes a cada 30s
  // ----------------------------------------------------------------
  private startStatsLoop(): void {
    if (this.statsTimer) clearInterval(this.statsTimer)
    if (this.isStopped) return

    const runStats = async (): Promise<void> => {
      if (this.isStopped || !this.videoId) return
      try {
        await this.pollStats()
      } catch {
        // Silencioso
      }
    }

    void runStats()
    this.statsTimer = setInterval(runStats, 30_000)
  }

  private async pollStats(): Promise<void> {
    if (!this.videoId || this.isStopped) return

    // Garantir token atualizado se estiver autenticado
    if (this.tokens) {
      this.tokens = await getValidTokens(this.store)
    }

    const url = `${YOUTUBE_API_BASE}/videos?part=liveStreamingDetails,statistics&id=${encodeURIComponent(this.videoId)}${this.tokens ? '' : `&key=${API_KEY}`}`
    const headers: Record<string, string> = {}
    if (this.tokens) {
      headers['Authorization'] = `Bearer ${this.tokens.accessToken}`
    }

    const res = await net.fetch(url, { headers })
    if (!res.ok) return

    const data = (await res.json()) as {
      items?: Array<{
        liveStreamingDetails?: { concurrentViewers?: string }
        statistics?: { likeCount?: string }
      }>
    }

    if (data.items && data.items.length > 0) {
      const item = data.items[0]
      const viewers = parseInt(item.liveStreamingDetails?.concurrentViewers || '0', 10)
      const likes = parseInt(item.statistics?.likeCount || '0', 10)

      this.onViewerCount?.(viewers, likes)
    }
  }

  // ----------------------------------------------------------------
  // Enviar mensagem no chat via API insert
  // ----------------------------------------------------------------
  async sendMessage(text: string): Promise<boolean> {
    this.tokens = await getValidTokens(this.store)
    if (!this.tokens || !this.liveChatId) return false

    try {
      const url = `${YOUTUBE_API_BASE}/liveChat/messages?part=snippet`
      const body = JSON.stringify({
        snippet: {
          liveChatId: this.liveChatId,
          type: 'textMessageEvent',
          textMessageDetails: {
            messageText: text
          }
        }
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
          this.tokens = await refreshAccessToken(this.store, this.tokens)
          return this.sendMessage(text)
        }
        const errText = await res.text()
        console.error('[YouTube Send] Falha ao enviar mensagem:', errText)
        return false
      }

      return true
    } catch (err) {
      console.error('[YouTube Send] Erro ao enviar mensagem:', err)
      return false
    }
  }

  // ----------------------------------------------------------------
  // Buscar emojis/emotes da live via scraping do HTML inicial
  // ----------------------------------------------------------------
  private async fetchCustomEmojis(): Promise<void> {
    if (!this.videoId) return
    try {
      console.log(`[YouTube] Carregando lista de emojis para o vídeo: ${this.videoId}`)
      const url = `https://www.youtube.com/live_chat?v=${encodeURIComponent(this.videoId)}`
      const res = await net.fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })
      if (!res.ok) {
        console.warn(`[YouTube] Falha na requisição de emojis, status: ${res.status}`)
        return
      }
      const html = await res.text()

      const pattern = /ytInitialData"\]\s*=\s*/
      const match = html.match(pattern)
      if (!match || match.index === undefined) {
        console.warn('[YouTube] ytInitialData não encontrado no HTML para carregar emojis')
        return
      }

      const startIdx = match.index + match[0].length
      const dataStart = html.indexOf('{', startIdx)
      if (dataStart === -1) return

      const scriptEnd = html.indexOf(';</script>', dataStart)
      if (scriptEnd === -1) return

      const jsonStr = html.substring(dataStart, scriptEnd)
      const data = JSON.parse(jsonStr)

      this.customEmojis.clear()

      const emojis = data.contents?.liveChatRenderer?.emojis
      if (Array.isArray(emojis)) {
        for (const item of emojis) {
          const shortcuts = item.shortcuts || []
          const imgUrl = item.image?.thumbnails?.[0]?.url
          if (imgUrl) {
            const absoluteUrl = imgUrl.startsWith('//') ? `https:${imgUrl}` : imgUrl
            for (const shortcut of shortcuts) {
              this.customEmojis.set(shortcut, absoluteUrl)
            }
          }
        }
      }

      console.log(
        `[YouTube] Emojis carregados da live com sucesso. Total mapeado: ${this.customEmojis.size}`
      )
    } catch (err) {
      console.warn('[YouTube] Erro ao buscar emojis personalizados:', err)
    }
  }

  // ----------------------------------------------------------------
  // Desconectar e limpar timers
  // ----------------------------------------------------------------
  disconnect(): void {
    this.isStopped = true

    if (this.pollingTimer) {
      clearTimeout(this.pollingTimer)
      this.pollingTimer = null
    }

    if (this.statsTimer) {
      clearInterval(this.statsTimer)
      this.statsTimer = null
    }

    this.liveChatId = ''
  }
}
