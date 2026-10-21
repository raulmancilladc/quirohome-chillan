import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings, BlockedUser, ChatMessage, FaqEntry, Platform, PlatformConnectionStatus, StreamStartOptions, StreamStatus, SuggestedAnswer,
} from '../shared/types';

export interface AnsweredEvent {
  message: ChatMessage;
  suggestion: SuggestedAnswer;
  posted: boolean;
  overlay: boolean;
}

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_: unknown, payload: T) => cb(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api = {
  stream: {
    start: (opts: StreamStartOptions): Promise<StreamStatus> => ipcRenderer.invoke('stream:start', opts),
    chunk: (buf: ArrayBuffer): void => ipcRenderer.send('stream:chunk', buf),
    stop: (): Promise<StreamStatus> => ipcRenderer.invoke('stream:stop'),
    status: (): Promise<StreamStatus> => ipcRenderer.invoke('stream:status'),
    openRecordings: (): Promise<string> => ipcRenderer.invoke('stream:openRecordings'),
    onStatus: (cb: (s: StreamStatus) => void) => on<StreamStatus>('stream:status', cb),
    onLog: (cb: (line: string) => void) => on<string>('stream:log', cb),
  },
  settings: {
    get: (): Promise<AppSettings> => ipcRenderer.invoke('settings:get'),
    set: (s: AppSettings): Promise<AppSettings> => ipcRenderer.invoke('settings:set', s),
    onChanged: (cb: (s: AppSettings) => void) => on<AppSettings>('settings:changed', cb),
  },
  chat: {
    connect: (): Promise<PlatformConnectionStatus[]> => ipcRenderer.invoke('chat:connect'),
    disconnect: (): Promise<void> => ipcRenderer.invoke('chat:disconnect'),
    answer: (message: ChatMessage, suggestion: SuggestedAnswer): Promise<void> => ipcRenderer.invoke('chat:answer', { message, suggestion }),
    manualQuestion: (platform: Platform, text: string): Promise<SuggestedAnswer | null> => ipcRenderer.invoke('chat:manualQuestion', { platform, text }),
    canReply: (platform: Platform): Promise<boolean> => ipcRenderer.invoke('chat:canReply', platform),
    block: (platform: Platform, author: string): Promise<BlockedUser[]> => ipcRenderer.invoke('chat:block', { platform, author }),
    unblock: (platform: Platform, author: string): Promise<BlockedUser[]> => ipcRenderer.invoke('chat:unblock', { platform, author }),
    onLearned: (cb: (f: FaqEntry) => void) => on<FaqEntry>('faq:learned', cb),
    onMessage: (cb: (m: ChatMessage) => void) => on<ChatMessage>('chat:message', cb),
    onSuggestion: (cb: (s: SuggestedAnswer) => void) => on<SuggestedAnswer>('chat:suggestion', cb),
    onAnswered: (cb: (e: AnsweredEvent) => void) => on<AnsweredEvent>('chat:answered', cb),
    onStatus: (cb: (s: PlatformConnectionStatus) => void) => on<PlatformConnectionStatus>('chat:status', cb),
  },
  youtube: {
    login: (): Promise<boolean> => ipcRenderer.invoke('youtube:login'),
    streamKey: (): Promise<{ url: string; key: string } | null> => ipcRenderer.invoke('youtube:streamKey'),
  },
  facebook: {
    createLive: (title: string): Promise<{ id: string; url: string; key: string }> => ipcRenderer.invoke('facebook:createLive', title),
  },
  app: {
    openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
    ffmpegPath: (): Promise<string> => ipcRenderer.invoke('app:ffmpegPath'),
    setSystemMute: (muted: boolean): Promise<boolean> => ipcRenderer.invoke('app:setSystemMute', muted),
  },
};

export type QuiroLiveApi = typeof api;
contextBridge.exposeInMainWorld('quirolive', api);
