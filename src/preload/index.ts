import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { ChatMessage } from '../common/types/ChatMessage'
import { PlatformName, ConnectionStatus } from '../common/types/Platform'

// Custom APIs for renderer
const api = {
  // Listeners (Main -> Renderer)
  onChatMessage: (callback: (message: ChatMessage) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, message: ChatMessage): void => callback(message)
    ipcRenderer.on('chat:message', subscription)
    return (): void => {
      ipcRenderer.removeListener('chat:message', subscription)
    }
  },
  onConnectionStatus: (
    callback: (
      platform: PlatformName,
      status: ConnectionStatus,
      channelInfo?: string,
      error?: string
    ) => void
  ): (() => void) => {
    const subscription = (
      _event: IpcRendererEvent,
      platform: PlatformName,
      status: ConnectionStatus,
      channelInfo?: string,
      error?: string
    ): void => callback(platform, status, channelInfo, error)
    ipcRenderer.on('chat:status', subscription)
    return (): void => {
      ipcRenderer.removeListener('chat:status', subscription)
    }
  },
  onViewerCount: (
    callback: (platform: PlatformName, viewers: number, likeCount?: number) => void
  ): (() => void) => {
    const subscription = (
      _event: IpcRendererEvent,
      platform: PlatformName,
      viewers: number,
      likeCount?: number
    ): void => callback(platform, viewers, likeCount)
    ipcRenderer.on('chat:stats', subscription)
    return (): void => {
      ipcRenderer.removeListener('chat:stats', subscription)
    }
  },
  onOverlayStatus: (callback: (active: boolean) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, active: boolean): void => callback(active)
    ipcRenderer.on('chat:overlay-status', subscription)
    return (): void => {
      ipcRenderer.removeListener('chat:overlay-status', subscription)
    }
  },
  onMaximizedStatus: (callback: (isMaximized: boolean) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, isMaximized: boolean): void =>
      callback(isMaximized)
    ipcRenderer.on('window:maximized-status', subscription)
    return (): void => {
      ipcRenderer.removeListener('window:maximized-status', subscription)
    }
  },
  onTwitchAuthSuccess: (
    callback: (info: { login: string; userId: string }) => void
  ): (() => void) => {
    const subscription = (
      _event: IpcRendererEvent,
      info: { login: string; userId: string }
    ): void => callback(info)
    ipcRenderer.on('twitch:auth:success', subscription)
    return (): void => {
      ipcRenderer.removeListener('twitch:auth:success', subscription)
    }
  },
  onTwitchAuthError: (callback: (message: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on('twitch:auth:error', subscription)
    return (): void => {
      ipcRenderer.removeListener('twitch:auth:error', subscription)
    }
  },
  onUpdateAvailable: (callback: (version: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, version: string): void => callback(version)
    ipcRenderer.on('update:available', subscription)
    return (): void => {
      ipcRenderer.removeListener('update:available', subscription)
    }
  },
  onUpdateDownloaded: (callback: (version: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, version: string): void => callback(version)
    ipcRenderer.on('update:downloaded', subscription)
    return (): void => {
      ipcRenderer.removeListener('update:downloaded', subscription)
    }
  },
  onUpdateProgress: (callback: (percent: number) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, percent: number): void => callback(percent)
    ipcRenderer.on('update:progress', subscription)
    return (): void => {
      ipcRenderer.removeListener('update:progress', subscription)
    }
  },
  onUpdateError: (callback: (error: string) => void): (() => void) => {
    const subscription = (_event: IpcRendererEvent, error: string): void => callback(error)
    ipcRenderer.on('update:error', subscription)
    return (): void => {
      ipcRenderer.removeListener('update:error', subscription)
    }
  },

  // Actions (Renderer -> Main)
  connectTwitch: (channel: string, save: boolean) =>
    ipcRenderer.invoke('twitch:connect', channel, save),
  connectYouTube: (videoId: string, save: boolean, provider: string) =>
    ipcRenderer.invoke('youtube:connect', videoId, save, provider),
  connectKick: (slug: string, save: boolean) => ipcRenderer.invoke('kick:connect', slug, save),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  disconnect: (platform: PlatformName) => ipcRenderer.invoke('chat:disconnect', platform),
  toggleOverlay: () => ipcRenderer.invoke('window:toggleOverlay'),
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  resizeWindowHeight: (height: number) => ipcRenderer.invoke('window:resizeHeight', height),
  resizeWindow: (width: number, height: number) =>
    ipcRenderer.invoke('window:resize', width, height),
  sendMessage: (payload: { platforms: PlatformName[]; text: string }) =>
    ipcRenderer.invoke('chat:send', payload),
  twitchAuthStart: () => ipcRenderer.invoke('twitch:auth:start'),
  twitchAuthStatus: () => ipcRenderer.invoke('twitch:auth:status'),
  twitchAuthLogout: () => ipcRenderer.invoke('twitch:auth:logout'),
  youtubeAuthStart: () => ipcRenderer.invoke('youtube:auth:start'),
  youtubeAuthStatus: () => ipcRenderer.invoke('youtube:auth:status'),
  youtubeAuthLogout: () => ipcRenderer.invoke('youtube:auth:logout'),
  kickAuthStart: () => ipcRenderer.invoke('kick:auth:start'),
  kickAuthStatus: () => ipcRenderer.invoke('kick:auth:status'),
  kickAuthLogout: () => ipcRenderer.invoke('kick:auth:logout'),
  getQuickMessages: () => ipcRenderer.invoke('quickMessages:get'),
  saveQuickMessages: (messages: { id: string; label: string; text: string }[]) =>
    ipcRenderer.invoke('quickMessages:save', messages),
  getMutedUsers: () => ipcRenderer.invoke('mutedUsers:get'),
  saveMutedUsers: (mutedUsers: { id: string; username: string; platform: PlatformName }[]) =>
    ipcRenderer.invoke('mutedUsers:save', mutedUsers),
  getAppVersion: () => ipcRenderer.invoke('app:version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  getLogs: () => ipcRenderer.invoke('logs:get'),
  exportAndEmailLogs: (userInfo: string) => ipcRenderer.invoke('logs:export-email', userInfo)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
