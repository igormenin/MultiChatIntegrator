import { net, shell } from 'electron'
import Store from 'electron-store'
import * as http from 'http'
import * as crypto from 'crypto'
import { AddressInfo } from 'net'

type AnyStore = Store<Record<string, unknown>>

const CLIENT_ID = import.meta.env.MAIN_VITE_KICK_CLIENT_ID || ''
const CLIENT_SECRET = import.meta.env.MAIN_VITE_KICK_CLIENT_SECRET || ''

const AUTH_URL = 'https://id.kick.com/oauth/authorize'
const TOKEN_URL = 'https://id.kick.com/oauth/token'

const SCOPES = ['user:read', 'channel:read', 'chat:write'].join(' ')
const PORT = 21337
const REDIRECT_URI = `http://127.0.0.1:${PORT}`

export interface KickTokens {
  accessToken: string
  refreshToken: string
  expiresAt: number // ms epoch
  username?: string // nome da conta autenticada
  channelId?: string // ID do canal da Kick
}

// ----------------------------------------------------------------
// Helpers de PKCE
// ----------------------------------------------------------------
function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url')
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url')
}

// ----------------------------------------------------------------
// Helper de requisição POST
// ----------------------------------------------------------------
async function post(url: string, body: Record<string, string>): Promise<Response> {
  const params = new URLSearchParams(body).toString()
  return net.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  })
}

