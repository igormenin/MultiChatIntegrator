import { net, shell } from 'electron'
import Store from 'electron-store'
import * as http from 'http'
import { AddressInfo } from 'net'

type AnyStore = Store<Record<string, unknown>>

const CLIENT_ID = import.meta.env.MAIN_VITE_YOUTUBE_CLIENT_ID || ''
const CLIENT_SECRET = import.meta.env.MAIN_VITE_YOUTUBE_CLIENT_SECRET || ''

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke'

const SCOPES = [
  'https://www.googleapis.com/auth/youtube.readonly',
  'https://www.googleapis.com/auth/youtube.force-ssl',
  'https://www.googleapis.com/auth/userinfo.profile'
].join(' ')

const PORT = 21338
const REDIRECT_URI = `http://127.0.0.1:${PORT}`

export interface YouTubeTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // ms epoch
  channelTitle?: string // nome da conta autenticada
  channelId?: string
}

// ----------------------------------------------------------------
// Helpers de rede usando electron net
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

// ----------------------------------------------------------------
// Fluxo OAuth: Iniciar Servidor Local e Abrir Navegador
// ----------------------------------------------------------------
export async function startYouTubeAuthFlow(store: AnyStore): Promise<YouTubeTokens> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'Chaves MAIN_VITE_YOUTUBE_CLIENT_ID ou MAIN_VITE_YOUTUBE_CLIENT_SECRET ausentes no .env'
    )
  }

  return new Promise((resolve, reject) => {
    let server: http.Server | null = null
    let timeoutTimer: NodeJS.Timeout | null = null

    // Função de limpeza para fechar o servidor e limpar timers
    const cleanup = (): void => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer)
        timeoutTimer = null
      }
      if (server) {
        server.close()
        server = null
      }
    }

    // Criar o servidor local para receber a resposta do Google
    server = http.createServer(async (req, res) => {
      const reqUrl = req.url || ''
      if (!reqUrl.includes('?')) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>MultiChat Integrator</h1><p>Aguardando autorização...</p>')
        return
      }

      const queryParams = new URLSearchParams(reqUrl.substring(reqUrl.indexOf('?')))
      const code = queryParams.get('code')
      const error = queryParams.get('error')

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
          <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
            <h1 style="color: #EF4444;">Autenticação Cancelada</h1>
            <p>Ocorreu um erro ou você cancelou o login: <strong>${error}</strong></p>
            <p>Você pode fechar esta página e tentar novamente no aplicativo.</p>
          </div>
        `)
        cleanup()
        reject(new Error(`Login cancelado pelo usuário: ${error}`))
        return
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>Erro</h1><p>Código de autorização ausente.</p>')
        return
      }

      // Responder com sucesso na página web
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px;">
          <h1 style="color: #10B981;">Autenticação Concluída!</h1>
          <p>Você autorizou o MultiChat Integrator com sucesso no YouTube.</p>
          <p><strong>Já pode fechar esta aba/janela do navegador</strong> e voltar para o aplicativo.</p>
        </div>
      `)

      cleanup()

      try {
        // Trocar código pelo access/refresh tokens
        const tokenRes = await post(TOKEN_URL, {
          code,
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })

        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          throw new Error(`Falha ao trocar código por tokens: ${errText}`)
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string
          refresh_token?: string
          expires_in: number
        }

        const tokens: YouTubeTokens = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || '',
          expiresAt: Date.now() + tokenData.expires_in * 1000
        }

        // Buscar detalhes do canal do streamer
        try {
          const API_KEY = import.meta.env.MAIN_VITE_YOUTUBE_API_KEY || ''
          const channelRes = await net.fetch(
            `https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true&key=${API_KEY}`,
            {
              headers: { Authorization: `Bearer ${tokens.accessToken}` }
            }
          )
          if (channelRes.ok) {
            const channelData = (await channelRes.json()) as {
              items?: Array<{ id: string; snippet: { title: string } }>
            }
            if (channelData.items && channelData.items.length > 0) {
              tokens.channelId = channelData.items[0].id
              tokens.channelTitle = channelData.items[0].snippet.title
            } else {
              console.warn(
                '[YouTube Auth] Canal não encontrado (items vazio). O usuário possui um canal criado?'
              )
            }
          } else {
            const errText = await channelRes.text()
            console.error('[YouTube Auth] Falha na API de channels:', channelRes.status, errText)
          }
        } catch (err) {
          console.warn('[YouTube Auth] Erro de rede ao obter detalhes do canal:', err)
        }

        // Se não conseguiu pegar o nome do canal (usuário sem canal), tenta pegar do perfil Google
        if (!tokens.channelTitle) {
          try {
            const profileRes = await net.fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
              headers: { Authorization: `Bearer ${tokens.accessToken}` }
            })
            if (profileRes.ok) {
              const profileData = (await profileRes.json()) as { name?: string }
              if (profileData.name) {
                tokens.channelTitle = profileData.name
              }
            }
          } catch (profileErr) {
            console.warn('[YouTube Auth] Erro ao buscar userinfo:', profileErr)
          }
        }

        if (!tokens.channelTitle) {
          tokens.channelTitle = 'Streamer YouTube'
        }

        // Salvar tokens
        store.set('youtubeTokens', tokens)
        resolve(tokens)
      } catch (err) {
        reject(err)
      }
    })

    // Iniciar escuta do servidor na porta especificada
    server.listen(PORT, '127.0.0.1', () => {
      const addr = server?.address() as AddressInfo
      console.log(`[YouTube Auth] Servidor de callback rodando em http://127.0.0.1:${addr.port}`)

      // Montar URL de autorização do Google
      const authParams = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        access_type: 'offline', // Importante para obter o refresh_token
        prompt: 'consent' // Garante que retorne o refresh_token em logins subsequentes
      })

      const fullAuthUrl = `${AUTH_URL}?${authParams.toString()}`

      // Abrir navegador do usuário
      void shell.openExternal(fullAuthUrl)
    })

    // Definir timeout de 5 minutos
    timeoutTimer = setTimeout(
      () => {
        cleanup()
        reject(new Error('Tempo limite de login expirado (5 minutos)'))
      },
      5 * 60 * 1000
    )
  })
}

