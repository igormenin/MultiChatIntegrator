/**
 * YouTubeChatPopupReader
 *
 * Lê mensagens do chat do YouTube usando o endpoint interno (não oficial)
 * `youtubei/v1/live_chat/get_live_chat`, da mesma forma que o popout do chat faz.
 *
 * ⚠️  AVISO: Este módulo usa um endpoint interno não documentado do YouTube.
 *     Pode parar de funcionar a qualquer momento caso o YouTube altere sua estrutura.
 *     Não há garantia de estabilidade de longo prazo.
 *
 * Diferença entre "Principais mensagens" e "Chat ao vivo":
 *  - "Principais mensagens" (Top Chat): filtrado pelo YouTube, apenas destacados.
 *    Corresponde ao continuation do tipo `timedContinuationData`.
 *  - "Chat ao vivo" (Live Chat): todas as mensagens em tempo real.
 *    Corresponde ao continuation do tipo `invalidationContinuationData`.
 *  A seleção é feita pela heurística em `selectInitialContinuation()`.
 */

import { net } from 'electron'
import { ChatMessage } from '../../common/types/ChatMessage'

// ----------------------------------------------------------------
// Configuração (tuning opcional via .env)
// ----------------------------------------------------------------
const POLL_MIN_MS = parseInt(
  import.meta.env.MAIN_VITE_YOUTUBE_CHATPOPUP_POLL_MIN_MS || '1500',
  10
)
const POLL_MAX_MS = parseInt(
  import.meta.env.MAIN_VITE_YOUTUBE_CHATPOPUP_POLL_MAX_MS || '8000',
  10
)
const INITIAL_TIMEOUT_MS = parseInt(
  import.meta.env.MAIN_VITE_YOUTUBE_CHATPOPUP_INITIAL_TIMEOUT_MS || '12000',
  10
)
const MAX_RETRIES = parseInt(
  import.meta.env.MAIN_VITE_YOUTUBE_CHATPOPUP_MAX_RETRIES || '5',
  10
)
const FILTER_MODE = import.meta.env.MAIN_VITE_YOUTUBE_CHATPOPUP_FILTER_MODE || 'live_all'

const LIVE_CHAT_URL = 'https://www.youtube.com/live_chat'
const INNERTUBE_LIVE_CHAT_URL =
  'https://www.youtube.com/youtubei/v1/live_chat/get_live_chat'

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
const ACCEPT_LANGUAGE = 'pt-BR,pt;q=0.9,en;q=0.8'

// ----------------------------------------------------------------
// Tipos internos
// ----------------------------------------------------------------
type FilterMode = 'live_all' | 'top_chat'