// ----------------------------------------------------------------
// Iniciar Fluxo de Autenticação OAuth 2.1 + PKCE com Servidor Local
// ----------------------------------------------------------------
export async function startKickAuthFlow(store: AnyStore): Promise<KickTokens> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error(
      'Chaves MAIN_VITE_KICK_CLIENT_ID ou MAIN_VITE_KICK_CLIENT_SECRET ausentes no .env'
    )
  }

  return new Promise((resolve, reject) => {
    let server: http.Server | null = null
    let timeoutTimer: NodeJS.Timeout | null = null

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
      const state = queryParams.get('state')

      const savedState = store.get('kickAuthState') as string | undefined
      store.delete('kickAuthState')

      if (state !== savedState) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
          <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #1a1d24; color: #fff; height: 100vh; padding: 20px; box-sizing: border-box;">
            <h1 style="color: #EF4444;">Falha na Autenticação</h1>
            <p>Parâmetro state inválido ou expirado. Possível tentativa de CSRF.</p>
            <p>Por favor, tente novamente a partir do aplicativo.</p>
          </div>
        `)
        cleanup()
        reject(new Error('Parâmetro state do OAuth inválido.'))
        return
      }

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end(`
          <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #1a1d24; color: #fff; height: 100vh; padding: 20px; box-sizing: border-box;">
            <h1 style="color: #EF4444;">Autenticação Cancelada</h1>
            <p>Ocorreu um erro ou você cancelou o login na Kick: <strong>${error}</strong></p>
            <p>Você pode fechar esta página e tentar novamente no aplicativo.</p>
          </div>
        `)
        cleanup()
        reject(new Error(`Login na Kick cancelado pelo usuário: ${error}`))
        return
      }

      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' })
        res.end('<h1>Erro</h1><p>Código de autorização ausente.</p>')
        return
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(`
        <div style="font-family: sans-serif; text-align: center; margin-top: 50px; background-color: #1a1d24; color: #fff; height: 100vh; padding: 20px; box-sizing: border-box;">
          <h1 style="color: #53FC18;">Autenticação Concluída!</h1>
          <p>Você autorizou o MultiChat Integrator com sucesso na Kick.</p>
          <p><strong>Já pode fechar esta aba/janela do navegador</strong> e voltar para o aplicativo.</p>
        </div>
      `)

      cleanup()

      try {
        const savedVerifier = store.get('kickCodeVerifier') as string | undefined
        if (!savedVerifier) {
          throw new Error('Code Verifier do PKCE ausente no armazenamento local.')
        }
        store.delete('kickCodeVerifier')

        // Trocar código pelo access/refresh token
        const tokenRes = await post(TOKEN_URL, {
          client_id: CLIENT_ID,
          client_secret: CLIENT_SECRET,
          code,
          code_verifier: savedVerifier,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code'
        })

        if (!tokenRes.ok) {
          const errText = await tokenRes.text()
          throw new Error(`Falha ao obter tokens da Kick: ${errText}`)
        }

        const tokenData = (await tokenRes.json()) as {
          access_token: string
          refresh_token: string
          expires_in: number
        }

        const tokens: KickTokens = {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          expiresAt: Date.now() + tokenData.expires_in * 1000
        }

        // Buscar detalhes do usuário autenticado
        try {
          const userRes = await net.fetch('https://api.kick.com/public/v1/users', {
            headers: { Authorization: `Bearer ${tokens.accessToken}` }
          })
          if (userRes.ok) {
            const userData = (await userRes.json()) as {
              data?: {
                id?: string | number
                username?: string
                display_name?: string
              }
              id?: string | number
              username?: string
              name?: string
              display_name?: string
            }
            // Mapear flexivelmente se for envelopado em "data" ou direto no root
            const userObj = (userData.data || userData) as {
              id?: string | number
              username?: string
              name?: string
              display_name?: string
            }
            tokens.channelId = userObj.id ? String(userObj.id) : undefined
            tokens.username = userObj.username || userObj.name || userObj.display_name
          }
        } catch (err) {
          console.warn('[Kick Auth] Erro ao obter detalhes do usuário:', err)
        }

        store.set('kickTokens', tokens)
        resolve(tokens)
      } catch (err) {
        reject(err)
      }
    })

    // Tratamento explícito para erro de porta ocupada (Opção A)
    server.on('error', (err: Error & { code?: string }) => {
      cleanup()
      if (err.code === 'EADDRINUSE') {
        reject(
          new Error(
            `A porta local ${PORT} está ocupada por outra aplicação. Por favor, feche o outro aplicativo antes de tentar o login.`
          )
        )
      } else {
        reject(err)
      }
    })

    server.listen(PORT, '127.0.0.1', () => {
      const addr = server?.address() as AddressInfo
      console.log(`[Kick Auth] Servidor de callback rodando em http://127.0.0.1:${addr.port}`)

      // PKCE setup
      const verifier = generateCodeVerifier()
      const challenge = generateCodeChallenge(verifier)
      const state = crypto.randomBytes(16).toString('hex')

      // Salvar verifier e state no store para usar na resposta
      store.set('kickCodeVerifier', verifier)
      store.set('kickAuthState', state)

      const authParams = new URLSearchParams({
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
        response_type: 'code',
        scope: SCOPES,
        code_challenge: challenge,
        code_challenge_method: 'S256',
        state: state
      })

      const fullAuthUrl = `${AUTH_URL}?${authParams.toString()}`
      void shell.openExternal(fullAuthUrl)
    })

    // Timeout de 5 minutos
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
  currentTokens: KickTokens
): Promise<KickTokens> {
  if (!currentTokens.refreshToken) {
    throw new Error('Refresh token da Kick ausente. Reautenticação necessária.')
  }

  const res = await post(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: currentTokens.refreshToken,
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET
  })

  if (!res.ok) {
    const err = await res.text()
    // Tratamento explícito de falha na renovação (Opção A)
    store.delete('kickTokens')
    throw new Error(`Falha ao renovar token da Kick (Sessão Expirada): ${err}`)
  }

  const data = (await res.json()) as {
    access_token: string
    refresh_token: string
    expires_in: number
  }

  const newTokens: KickTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    username: currentTokens.username,
    channelId: currentTokens.channelId
  }

  store.set('kickTokens', newTokens)
  return newTokens
}

// ----------------------------------------------------------------
// Obter tokens válidos, renovando automaticamente se expirar em < 5 min
// ----------------------------------------------------------------
export async function getValidTokens(store: AnyStore): Promise<KickTokens | null> {
  const tokens = store.get('kickTokens') as KickTokens | undefined
  if (!tokens) return null

  const FIVE_MIN = 5 * 60 * 1000
  if (Date.now() >= tokens.expiresAt - FIVE_MIN) {
    try {
      return await refreshAccessToken(store, tokens)
    } catch (err) {
      console.error('[Kick Auth] Erro ao renovar refresh token:', err)
      // Limpeza do token e forçar logout
      store.delete('kickTokens')
      throw err
    }
  }

  return tokens
}

// ----------------------------------------------------------------
// Revogar token (logout)
// ----------------------------------------------------------------
export async function revokeToken(store: AnyStore): Promise<void> {
  const tokens = store.get('kickTokens') as KickTokens | undefined
  if (!tokens) return

  try {
    // Kick endpoint de revogação de tokens
    await post('https://id.kick.com/oauth/revoke', {
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      token: tokens.accessToken
    })
  } catch (err) {
    console.warn('[Kick Auth] Erro ao tentar revogar token na Kick:', err)
  }

  store.delete('kickTokens')
}
