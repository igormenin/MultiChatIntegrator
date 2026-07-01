import { ElectronAPI } from '@electron-toolkit/preload'
import { ChatMessage } from '../common/types/ChatMessage'
import { PlatformName, ConnectionStatus } from '../common/types/Platform'

interface CustomAPI {
  onChatMessage: (callback: (message: ChatMessage) => void) => () => void
  onConnectionStatus: (
    callback: (
      platform: PlatformName,
      status: ConnectionStatus,
      channelInfo?: string,
      error?: string
    ) => void
  ) => () => void
  onViewerCount: (
    callback: (platform: PlatformName, viewers: number, likeCount?: number) => void
  ) => () => void
  onOverlayStatus: (callback: (active: boolean) => void) => () => void
  onMaximizedStatus: (callback: (isMaximized: boolean) => void) => () => void
  onTwitchAuthSuccess: (callback: (info: { login: string; userId: string }) => void) => () => void
  onTwitchAuthError: (callback: (message: string) => void) => () => void
  onUpdateAvailable: (callback: (version: string) => void) => () => void
  onUpdateDownloaded: (callback: (version: string) => void) => () => void
  onUpdateProgress: (callback: (percent: number) => void) => () => void
  onUpdateError: (callback: (error: string) => void) => () => void

  connectTwitch: (channel: string, save: boolean) => Promise<void>
  connectYouTube: (videoId: string, save: boolean) => Promise<void>
  connectKick: (slug: string, save: boolean) => Promise<void>
  getSettings: () => Promise<{
    twitchChannel: string
    youtubeVideoId: string
    kickSlug: string
    saveTwitchChannel: boolean
    saveYoutubeVideoId: boolean
    saveKickSlug: boolean
  }>
  disconnect: (platform: PlatformName) => Promise<void>
  toggleOverlay: () => Promise<void>
  minimizeWindow: () => Promise<void>
  closeWindow: () => Promise<void>
  maximizeWindow: () => Promise<boolean>
  resizeWindowHeight: (height: number) => Promise<void>
  resizeWindow: (width: number, height: number) => Promise<void>
  sendMessage: (payload: {
    platforms: PlatformName[]
    text: string
  }) => Promise<{ success: boolean; platform: PlatformName; error?: string }[]>
  twitchAuthStart: () => Promise<{
    success: boolean
    userCode?: string
    verificationUri?: string
    expiresIn?: number
    error?: string
  }>
  twitchAuthStatus: () => Promise<{ authenticated: boolean; login?: string }>
  twitchAuthLogout: () => Promise<{ success: boolean }>
  youtubeAuthStart: () => Promise<{ success: boolean; login?: string; error?: string }>
  youtubeAuthStatus: () => Promise<{ authenticated: boolean; login?: string }>
  youtubeAuthLogout: () => Promise<{ success: boolean }>
  kickAuthStart: () => Promise<{ success: boolean; login?: string; error?: string }>
  kickAuthStatus: () => Promise<{ authenticated: boolean; login?: string; error?: string }>
  kickAuthLogout: () => Promise<{ success: boolean }>
  getQuickMessages: () => Promise<{ id: string; label: string; text: string }[]>
  saveQuickMessages: (
    messages: { id: string; label: string; text: string }[]
  ) => Promise<{ success: boolean }>
  getMutedUsers: () => Promise<{ id: string; username: string; platform: PlatformName }[]>
  saveMutedUsers: (
    mutedUsers: { id: string; username: string; platform: PlatformName }[]
  ) => Promise<{ success: boolean }>
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<{ success: boolean; error?: string; result?: unknown }>
  installUpdate: () => Promise<void>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
