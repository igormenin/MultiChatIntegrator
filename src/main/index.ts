import { app, shell, BrowserWindow, ipcMain, Tray, Menu, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import Store from 'electron-store'
import { autoUpdater } from 'electron-updater'
import icon from '../../resources/icon.png?asset'
import {
  startDeviceCodeFlow,
  pollForToken,
  getValidTokens,
  revokeToken,
  type TwitchTokens
} from './twitch/TwitchAuth'
import { TwitchConnector } from './twitch/TwitchConnector'
import {
  startYouTubeAuthFlow,
  getValidTokens as getValidYouTubeTokens,
  revokeToken as revokeYouTubeToken
} from './youtube/YouTubeAuth'
import { YouTubeConnector } from './youtube/YouTubeConnector'
import {
  startKickAuthFlow,
  getValidTokens as getValidKickTokens,
  revokeToken as revokeKickToken
} from './kick/KickAuth'
import { KickConnector } from './kick/KickConnector'

// Inicializar electron-store
const store = new Store({
  defaults: {
    windowBounds: { width: 980, height: 720, x: undefined, y: undefined },
    twitchChannel: '',
    youtubeVideoId: '',
    kickSlug: '',
    saveTwitchChannel: false,
    saveYoutubeVideoId: false,
    saveKickSlug: false,
    quickMessages: []
  }
})

// Cast para Store<Record<string,unknown>> para compatibilidade com TwitchAuth/TwitchConnector

const anyStore = store as unknown as Store<Record<string, unknown>>

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isOverlayMode = false

// Conector real Twitch
const twitchConnector = new TwitchConnector(anyStore)

// Conector real YouTube
const youtubeConnector = new YouTubeConnector(anyStore)

// Conector real Kick
const kickConnector = new KickConnector(anyStore)

// Device Code flow em andamento
let twitchDeviceCodeAbort: (() => void) | null = null

function setupAutoUpdater(): void {
  if (is.dev) {
    console.log('[Auto-Updater] Ignorado em modo de desenvolvimento')
    return
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    console.log('[Auto-Updater] Verificando atualizações...')
  })

  autoUpdater.on('update-available', (info) => {
    console.log('[Auto-Updater] Atualização disponível:', info.version)
    mainWindow?.webContents.send('update:available', info.version)
  })

  autoUpdater.on('update-not-available', () => {
    console.log('[Auto-Updater] Nenhuma atualização disponível.')
  })

  autoUpdater.on('error', (err) => {
    console.error('[Auto-Updater] Erro na verificação:', err)
    mainWindow?.webContents.send('update:error', err.message || String(err))
  })

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow?.webContents.send('update:progress', progressObj.percent)
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[Auto-Updater] Atualização baixada:', info.version)
    mainWindow?.webContents.send('update:downloaded', info.version)
  })

  void autoUpdater.checkForUpdatesAndNotify()
}

