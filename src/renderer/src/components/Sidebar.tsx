import React, { useState, useEffect } from 'react'
import { useChatStore, FontSize } from '../store/chatStore'
import { PlatformName } from '../../../common/types/Platform'
import logoIcon from '../assets/icon.png'

interface SidebarProps {
  isSettingsOpen: boolean
  onToggleSettings: () => void
  isMutedUsersOpen: boolean
  onToggleMutedUsers: () => void
}

export const Sidebar: React.FC<SidebarProps> = ({
  isSettingsOpen,
  onToggleSettings,
  isMutedUsersOpen,
  onToggleMutedUsers
}) => {
  const { connections, activeFilters, toggleFilter, updateConnectionStatus, fontSize, setFontSize } = useChatStore()

  const [isFontSizeOpen, setIsFontSizeOpen] = useState(false)

  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false)
  const [versionText, setVersionText] = useState('v1.0.0')

  useEffect(() => {
    window.api
      .getAppVersion()
      .then((v) => {
        setVersionText(`v${v}`)
      })
      .catch(() => {
        setVersionText('v1.0.0')
      })
  }, [])

  const handleVersionClick = async (): Promise<void> => {
    if (isCheckingUpdate) return
    setIsCheckingUpdate(true)
    const originalText = versionText
    setVersionText('Buscando...')

    try {
      const res = await window.api.checkForUpdates()
      if (!res.success) {
        setVersionText('Erro!')
        setTimeout(() => setVersionText(originalText), 2000)
        return
      }

      setTimeout(() => {
        setVersionText('Atualizado!')
        setTimeout(() => {
          setVersionText(originalText)
        }, 2000)
      }, 1000)
    } catch (err) {
      console.error('[Sidebar] Erro ao buscar atualizações:', err)
      setVersionText('Erro!')
      setTimeout(() => setVersionText(originalText), 2000)
    } finally {
      setIsCheckingUpdate(false)
    }
  }

  const hasActiveConnections = Object.values(connections).some(
    (c) => c.status === 'connected' || c.status === 'connecting'
  )

  const handleDisconnectAll = async (): Promise<void> => {
    const connectedPlatforms = Object.keys(connections).filter(
      (platform) =>
        connections[platform].status === 'connected' ||
        connections[platform].status === 'connecting'
    ) as PlatformName[]

    for (const platform of connectedPlatforms) {
      try {
        await window.api.disconnect(platform)
        updateConnectionStatus(platform, 'disconnected')
      } catch (err) {
        console.error(`Erro ao desconectar ${platform}:`, err)
      }
    }
  }

  const platforms: { name: PlatformName; label: string; icon: React.ReactNode; color: string }[] = [
    {
      name: 'twitch',
      label: 'Twitch',
      color: 'var(--color-twitch)',
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z" />
        </svg>
      )
    },
    {
      name: 'youtube',
      label: 'YouTube',
      color: 'var(--color-youtube)',
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          <path d="M23.498 6.163a3.003 3.003 0 0 0-2.11-2.11C19.517 3.545 12 3.545 12 3.545s-7.516 0-9.387.508a3.003 3.003 0 0 0-2.11 2.11C0 8.033 0 12 0 12s0 3.967.502 5.837a3.003 3.003 0 0 0 2.11 2.11c1.871.508 9.387.508 9.387.508s7.517 0 9.387-.508a3.003 3.003 0 0 0 2.11-2.11c.503-1.87.503-5.837.503-5.837s0-3.967-.503-5.837zm-14.17 9.426V8.41L15.6 12l-6.272 3.59z" />
        </svg>
      )
    },
    {
      name: 'kick',
      label: 'Kick',
      color: 'var(--color-kick)',
      icon: (
        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
          {/* Custom Kick Logo SVG */}
          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7.5V7H9v3h2.5V7H13v3.5l2-3.5h1.75l-2.5 4.25 2.75 5.75h-1.8L13 13.5v3.5h-1.5V13L9 17z" />
        </svg>
      )
    }
  ]

  return (
    <aside
      className="sidebar"
      style={{
        width: '60px',
        backgroundColor: 'var(--bg-sidebar)',
        borderRight: '1px solid var(--border-color)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 0',
        zIndex: 50
      }}
    >
      {/* Top Logo */}
      <div
        className="app-logo"
        style={{
          marginBottom: '24px',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center'
        }}
        title="MultiChat Integrator"
      >
        <img
          src={logoIcon}
          alt="MultiChat Logo"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '8px',
            boxShadow: '0 0 12px rgba(255, 255, 255, 0.12)',
            transition: 'transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'scale(1.1) rotate(5deg)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'scale(1) rotate(0deg)'
          }}
        />
      </div>

      {/* Center Toggles */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          flex: 1,
          justifyContent: 'center'
        }}
      >
        {platforms.map((platform) => {
          const isFilterActive = activeFilters[platform.name]
          const isConnected = connections[platform.name].status === 'connected'
          const isConnecting = connections[platform.name].status === 'connecting'

          return (
            <button
              key={platform.name}
              onClick={() => toggleFilter(platform.name)}
              className="tooltip-right"
              data-tooltip={`${platform.label}: ${isFilterActive ? 'Visível' : 'Oculto'}`}
              style={{
                width: '42px',
                height: '42px',
                backgroundColor: isFilterActive ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
                border: '1px solid',
                borderColor: isFilterActive ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
                borderRadius: '8px',
                color: isFilterActive ? platform.color : 'var(--text-muted)',
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s ease'
              }}
            >
              {platform.icon}

              {/* Connection Status Dot */}
              {isConnected && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    width: '7px',
                    height: '7px',
                    backgroundColor: '#10B981',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px #10B981',
                    border: '1px solid var(--bg-sidebar)'
                  }}
                />
              )}
              {isConnecting && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: '4px',
                    right: '4px',
                    width: '7px',
                    height: '7px',
                    backgroundColor: '#F59E0B',
                    borderRadius: '50%',
                    boxShadow: '0 0 8px #F59E0B',
                    border: '1px solid var(--bg-sidebar)',
                    animation: 'pulse 1.5s infinite ease-in-out'
                  }}
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Bottom Buttons Container */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center' }}>
        {/* Disconnect All Button */}
        <button
          onClick={handleDisconnectAll}
          disabled={!hasActiveConnections}
          className="tooltip-right disconnect-all-btn"
          data-tooltip={
            hasActiveConnections ? 'Desconectar de todas as contas' : 'Nenhuma conta conectada'
          }
          style={{
            width: '42px',
            height: '42px',
            backgroundColor: 'transparent',
            border: '1px solid',
            borderColor: 'transparent',
            borderRadius: '8px',
            color: hasActiveConnections ? 'var(--text-secondary)' : 'rgba(255, 255, 255, 0.15)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: hasActiveConnections ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s ease'
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </button>

        {/* Font Size Button */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setIsFontSizeOpen(!isFontSizeOpen)}
            className="tooltip-right"
            data-tooltip="Tamanho da Fonte"
            style={{
              width: '42px',
              height: '42px',
              backgroundColor: isFontSizeOpen ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
              border: '1px solid',
              borderColor: isFontSizeOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
              borderRadius: '8px',
              color: isFontSizeOpen ? '#fff' : 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width="20"
              height="20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
          </button>

          {/* Font Size Popover */}
          {isFontSizeOpen && (
            <div
              style={{
                position: 'absolute',
                left: 'calc(100% + 12px)',
                top: '50%',
                transform: 'translateY(-50%)',
                backgroundColor: 'var(--bg-sidebar)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                borderRadius: '8px',
                padding: '8px',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                zIndex: 100,
                minWidth: '120px'
              }}
            >
              {(['small', 'medium', 'large'] as FontSize[]).map((size) => {
                const labels = { small: 'Pequeno', medium: 'Médio', large: 'Grande' }
                return (
                  <button
                    key={size}
                    onClick={() => {
                      setFontSize(size)
                      setIsFontSizeOpen(false)
                    }}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: fontSize === size ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                      color: fontSize === size ? '#fff' : 'var(--text-secondary)',
                      border: 'none',
                      borderRadius: '4px',
                      textAlign: 'left',
                      cursor: 'pointer',
                      fontSize: '13px',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseEnter={(e) => {
                      if (fontSize !== size) e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
                    }}
                    onMouseLeave={(e) => {
                      if (fontSize !== size) e.currentTarget.style.backgroundColor = 'transparent'
                    }}
                  >
                    {labels[size]}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* Bottom User Filter (Mute) Button */}
        <button
          onClick={onToggleMutedUsers}
          className="tooltip-right"
          data-tooltip="Usuários Ocultados"
          style={{
            width: '42px',
            height: '42px',
            backgroundColor: isMutedUsersOpen ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
            border: '1px solid',
            borderColor: isMutedUsersOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            borderRadius: '8px',
            color: isMutedUsersOpen ? 'var(--color-kick)' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="18" y1="8" x2="23" y2="13" />
            <line x1="23" y1="8" x2="18" y2="13" />
          </svg>
        </button>

        {/* Bottom Settings Button */}
        <button
          onClick={onToggleSettings}
          className="tooltip-right"
          data-tooltip="Configurações"
          style={{
            width: '42px',
            height: '42px',
            backgroundColor: isSettingsOpen ? 'rgba(255, 255, 255, 0.04)' : 'transparent',
            border: '1px solid',
            borderColor: isSettingsOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            borderRadius: '8px',
            color: isSettingsOpen ? '#ffffff' : 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <svg
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              transform: isSettingsOpen ? 'rotate(45deg)' : 'none',
              transition: 'transform 0.3s ease'
            }}
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>

        {/* Versão do App com Busca de Atualizações */}
        <span
          onClick={handleVersionClick}
          title="Clique para buscar atualizações"
          style={{
            fontSize: '9px',
            color: 'var(--text-muted)',
            cursor: isCheckingUpdate ? 'not-allowed' : 'pointer',
            marginTop: '4px',
            padding: '2px 6px',
            borderRadius: '4px',
            backgroundColor: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.05)',
            transition: 'all 0.2s ease',
            userSelect: 'none',
            fontWeight: 600,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap'
          }}
          onMouseEnter={(e) => {
            if (!isCheckingUpdate) {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.15)'
              e.currentTarget.style.color = 'var(--text-secondary)'
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.05)'
            }
          }}
          onMouseLeave={(e) => {
            if (!isCheckingUpdate) {
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)'
              e.currentTarget.style.color = 'var(--text-muted)'
              e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.02)'
            }
          }}
        >
          {versionText}
        </span>
      </div>

      {/* Inline styles for pulse animations */}
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; transform: scale(0.9); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </aside>
  )
}
