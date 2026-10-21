import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import type { AppSettings, ChatMessage, StreamStartOptions, SuggestedAnswer } from '../shared/types';
import { loadSettings, saveSettings } from './store';
import { StreamEngine, resolveFfmpegPath } from './streaming/ffmpeg';
import { ChatAggregator } from './chat/aggregator';
import { suggestAnswer } from './autoanswer/engine';
import { youtubeLogin, YouTubeApi } from './chat/youtube';
import { facebookCreateLive } from './chat/facebook';

let win: BrowserWindow | null = null;
let settings: AppSettings = loadSettings();
const engine = new StreamEngine(resolveFfmpegPath(), path.join(app.getPath('videos'), 'QuiroHome Live'));
const chat = new ChatAggregator();
let facebookLiveId: string | undefined;

function send(channel: string, payload: unknown) {
  win?.webContents.send(channel, payload);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1380,
    height: 860,
    minWidth: 1024,
    minHeight: 700,
    title: 'QuiroHome Live',
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  win.on('closed', () => (win = null));
}

// ---- Transmisión -----------------------------------------------------------
engine.on('status', (s) => send('stream:status', s));
engine.on('log', (line: string) => send('stream:log', line));

ipcMain.handle('stream:start', (_e, opts: StreamStartOptions) => {
  engine.start(opts);
  return engine.getStatus();
});
ipcMain.on('stream:chunk', (_e, chunk: ArrayBuffer) => {
  engine.write(Buffer.from(chunk));
});
ipcMain.handle('stream:stop', () => {
  engine.stop();
  return engine.getStatus();
});
ipcMain.handle('stream:status', () => engine.getStatus());
ipcMain.handle('stream:openRecordings', () => shell.openPath(path.join(app.getPath('videos'), 'QuiroHome Live')));

// ---- Configuración ---------------------------------------------------------
ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:set', (_e, next: AppSettings) => {
  settings = next;
  saveSettings(settings);
  return settings;
});

// ---- Chat ------------------------------------------------------------------
chat.on('message', async (m: ChatMessage) => {
  send('chat:message', m);
  if (settings.autoAnswer.mode === 'off') return;
  const suggestion = await suggestAnswer(m, {
    faq: settings.faq,
    business: settings.business,
    useAi: settings.autoAnswer.useAi,
    anthropicApiKey: settings.autoAnswer.anthropicApiKey,
  });
  if (!suggestion) return;
  if (settings.autoAnswer.mode === 'auto') {
    await publishAnswer(m, suggestion);
  } else {
    send('chat:suggestion', suggestion);
  }
});
chat.on('status', (s) => send('chat:status', s));

async function publishAnswer(message: ChatMessage, suggestion: SuggestedAnswer) {
  let posted = false;
  if (settings.autoAnswer.postToChat) {
    try {
      posted = await chat.reply(message, suggestion.answer);
    } catch (err) {
      send('chat:status', { platform: message.platform, connected: true, message: `No se pudo responder: ${(err as Error).message}` });
    }
  }
  send('chat:answered', { message, suggestion, posted, overlay: settings.autoAnswer.showOverlay });
}

ipcMain.handle('chat:connect', async () => {
  await chat.connectAll(settings.chat, facebookLiveId);
  return chat.getStatuses();
});
ipcMain.handle('chat:disconnect', async () => {
  await chat.disconnectAll();
});
ipcMain.handle('chat:answer', async (_e, payload: { message: ChatMessage; suggestion: SuggestedAnswer }) => {
  await publishAnswer(payload.message, payload.suggestion);
});
ipcMain.handle('chat:manualQuestion', async (_e, payload: { platform: ChatMessage['platform']; text: string }) => {
  const m: ChatMessage = {
    id: `manual-${Date.now()}`,
    platform: payload.platform,
    author: 'Pregunta manual',
    text: payload.text,
    timestamp: Date.now(),
  };
  send('chat:message', m);
  const suggestion = await suggestAnswer(m, {
    faq: settings.faq,
    business: settings.business,
    useAi: settings.autoAnswer.useAi,
    anthropicApiKey: settings.autoAnswer.anthropicApiKey,
  });
  if (suggestion) send('chat:suggestion', suggestion);
  return suggestion;
});
ipcMain.handle('chat:canReply', (_e, platform: ChatMessage['platform']) => chat.canReply(platform));

// ---- Integraciones de plataformas -----------------------------------------
ipcMain.handle('youtube:login', async () => {
  const refreshToken = await youtubeLogin(settings.chat.youtube);
  settings.chat.youtube.refreshToken = refreshToken;
  saveSettings(settings);
  return true;
});
ipcMain.handle('youtube:streamKey', async () => {
  const api = new YouTubeApi(settings.chat.youtube);
  return api.getStreamKey();
});
ipcMain.handle('facebook:createLive', async (_e, title: string) => {
  const live = await facebookCreateLive(settings.chat.facebook, title);
  facebookLiveId = live.id;
  return live;
});
ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));
ipcMain.handle('app:ffmpegPath', () => resolveFfmpegPath());

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  engine.stop();
  void chat.disconnectAll();
  if (process.platform !== 'darwin') app.quit();
});

process.on('uncaughtException', (err) => {
  console.error(err);
  if (win) dialog.showErrorBox('Error inesperado', err.message);
});