async function autoReconnect(): Promise<void> {
  const saveTwitch = store.get('saveTwitchChannel') as boolean
  const saveYoutube = store.get('saveYoutubeVideoId') as boolean
  const saveKick = store.get('saveKickSlug') as boolean

  if (saveTwitch) {
    const channel = store.get('twitchChannel') as string
    if (channel) {
      console.log(`[Auto-Reconnect] Twitch: ${channel}`)
      mainWindow?.webContents.send('chat:status', 'twitch', 'connecting', channel)
      twitchConnector.onStatusChange = (status, info, error): void => {
        mainWindow?.webContents.send('chat:status', 'twitch', status, info, error)
      }
      twitchConnector.onMessage = (msg): void => {
        mainWindow?.webContents.send('chat:message', msg)
      }
      twitchConnector.onViewerCount = (viewers): void => {
        mainWindow?.webContents.send('chat:stats', 'twitch', viewers)
      }
      void twitchConnector.connect(channel)
    }
  }

  if (saveYoutube) {
    const videoId = store.get('youtubeVideoId') as string
    const isYTAuth = !!(await getValidYouTubeTokens(anyStore))
    if (videoId || isYTAuth) {
      const channelInfo = videoId || 'Auto-detecção'
      console.log(`[Auto-Reconnect] YouTube: ${channelInfo}`)
      mainWindow?.webContents.send('chat:status', 'youtube', 'connecting', channelInfo)
      youtubeConnector.onStatusChange = (status, info, error): void => {
        mainWindow?.webContents.send('chat:status', 'youtube', status, info, error)
      }
      youtubeConnector.onMessage = (msg): void => {
        mainWindow?.webContents.send('chat:message', msg)
      }
      youtubeConnector.onViewerCount = (viewers, likes): void => {
        mainWindow?.webContents.send('chat:stats', 'youtube', viewers, likes)
      }
      void youtubeConnector.connect(videoId)
    }
  }

  if (saveKick) {
    const slug = store.get('kickSlug') as string
    const isKickAuth = !!(await getValidKickTokens(anyStore))
    if (slug || isKickAuth) {
      const channelInfo = slug || 'Auto-detecção'
      console.log(`[Auto-Reconnect] Kick: ${channelInfo}`)
      mainWindow?.webContents.send('chat:status', 'kick', 'connecting', channelInfo)
      kickConnector.onStatusChange = (status, info, error): void => {
        mainWindow?.webContents.send('chat:status', 'kick', status, info, error)
      }
      kickConnector.onMessage = (msg): void => {
        mainWindow?.webContents.send('chat:message', msg)
      }
      kickConnector.onViewerCount = (viewers): void => {
        mainWindow?.webContents.send('chat:stats', 'kick', viewers)
      }
      void kickConnector.connect(slug)
    }
  }
}

function createWindow(): void {
  const bounds = store.get('windowBounds') as {
    width: number
    height: number
    x?: number
    y?: number
  }

  // Criar janela principal frameless e transparente
  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: 980,
    minHeight: 720,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    transparent: true,
    alwaysOnTop: isOverlayMode,
    icon,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()

    // Restaurar estado de overlay no frontend após carregar
    setTimeout(() => {
      if (mainWindow && isOverlayMode) {
        mainWindow.webContents.send('chat:overlay-status', true)
      }
      void autoReconnect()
      setupAutoUpdater()
    }, 1000)
  })

  // Propagar status de maximizado para o renderer
  mainWindow.on('maximize', () => {
    mainWindow?.webContents.send('window:maximized-status', true)
  })

  mainWindow.on('unmaximize', () => {
    mainWindow?.webContents.send('window:maximized-status', false)
  })

  // Salvar dimensões da janela ao fechar
  mainWindow.on('close', () => {
    if (mainWindow) {
      // Salvar apenas se não estiver maximizado para não corromper dimensões normais
      if (!mainWindow.isMaximized()) {
        store.set('windowBounds', mainWindow.getBounds())
      }
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR para renderer em dev
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// Configurar System Tray
function createTray(): void {
  // Criar ícone simples para a bandeja
  const trayIcon = nativeImage.createEmpty()
  // No Windows usamos um ícone transparente ou uma imagem pequena. Para a base, criamos um ícone básico do template
  // Se houver resources/icon.png usaremos ele, senão criamos uma imagem vazia de 16x16
  const iconPath = join(__dirname, '../../resources/icon.png')
  let finalIcon = trayIcon
  try {
    finalIcon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
  } catch {
    // Fallback se não conseguir ler
  }

  tray = new Tray(finalIcon)
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mostrar Aplicativo',
      click: (): void => {
        mainWindow?.show()
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: (): void => {
        app.quit()
      }
    }
  ])

  tray.setToolTip('MultiChat Integrator')
  tray.setContextMenu(contextMenu)

  // Duplo clique na bandeja mostra o app
  tray.on('double-click', () => {
    mainWindow?.show()
  })
}

function toggleOverlayMode(): void {
  isOverlayMode = !isOverlayMode

  if (mainWindow) {
    mainWindow.setAlwaysOnTop(isOverlayMode)
    mainWindow.webContents.send('chat:overlay-status', isOverlayMode)
  }

  // Atualizar menu da tray
  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Mostrar Aplicativo',
        click: (): void => {
          mainWindow?.show()
        }
      },
      { type: 'separator' },
      {
        label: 'Sair',
        click: (): void => {
          app.quit()
        }
      }
    ])
    tray.setContextMenu(contextMenu)
  }
}