interface InnertubeContext {
  client: {
    clientName: string
    clientVersion: string
    hl?: string
    gl?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

interface ContinuationData {
  continuation: string
  timeoutMs?: number
  type: 'invalidation' | 'timed' | 'unknown'
}

interface LiveChatAction {
  addChatItemAction?: {
    item: Record<string, unknown>
  }
}

// ----------------------------------------------------------------
// YouTubeChatPopupReader — classe pública
// ----------------------------------------------------------------
export class YouTubeChatPopupReader {
  private stopped = false
  // Limite generoso para livestreams de muitas horas
  private readonly SEEN_IDS_MAX = 5000
  private readonly SEEN_IDS_PURGE_TO = 4000 // Purgar para este tamanho quando atingir o limite
  private seenIds = new Set<string>()

  /** Encerra o loop de polling graciosamente. */
  stop(): void {
    this.stopped = true
    console.log('[YouTube ChatPopup] stop() chamado.')
  }

  /**
   * Inicia a leitura de mensagens do chat da live.
   * Resolve quando stop() é chamado.
   * Rejeita em caso de erro fatal (estrutura do HTML mudou, etc.).
   */
  async startReading(
    videoId: string,
    onMessage: (msg: ChatMessage) => void
  ): Promise<void> {
    this.stopped = false
    this.seenIds.clear()

    console.log(
      `[YouTube ChatPopup] Iniciando leitura. videoId=${videoId}, filterMode=${FILTER_MODE}`
    )

    // Bootstrap: buscar HTML da janela popout
    const bootstrapUrl = `${LIVE_CHAT_URL}?is_popout=1&v=${encodeURIComponent(videoId)}`
    const html = await this.fetchHtml(bootstrapUrl)

    // Extrair dados necessários para o polling
    const apiKey = extractApiKey(html)
    if (!apiKey) {
      throw new Error(
        '[YouTube ChatPopup] INNERTUBE_API_KEY não encontrado no HTML inicial. ' +
          'O YouTube pode ter alterado sua estrutura. O modo chat_popup não pode continuar.'
      )
    }
    console.log('[YouTube ChatPopup] INNERTUBE_API_KEY extraído com sucesso.')

    const innertubeContext = extractContext(html)
    const continuations = extractContinuations(html)

    if (continuations.length === 0) {
      throw new Error(
        '[YouTube ChatPopup] Nenhum continuation encontrado no HTML. ' +
          'A live pode ter encerrado ou a estrutura do YouTube mudou.'
      )
    }

    const initial = selectInitialContinuation(continuations, FILTER_MODE as FilterMode)

    // Iniciar loop de polling
    await this.pollLoop(apiKey, innertubeContext, initial.continuation, onMessage)
  }

  // ----------------------------------------------------------------
  // Loop principal de polling
  // ----------------------------------------------------------------
  private async pollLoop(
    apiKey: string,
    context: InnertubeContext,
    initialContinuation: string,
    onMessage: (msg: ChatMessage) => void
  ): Promise<void> {
    let continuation = initialContinuation
    let retryCount = 0
    let pollIteration = 0

    while (!this.stopped) {
      pollIteration++

      try {
        const { actions, nextContinuation, timeoutMs } = await this.poll(
          apiKey,
          context,
          continuation
        )
        retryCount = 0 // reset após sucesso

        // Processar e deduplicar mensagens
        let newCount = 0
        let dupCount = 0

        for (const action of actions) {
          const msg = parseAction(action)
          if (!msg) continue

          if (this.seenIds.has(msg.messageId)) {
            dupCount++
            continue
          }

          this.seenIds.add(msg.messageId)
          // Purga em lote ao atingir o limite — remove os mais antigos de uma vez só
          if (this.seenIds.size > this.SEEN_IDS_MAX) {
            const removeCount = this.seenIds.size - this.SEEN_IDS_PURGE_TO
            const iter = this.seenIds.values()
            for (let i = 0; i < removeCount; i++) {
              const oldest = iter.next().value
              if (oldest) this.seenIds.delete(oldest)
            }
            console.log(`[YouTube ChatPopup] seenIds purgado: ${removeCount} entradas removidas.`)
          }

          newCount++
          onMessage(msg)
        }

        console.log(
          `[YouTube ChatPopup] Poll #${pollIteration}: ` +
            `${newCount} novas, ${dupCount} duplicadas. ` +
            `continuation=${continuation.substring(0, 30)}... ` +
            `timeoutMs=${timeoutMs ?? 'n/a'}`
        )

        if (!nextContinuation) {
          console.warn(
            '[YouTube ChatPopup] Próximo continuation ausente na resposta. ' +
              'Aguardando antes de tentar novamente com o mesmo continuation...'
          )
          await sleep(POLL_MIN_MS)
          continue
        }

        continuation = nextContinuation

        // Respeitar timeoutMs do YouTube dentro dos limites configurados
        const delay = timeoutMs
          ? Math.min(POLL_MAX_MS, Math.max(POLL_MIN_MS, timeoutMs))
          : POLL_MIN_MS

        await sleep(delay)
      } catch (err: unknown) {
        if (this.stopped) break

        const errMsg = err instanceof Error ? err.message : String(err)

        if (!isTransientError(err)) {
          throw err // Erro fatal — propaga para YouTubeConnector
        }

        retryCount++
        if (retryCount > MAX_RETRIES) {
          throw new Error(
            `[YouTube ChatPopup] Máximo de retries (${MAX_RETRIES}) atingido. ` +
              `Último erro: ${errMsg}`
          )
        }

        const backoff = Math.min(POLL_MAX_MS, POLL_MIN_MS * Math.pow(2, retryCount - 1))
        console.warn(
          `[YouTube ChatPopup] Erro transitório (retry ${retryCount}/${MAX_RETRIES}). ` +
            `Aguardando ${backoff}ms. Motivo: ${errMsg}`
        )
        await sleep(backoff)
      }
    }

    console.log('[YouTube ChatPopup] Loop de polling encerrado.')
  }

  // ----------------------------------------------------------------
  // POST para o endpoint innertube de live chat
  // ----------------------------------------------------------------
  private async poll(
    apiKey: string,
    context: InnertubeContext,
    continuation: string
  ): Promise<{
    actions: LiveChatAction[]
    nextContinuation: string | null
    timeoutMs: number | null
  }> {
    const url = `${INNERTUBE_LIVE_CHAT_URL}?key=${encodeURIComponent(apiKey)}&prettyPrint=false`
    const body = JSON.stringify({ context, continuation })

    const res = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': USER_AGENT,
          'Accept-Language': ACCEPT_LANGUAGE,
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': (context.client.clientVersion as string) || '2.20240101.00.00'
        },
        body
      },
      INITIAL_TIMEOUT_MS
    )

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const err = new Error(`HTTP ${res.status}: ${text.substring(0, 200)}`)
      // 429 e 5xx são transitórios
      if (res.status === 429 || res.status >= 500) {
        ;(err as NodeJS.ErrnoException).code = 'TRANSIENT'
      }
      throw err
    }

    const data = (await res.json()) as {
      continuationContents?: {
        liveChatContinuation?: {
          actions?: LiveChatAction[]
          continuations?: Record<string, unknown>[]
        }
      }
    }

    const lcc = data.continuationContents?.liveChatContinuation
    const actions = (lcc?.actions ?? []) as LiveChatAction[]
    const rawContinuations = (lcc?.continuations ?? []) as Record<string, unknown>[]

    // Extrair próximo continuation e timeoutMs
    let nextContinuation: string | null = null
    let timeoutMs: number | null = null

    for (const c of rawContinuations) {
      const inv = c['invalidationContinuationData'] as Record<string, unknown> | undefined
      const timed = c['timedContinuationData'] as Record<string, unknown> | undefined

      if (inv?.['continuation']) {
        nextContinuation = inv['continuation'] as string
        timeoutMs = (inv['timeoutMs'] as number) ?? null
        break
      }
      if (timed?.['continuation']) {
        nextContinuation = timed['continuation'] as string
        timeoutMs = (timed['timeoutMs'] as number) ?? null
        break
      }
    }

    return { actions, nextContinuation, timeoutMs }
  }

  // ----------------------------------------------------------------
  // GET do HTML inicial
  // ----------------------------------------------------------------
  private async fetchHtml(url: string): Promise<string> {
    const res = await fetchWithTimeout(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept-Language': ACCEPT_LANGUAGE,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        }
      },
      INITIAL_TIMEOUT_MS
    )

    if (!res.ok) {
      throw new Error(
        `[YouTube ChatPopup] Falha ao buscar HTML inicial (${url}): HTTP ${res.status}`
      )
    }

    return res.text()
  }
}