// ----------------------------------------------------------------
// Renovar token via refresh_token
// ----------------------------------------------------------------
export async function refreshAccessToken(
  store: AnyStore,
  currentTokens: YouTubeTokens
): Promise<YouTubeTokens> {
  if (!currentTokens.refreshToken) {
    throw new Error('Refresh token ausente. Reautenticação necessária.')
  }

  const res = await post(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: currentTokens.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Falha ao renovar token do YouTube: ${err}`)
  }

  const data = (await res.json()) as {
    access_token: string
    expires_in: number
    refresh_token?: string
  }

  const newTokens: YouTubeTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || currentTokens.refreshToken, // Preservar ou usar novo se fornecido
    expiresAt: Date.now() + data.expires_in * 1000,
    channelId: currentTokens.channelId,
    channelTitle: currentTokens.channelTitle
  }

  store.set('youtubeTokens', newTokens)
  return newTokens
}

// ----------------------------------------------------------------
// Obter tokens válidos, renovando automaticamente se expirar em < 5 min
// ----------------------------------------------------------------
export async function getValidTokens(store: AnyStore): Promise<YouTubeTokens | null> {
  const tokens = store.get('youtubeTokens') as YouTubeTokens | undefined
  if (!tokens) return null

  // Se expirar em menos de 5 minutos, renovar
  const FIVE_MIN = 5 * 60 * 1000
  if (Date.now() >= tokens.expiresAt - FIVE_MIN) {
    try {
      return await refreshAccessToken(store, tokens)
    } catch (err) {
      console.error('[YouTube Auth] Erro ao renovar refresh token:', err)
      // Token inválido/revogado — forçar reautenticação
      store.delete('youtubeTokens')
      return null
    }
  }

  return tokens
}

// ----------------------------------------------------------------
// Revogar token (logout)
// ----------------------------------------------------------------
export async function revokeToken(store: AnyStore): Promise<void> {
  const tokens = store.get('youtubeTokens') as YouTubeTokens | undefined
  if (!tokens) return

  try {
    await post(REVOKE_URL, {
      token: tokens.accessToken
    })
  } catch (err) {
    console.warn('[YouTube Auth] Erro ao tentar revogar token no Google:', err)
  }

  store.delete('youtubeTokens')
}
