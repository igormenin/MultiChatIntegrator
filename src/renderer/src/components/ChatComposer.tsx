import React, { useState, useEffect, useRef } from 'react'
import { useChatStore } from '../store/chatStore'
import { PlatformName } from '../../../common/types/Platform'
import { QuickMessagesModal } from './QuickMessagesModal'

export const ChatComposer: React.FC = () => {
  const { connections, quickMessages, setQuickMessages, clearChat } = useChatStore()
  const [text, setText] = useState('')
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformName[]>([])
  const [isSending, setIsSending] = useState(false)
  const [feedbacks, setFeedbacks] = useState<Record<string, 'success' | 'error' | null>>({})
  const [isModalOpen, setIsModalOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Carregar mensagens rápidas salvas na inicialização
  useEffect(() => {
    void window.api.getQuickMessages().then((msgs) => {
      setQuickMessages(msgs)
    })
  }, [setQuickMessages])

  // Obter as plataformas conectadas
  const connectedPlatforms = Object.keys(connections).filter(
    (platform) => connections[platform].status === 'connected'
  ) as PlatformName[]

  // Computar quais plataformas estão de fato ativas na seleção
  const activeSelected =
    selectedPlatforms.length === 0
      ? connectedPlatforms
      : selectedPlatforms.filter((p) => connectedPlatforms.includes(p))

  const togglePlatformSelection = (platform: PlatformName): void => {
    if (!connectedPlatforms.includes(platform)) return

    const currentSelected = selectedPlatforms.length === 0 ? connectedPlatforms : selectedPlatforms

    if (currentSelected.includes(platform)) {
      if (activeSelected.length === 1) return
      setSelectedPlatforms(currentSelected.filter((p) => p !== platform))
    } else {
      setSelectedPlatforms([...currentSelected, platform])
    }
  }

  const sendText = async (textToSend: string): Promise<void> => {
    if (!textToSend.trim() || activeSelected.length === 0 || isSending) return

    setIsSending(true)
    setFeedbacks({})

    try {
      const results = await window.api.sendMessage({
        platforms: activeSelected,
        text: textToSend.trim()
      })

      const newFeedbacks: Record<string, 'success' | 'error'> = {}
      results.forEach((res) => {
        newFeedbacks[res.platform] = res.success ? 'success' : 'error'
      })
      setFeedbacks(newFeedbacks)

      setTimeout(() => {
        setFeedbacks((prev) => {
          const cleared = { ...prev }
          activeSelected.forEach((p) => {
            cleared[p] = null
          })
          return cleared
        })
      }, 3000)
    } catch (err) {
      console.error('Erro ao enviar mensagem via IPC:', err)
      const errorFeedbacks: Record<string, 'error'> = {}
      activeSelected.forEach((p) => {
        errorFeedbacks[p] = 'error'
      })
      setFeedbacks(errorFeedbacks)
    } finally {
      setIsSending(false)
      textareaRef.current?.focus()
    }
  }

  const handleSend = async (): Promise<void> => {
    if (!text.trim()) return
    await sendText(text)
    setText('')
  }

  const handleQuickSend = async (msgText: string): Promise<void> => {
    await sendText(msgText)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleSend()
    }
  }

  // Ajustar altura da textarea automaticamente
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [text])

  const platformStyle = (platform: PlatformName): React.CSSProperties => {
    const isConnected = connectedPlatforms.includes(platform)
    const isSelected = activeSelected.includes(platform)
    const feedback = feedbacks[platform]

    let color = 'var(--text-muted)'
    let borderColor = 'transparent'
    let bg = 'rgba(255, 255, 255, 0.01)'

    if (isConnected) {
      const platColor =
        platform === 'twitch'
          ? 'var(--color-twitch)'
          : platform === 'youtube'
            ? 'var(--color-youtube)'
            : 'var(--color-kick)'

      if (feedback === 'success') {
        color = '#10B981'
        borderColor = 'rgba(16, 185, 129, 0.4)'
        bg = 'rgba(16, 185, 129, 0.08)'
      } else if (feedback === 'error') {
        color = '#EF4444'
        borderColor = 'rgba(239, 68, 68, 0.4)'
        bg = 'rgba(239, 68, 68, 0.08)'
      } else if (isSelected) {
        color = '#ffffff'
        borderColor = platColor
        bg =
          platform === 'twitch'
            ? 'rgba(145, 70, 255, 0.15)'
            : platform === 'youtube'
              ? 'rgba(255, 0, 0, 0.15)'
              : 'rgba(83, 252, 24, 0.15)'
      } else {
        color = 'var(--text-secondary)'
        borderColor = 'var(--border-color)'
        bg = 'rgba(255, 255, 255, 0.03)'
      }
    }

    return {
      color,
      borderColor,
      backgroundColor: bg,
      cursor: isConnected ? 'pointer' : 'not-allowed',
      opacity: isConnected ? 1 : 0.4,
      display: 'flex',
      alignItems: 'center',
      gap: '6px',
      padding: '4px 10px',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      border: '1px solid',
      borderRadius: '16px',
      transition: 'all 0.15s ease'
    }
  }

  return (
    <>
      <div
        className="chat-composer"
        style={{
          padding: '12px 16px',
          backgroundColor: 'var(--bg-panel)',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          zIndex: 30
        }}
      >
        {/* Linha 1: Platform Selectors + botão Gerir */}
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span
            style={{
              fontSize: '11px',
              color: 'var(--text-muted)',
              fontWeight: 500,
              marginRight: '4px'
            }}
          >
            Enviar para:
          </span>
          {(['twitch', 'youtube', 'kick'] as PlatformName[]).map((p) => (
            <button
              key={p}
              onClick={() => togglePlatformSelection(p)}
              style={platformStyle(p)}
              disabled={!connectedPlatforms.includes(p)}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor:
                    p === 'twitch'
                      ? 'var(--color-twitch)'
                      : p === 'youtube'
                        ? 'var(--color-youtube)'
                        : 'var(--color-kick)'
                }}
              />
              {p}
              {feedbacks[p] === 'success' && ' ✓'}
              {feedbacks[p] === 'error' && ' ✗'}
            </button>
          ))}

          {connectedPlatforms.length === 0 && (
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Nenhuma plataforma conectada
            </span>
          )}

          {/* Container de Ações à Direita */}
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {/* Botão Gerir Mensagens Rápidas */}
            <button
              onClick={() => setIsModalOpen(true)}
              title="Gerenciar mensagens rápidas"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                fontSize: '11px',
                fontWeight: 600,
                backgroundColor: isModalOpen ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.03)',
                border: '1px solid',
                borderColor: isModalOpen ? 'rgba(255,255,255,0.2)' : 'var(--border-color)',
                color: isModalOpen ? '#ffffff' : 'var(--text-muted)',
                borderRadius: '16px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (!isModalOpen) {
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
                  e.currentTarget.style.color = 'var(--text-secondary)'
                }
              }}
              onMouseLeave={(e) => {
                if (!isModalOpen) {
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.color = 'var(--text-muted)'
                }
              }}
            >
              <span style={{ fontSize: '13px' }}>⚡</span>
              {quickMessages.length > 0 && (
                <span
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.12)',
                    borderRadius: '8px',
                    padding: '0 5px',
                    fontSize: '10px'
                  }}
                >
                  {quickMessages.length}
                </span>
              )}
            </button>

            {/* Botão Limpar Chat */}
            <button
              onClick={() => clearChat()}
              title="Limpar chat"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '24px',
                height: '24px',
                padding: '0',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-muted)',
                borderRadius: '50%',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
                e.currentTarget.style.backgroundColor = 'rgba(239,68,68,0.08)'
                e.currentTarget.style.color = '#ef4444'
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-color)'
                e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.03)'
                e.currentTarget.style.color = 'var(--text-muted)'
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </button>
          </div>
        </div>

        {/* Linha 2: Faixa de Mensagens Rápidas (oculta se vazia) */}
        {quickMessages.length > 0 && (
          <div
            style={{
              display: 'flex',
              gap: '6px',
              overflowX: 'auto',
              paddingBottom: '2px',
              scrollbarWidth: 'none'
            }}
          >
            {quickMessages.map((msg) => (
              <button
                key={msg.id}
                onClick={() => void handleQuickSend(msg.text)}
                disabled={activeSelected.length === 0 || isSending}
                title={msg.text}
                style={{
                  flexShrink: 0,
                  padding: '4px 12px',
                  fontSize: '11px',
                  fontWeight: 500,
                  backgroundColor: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '14px',
                  color:
                    activeSelected.length === 0 || isSending
                      ? 'var(--text-muted)'
                      : 'var(--text-secondary)',
                  cursor: activeSelected.length === 0 || isSending ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap',
                  opacity: activeSelected.length === 0 || isSending ? 0.5 : 1
                }}
                onMouseEnter={(e) => {
                  if (activeSelected.length > 0 && !isSending) {
                    e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.09)'
                    e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
                    e.currentTarget.style.color = '#ffffff'
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.04)'
                  e.currentTarget.style.borderColor = 'var(--border-color)'
                  e.currentTarget.style.color =
                    activeSelected.length === 0 || isSending
                      ? 'var(--text-muted)'
                      : 'var(--text-secondary)'
                }}
              >
                {msg.label}
              </button>
            ))}
          </div>
        )}

        {/* Linha 3: Message Input and Send Button */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              connectedPlatforms.length > 0
                ? 'Digite sua mensagem e pressione Enter...'
                : 'Conecte-se a um canal para poder enviar mensagens'
            }
            disabled={connectedPlatforms.length === 0 || isSending}
            rows={1}
            style={{
              flex: 1,
              resize: 'none',
              minHeight: '36px',
              maxHeight: '120px',
              padding: '8px 12px',
              backgroundColor: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              color: '#ffffff',
              fontSize: '13.5px',
              lineHeight: '1.4'
            }}
          />

          <button
            onClick={() => void handleSend()}
            disabled={!text.trim() || activeSelected.length === 0 || isSending}
            style={{
              height: '36px',
              padding: '0 16px',
              backgroundColor:
                !text.trim() || activeSelected.length === 0 || isSending
                  ? 'rgba(255, 255, 255, 0.03)'
                  : 'rgba(255, 255, 255, 0.08)',
              border: '1px solid',
              borderColor:
                !text.trim() || activeSelected.length === 0 || isSending
                  ? 'var(--border-color)'
                  : 'rgba(255, 255, 255, 0.15)',
              color:
                !text.trim() || activeSelected.length === 0 || isSending
                  ? 'var(--text-muted)'
                  : '#ffffff',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor:
                !text.trim() || activeSelected.length === 0 || isSending
                  ? 'not-allowed'
                  : 'pointer',
              transition: 'all 0.15s ease'
            }}
          >
            {isSending ? 'Enviando...' : 'Enviar'}
          </button>
        </div>
      </div>

      {/* Modal de gerenciamento */}
      {isModalOpen && <QuickMessagesModal onClose={() => setIsModalOpen(false)} />}
    </>
  )
}