// ----------------------------------------------------------------
// Funções puras de extração — exportadas para facilitar testes
// ----------------------------------------------------------------

/**
 * Extrai a INNERTUBE_API_KEY do HTML da página de live chat.
 * Tenta dois padrões conhecidos, com fallback.
 */
export function extractApiKey(html: string): string | null {
  const match =
    html.match(/"INNERTUBE_API_KEY"\s*:\s*"([^"]+)"/) ??
    html.match(/"innertubeApiKey"\s*:\s*"([^"]+)"/)
  return match?.[1] ?? null
}

/**
 * Extrai o INNERTUBE_CONTEXT do HTML.
 * Retorna um contexto mínimo de fallback se não encontrar.
 */
export function extractContext(html: string): InnertubeContext {
  try {
    const match = html.match(/"INNERTUBE_CONTEXT"\s*:\s*(\{)/)
    if (match?.index !== undefined) {
      const startIdx = match.index + '"INNERTUBE_CONTEXT":'.length
      const jsonStr = extractJsonObject(html, html.indexOf('{', startIdx))
      if (jsonStr) {
        return JSON.parse(jsonStr) as InnertubeContext
      }
    }
  } catch {
    // Silencioso — usa fallback
  }

  console.warn(
    '[YouTube ChatPopup] INNERTUBE_CONTEXT não encontrado no HTML. ' +
      'Usando contexto mínimo de fallback (pode afetar compatibilidade).'
  )
  return {
    client: {
      clientName: 'WEB',
      clientVersion: '2.20240101.00.00',
      hl: 'pt',
      gl: 'BR'
    }
  }
}

/**
 * Extrai os continuations do ytInitialData no HTML.
 * Usa o mesmo padrão de parsing já existente em fetchCustomEmojis() do YouTubeConnector.
 *
 * Diferença entre tipos:
 *  - 'invalidation': Chat ao vivo (todas as mensagens)
 *  - 'timed': Principais mensagens (filtrado pelo YouTube)
 */
export function extractContinuations(html: string): ContinuationData[] {
  const results: ContinuationData[] = []

  try {
    // Mesmo padrão de fetchCustomEmojis() no YouTubeConnector
    const pattern = /ytInitialData"\]\s*=\s*/
    const match = html.match(pattern)
    if (!match || match.index === undefined) {
      console.warn('[YouTube ChatPopup] ytInitialData não encontrado no HTML.')
      return results
    }

    const startIdx = match.index + match[0].length
    const dataStart = html.indexOf('{', startIdx)
    if (dataStart === -1) return results

    const scriptEnd = html.indexOf(';</script>', dataStart)
    if (scriptEnd === -1) return results

    const jsonStr = html.substring(dataStart, scriptEnd)
    const data = JSON.parse(jsonStr) as {
      contents?: {
        liveChatRenderer?: {
          continuations?: Record<string, unknown>[]
        }
      }
    }

    const continuations = data.contents?.liveChatRenderer?.continuations ?? []

    for (const c of continuations) {
      const inv = c['invalidationContinuationData'] as Record<string, unknown> | undefined
      const timed = c['timedContinuationData'] as Record<string, unknown> | undefined

      if (inv?.['continuation']) {
        results.push({
          continuation: inv['continuation'] as string,
          timeoutMs: inv['timeoutMs'] as number | undefined,
          type: 'invalidation'
        })
      } else if (timed?.['continuation']) {
        results.push({
          continuation: timed['continuation'] as string,
          timeoutMs: timed['timeoutMs'] as number | undefined,
          type: 'timed'
        })
      }
    }
  } catch (err) {
    console.warn('[YouTube ChatPopup] Erro ao extrair continuations do HTML:', err)
  }

  console.log(
    `[YouTube ChatPopup] Continuations encontrados: ${results.length}. ` +
      results.map((c, i) => `[${i}] type=${c.type}`).join(', ')
  )

  return results
}

/**
 * Seleciona o continuation inicial conforme o filterMode.
 *
 * Heurística:
 *  - live_all → prefere 'invalidation' (Chat ao vivo completo)
 *  - top_chat → prefere 'timed' (Principais mensagens)
 *  - Fallback: primeiro disponível (com log de aviso)
 *
 * ⚠️  Esta heurística depende da estrutura atual do YouTube e pode
 *     quebrar se o YouTube alterar o formato de resposta.
 */
export function selectInitialContinuation(
  continuations: ContinuationData[],
  filterMode: FilterMode
): ContinuationData {
  if (continuations.length === 0) {
    throw new Error('[YouTube ChatPopup] Nenhum continuation disponível para seleção.')
  }

  const preferred = filterMode === 'live_all' ? 'invalidation' : 'timed'
  const found = continuations.find((c) => c.type === preferred)

  if (found) {
    console.log(
      `[YouTube ChatPopup] Continuation selecionado: type=${found.type} ` +
        `(heurística: filterMode='${filterMode}', prefere '${preferred}')`
    )
    return found
  }

  // Fallback para o primeiro disponível
  const fallback = continuations[0]
  console.warn(
    `[YouTube ChatPopup] Continuation preferido ('${preferred}') não encontrado entre ${continuations.length} opções. ` +
      `Usando fallback: type=${fallback.type}. ` +
      `Isso pode resultar em receber "Principais mensagens" em vez de "Chat ao vivo".`
  )
  return fallback
}

// ----------------------------------------------------------------
// Parsing de actions → ChatMessage
// ----------------------------------------------------------------

/**
 * Converte uma action do YouTube para o formato interno ChatMessage.
 * Retorna null para actions não suportadas ou sem item de chat.
 */
export function parseAction(action: LiveChatAction): ChatMessage | null {
  const item = action.addChatItemAction?.item
  if (!item) return null

  if (item['liveChatTextMessageRenderer']) {
    return parseTextMessage(item['liveChatTextMessageRenderer'] as Record<string, unknown>)
  }
  if (item['liveChatPaidMessageRenderer']) {
    return parsePaidMessage(item['liveChatPaidMessageRenderer'] as Record<string, unknown>)
  }
  if (item['liveChatMembershipItemRenderer']) {
    return parseMembershipMessage(
      item['liveChatMembershipItemRenderer'] as Record<string, unknown>
    )
  }
  if (item['liveChatPaidStickerRenderer']) {
    return parsePaidStickerMessage(
      item['liveChatPaidStickerRenderer'] as Record<string, unknown>
    )
  }

  const unknownKey = Object.keys(item)[0] ?? 'unknown'
  console.warn(`[YouTube ChatPopup] Renderer desconhecido ignorado: ${unknownKey}`)
  return null
}

function parseTextMessage(r: Record<string, unknown>): ChatMessage | null {
  const id = r['id'] as string | undefined
  if (!id) return null

  const text = extractRuns(r['message'] as Record<string, unknown>)
  const author = extractAuthor(r)

  return buildMessage(id, text, author, r)
}

function parsePaidMessage(r: Record<string, unknown>): ChatMessage | null {
  const id = r['id'] as string | undefined
  if (!id) return null

  const amount =
    ((r['purchaseAmountText'] as Record<string, unknown>)?.['simpleText'] as string) ?? ''
  const bodyText = extractRuns(r['message'] as Record<string, unknown>)
  const text = bodyText ? `[Super Chat ${amount}] ${bodyText}` : `[Super Chat ${amount}]`
  const author = extractAuthor(r)

  return { ...buildMessage(id, text, author, r), isSubscriber: true }
}

function parseMembershipMessage(r: Record<string, unknown>): ChatMessage | null {
  const id = r['id'] as string | undefined
  if (!id) return null

  const headerText = extractRuns(r['headerSubtext'] as Record<string, unknown>)
  const text = headerText || '[Novo Membro]'
  const author = extractAuthor(r)

  return { ...buildMessage(id, text, author, r), isSubscriber: true }
}

function parsePaidStickerMessage(r: Record<string, unknown>): ChatMessage | null {
  const id = r['id'] as string | undefined
  if (!id) return null

  const amount =
    ((r['purchaseAmountText'] as Record<string, unknown>)?.['simpleText'] as string) ?? ''
  const text = `[Sticker pago ${amount}]`
  const author = extractAuthor(r)

  return { ...buildMessage(id, text, author, r), isSubscriber: true }
}

function buildMessage(
  id: string,
  text: string,
  author: AuthorInfo,
  r: Record<string, unknown>
): ChatMessage {
  return {
    id: `youtube-popup-${id}`,
    platform: 'youtube',
    username: author.displayName.toLowerCase().replace(/\s+/g, ''),
    displayName: author.displayName,
    text,
    timestamp: extractTimestamp(r),
    color: '#FF0000',
    avatarUrl: author.avatarUrl,
    isModerator: author.isModerator,
    isSubscriber: author.isSubscriber,
    messageId: id
  }
}

// ----------------------------------------------------------------
// Helpers de extração de campos do renderer
// ----------------------------------------------------------------

function extractRuns(node: Record<string, unknown> | undefined): string {
  if (!node) return ''
  const runs = node['runs'] as Array<{ text?: string }> | undefined
  if (!Array.isArray(runs)) return ''
  return runs.map((r) => r.text ?? '').join('')
}

interface AuthorInfo {
  displayName: string
  avatarUrl: string | undefined
  isModerator: boolean
  isSubscriber: boolean
}

function extractAuthor(r: Record<string, unknown>): AuthorInfo {
  const nameNode = r['authorName'] as Record<string, unknown> | undefined
  const displayName = (nameNode?.['simpleText'] as string) ?? 'Unknown'

  const photoNode = r['authorPhoto'] as Record<string, unknown> | undefined
  const thumbnails = photoNode?.['thumbnails'] as Array<{ url: string }> | undefined
  const avatarUrl = thumbnails?.[thumbnails.length - 1]?.url

  const badges = r['authorBadges'] as Array<Record<string, unknown>> | undefined
  let isModerator = false
  let isSubscriber = false

  if (Array.isArray(badges)) {
    for (const badge of badges) {
      const badgeRenderer = badge['liveChatAuthorBadgeRenderer'] as
        | Record<string, unknown>
        | undefined
      const iconType = (badgeRenderer?.['icon'] as Record<string, unknown> | undefined)?.[
        'iconType'
      ] as string | undefined

      if (iconType === 'MODERATOR' || iconType === 'OWNER') isModerator = true
      if (iconType === 'MEMBER') isSubscriber = true
    }
  }

  return { displayName, avatarUrl, isModerator, isSubscriber }
}

function extractTimestamp(r: Record<string, unknown>): number {
  const usec = r['timestampUsec'] as string | undefined
  if (usec) return Math.floor(parseInt(usec, 10) / 1000)
  return Date.now()
}

// ----------------------------------------------------------------
// Utilitários
// ----------------------------------------------------------------

/** Extrai um objeto JSON completo a partir de um índice de abertura '{'. */
function extractJsonObject(str: string, startIndex: number): string | null {
  if (startIndex === -1 || startIndex >= str.length) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let i = startIndex; i < str.length; i++) {
    const ch = str[i]
    if (escaped) {
      escaped = false
      continue
    }
    if (ch === '\\' && inString) {
      escaped = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return str.substring(startIndex, i + 1)
    }
  }
  return null
}

/**
 * Classifica se um erro é transitório (deve fazer retry) ou fatal.
 * Erros fatais: estrutura do HTML mudou, dados essenciais ausentes.
 * Erros transitórios: timeout, rede, 429, 5xx.
 */
function isTransientError(err: unknown): boolean {
  if (!(err instanceof Error)) return true
  const msg = err.message
  if (msg.includes('INNERTUBE_API_KEY não encontrado')) return false
  if (msg.includes('Nenhum continuation encontrado')) return false
  if (msg.includes('mudou') && msg.includes('estrutura')) return false
  if ((err as NodeJS.ErrnoException).code === 'TRANSIENT') return true
  return true // Por padrão, tentar retry
}

/** Wrapper de fetch com timeout manual via Promise.race (compatibilidade garantida). */
async function fetchWithTimeout(
  url: string,
  options: Parameters<typeof net.fetch>[1],
  timeoutMs: number
): Promise<Response> {
  const fetchPromise = net.fetch(url, options)
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error(`Request timeout após ${timeoutMs}ms`)), timeoutMs)
  )
  return Promise.race([fetchPromise, timeoutPromise])
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
