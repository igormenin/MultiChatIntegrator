import React, { useState, useEffect } from 'react'
import { useChatStore } from '../store/chatStore'

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M'
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  }
  return num.toString()
}

export const TopBar: React.FC = () => {
  const { connections, stats } = useChatStore()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    // Escuta evento de maximizado do processo principal
    const cleanupMaximized = window.api.onMaximizedStatus((status) => {
      setIsMaximized(status)
    })

    return () => {
      cleanupMaximized()
    }
  }, [])

  const handleMaximize = async (): Promise<void> => {
    const status = await window.api.maximizeWindow()
    setIsMaximized(status)
  }

  const activeStats = Object.keys(connections)
    .filter((platform) => connections[platform].status === 'connected')
    .map((platform) => {
      const platformStats = stats[platform]
      const label = platform.toUpperCase()
      const color =
        platform === 'twitch'
          ? 'var(--color-twitch)'
          : platform === 'youtube'
            ? 'var(--color-youtube)'
            : 'var(--color-kick)'

      return (
        <div
          key={platform}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            backgroundColor: 'rgba(255, 255, 255, 0.03)',
            border: '1px solid var(--border-color)',
            borderRadius: '16px',
            padding: '4px 12px',
            fontSize: '12px',
            fontWeight: 500
          }}
        >
          {/* Status dot in platform color */}
          <span
            style={{
              width: '6px',
              height: '6px',
              backgroundColor: color,
              borderRadius: '50%',
              boxShadow: `0 0 6px ${color}`
            }}
          />
          <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
          <span style={{ color: '#ffffff', fontWeight: 600 }}>
            {formatNumber(platformStats.viewers)} viewers
          </span>

          {/* Likes for YouTube */}
          {platform === 'youtube' && typeof platformStats.likeCount === 'number' && (
            <>
              <span style={{ color: 'var(--text-muted)' }}>·</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#EF4444' }}>
                <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span style={{ fontWeight: 600 }}>
                  {formatNumber(platformStats.likeCount)} likes
                </span>
              </span>
            </>
          )}
        </div>
      )
    })

  return (
    <header
      className="topbar"
      style={
        {
          height: '48px',
          backgroundColor: 'var(--bg-panel)',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          zIndex: 40,
          WebkitAppRegion: 'drag' // Permite arrastar a janela
        } as React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
      }
    >
      {/* Title */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <h1
          style={{ fontSize: '14px', fontWeight: 600, letterSpacing: '0.02em', color: '#ffffff' }}
        >
          MultiChat Integrator
        </h1>
      </div>

      {/* Stats Panel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px'
        }}
      >
        {activeStats.length > 0 ? (
          activeStats
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            Nenhum canal conectado. Abra as configurações para conectar.
          </span>
        )}
      </div>

      {/* Window Controls */}
      <div
        className="window-controls"
        style={
          {
            WebkitAppRegion: 'no-drag'
          } as React.CSSProperties & { WebkitAppRegion?: 'drag' | 'no-drag' }
        }
      >
        {/* Minimizar */}
        <button
          className="window-control-btn window-control-btn-minimize"
          onClick={() => window.api.minimizeWindow()}
          title="Minimizar"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Maximizar/Restaurar */}
        <button
          className="window-control-btn"
          onClick={handleMaximize}
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
        >
          {isMaximized ? (
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M8 8V4h12v12h-4" />
              <rect x="4" y="8" width="12" height="12" rx="1.5" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              width="13"
              height="13"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="4" y="4" width="16" height="16" rx="1.5" />
            </svg>
          )}
        </button>

        {/* Fechar */}
        <button
          className="window-control-btn window-control-btn-close"
          onClick={() => window.api.closeWindow()}
          title="Fechar"
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </header>
  )
}
