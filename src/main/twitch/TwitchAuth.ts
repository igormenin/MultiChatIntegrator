import { net } from 'electron'
import Store from 'electron-store'

type AnyStore = Store<Record<string, unknown>>

const CLIENT_ID = import.meta.env.MAIN_VITE_TWITCH_CLIENT_ID || ''
const CLIENT_SECRET = import.meta.env.MAIN_VITE_TWITCH_CLIENT_SECRET || ''

const DEVICE_AUTH_URL = 'https://id.twitch.tv/oauth2/device'
const TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
const VALIDATE_URL = 'https://id.twitch.tv/oauth2/validate'

const SCOPES = ['user:read:chat', 'user:write:chat', 'user:bot', 'channel:bot'].join(' ')

export interface TwitchTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // ms epoch
  login?: string // username da conta autenticada
  userId?: string
}

export interface DeviceCodeResponse {
  deviceCode: string
  userCode: string
  verificationUri: string
  expiresIn: number
  interval: number
}

// ----------------------------------------------------------------
// Helpers de rede usando electron net (para bypass de CORS no main)
// ----------------------------------------------------------------
async function post(url: string, body: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams(body).toString()
  const response = await net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })
  return response
}

async function get(url: string, token: string): Promise<Response> {
  return net.fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  })
}

// ----------------------------------------------------------------
// Passo 1: Iniciar Device Code Flow
// ----------------------------------------------------------------
export async function startDeviceCodeFlow(): Promise<DeviceCodeResponse> {
  const res = await post(DEVICE_AUTH_URL, {
    client_id: CLIENT_ID,
    scopes: SCOPES
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao iniciar Device Code Flow: ${err}`)
  }

  const data = (await res.json()) as {
    device_code: string
    user_code: string
    verification_uri: string
    expires_in: number
    interval: number
  }

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval
  }
}

// ----------------------------------------------------------------
// Passo 2: Polling até o usuário autorizar
// ----------------------------------------------------------------
export async function pollForToken(
  deviceCode: string,
  intervalSec: number,
  onPending?: () => void
): Promise<TwitchTokens> {
  const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

  const deadline = Date.now() + 1800 * 1000 // 30 min máx

  while (Date.now() < deadline) {
    await delay(intervalSec * 1000)

    const res = await post(TOKEN_URL, {
      client_id: CLIENT_ID,
      scopes: SCOPES,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })

    const data = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      status?: number
      message?: string
    }

    if (res.ok && data.access_token) {
      // Buscar login/userId do token
      const tokens: TwitchTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || '',
        expiresAt: Date.now() + (data.expires_in || 14400) * 1000
      }

      try {
        const validateRes = await get(VALIDATE_URL, tokens.accessToken)
        if (validateRes.ok) {
          const validateData = (await validateRes.json()) as { login: string; user_id: string }
          tokens.login = validateData.login
          tokens.userId = validateData.user_id
        }
      } catch {
        // Não bloquear se a validação falhar
      }

      return tokens
    }

    // Pendente = usuário ainda não autorizou, continuar polling
    if (data.message === 'authorization_pending') {
      onPending?.()
      continue
    }

    // Qualquer outro erro quebra o fluxo
    throw new Error(data.message || 'Erro desconhecido ao trocar device code por token')
  }

  throw new Error('Tempo de autorização expirado (30 min)')
}

// ----------------------------------------------------------------
// Renovar token via refresh_token
// ----------------------------------------------------------------
export async function refreshAccessToken(
  store: AnyStore,
  currentTokens: TwitchTokens
): Promise<TwitchTokens> {
  const res = await post(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: currentTokens.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao renovar token: ${err}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const newTokens: TwitchTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in || 14400) * 1000,
    login: currentTokens.login,
    userId: currentTokens.userId
  }

  store.set('twitchTokens', newTokens)
  return newTokens
}

// ----------------------------------------------------------------
// Carregar tokens salvos e renovar se necessário
// ----------------------------------------------------------------
export async function getValidTokens(store: AnyStore): Promise<TwitchTokens | null> {
  const tokens = store.get('twitchTokens') as TwitchTokens | undefined
  if (!tokens) return null

  // Se expirar em menos de 5 minutos, renovar
  const FIVE_MIN = 5 * 60 * 1000
  if (Date.now() >= tokens.expiresAt - FIVE_MIN) {
    try {
      return await refreshAccessToken(store, tokens)
    } catch {
      // Token inválido — forçar reautenticação
      store.delete('twitchTokens')
      return null
    }
  }

  return tokens
}

// ----------------------------------------------------------------
// Revogar token (logout)
// ----------------------------------------------------------------
export async function revokeToken(store: AnyStore): Promise<void> {
  const tokens = store.get('twitchTokens') as TwitchTokens | undefined
  if (!tokens) return

  try {
    await net.fetch('https://id.twitch.tv/oauth2/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: CLIENT_ID, token: tokens.accessToken }).toString()
    })
  } catch {
    // Ignorar erros de revoke — excluir localmente de qualquer forma
  }

  store.delete('twitchTokens')
}
