import React, { useState, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'
import { PlatformName } from '../../../common/types/Platform'

interface SettingsPanelProps {
  isOpen: boolean
}

type TwitchAuthStep = 'idle' | 'starting' | 'pending' | 'authenticated'
type YoutubeAuthStep = 'idle' | 'starting' | 'authenticated'
type KickAuthStep = 'idle' | 'starting' | 'authenticated'

interface TwitchDeviceInfo {
  userCode: string
  verificationUri: string
  expiresIn: number
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({ isOpen }) => {
  const { connections, updateConnectionStatus } = useChatStore()

  // Twitch auth state
  const [twitchAuthStep, setTwitchAuthStep] = useState<TwitchAuthStep>('idle')
  const [twitchDeviceInfo, setTwitchDeviceInfo] = useState<TwitchDeviceInfo | null>(null)
  const [twitchLogin, setTwitchLogin] = useState<string>('')
  const [twitchAuthError, setTwitchAuthError] = useState<string>('')

  // YouTube auth state
  const [youtubeAuthStep, setYoutubeAuthStep] = useState<YoutubeAuthStep>('idle')
  const [youtubeLogin, setYoutubeLogin] = useState<string>('')
  const [youtubeAuthError, setYoutubeAuthError] = useState<string>('')

  // Kick auth state
  const [kickAuthStep, setKickAuthStep] = useState<KickAuthStep>('idle')
  const [kickLogin, setKickLogin] = useState<string>('')
  const [kickAuthError, setKickAuthError] = useState<string>('')

  // Campos de canal
  const [twitchChannel, setTwitchChannel] = useState(() => connections.twitch.channelInfo || '')
  const [youtubeVideoId, setYoutubeVideoId] = useState(() => connections.youtube.channelInfo || '')

  // Provider do YouTube fixado em 'chat_popup'
  const youtubeProvider = 'chat_popup'

  // Checkboxes de persistência
  const [saveTwitchChannel, setSaveTwitchChannel] = useState(false)
  const [saveYoutubeVideoId, setSaveYoutubeVideoId] = useState(false)
  const [saveKickSlug, setSaveKickSlug] = useState(false)



  // Verificar status de auth do Twitch ao montar
  useEffect(() => {
    // Carregar configurações salvas no startup
    void window.api.getSettings().then((settings) => {
      if (settings.twitchChannel) setTwitchChannel(settings.twitchChannel)
      if (settings.youtubeVideoId) setYoutubeVideoId(settings.youtubeVideoId)
      setSaveTwitchChannel(settings.saveTwitchChannel)
      setSaveYoutubeVideoId(settings.saveYoutubeVideoId)
      setSaveKickSlug(settings.saveKickSlug)
    })

    void window.api.twitchAuthStatus().then((status) => {
      if (status.authenticated && status.login) {
        setTwitchAuthStep('authenticated')
        setTwitchLogin(status.login)
      }
    })

    // Ouvir sucesso de auth (Device Code aprovado)
    const unsubSuccess = window.api.onTwitchAuthSuccess((info) => {
      setTwitchAuthStep('authenticated')
      setTwitchLogin(info.login)
      setTwitchDeviceInfo(null)
    })

    // Ouvir erros de auth
    const unsubError = window.api.onTwitchAuthError((message) => {
      setTwitchAuthStep('idle')
      setTwitchDeviceInfo(null)
      setTwitchAuthError(message || 'Erro de autorização')
    })

    void window.api.youtubeAuthStatus().then((status) => {
      if (status.authenticated && status.login) {
        setYoutubeAuthStep('authenticated')
        setYoutubeLogin(status.login)
      }
    })

    void window.api.kickAuthStatus().then((status) => {
      if (status.authenticated && status.login) {
        setKickAuthStep('authenticated')
        setKickLogin(status.login)
      } else if (status.error) {
        setKickAuthStep('idle')
        setKickAuthError(status.error)
      }
    })

    return () => {
      unsubSuccess()
      unsubError()
    }
  }, [])

  // Iniciar fluxo de autenticação Twitch
  const handleTwitchLogin = async (): Promise<void> => {
    setTwitchAuthStep('starting')
    setTwitchAuthError('')
    try {
      const result = await window.api.twitchAuthStart()
      if (result.success && result.userCode && result.verificationUri) {
        setTwitchDeviceInfo({
          userCode: result.userCode,
          verificationUri: result.verificationUri,
          expiresIn: result.expiresIn || 1800
        })
        setTwitchAuthStep('pending')
      } else {
        setTwitchAuthStep('idle')
        setTwitchAuthError(result.error || 'Falha ao iniciar Device Flow')
      }
    } catch (err: unknown) {
      setTwitchAuthStep('idle')
      const errMsg = err instanceof Error ? err.message : String(err)
      setTwitchAuthError(errMsg || 'Erro de conexão')
    }
  }

  // Abrir URL de verificaÃ§Ã£o no browser
  const handleOpenVerification = (): void => {
    if (twitchDeviceInfo) {
      window.open(twitchDeviceInfo.verificationUri, '_blank')
    }
  }

  // Copiar cÃ³digo para Ã¡rea de transferÃªncia
  const handleCopyCode = (): void => {
    if (twitchDeviceInfo) {
      void navigator.clipboard.writeText(twitchDeviceInfo.userCode)
    }
  }

  // Logout Twitch
  const handleTwitchLogout = async (): Promise<void> => {
    await window.api.twitchAuthLogout()
    setTwitchAuthStep('idle')
    setTwitchLogin('')
    setTwitchDeviceInfo(null)
    updateConnectionStatus('twitch', 'disconnected')
  }

  // Iniciar fluxo de autenticação YouTube
  const handleYoutubeLogin = async (): Promise<void> => {
    setYoutubeAuthStep('starting')
    setYoutubeAuthError('')
    try {
      const result = await window.api.youtubeAuthStart()
      if (result.success) {
        setYoutubeAuthStep('authenticated')
        setYoutubeLogin(result.login || 'Usuário YouTube')
      } else {
        setYoutubeAuthStep('idle')
        setYoutubeAuthError(result.error || 'Falha ao iniciar fluxo')
      }
    } catch (err: unknown) {
      setYoutubeAuthStep('idle')
      const errMsg = err instanceof Error ? err.message : String(err)
      setYoutubeAuthError(errMsg || 'Erro de conexão')
    }
  }

  // Logout YouTube
  const handleYoutubeLogout = async (): Promise<void> => {
    await window.api.youtubeAuthLogout()
    setYoutubeAuthStep('idle')
    setYoutubeLogin('')
    updateConnectionStatus('youtube', 'disconnected')
  }

  // Iniciar fluxo de autenticação Kick
  const handleKickLogin = async (): Promise<void> => {
    setKickAuthStep('starting')
    setKickAuthError('')
    try {
      const result = await window.api.kickAuthStart()
      if (result.success && result.login) {
        setKickAuthStep('authenticated')
        setKickLogin(result.login)
      } else {
        setKickAuthStep('idle')
        setKickAuthError(result.error || 'Falha ao iniciar fluxo')
      }
    } catch (err: unknown) {
      setKickAuthStep('idle')
      const errMsg = err instanceof Error ? err.message : String(err)
      setKickAuthError(errMsg || 'Erro de conexão')
    }
  }

  // Logout Kick
  const handleKickLogout = async (): Promise<void> => {
    await window.api.kickAuthLogout()
    setKickAuthStep('idle')
    setKickLogin('')
    updateConnectionStatus('kick', 'disconnected')
  }

  const handleConnect = async (platform: PlatformName): Promise<void> => {
    try {
      if (platform === 'twitch') {
        if (!twitchChannel.trim()) return
        updateConnectionStatus('twitch', 'connecting', twitchChannel.trim())
        await window.api.connectTwitch(twitchChannel.trim(), saveTwitchChannel)
      } else if (platform === 'youtube') {
        if (!youtubeVideoId.trim() && youtubeAuthStep !== 'authenticated') return
        const channelInfo = youtubeVideoId.trim() || 'Auto-detecção'
        updateConnectionStatus('youtube', 'connecting', channelInfo)
        await window.api.connectYouTube(youtubeVideoId.trim(), saveYoutubeVideoId, youtubeProvider)
      } else if (platform === 'kick') {
        if (kickAuthStep !== 'authenticated') return
        const channelInfo = kickLogin || 'Auto-detecção'
        updateConnectionStatus('kick', 'connecting', channelInfo)
        await window.api.connectKick('', saveKickSlug)
      }
    } catch (err: unknown) {
      console.error(`Erro ao conectar ${platform}:`, err)
      const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido'
      updateConnectionStatus(platform, 'disconnected', undefined, errorMsg)
    }
  }

  const handleDisconnect = async (platform: PlatformName): Promise<void> => {
    try {
      await window.api.disconnect(platform)
      updateConnectionStatus(platform, 'disconnected')
    } catch (err) {
      console.error(`Erro ao desconectar ${platform}:`, err)
    }
  }

  if (!isOpen) return null

  return (
    <div
      className="settings-panel"
      style={{
        width: '280px',
        backgroundColor: 'var(--bg-panel)',
        borderLeft: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        zIndex: 40,
        boxShadow: '-4px 0 16px rgba(0,0,0,0.3)',
        overflowY: 'auto'
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
        <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
          Canais &amp; Conexões
        </span>
      </div>

      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Botão de Limpeza Global */}
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button
            onClick={async () => {
              if (
                confirm(
                  'Tem certeza que deseja limpar todas as configurações de login salvas? Isso desconectará todas as plataformas.'
                )
              ) {
                await Promise.all([handleTwitchLogout(), handleYoutubeLogout(), handleKickLogout()])
              }
            }}
            style={{
              width: '80%',
              height: '36px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#EF4444',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s'
            }}
          >
            Limpar Todos os Logins Salvos
          </button>
        </div>
        {/* TWITCH CARD */}
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
            borderLeft: '3px solid var(--color-twitch)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '10px'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-twitch)' }}>
              Twitch
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {connections.twitch.status === 'connected'
                ? '🟢 Conectado'
                : connections.twitch.status === 'connecting'
                  ? '🟡 Conectando'
                  : '🔴 Desconectado'}
            </span>
          </div>

          {/* Passo 1: Não autenticado */}
          {twitchAuthStep === 'idle' && (
            <button
              onClick={() => void handleTwitchLogin()}
              style={{
                width: '100%',
                height: '32px',
                backgroundColor: 'var(--color-twitch)',
                color: '#ffffff',
                border: 'none',
                fontSize: '12px',
                fontWeight: 600,
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Login com Twitch
            </button>
          )}

          {/* Passo 2: Iniciando */}
          {twitchAuthStep === 'starting' && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '6px 0'
              }}
            >
              Iniciando autenticação...
            </div>
          )}

          {/* Passo 3: Aguardando código */}
          {twitchAuthStep === 'pending' && twitchDeviceInfo && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ fontSize: '10px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                Acesse o link abaixo e insira o código para autorizar:
              </div>
              {/* Código de verificação */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  backgroundColor: 'rgba(145, 70, 255, 0.12)',
                  border: '1px solid rgba(145, 70, 255, 0.3)',
                  borderRadius: '6px',
                  padding: '8px 10px'
                }}
              >
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '18px',
                    fontWeight: 700,
                    color: 'var(--color-twitch)',
                    letterSpacing: '0.12em',
                    flex: 1,
                    textAlign: 'center'
                  }}
                >
                  {twitchDeviceInfo.userCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  title="Copiar código"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    padding: '2px',
                    display: 'flex'
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    width="13"
                    height="13"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
              <button
                onClick={handleOpenVerification}
                style={{
                  width: '100%',
                  height: '30px',
                  backgroundColor: 'rgba(145, 70, 255, 0.15)',
                  border: '1px solid rgba(145, 70, 255, 0.35)',
                  color: 'var(--color-twitch)',
                  fontSize: '11px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Abrir twitch.tv/activate ↗
              </button>
              <div style={{ fontSize: '9px', color: 'var(--text-muted)', textAlign: 'center' }}>
                Aguardando autorização...
              </div>
            </div>
          )}

          {/* Passo 4: Autenticado — mostrar conta + campo de canal */}
          {twitchAuthStep === 'authenticated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {/* Badge de conta */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(145, 70, 255, 0.08)',
                  border: '1px solid rgba(145, 70, 255, 0.2)',
                  borderRadius: '4px',
                  padding: '5px 8px'
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  ✓ Conta: <strong style={{ color: 'var(--color-twitch)' }}>{twitchLogin}</strong>
                </span>
                <button
                  onClick={() => void handleTwitchLogout()}
                  title="Deslogar"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '9px',
                    padding: '0 2px'
                  }}
                >
                  Sair
                </button>
              </div>

              {connections.twitch.status !== 'connected' ? (
                <>
                  <input
                    type="text"
                    value={twitchChannel}
                    onChange={(e) => setTwitchChannel(e.target.value)}
                    placeholder="Canal (Ex: jebala)"
                    disabled={connections.twitch.status === 'connecting'}
                    style={{ width: '100%' }}
                  />
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '9.5px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      margin: '4px 0 8px 0',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={saveTwitchChannel}
                      onChange={(e) => setSaveTwitchChannel(e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '12px',
                        height: '12px',
                        accentColor: 'var(--color-twitch)'
                      }}
                    />
                    Salvar informações para a próxima vez
                  </label>
                  <button
                    onClick={() => void handleConnect('twitch')}
                    disabled={!twitchChannel.trim() || connections.twitch.status === 'connecting'}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'var(--color-twitch)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {connections.twitch.status === 'connecting'
                      ? 'Conectando...'
                      : 'Conectar ao canal'}
                  </button>
                </>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      marginBottom: '8px'
                    }}
                  >
                    Canal:{' '}
                    <strong style={{ color: '#ffffff' }}>{connections.twitch.channelInfo}</strong>
                  </div>
                  <button
                    onClick={() => void handleDisconnect('twitch')}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#EF4444',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              )}
            </div>
          )}

          {connections.twitch.error && (
            <div
              style={{
                fontSize: '10px',
                color: '#EF4444',
                marginTop: '6px',
                wordBreak: 'break-word'
              }}
            >
              Erro: {connections.twitch.error}
            </div>
          )}
          {twitchAuthError && (
            <div
              style={{
                fontSize: '10px',
                color: '#EF4444',
                marginTop: '6px',
                wordBreak: 'break-word'
              }}
            >
              Erro de Autenticação: {twitchAuthError}
            </div>
          )}
        </div>

        {/* YOUTUBE CARD */}
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
            borderLeft: '3px solid var(--color-youtube)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-youtube)' }}>
              YouTube
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {connections.youtube.status === 'connected'
                ? '🟢 Conectado'
                : connections.youtube.status === 'connecting'
                  ? '🟡 Conectando'
                  : '🔴 Desconectado'}
            </span>
          </div>

          {/* Passo 1: Não autenticado - Mostrar Login e opção de leitura direta */}
          {youtubeAuthStep === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => void handleYoutubeLogin()}
                style={{
                  width: '100%',
                  height: '32px',
                  backgroundColor: 'var(--color-youtube)',
                  color: '#ffffff',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Login com YouTube
              </button>

              <div
                style={{
                  fontSize: '10px',
                  color: 'var(--text-muted)',
                  textAlign: 'center',
                  margin: '4px 0'
                }}
              >
                — OU LEITURA DIRETA POR VÍDEO —
              </div>

              {/* Input de Video ID — visível apenas quando não conectado */}
              {connections.youtube.status !== 'connected' && (
                <input
                  type="text"
                  value={youtubeVideoId}
                  onChange={(e) => setYoutubeVideoId(e.target.value)}
                  placeholder="Video ID ou ID da Live"
                  disabled={connections.youtube.status === 'connecting'}
                  style={{ width: '100%' }}
                />
              )}


              {/* Ações: connect/disconnect — condicionais ao status */}
              {connections.youtube.status !== 'connected' ? (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '9.5px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      margin: '4px 0 8px 0',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={saveYoutubeVideoId}
                      onChange={(e) => setSaveYoutubeVideoId(e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '12px',
                        height: '12px',
                        accentColor: 'var(--color-youtube)'
                      }}
                    />
                    Salvar informações para a próxima vez
                  </label>
                  <button
                    onClick={() => void handleConnect('youtube')}
                    disabled={!youtubeVideoId.trim() || connections.youtube.status === 'connecting'}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      border: '1px solid var(--border-color)',
                      color: '#ffffff',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {connections.youtube.status === 'connecting' ? 'Conectando...' : 'Conectar por ID'}
                  </button>
                </>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      marginBottom: '8px'
                    }}
                  >
                    Vídeo ID:{' '}
                    <strong style={{ color: '#ffffff' }}>{connections.youtube.channelInfo}</strong>
                  </div>
                  <button
                    onClick={() => void handleDisconnect('youtube')}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#EF4444',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Passo 2: Iniciando Auth */}
          {youtubeAuthStep === 'starting' && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '6px 0'
              }}
            >
              Aguardando login no navegador...
            </div>
          )}

          {/* Passo 3: Autenticado */}
          {youtubeAuthStep === 'authenticated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(255, 0, 0, 0.05)',
                  border: '1px solid rgba(255, 0, 0, 0.15)',
                  borderRadius: '4px',
                  padding: '5px 8px'
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  ✓ Conta: <strong style={{ color: 'var(--color-youtube)' }}>{youtubeLogin}</strong>
                </span>
                <button
                  onClick={() => void handleYoutubeLogout()}
                  title="Deslogar"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '9px',
                    padding: '0 2px'
                  }}
                >
                  Sair
                </button>
              </div>

              {/* Input de Video ID — visível apenas quando não conectado */}
              {connections.youtube.status !== 'connected' && (
                <input
                  type="text"
                  value={youtubeVideoId}
                  onChange={(e) => setYoutubeVideoId(e.target.value)}
                  placeholder="Video ID (deixe vazio para auto)"
                  disabled={connections.youtube.status === 'connecting'}
                  style={{ width: '100%' }}
                />
              )}

              {/* Toggle de provider — SEMPRE VISÍVEL, desabilitado quando conectado */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 0 4px 0',
                  borderTop: '1px solid var(--border-color)',
                  marginTop: '4px'
                }}
              >
                <span style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>
                  Modo de leitura
                </span>
                <button
                  onClick={() =>
                    setYoutubeProvider((p) =>
                      p === 'official_api' ? 'chat_popup' : 'official_api'
                    )
                  }
                  disabled={connections.youtube.status !== 'disconnected'}
                  title={
                    youtubeProvider === 'official_api'
                      ? 'Alternar para Chat Popup'
                      : 'Alternar para API Oficial'
                  }
                  style={{
                    width: '102px',
                    height: '28px',
                    borderRadius: '14px',
                    border: 'none',
                    cursor:
                      connections.youtube.status !== 'disconnected' ? 'not-allowed' : 'pointer',
                    backgroundColor: youtubeProvider === 'chat_popup' ? '#22c55e' : '#ef4444',
                    position: 'relative',
                    flexShrink: 0,
                    transition: 'background-color 0.25s',
                    opacity: connections.youtube.status !== 'disconnected' ? 0.55 : 1,
                    padding: 0,
                    overflow: 'hidden'
                  }}
                >
                  {/* Texto dentro da pill */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '50%',
                      transform: 'translateY(-50%)',
                      ...(youtubeProvider === 'chat_popup' ? { left: '8px' } : { right: '8px' }),
                      fontSize: '9px',
                      fontWeight: 700,
                      color: '#fff',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      lineHeight: 1,
                      letterSpacing: '0.3px'
                    }}
                  >
                    {youtubeProvider === 'chat_popup' ? 'Chat Popup' : 'API'}
                  </span>
                  {/* Thumb circular */}
                  <span
                    style={{
                      position: 'absolute',
                      top: '2px',
                      left: youtubeProvider === 'chat_popup' ? 'calc(100% - 26px)' : '2px',
                      width: '24px',
                      height: '24px',
                      borderRadius: '50%',
                      backgroundColor: '#fff',
                      transition: 'left 0.25s',
                      pointerEvents: 'none',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.25)'
                    }}
                  />
                </button>
              </div>

              {/* Ações: connect/disconnect — condicionais ao status */}
              {connections.youtube.status !== 'connected' ? (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '9.5px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      margin: '4px 0 8px 0',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={saveYoutubeVideoId}
                      onChange={(e) => setSaveYoutubeVideoId(e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '12px',
                        height: '12px',
                        accentColor: 'var(--color-youtube)'
                      }}
                    />
                    Salvar informações para a próxima vez
                  </label>
                  <button
                    onClick={() => void handleConnect('youtube')}
                    disabled={connections.youtube.status === 'connecting'}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'var(--color-youtube)',
                      color: '#ffffff',
                      border: 'none',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {connections.youtube.status === 'connecting' ? 'Conectando...' : 'Conectar à live'}
                  </button>
                </>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      marginBottom: '8px'
                    }}
                  >
                    Live:{' '}
                    <strong style={{ color: '#ffffff' }}>{connections.youtube.channelInfo}</strong>
                  </div>
                  <button
                    onClick={() => void handleDisconnect('youtube')}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#EF4444',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              )}
            </div>
          )}
          {youtubeAuthError && (
            <div
              style={{
                fontSize: '10px',
                color: '#EF4444',
                marginTop: '6px',
                wordBreak: 'break-word'
              }}
            >
              Erro de Autenticação: {youtubeAuthError}
            </div>
          )}
        </div>

        {/* KICK CARD */}
        <div
          style={{
            border: '1px solid var(--border-color)',
            borderRadius: '6px',
            padding: '12px',
            backgroundColor: 'rgba(255, 255, 255, 0.01)',
            borderLeft: '3px solid var(--color-kick)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '8px'
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '12px', color: 'var(--color-kick)' }}>
              Kick
            </span>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
              {connections.kick.status === 'connected'
                ? '🟢 Conectado'
                : connections.kick.status === 'connecting'
                  ? '🟡 Conectando'
                  : '🔴 Desconectado'}
            </span>
          </div>

          {/* Passo 1: Não autenticado - Mostrar Login */}
          {kickAuthStep === 'idle' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <button
                onClick={() => void handleKickLogin()}
                style={{
                  width: '100%',
                  height: '32px',
                  backgroundColor: 'var(--color-kick)',
                  color: '#07080B',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 600,
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Login com Kick
              </button>
            </div>
          )}

          {/* Passo 2: Iniciando Auth */}
          {kickAuthStep === 'starting' && (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                padding: '6px 0'
              }}
            >
              Aguardando login no navegador...
            </div>
          )}

          {/* Passo 3: Autenticado */}
          {kickAuthStep === 'authenticated' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: 'rgba(83, 252, 24, 0.05)',
                  border: '1px solid rgba(83, 252, 24, 0.15)',
                  borderRadius: '4px',
                  padding: '5px 8px'
                }}
              >
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  ✓ Conta: <strong style={{ color: 'var(--color-kick)' }}>{kickLogin}</strong>
                </span>
                <button
                  onClick={() => void handleKickLogout()}
                  title="Deslogar"
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '9px',
                    padding: '0 2px'
                  }}
                >
                  Sair
                </button>
              </div>

              {connections.kick.status !== 'connected' ? (
                <>
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '9.5px',
                      color: 'var(--text-secondary)',
                      cursor: 'pointer',
                      margin: '4px 0 8px 0',
                      userSelect: 'none'
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={saveKickSlug}
                      onChange={(e) => setSaveKickSlug(e.target.checked)}
                      style={{
                        cursor: 'pointer',
                        width: '12px',
                        height: '12px',
                        accentColor: 'var(--color-kick)'
                      }}
                    />
                    Salvar informações para a próxima vez
                  </label>
                  <button
                    onClick={() => void handleConnect('kick')}
                    disabled={connections.kick.status === 'connecting'}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'var(--color-kick)',
                      color: '#07080B',
                      border: 'none',
                      fontSize: '12px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    {connections.kick.status === 'connecting'
                      ? 'Conectando...'
                      : 'Conectar ao chat'}
                  </button>
                </>
              ) : (
                <div>
                  <div
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-secondary)',
                      marginBottom: '8px'
                    }}
                  >
                    Canal:{' '}
                    <strong style={{ color: '#ffffff' }}>{connections.kick.channelInfo}</strong>
                  </div>
                  <button
                    onClick={() => void handleDisconnect('kick')}
                    style={{
                      width: '100%',
                      height: '32px',
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      color: '#EF4444',
                      fontSize: '12px',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Desconectar
                  </button>
                </div>
              )}
            </div>
          )}
          {kickAuthError && (
            <div
              style={{
                fontSize: '10px',
                color: '#EF4444',
                marginTop: '6px',
                wordBreak: 'break-word'
              }}
            >
              Erro de Autenticação: {kickAuthError}
            </div>
          )}
          {connections.kick.error && (
            <div
              style={{
                fontSize: '10px',
                color: '#EF4444',
                marginTop: '6px',
                wordBreak: 'break-word'
              }}
            >
              Erro: {connections.kick.error}
            </div>
          )}
        </div>
      </div>


    </div>
  )
}
