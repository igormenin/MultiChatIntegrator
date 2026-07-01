import React, { useState, useEffect } from 'react'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ChatFeed } from './components/ChatFeed'
import { ChatComposer } from './components/ChatComposer'
import { SettingsPanel } from './components/SettingsPanel'
import { MutedUsersModal } from './components/MutedUsersModal'
import { useChatStore } from './store/chatStore'

function App(): React.JSX.Element {
  const { addMessage, updateConnectionStatus, updateStats, isOverlayMode, setOverlayMode } =
    useChatStore()
  const [isSettingsOpen, setIsSettingsOpen] = useState(true)
  const [isMutedUsersOpen, setIsMutedUsersOpen] = useState(false)

  // Estados para o Auto-Updater
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'downloading' | 'downloaded' | 'error'>(
    'idle'
  )
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [newVersion, setNewVersion] = useState('')
  const [updateError, setUpdateError] = useState('')
  const [showUpdateBanner, setShowUpdateBanner] = useState(false)

  // Registrar listeners IPC ao montar o app
  useEffect(() => {
    // 0. Carregar usuários ocultados inicialmente
    void window.api.getMutedUsers().then((users) => {
      useChatStore.getState().setMutedUsers(users || [])
    })

    // 1. Ouvir mensagens de chat vindo do main process
    const cleanupChatMessage = window.api.onChatMessage((message) => {
      addMessage(message)
    })

    // 2. Ouvir mudanças de status de conexão das plataformas
    const cleanupConnectionStatus = window.api.onConnectionStatus(
      (platform, status, channelInfo, error) => {
        updateConnectionStatus(platform, status, channelInfo, error)
      }
    )

    // 3. Ouvir contagem de viewers e likes
    const cleanupViewerCount = window.api.onViewerCount((platform, viewers, likeCount) => {
      updateStats(platform, { viewers, likeCount })
    })

    // 4. Ouvir mudança no status do overlay vinda do main process
    const cleanupOverlayStatus = window.api.onOverlayStatus((active) => {
      setOverlayMode(active)
    })

    // 5. Ouvir eventos de atualização automática do main process
    const cleanupUpdateAvailable = window.api.onUpdateAvailable((version) => {
      setNewVersion(version)
      setUpdateStatus('downloading')
      setShowUpdateBanner(true)
    })

    const cleanupUpdateProgress = window.api.onUpdateProgress((percent) => {
      setUpdateStatus('downloading')
      setDownloadProgress(Math.round(percent))
      setShowUpdateBanner(true)
    })

    const cleanupUpdateDownloaded = window.api.onUpdateDownloaded((version) => {
      setNewVersion(version)
      setUpdateStatus('downloaded')
      setShowUpdateBanner(true)
    })

    const cleanupUpdateError = window.api.onUpdateError((err) => {
      setUpdateStatus('error')
      setUpdateError(err)
      setShowUpdateBanner(true)
      // Ocultar automaticamente em caso de erro após 8 segundos
      const timer = setTimeout(() => {
        setShowUpdateBanner(false)
      }, 8000)
      return () => clearTimeout(timer)
    })

    // Limpar listeners ao desmontar o componente
    return () => {
      cleanupChatMessage()
      cleanupConnectionStatus()
      cleanupViewerCount()
      cleanupOverlayStatus()
      cleanupUpdateAvailable()
      cleanupUpdateProgress()
      cleanupUpdateDownloaded()
      cleanupUpdateError()
    }
  }, [addMessage, updateConnectionStatus, updateStats, setOverlayMode])

  const handleInstallUpdate = (): void => {
    window.api.installUpdate()
  }

  const handleResizeMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    direction: 'vertical' | 'horizontal' | 'both'
  ): void => {
    e.preventDefault()
    const startWidth = window.innerWidth
    const startHeight = window.innerHeight
    const startX = e.screenX
    const startY = e.screenY

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      let newWidth = startWidth
      let newHeight = startHeight

      if (direction === 'horizontal' || direction === 'both') {
        const deltaX = moveEvent.screenX - startX
        newWidth = Math.max(980, startWidth + deltaX)
      }
      if (direction === 'vertical' || direction === 'both') {
        const deltaY = moveEvent.screenY - startY
        newHeight = Math.max(720, startHeight + deltaY)
      }

      window.api.resizeWindow(newWidth, newHeight)
    }

    const handleMouseUp = (): void => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div className={`app-container ${isOverlayMode ? 'overlay-active' : ''}`}>
      {/* Sidebar esquerda */}
      <Sidebar
        isSettingsOpen={isSettingsOpen}
        onToggleSettings={() => setIsSettingsOpen(!isSettingsOpen)}
        isMutedUsersOpen={isMutedUsersOpen}
        onToggleMutedUsers={() => setIsMutedUsersOpen(!isMutedUsersOpen)}
      />

      {/* Área central principal */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* TopBar */}
        <TopBar />

        {/* Chat Feed */}
        <ChatFeed />

        {/* Chat Composer */}
        <ChatComposer />
      </div>

      {/* Painel lateral de configurações */}
      <SettingsPanel isOpen={isSettingsOpen} />

      {/* Custom Resize Handles */}
      <div
        className="resize-handle-vertical"
        onMouseDown={(e) => handleResizeMouseDown(e, 'vertical')}
      />
      <div
        className="resize-handle-horizontal"
        onMouseDown={(e) => handleResizeMouseDown(e, 'horizontal')}
      />
      <div className="resize-handle-corner" onMouseDown={(e) => handleResizeMouseDown(e, 'both')} />

      {/* Modal de gerenciamento de usuários ocultados */}
      {isMutedUsersOpen && <MutedUsersModal onClose={() => setIsMutedUsersOpen(false)} />}

      {/* Banner de Atualização Automática */}
      {showUpdateBanner && (
        <div
          className="update-toast-banner"
          style={
            { WebkitAppRegion: 'no-drag' } as React.CSSProperties & {
              WebkitAppRegion?: 'drag' | 'no-drag'
            }
          }
        >
          <div className="update-banner-header">
            <div className="update-banner-title">
              <span
                className="update-pulse-dot"
                style={{
                  backgroundColor:
                    updateStatus === 'error'
                      ? '#ef4444'
                      : updateStatus === 'downloaded'
                        ? '#10b981'
                        : '#3b82f6',
                  boxShadow:
                    updateStatus === 'error'
                      ? '0 0 8px #ef4444'
                      : updateStatus === 'downloaded'
                        ? '0 0 8px #10b981'
                        : '0 0 8px #3b82f6'
                }}
              />
              <span>
                {updateStatus === 'downloading' && 'Baixando Atualização...'}
                {updateStatus === 'downloaded' && 'Atualização Disponível!'}
                {updateStatus === 'error' && 'Erro na Atualização'}
              </span>
            </div>
            {updateStatus !== 'downloading' && (
              <button
                onClick={() => setShowUpdateBanner(false)}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '2px'
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div className="update-banner-text">
            {updateStatus === 'downloading' &&
              `Baixando a versão ${newVersion}... Progresso: ${downloadProgress}%`}
            {updateStatus === 'downloaded' &&
              `A versão ${newVersion} foi baixada e está pronta para instalação.`}
            {updateStatus === 'error' && `Não foi possível atualizar: ${updateError}`}
          </div>

          {updateStatus === 'downloading' && (
            <div className="update-progress-bar-bg">
              <div className="update-progress-bar-fill" style={{ width: `${downloadProgress}%` }} />
            </div>
          )}

          {updateStatus === 'downloaded' && (
            <div className="update-banner-actions">
              <button className="update-btn-secondary" onClick={() => setShowUpdateBanner(false)}>
                Depois
              </button>
              <button className="update-btn-primary" onClick={handleInstallUpdate}>
                Reiniciar e Instalar
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default App
