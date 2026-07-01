import React, { useState } from 'react'
import { useChatStore, MutedUser } from '../store/chatStore'
import { PlatformName } from '../../../common/types/Platform'

interface MutedUsersModalProps {
  onClose: () => void
}

export const MutedUsersModal: React.FC<MutedUsersModalProps> = ({ onClose }) => {
  const { mutedUsers, addMutedUser, removeMutedUser } = useChatStore()
  const [usernameInput, setUsernameInput] = useState('')
  const [selectedPlatform, setSelectedPlatform] = useState<PlatformName>('twitch')
  const [error, setError] = useState('')

  const handleAdd = async (): Promise<void> => {
    const rawUsername = usernameInput.trim()
    if (!rawUsername) {
      setError('O nome de usuário não pode estar vazio.')
      return
    }

    // Verificar se já está na lista para a mesma plataforma
    const exists = mutedUsers.some(
      (u) =>
        u.username.toLowerCase() === rawUsername.toLowerCase() && u.platform === selectedPlatform
    )

    if (exists) {
      setError(
        `O usuário "${rawUsername}" já está ocultado para a plataforma ${selectedPlatform.toUpperCase()}.`
      )
      return
    }

    const newMutedUser: MutedUser = {
      id: `mu-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      username: rawUsername,
      platform: selectedPlatform
    }

    addMutedUser(newMutedUser)
    const updated = [...mutedUsers, newMutedUser]
    await window.api.saveMutedUsers(updated)

    setUsernameInput('')
    setError('')
  }

  const handleRemove = async (id: string): Promise<void> => {
    removeMutedUser(id)
    const updated = mutedUsers.filter((u) => u.id !== id)
    await window.api.saveMutedUsers(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter') {
      e.preventDefault()
      void handleAdd()
    }
    if (e.key === 'Escape') {
      onClose()
    }
  }

  const getPlatformLabel = (platform: PlatformName): string => {
    switch (platform) {
      case 'twitch':
        return 'Twitch'
      case 'youtube':
        return 'YouTube'
      case 'kick':
        return 'Kick'
      default:
        return platform
    }
  }

  const getPlatformColor = (platform: PlatformName): string => {
    switch (platform) {
      case 'twitch':
        return 'var(--color-twitch)'
      case 'youtube':
        return 'var(--color-youtube)'
      case 'kick':
        return 'var(--color-kick)'
      default:
        return 'var(--text-secondary)'
    }
  }

  return (
    /* Overlay */
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(4px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center'
      }}
    >
      {/* Modal Container */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: '420px',
          maxHeight: '80vh',
          backgroundColor: 'var(--bg-panel)',
          border: '1px solid var(--border-color)',
          borderRadius: '10px',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '16px' }}>🚫</span>
            <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
              Gerenciar Usuários Ocultados
            </span>
            <span
              style={{
                fontSize: '10px',
                color: 'var(--text-muted)',
                backgroundColor: 'rgba(255,255,255,0.05)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '1px 7px'
              }}
            >
              {mutedUsers.length}
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '18px',
              lineHeight: 1,
              padding: '2px 4px',
              borderRadius: '4px',
              transition: 'color 0.15s'
            }}
            onMouseEnter={(e) => ((e.target as HTMLElement).style.color = '#ffffff')}
            onMouseLeave={(e) => ((e.target as HTMLElement).style.color = 'var(--text-muted)')}
          >
            ×
          </button>
        </div>

        {/* Muted Users List */}
        <div
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}
        >
          {mutedUsers.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '32px 0',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontStyle: 'italic'
              }}
            >
              Nenhum usuário ocultado no momento.
              <br />
              Utilize o formulário abaixo para adicionar.
            </div>
          ) : (
            mutedUsers.map((user) => (
              <div
                key={user.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '8px 10px',
                  backgroundColor: 'rgba(255,255,255,0.03)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px'
                }}
              >
                {/* Platform Badge */}
                <span
                  style={{
                    flexShrink: 0,
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${getPlatformColor(user.platform)}`,
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '10px',
                    fontWeight: 600,
                    color: getPlatformColor(user.platform)
                  }}
                >
                  {getPlatformLabel(user.platform).toUpperCase()}
                </span>

                {/* Username */}
                <span
                  style={{
                    flex: 1,
                    fontSize: '12.5px',
                    color: '#ffffff',
                    fontWeight: 500,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={user.username}
                >
                  {user.username}
                </span>

                {/* Remove / Unmute Button */}
                <button
                  onClick={() => void handleRemove(user.id)}
                  title="Remover Ocultação"
                  style={{
                    flexShrink: 0,
                    background: 'none',
                    border: '1px solid transparent',
                    cursor: 'pointer',
                    color: 'var(--text-muted)',
                    fontSize: '13px',
                    width: '24px',
                    height: '24px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s'
                  }}
                  onMouseEnter={(e) => {
                    const el = e.currentTarget
                    el.style.color = '#EF4444'
                    el.style.borderColor = 'rgba(239,68,68,0.3)'
                    el.style.backgroundColor = 'rgba(239,68,68,0.08)'
                  }}
                  onMouseLeave={(e) => {
                    const el = e.currentTarget
                    el.style.color = 'var(--text-muted)'
                    el.style.borderColor = 'transparent'
                    el.style.backgroundColor = 'transparent'
                  }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* Add Form */}
        <div
          style={{
            padding: '12px 16px',
            borderTop: '1px solid var(--border-color)',
            flexShrink: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
          }}
        >
          {error && (
            <div
              style={{
                fontSize: '11px',
                color: '#EF4444',
                padding: '5px 8px',
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '4px'
              }}
            >
              {error}
            </div>
          )}

          {/* Radio Buttons for Platform Selection */}
          <div
            style={{
              display: 'flex',
              gap: '16px',
              fontSize: '11.5px',
              color: 'var(--text-secondary)',
              alignItems: 'center',
              padding: '2px 0'
            }}
          >
            <span style={{ fontWeight: 500 }}>Plataforma:</span>
            {(['twitch', 'youtube', 'kick'] as PlatformName[]).map((platform) => (
              <label
                key={platform}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                  userSelect: 'none'
                }}
              >
                <input
                  type="radio"
                  name="muted-platform"
                  checked={selectedPlatform === platform}
                  onChange={() => setSelectedPlatform(platform)}
                  style={{
                    cursor: 'pointer',
                    accentColor: getPlatformColor(platform)
                  }}
                />
                {getPlatformLabel(platform)}
              </label>
            ))}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Username Input */}
            <input
              type="text"
              value={usernameInput}
              onChange={(e) => {
                setUsernameInput(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="Nome do usuário para ocultar…"
              maxLength={100}
              style={{
                flex: 1,
                padding: '7px 10px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '5px',
                color: '#ffffff',
                fontSize: '12px'
              }}
            />

            {/* Add Button */}
            <button
              onClick={() => void handleAdd()}
              disabled={!usernameInput.trim()}
              style={{
                flexShrink: 0,
                padding: '0 14px',
                height: '34px',
                backgroundColor: !usernameInput.trim()
                  ? 'rgba(255,255,255,0.03)'
                  : 'var(--color-kick)', // uses standard brand green
                border: '1px solid',
                borderColor: !usernameInput.trim() ? 'var(--border-color)' : 'rgba(0,0,0,0.1)',
                color: !usernameInput.trim() ? 'var(--text-muted)' : '#07080B',
                borderRadius: '5px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: !usernameInput.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s'
              }}
            >
              + Ocultar
            </button>
          </div>

          <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
            Pressione{' '}
            <kbd
              style={{
                fontSize: '9px',
                padding: '1px 4px',
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: '3px',
                border: '1px solid var(--border-color)'
              }}
            >
              Enter
            </kbd>{' '}
            para adicionar ou{' '}
            <kbd
              style={{
                fontSize: '9px',
                padding: '1px 4px',
                backgroundColor: 'rgba(255,255,255,0.07)',
                borderRadius: '3px',
                border: '1px solid var(--border-color)'
              }}
            >
              Esc
            </kbd>{' '}
            para fechar
          </div>
        </div>
      </div>
    </div>
  )
}
