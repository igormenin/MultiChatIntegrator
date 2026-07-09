import React from 'react'
import { ChatMessage as ChatMessageType } from '../../../common/types/ChatMessage'

interface ChatMessageProps {
  message: ChatMessageType
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const [imgError, setImgError] = React.useState(false)

  const {
    platform,
    username,
    displayName,
    text,
    timestamp,
    color,
    avatarUrl,
    isModerator,
    isSubscriber,
    emotes
  } = message

  // Formatar hora
  const timeString = new Date(timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })

  // Estilos de plataforma
  const platformConfig = {
    twitch: {
      color: 'var(--color-twitch)',
      bgLight: 'rgba(145, 70, 255, 0.05)',
      badge: '🟣 Twitch',
      borderColor: 'var(--color-twitch)',
      barTextColor: '#ffffff'
    },
    youtube: {
      color: 'var(--color-youtube)',
      bgLight: 'rgba(255, 0, 0, 0.05)',
      badge: '🔴 YouTube',
      borderColor: 'var(--color-youtube)',
      barTextColor: '#ffffff'
    },
    kick: {
      color: 'var(--color-kick)',
      bgLight: 'rgba(83, 252, 24, 0.05)',
      badge: '🟢 Kick',
      borderColor: 'var(--color-kick)',
      barTextColor: '#000000'
    }
  }[platform]

  // Cor do nick do usuário
  const userColor = color || platformConfig.color

  // Função para renderizar texto com emotes/emojis
  const renderMessageText = (): React.ReactNode => {
    if (!emotes || emotes.length === 0) {
      return text
    }

    // Escapar caracteres especiais dos códigos de emote para criar a expressão regular
    const escapedCodes = emotes.map((e) => e.code.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&'))
    const regex = new RegExp(`(${escapedCodes.join('|')})`, 'g')

    const parts = text.split(regex)
    return parts.map((part, index) => {
      const emote = emotes.find((e) => e.code === part)
      if (emote) {
        return (
          <img
            key={index}
            src={emote.url}
            alt={emote.code}
            title={emote.code}
            style={{
              height: '24px',
              verticalAlign: 'middle',
              display: 'inline-block',
              margin: '0 2px'
            }}
          />
        )
      }
      return part
    })
  }

  return (
    <div
      className={`glass-card card-${platform} animate-message`}
      style={{
        display: 'flex',
        borderRadius: '6px',
        margin: '6px 12px 6px 12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        backgroundColor: '#13151b',
        overflow: 'hidden',
        borderLeftWidth: '3px' // Override the default 3px border to use our custom bar instead
      }}
    >
      {/* Vertical Platform Bar */}
      <div
        style={{
          width: '14px',
          backgroundColor: platformConfig.color,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0
        }}
      >
        <span
          style={{
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
            fontSize: '9px',
            fontWeight: 800,
            color: platformConfig.barTextColor,
            letterSpacing: '1px',
            textTransform: 'uppercase',
            opacity: 1,
            whiteSpace: 'nowrap'
          }}
        >
          {platform}
        </span>
      </div>

      {/* Main Content Wrapper */}
      <div
        style={{
          display: 'flex',
          flex: 1,
          gap: '12px',
          padding: '10px 14px',
          minWidth: 0 // Prevent flex overflow issues
        }}
      >
        {/* Avatar Container */}
        <div style={{ flexShrink: 0 }}>
          {avatarUrl && !imgError ? (
            <img
              src={avatarUrl}
              alt={displayName}
              onError={() => setImgError(true)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                objectFit: 'cover',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            />
          ) : (
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: 'rgba(255, 255, 255, 0.08)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                color: 'var(--text-secondary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: '15px', height: '15px', opacity: 0.7 }}
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
          )}
        </div>

        {/* Message Content */}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, gap: '3px' }}>
          {/* Message Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '6px',
              fontSize: '12px'
            }}
          >
            {/* User Name */}
            <span style={{ fontWeight: 700, color: userColor }}>{displayName || username}</span>

            {/* Roles Badges */}
            {isModerator && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: '#10B981',
                  padding: '0px 4px',
                  borderRadius: '3px',
                  border: '1px solid rgba(16, 185, 129, 0.2)'
                }}
              >
                MOD
              </span>
            )}
            {isSubscriber && (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 700,
                  backgroundColor: 'rgba(59, 130, 246, 0.15)',
                  color: '#3B82F6',
                  padding: '0px 4px',
                  borderRadius: '3px',
                  border: '1px solid rgba(59, 130, 246, 0.2)'
                }}
              >
                SUB
              </span>
            )}

            {/* Timestamp */}
            <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '11px' }}>
              {timeString}
            </span>
          </div>

          {/* Message Text */}
          <div
            style={{
              fontSize: '13.5px',
              color: 'var(--text-primary)',
              lineHeight: '1.4',
              wordBreak: 'break-word',
              userSelect: 'text'
            }}
          >
            {renderMessageText()}
          </div>
        </div>
      </div>
    </div>
  )
}
