import { create } from 'zustand'
import { ChatMessage } from '../../../common/types/ChatMessage'
import { PlatformName, ConnectionStatus, PlatformConnection } from '../../../common/types/Platform'
import { PlatformStats } from '../../../common/types/PlatformStats'

export interface QuickMessage {
  id: string
  label: string
  text: string
}

export interface MutedUser {
  id: string
  username: string
  platform: PlatformName
}

export type FontSize = 'small' | 'medium' | 'large'


interface ChatState {
  messages: ChatMessage[]
  connections: Record<PlatformName, PlatformConnection>
  stats: Record<PlatformName, PlatformStats>
  activeFilters: Record<PlatformName, boolean>
  isOverlayMode: boolean
  quickMessages: QuickMessage[]
  mutedUsers: MutedUser[]
  fontSize: FontSize

  // Actions
  addMessage: (message: ChatMessage) => void
  updateConnectionStatus: (
    platform: PlatformName,
    status: ConnectionStatus,
    channelInfo?: string,
    error?: string
  ) => void
  updateStats: (platform: PlatformName, stats: Partial<PlatformStats>) => void
  toggleFilter: (platform: PlatformName) => void
  setOverlayMode: (active: boolean) => void
  clearChat: () => void
  setQuickMessages: (messages: QuickMessage[]) => void
  addQuickMessage: (message: QuickMessage) => void
  removeQuickMessage: (id: string) => void
  setMutedUsers: (users: MutedUser[]) => void
  addMutedUser: (user: MutedUser) => void
  removeMutedUser: (id: string) => void
  setFontSize: (size: FontSize) => void
}

const MAX_MESSAGES = 500

const initialConnections: Record<PlatformName, PlatformConnection> = {
  twitch: { platform: 'twitch', status: 'disconnected' },
  youtube: { platform: 'youtube', status: 'disconnected' },
  kick: { platform: 'kick', status: 'disconnected' }
}

const initialStats: Record<PlatformName, PlatformStats> = {
  twitch: { viewers: 0, updatedAt: 0 },
  youtube: { viewers: 0, likeCount: 0, updatedAt: 0 },
  kick: { viewers: 0, updatedAt: 0 }
}

const initialFilters: Record<PlatformName, boolean> = {
  twitch: true,
  youtube: true,
  kick: true
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  connections: initialConnections,
  stats: initialStats,
  activeFilters: initialFilters,
  isOverlayMode: false,
  quickMessages: [],
  mutedUsers: [],
  fontSize: 'medium',

  addMessage: (message) =>
    set((state) => {
      // Evitar mensagens duplicadas da mesma plataforma se já existirem
      const isDuplicate = state.messages.some(
        (msg) => msg.platform === message.platform && msg.messageId === message.messageId
      )
      if (isDuplicate) return state

      const newMessages = [...state.messages, message]
      if (newMessages.length > MAX_MESSAGES) {
        newMessages.shift()
      }
      return { messages: newMessages }
    }),

  updateConnectionStatus: (platform, status, channelInfo, error) =>
    set((state) => ({
      connections: {
        ...state.connections,
        [platform]: { platform, status, channelInfo, error }
      }
    })),

  updateStats: (platform, statsUpdates) =>
    set((state) => ({
      stats: {
        ...state.stats,
        [platform]: {
          ...state.stats[platform],
          ...statsUpdates,
          updatedAt: Date.now()
        }
      }
    })),

  toggleFilter: (platform) =>
    set((state) => ({
      activeFilters: {
        ...state.activeFilters,
        [platform]: !state.activeFilters[platform]
      }
    })),

  setOverlayMode: (active) => set({ isOverlayMode: active }),

  clearChat: () => set({ messages: [] }),

  setQuickMessages: (messages) => set({ quickMessages: messages }),

  addQuickMessage: (message) =>
    set((state) => ({
      quickMessages: [...state.quickMessages, message].slice(0, 10)
    })),

  removeQuickMessage: (id) =>
    set((state) => ({
      quickMessages: state.quickMessages.filter((m) => m.id !== id)
    })),

  setMutedUsers: (users) => set({ mutedUsers: users }),

  addMutedUser: (user) =>
    set((state) => ({
      mutedUsers: [...state.mutedUsers, user]
    })),

  removeMutedUser: (id) =>
    set((state) => ({
      mutedUsers: state.mutedUsers.filter((u) => u.id !== id)
    })),

  setFontSize: (size) => set({ fontSize: size })
}))
