import React, { useEffect, useRef, useState } from 'react'
import { useChatStore } from '../store/chatStore'

interface LogModalProps {
  onClose: () => void
}

export const LogModal: React.FC<LogModalProps> = ({ onClose }) => {
  const connections = useChatStore((state) => state.connections)
  const [logs, setLogs] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [autoScroll, setAutoScroll] = useState(true)
  const [filter, setFilter] = useState('')
  const endRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchLogs = async (): Promise<void> => {
    try {
      const result = await window.api.getLogs()
      setLogs(result || [])
    } catch {
      setLogs(['[Erro ao carregar logs]'])
    } finally {
      setIsLoading(false)
    }
  }

  const handleExportEmail = async (): Promise<void> => {
    if (isSendingEmail) return
    setIsSendingEmail(true)
    try {
      let userInfo = 'Informações das Conexões Atuais:\n\n'
      for (const [platform, conn] of Object.entries(connections)) {
        userInfo += `Plataforma: ${platform.toUpperCase()}\n`
        userInfo += `Status: ${conn.status}\n`
        userInfo += `Usuário/Canal logado: ${conn.channelInfo || 'Não definido'}\n`
        if (platform === 'youtube' && conn.status === 'connected') {
          userInfo += `ID da Live do YouTube: ${conn.channelInfo || 'Não definido'}\n`
        }
        userInfo += '\n'
      }

      const result = await window.api.exportAndEmailLogs(userInfo)
      if (result.success) {
        alert('Logs exportados e enviados por e-mail com sucesso!')
      } else {
        alert('Erro ao enviar e-mail:\n' + result.error)
      }
    } catch (err: unknown) {
      alert('Erro inesperado:\n' + (err instanceof Error ? err.message : String(err)))
    } finally {
      setIsSendingEmail(false)
    }
  }

  useEffect(() => {
    let cancelled = false

    const loadLogs = (): void => {
      window.api
        .getLogs()
        .then((result) => {
          if (!cancelled) {
            setLogs(result || [])
            setIsLoading(false)
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLogs(['[Erro ao carregar logs]'])
            setIsLoading(false)
          }
        })
    }

    loadLogs()
    const interval = setInterval(loadLogs, 2000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [logs, autoScroll])

  const filteredLogs = filter
    ? logs.filter((l) => l.toLowerCase().includes(filter.toLowerCase()))
    : logs

  const getLineColor = (line: string): string => {
    if (line.includes('] [ERROR]')) return '#f87171'
    if (line.includes('] [WARN]')) return '#fbbf24'
    if (line.includes('] [INFO]')) return '#94a3b8'
    return '#94a3b8'
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={handleBackdropClick}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px'
      }}
    >
      <div
        style={{
          width: '90vw',
          maxWidth: '90vw',
          height: '90vh',
          backgroundColor: '#0d1117',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
          overflow: 'hidden'
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Terminal icon */}
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="#64748b"
              strokeWidth="2"
            >
              <polyline points="4 17 10 11 4 5" />
              <line x1="12" y1="19" x2="20" y2="19" />
            </svg>
            <span
              style={{
                fontWeight: 700,
                fontSize: '13px',
                color: '#e2e8f0',
                letterSpacing: '0.3px'
              }}
            >
              Logs do Aplicativo
            </span>
            <span
              style={{
                fontSize: '10px',
                color: '#475569',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                padding: '1px 7px',
                borderRadius: '10px'
              }}
            >
              {filteredLogs.length} linhas
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Filter input */}
            <input
              type="text"
              placeholder="Filtrar logs..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{
                height: '28px',
                padding: '0 10px',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#e2e8f0',
                fontSize: '11px',
                outline: 'none',
                width: '180px'
              }}
            />

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              title={autoScroll ? 'Auto-scroll: ON' : 'Auto-scroll: OFF'}
              style={{
                height: '28px',
                padding: '0 10px',
                backgroundColor: autoScroll ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)',
                border: '1px solid',
                borderColor: autoScroll ? 'rgba(99,102,241,0.4)' : 'rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: autoScroll ? '#818cf8' : '#64748b',
                fontSize: '11px',
                cursor: 'pointer',
                fontWeight: 600,
                transition: 'all 0.15s'
              }}
            >
              Auto-scroll
            </button>

            {/* Export and Email */}
            <button
              onClick={() => void handleExportEmail()}
              disabled={isSendingEmail}
              title="Exportar e enviar por E-mail"
              style={{
                height: '28px',
                padding: '0 10px',
                backgroundColor: isSendingEmail ? 'rgba(255,255,255,0.02)' : 'rgba(16, 185, 129, 0.15)',
                border: '1px solid',
                borderColor: isSendingEmail ? 'rgba(255,255,255,0.05)' : 'rgba(16, 185, 129, 0.4)',
                borderRadius: '6px',
                color: isSendingEmail ? '#64748b' : '#10b981',
                fontSize: '11px',
                cursor: isSendingEmail ? 'wait' : 'pointer',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.15s'
              }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                <polyline points="22,6 12,13 2,6" />
              </svg>
              {isSendingEmail ? 'Enviando...' : 'Exportar (E-mail)'}
            </button>

            {/* Refresh */}
            <button
              onClick={() => void fetchLogs()}
              title="Atualizar"
              style={{
                width: '28px',
                height: '28px',
                backgroundColor: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '6px',
                color: '#64748b',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.15s'
              }}
            >
              <svg
                viewBox="0 0 24 24"
                width="13"
                height="13"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
            </button>

            {/* Close */}
            <button
              onClick={onClose}
              title="Fechar"
              style={{
                width: '28px',
                height: '28px',
                backgroundColor: 'rgba(239,68,68,0.08)',
                border: '1px solid rgba(239,68,68,0.2)',
                borderRadius: '6px',
                color: '#f87171',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '14px',
                transition: 'all 0.15s'
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Log Content */}
        <div
          ref={containerRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '12px 16px',
            fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
            fontSize: '11.5px',
            lineHeight: '1.6',
            backgroundColor: '#0d1117'
          }}
        >
          {isLoading ? (
            <div style={{ color: '#475569', textAlign: 'center', paddingTop: '40px' }}>
              Carregando logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div style={{ color: '#475569', textAlign: 'center', paddingTop: '40px' }}>
              {filter ? 'Nenhum log corresponde ao filtro.' : 'Nenhum log disponível.'}
            </div>
          ) : (
            filteredLogs.map((line, i) => (
              <div
                key={i}
                style={{
                  color: getLineColor(line),
                  padding: '1px 0',
                  wordBreak: 'break-all',
                  borderBottom: '1px solid rgba(255,255,255,0.02)'
                }}
              >
                {line}
              </div>
            ))
          )}
          <div ref={endRef} />
        </div>
      </div>
    </div>
  )
}
