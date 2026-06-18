import React, { useState } from 'react'
import { useChatStore, QuickMessage } from '../store/chatStore'

interface QuickMessagesModalProps {
  onClose: () => void
}

const MAX_QUICK_MESSAGES = 10

export const QuickMessagesModal: React.FC<QuickMessagesModalProps> = ({ onClose }) => {
  const { quickMessages, addQuickMessage, removeQuickMessage } = useChatStore()
  const [labelInput, setLabelInput] = useState('')
  const [textInput, setTextInput] = useState('')
  const [error, setError] = useState('')

  const handleAdd = async (): Promise<void> => {
    const label = labelInput.trim()
    const text = textInput.trim()

    if (!label) {
      setError('O nome do botão não pode estar vazio.')
      return
    }
    if (!text) {
      setError('O texto da mensagem não pode estar vazio.')
      return
    }
    if (quickMessages.length >= MAX_QUICK_MESSAGES) {
      setError(`Limite de ${MAX_QUICK_MESSAGES} mensagens rápidas atingido.`)
      return
    }

    const newMsg: QuickMessage = {
      id: `qm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      label,
      text
    }

    addQuickMessage(newMsg)
    const updated = [...quickMessages, newMsg].slice(0, MAX_QUICK_MESSAGES)
    await window.api.saveQuickMessages(updated)

    setLabelInput('')
    setTextInput('')
    setError('')
  }

  const handleRemove = async (id: string): Promise<void> => {
    removeQuickMessage(id)
    const updated = quickMessages.filter((m) => m.id !== id)
    await window.api.saveQuickMessages(updated)
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void handleAdd()
    }
    if (e.key === 'Escape') {
      onClose()
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
      {/* Modal */}
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        style={{
          width: '420px',
          maxHeight: '540px',
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
            <span style={{ fontSize: '16px' }}>⚡</span>
            <span style={{ fontWeight: 600, fontSize: '13.5px', color: '#ffffff' }}>
              Mensagens Rápidas
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
              {quickMessages.length}/{MAX_QUICK_MESSAGES}
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

        {/* Lista de mensagens */}
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
          {quickMessages.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '24px 0',
                color: 'var(--text-muted)',
                fontSize: '12px',
                fontStyle: 'italic'
              }}
            >
              Nenhuma mensagem rápida cadastrada ainda.
              <br />
              Adicione uma abaixo!
            </div>
          ) : (
            quickMessages.map((msg) => (
              <div
                key={msg.id}
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
                {/* Badge do label */}
                <span
                  style={{
                    flexShrink: 0,
                    backgroundColor: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: '4px',
                    padding: '2px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#ffffff',
                    maxWidth: '90px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={msg.label}
                >
                  {msg.label}
                </span>

                {/* Texto da mensagem */}
                <span
                  style={{
                    flex: 1,
                    fontSize: '12px',
                    color: 'var(--text-secondary)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={msg.text}
                >
                  {msg.text}
                </span>

                {/* Botão remover */}
                <button
                  onClick={() => void handleRemove(msg.id)}
                  title="Remover"
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

        {/* Formulário de adição */}
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

          <div style={{ display: 'flex', gap: '8px' }}>
            {/* Campo Label */}
            <input
              type="text"
              value={labelInput}
              onChange={(e) => {
                setLabelInput(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="Botão (ex: GG)"
              maxLength={20}
              disabled={quickMessages.length >= MAX_QUICK_MESSAGES}
              style={{
                width: '100px',
                flexShrink: 0,
                padding: '7px 10px',
                backgroundColor: 'rgba(255,255,255,0.03)',
                border: '1px solid var(--border-color)',
                borderRadius: '5px',
                color: '#ffffff',
                fontSize: '12px'
              }}
            />

            {/* Campo Texto */}
            <input
              type="text"
              value={textInput}
              onChange={(e) => {
                setTextInput(e.target.value)
                setError('')
              }}
              onKeyDown={handleKeyDown}
              placeholder="Mensagem completa…"
              maxLength={500}
              disabled={quickMessages.length >= MAX_QUICK_MESSAGES}
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

            {/* Botão Adicionar */}
            <button
              onClick={() => void handleAdd()}
              disabled={
                quickMessages.length >= MAX_QUICK_MESSAGES ||
                !labelInput.trim() ||
                !textInput.trim()
              }
              style={{
                flexShrink: 0,
                padding: '0 14px',
                height: '34px',
                backgroundColor:
                  quickMessages.length >= MAX_QUICK_MESSAGES ||
                  !labelInput.trim() ||
                  !textInput.trim()
                    ? 'rgba(255,255,255,0.03)'
                    : 'rgba(255,255,255,0.09)',
                border: '1px solid',
                borderColor:
                  quickMessages.length >= MAX_QUICK_MESSAGES ||
                  !labelInput.trim() ||
                  !textInput.trim()
                    ? 'var(--border-color)'
                    : 'rgba(255,255,255,0.18)',
                color:
                  quickMessages.length >= MAX_QUICK_MESSAGES ||
                  !labelInput.trim() ||
                  !textInput.trim()
                    ? 'var(--text-muted)'
                    : '#ffffff',
                borderRadius: '5px',
                fontSize: '13px',
                fontWeight: 600,
                cursor:
                  quickMessages.length >= MAX_QUICK_MESSAGES ||
                  !labelInput.trim() ||
                  !textInput.trim()
                    ? 'not-allowed'
                    : 'pointer',
                transition: 'all 0.15s'
              }}
            >
              + Add
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
