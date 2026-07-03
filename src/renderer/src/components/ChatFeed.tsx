import React, { useRef, useState, useEffect } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useChatStore } from '../store/chatStore'
import { ChatMessage } from './ChatMessage'
import logoIcon from '../assets/icon.png'

export const ChatFeed: React.FC = () => {
  const { messages, activeFilters, mutedUsers } = useChatStore()
  const virtuosoRef = useRef<VirtuosoHandle>(null)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const [messagesCountAtBottomLeave, setMessagesCountAtBottomLeave] = useState(0)

  // Filtrar as mensagens de acordo com os filtros ativos na Sidebar e usuários ocultados
  const filteredMessages = messages.filter((msg) => {
    if (!activeFilters[msg.platform]) return false

    const isUserMuted = mutedUsers.some((muted) => {
      const matchUsername =
        muted.username.toLowerCase().trim() === msg.username.toLowerCase().trim() ||
        muted.username.toLowerCase().trim() === msg.displayName.toLowerCase().trim()
      const matchPlatform = muted.platform === msg.platform
      return matchUsername && matchPlatform
    })

    return !isUserMuted
  })

  // Computar mensagens recebidas desde que o usuário subiu a tela
  const newMessagesCount = isAtBottom
    ? 0
    : Math.max(0, filteredMessages.length - messagesCountAtBottomLeave)

  const scrollToBottom = (): void => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: filteredMessages.length - 1,
        align: 'end',
        behavior: 'smooth'
      })
      setIsAtBottom(true)
    }
  }

  const isInitialLoad = useRef(true)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined

    if (filteredMessages.length === 0) {
      isInitialLoad.current = true
    } else if (filteredMessages.length > 0 && virtuosoRef.current && isInitialLoad.current) {
      // Pequeno atraso para garantir que as imagens/mensagens renderizaram e adquiriram altura
      timer = setTimeout(() => {
        virtuosoRef.current?.scrollToIndex({
          index: filteredMessages.length - 1,
          align: 'end',
          behavior: 'auto'
        })
        isInitialLoad.current = false
      }, 150)
    }

    return () => {
      if (timer) clearTimeout(timer)
    }
  }, [filteredMessages.length])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        backgroundColor: 'transparent'
      }}
    >
      {/* Background Watermark Icon */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '250px',
          height: '250px',
          opacity: 0.5, // Marca d'água elegante e sutil
          pointerEvents: 'none',
          backgroundImage: `url(${logoIcon})`,
          backgroundSize: 'contain',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          zIndex: 0
        }}
      />

      {filteredMessages.length === 0 ? (
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text-muted)',
            fontSize: '13px',
            gap: '12px',
            zIndex: 1
          }}
        >
          {/* Logo or Chat bubble icon */}
        </div>
      ) : (
        <Virtuoso
          ref={virtuosoRef}
          data={filteredMessages}
          initialTopMostItemIndex={filteredMessages.length - 1}
          followOutput="smooth"
          totalCount={filteredMessages.length}
          itemContent={(_index, message) => <ChatMessage key={message.id} message={message} />}
          style={{ height: '100%', width: '100%', backgroundColor: 'transparent', zIndex: 1 }}
          alignToBottom
          atBottomStateChange={(atBottom) => {
            setIsAtBottom(atBottom)
            if (!atBottom) {
              setMessagesCountAtBottomLeave(filteredMessages.length)
            }
          }}
        />
      )}

      {/* Floating New Messages Badge */}
      {!isAtBottom && newMessagesCount > 0 && (
        <button
          onClick={scrollToBottom}
          style={{
            position: 'absolute',
            bottom: '16px',
            left: '50%',
            transform: 'translateX(-50%)',
            backgroundColor: 'rgba(255, 255, 255, 0.08)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255, 255, 255, 0.15)',
            borderRadius: '20px',
            color: '#ffffff',
            padding: '8px 16px',
            fontSize: '12px',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            zIndex: 10,
            animation: 'fadeInUp 0.2s ease-out',
            transition: 'all 0.15s ease'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.12)'
            e.currentTarget.style.transform = 'translateX(-50%) translateY(-2px)'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.08)'
            e.currentTarget.style.transform = 'translateX(-50%) translateY(0)'
          }}
        >
          <span>
            ▼ {newMessagesCount} {newMessagesCount === 1 ? 'nova mensagem' : 'novas mensagens'}
          </span>
        </button>
      )}
    </div>
  )
}
