import React, { useRef, useState, useEffect, useMemo } from 'react'
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso'
import { useChatStore } from '../store/chatStore'
import { ChatMessage } from './ChatMessage'
import { ChatMessage as ChatMessageType } from '../../../common/types/ChatMessage'
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

  // Array estável para o Virtuoso para não causar re-renders/loop infinito
  const virtuosoData = useMemo(() => {
    return [
      ...filteredMessages,
      { id: 'end-divider', isDivider: true } as unknown as ChatMessageType,
      { id: 'end-spacer', isSpacer: true } as unknown as ChatMessageType
    ]
  }, [filteredMessages])

  const scrollToBottom = (): void => {
    if (virtuosoRef.current) {
      virtuosoRef.current.scrollToIndex({
        index: filteredMessages.length + 1, // Foca no spacer invisível para garantir o espaço de 64px
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
    } else if (filteredMessages.length > 0 && virtuosoRef.current) {
      if (isInitialLoad.current) {
        // Pequeno atraso para garantir que as imagens/mensagens renderizaram e adquiriram altura
        timer = setTimeout(() => {
          virtuosoRef.current?.scrollToIndex({
            index: filteredMessages.length + 1, // Foca no spacer
            align: 'end',
            behavior: 'auto'
          })
          isInitialLoad.current = false
        }, 200) // Aumentei um pouquinho para garantir que a DOM carregou
      }
      // Removido o bloco "else if (isAtBottom)" pois conflita com o followOutput="smooth" nativo do Virtuoso.
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
          data={virtuosoData}
          initialTopMostItemIndex={filteredMessages.length + 1}
          followOutput={(isAtBottom) => (isAtBottom ? 'smooth' : false)}
          totalCount={filteredMessages.length + 2}
          itemContent={(_index, message: ChatMessageType & { isDivider?: boolean; isSpacer?: boolean }) => {
            if (message.isSpacer) {
              return <div style={{ height: '64px', width: '100%' }} />
            }
            if (message.isDivider) {
              return (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', opacity: 0.35, marginTop: '8px' }}>
                  <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, var(--text-muted), transparent)' }} />
                  <span style={{ padding: '0 12px', fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 600 }}>Fim das Mensagens</span>
                  <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, var(--text-muted), transparent)' }} />
                </div>
              )
            }
            return <ChatMessage key={message.id} message={message} />
          }}
          style={{ height: '100%', width: '100%', backgroundColor: 'transparent', zIndex: 1 }}
          alignToBottom
          atBottomThreshold={150}
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