// Registrar IPC Handlers
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.multichat.integrator')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 1. Alternar modo overlay
  ipcMain.handle('window:toggleOverlay', () => {
    toggleOverlayMode()
    return isOverlayMode
  })

  // Minimizar janela
  ipcMain.handle('window:minimize', () => {
    mainWindow?.minimize()
  })

  // Fechar janela (esconder para rodar em segundo plano)
  ipcMain.handle('window:close', () => {
    mainWindow?.hide()
  })

  // Redimensionar altura da janela (limite mínimo é o tamanho padrão de abertura: 720px)
  ipcMain.handle('window:resizeHeight', (_event, height: number) => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      mainWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: Math.max(720, height)
      })
    }
  })

  // Maximizar ou restaurar janela
  ipcMain.handle('window:maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) {
        mainWindow.unmaximize()
        return false
      } else {
        mainWindow.maximize()
        return true
      }
    }
    return false
  })

  // Redimensionar largura e altura da janela (limites mínimos: 980x720)
  ipcMain.handle('window:resize', (_event, width: number, height: number) => {
    if (mainWindow) {
      const bounds = mainWindow.getBounds()
      mainWindow.setBounds({
        x: bounds.x,
        y: bounds.y,
        width: Math.max(980, width),
        height: Math.max(720, height)
      })
    }
  })

  // ── Twitch Auth: iniciar Device Code Flow ──
  ipcMain.handle('twitch:auth:start', async () => {
    try {
      const flow = await startDeviceCodeFlow()

      let aborted = false
      twitchDeviceCodeAbort = (): void => {
        aborted = true
      }

      // Polling em background
      void (async (): Promise<void> => {
        try {
          const tokens: TwitchTokens = await pollForToken(flow.deviceCode, flow.interval, () =>
            console.log('[Twitch] Aguardando autorização do usuário...')
          )
          if (aborted) return

          anyStore.set('twitchTokens', tokens)
          twitchDeviceCodeAbort = null

          mainWindow?.webContents.send('twitch:auth:success', {
            login: tokens.login,
            userId: tokens.userId
          })
        } catch (err) {
          if (!aborted) {
            mainWindow?.webContents.send('twitch:auth:error', String(err))
          }
        }
      })()

      return {
        success: true,
        userCode: flow.userCode,
        verificationUri: flow.verificationUri,
        expiresIn: flow.expiresIn
      }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Twitch Auth: verificar se já está autenticado ──
  ipcMain.handle('twitch:auth:status', async () => {
    const tokens = await getValidTokens(anyStore)
    if (!tokens) return { authenticated: false }
    return { authenticated: true, login: tokens.login }
  })

  // ── Twitch Auth: logout ──
  ipcMain.handle('twitch:auth:logout', async () => {
    twitchDeviceCodeAbort?.()
    twitchDeviceCodeAbort = null
    twitchConnector.disconnect()
    await revokeToken(anyStore)
    mainWindow?.webContents.send('chat:status', 'twitch', 'disconnected')
    return { success: true }
  })

  // ── YouTube Auth: iniciar OAuth Loopback Flow ──
  ipcMain.handle('youtube:auth:start', async () => {
    try {
      const tokens = await startYouTubeAuthFlow(anyStore)
      return { success: true, login: tokens.channelTitle }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── YouTube Auth: verificar se já está autenticado ──
  ipcMain.handle('youtube:auth:status', async () => {
    const tokens = await getValidYouTubeTokens(anyStore)
    if (!tokens) return { authenticated: false }
    return { authenticated: true, login: tokens.channelTitle || 'Streamer YouTube' }
  })

  // ── YouTube Auth: logout ──
  ipcMain.handle('youtube:auth:logout', async () => {
    youtubeConnector.disconnect()
    await revokeYouTubeToken(anyStore)
    mainWindow?.webContents.send('chat:status', 'youtube', 'disconnected')
    return { success: true }
  })

  // ── Kick Auth: iniciar OAuth Loopback Flow ──
  ipcMain.handle('kick:auth:start', async () => {
    try {
      const tokens = await startKickAuthFlow(anyStore)
      return { success: true, login: tokens.username }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

  // ── Kick Auth: verificar se já está autenticado ──
  ipcMain.handle('kick:auth:status', async () => {
    try {
      const tokens = await getValidKickTokens(anyStore)
      if (!tokens) return { authenticated: false }
      return { authenticated: true, login: tokens.username || 'Streamer Kick' }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      return { authenticated: false, error: errorMsg }
    }
  })

  // ── Kick Auth: logout ──
  ipcMain.handle('kick:auth:logout', async () => {
    kickConnector.disconnect()
    await revokeKickToken(anyStore)
    mainWindow?.webContents.send('chat:status', 'kick', 'disconnected')
    return { success: true }
  })

  // ── 2. Conectar Twitch (real EventSub) ──
  ipcMain.handle('twitch:connect', async (_event, channel: string, save: boolean) => {
    console.log(`Conectando Twitch no canal: ${channel}, save: ${save}`)
    store.set('saveTwitchChannel', save)
    store.set('twitchChannel', save ? channel : '')

    twitchConnector.onStatusChange = (status, info, error): void => {
      mainWindow?.webContents.send('chat:status', 'twitch', status, info, error)
    }

    twitchConnector.onMessage = (msg): void => {
      mainWindow?.webContents.send('chat:message', msg)
    }

    twitchConnector.onViewerCount = (viewers): void => {
      mainWindow?.webContents.send('chat:stats', 'twitch', viewers)
    }

    void twitchConnector.connect(channel)
    return { success: true }
  })

  // 3. Conectar YouTube (Real)
  ipcMain.handle('youtube:connect', async (_event, videoId: string, save: boolean) => {
    console.log(`Conectando YouTube: ${videoId || 'detecção automática'}, save: ${save}`)
    store.set('saveYoutubeVideoId', save)
    store.set('youtubeVideoId', save ? videoId : '')

    youtubeConnector.onStatusChange = (status, info, error): void => {
      mainWindow?.webContents.send('chat:status', 'youtube', status, info, error)
    }

    youtubeConnector.onMessage = (msg): void => {
      mainWindow?.webContents.send('chat:message', msg)
    }

    youtubeConnector.onViewerCount = (viewers, likes): void => {
      mainWindow?.webContents.send('chat:stats', 'youtube', viewers, likes)
    }

    void youtubeConnector.connect(videoId)
    return { success: true }
  })

  // 4. Conectar Kick (Real WebSocket Pusher)
  ipcMain.handle('kick:connect', async (_event, slug: string, save: boolean) => {
    console.log(`Conectando Kick no canal: ${slug}, save: ${save}`)
    store.set('saveKickSlug', save)
    store.set('kickSlug', save ? slug : '')

    kickConnector.onStatusChange = (status, info, error): void => {
      mainWindow?.webContents.send('chat:status', 'kick', status, info, error)
    }

    kickConnector.onMessage = (msg): void => {
      mainWindow?.webContents.send('chat:message', msg)
    }

    kickConnector.onViewerCount = (viewers): void => {
      mainWindow?.webContents.send('chat:stats', 'kick', viewers)
    }

    void kickConnector.connect(slug)
    return { success: true }
  })

  // 4.5 Obter configurações salvas
  ipcMain.handle('settings:get', () => {
    return {
      twitchChannel: store.get('twitchChannel') as string,
      youtubeVideoId: store.get('youtubeVideoId') as string,
      kickSlug: store.get('kickSlug') as string,
      saveTwitchChannel: store.get('saveTwitchChannel') as boolean,
      saveYoutubeVideoId: store.get('saveYoutubeVideoId') as boolean,
      saveKickSlug: store.get('saveKickSlug') as boolean
    }
  })

  // 4.6 Mensagens Rápidas — obter
  ipcMain.handle('quickMessages:get', () => {
    return store.get('quickMessages') as { id: string; label: string; text: string }[]
  })

  // 4.7 Mensagens Rápidas — salvar
  ipcMain.handle(
    'quickMessages:save',
    (_event, messages: { id: string; label: string; text: string }[]) => {
      store.set('quickMessages', messages)
      return { success: true }
    }
  )

  // 5. Desconectar plataformas
  ipcMain.handle('chat:disconnect', async (_event, platform: string) => {
    console.log(`Desconectando plataforma: ${platform}`)

    if (platform === 'twitch') {
      twitchConnector.disconnect()
    } else if (platform === 'youtube') {
      youtubeConnector.disconnect()
    } else if (platform === 'kick') {
      kickConnector.disconnect()
    }

    if (mainWindow) {
      mainWindow.webContents.send('chat:status', platform, 'disconnected')
    }

    return { success: true }
  })

  // 6. Enviar mensagem (Twitch e YouTube reais; Kick simulado)
  ipcMain.handle('chat:send', async (_event, payload: { platforms: string[]; text: string }) => {
    const { platforms, text } = payload
    console.log(`Envio: "${text}" → ${platforms.join(', ')}`)

    const results = await Promise.all(
      platforms.map(async (platform) => {
        let success = false

        if (platform === 'twitch') {
          success = await twitchConnector.sendMessage(text)

          // Eco local da mensagem enviada (Twitch não rebate via EventSub quando bot == streamer)
          if (success && mainWindow) {
            const tokens = await getValidTokens(anyStore)
            const selfName = tokens?.login || (store.get('twitchChannel') as string) || 'você'
            mainWindow.webContents.send('chat:message', {
              id: `twitch-self-${Date.now()}`,
              platform: 'twitch',
              username: selfName,
              displayName: selfName,
              text,
              timestamp: Date.now(),
              color: '#A370F7',
              isModerator: true,
              isSubscriber: false,
              messageId: `msg-self-${Math.random()}`
            })
          }
        } else if (platform === 'youtube') {
          success = await youtubeConnector.sendMessage(text)

          // Eco local da mensagem enviada
          if (success && mainWindow) {
            const ytTokens = await getValidYouTubeTokens(anyStore)
            const selfName = ytTokens?.channelTitle || 'você'
            mainWindow.webContents.send('chat:message', {
              id: `youtube-self-${Date.now()}`,
              platform: 'youtube',
              username: selfName.toLowerCase().replace(/\s+/g, ''),
              displayName: selfName,
              text,
              timestamp: Date.now(),
              color: '#FF5555',
              isModerator: true,
              isSubscriber: false,
              messageId: `msg-self-${Math.random()}`
            })
          }
        } else {
          success = await kickConnector.sendMessage(text)

          // Eco local da mensagem enviada
          if (success && mainWindow) {
            const kickTokens = await getValidKickTokens(anyStore)
            const selfName = kickTokens?.username || (store.get('kickSlug') as string) || 'você'
            mainWindow.webContents.send('chat:message', {
              id: `kick-self-${Date.now()}`,
              platform: 'kick',
              username: selfName.toLowerCase().replace(/\s+/g, ''),
              displayName: selfName,
              text,
              timestamp: Date.now(),
              color: '#53FC18',
              isModerator: true,
              isSubscriber: false,
              messageId: `msg-self-${Math.random()}`
            })
          }
        }

        return { success, platform }
      })
    )

    return results
  })

  // Obter versão do aplicativo
  ipcMain.handle('app:version', () => {
    return app.getVersion()
  })

  // Forçar verificação de atualizações
  ipcMain.handle('update:check', async () => {
    if (is.dev) {
      return {
        success: false,
        error: 'Não é possível checar atualizações em modo de desenvolvimento'
      }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // Reiniciar e instalar atualização
  ipcMain.handle('update:install', () => {
    autoUpdater.quitAndInstall()
  })

  createWindow()
  createTray()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
