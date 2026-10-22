import { app, BrowserWindow, ipcMain, shell, dialog } from 'electron';
import path from 'node:path';
import type { AppSettings, BlockedUser, ChatAccount, ChatMessage, FaqEntry, StreamStartOptions, SuggestedAnswer } from '../shared/types';
import { loadSettings, saveSettings } from './store';
import { StreamEngine, resolveFfmpegPath } from './streaming/ffmpeg';
import { ChatAggregator } from './chat/aggregator';
import { suggestAnswer, keywordsFromQuestion, normalize } from './autoanswer/engine';
import { CommentLog } from './streaming/commentlog';
import { youtubeLogin, YouTubeApi } from './chat/youtube';
import { facebookCreateLive } from './chat/facebook';

let win: BrowserWindow | null = null;
let settings: AppSettings = loadSettings();
const engine = new StreamEngine(resolveFfmpegPath(), path.join(app.getPath('videos'), 'QuiroHome Live'));
const chat = new ChatAggregator();
const commentLog = new CommentLog();
/** Live videos creados por la app, por cuenta de Facebook. */
const facebookLiveIds: Record<string, string> = {};

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
      // El mezclador de audio arranca al abrir la app, sin esperar un clic.
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  if (process.env.VITE_DEV_SERVER_URL) {
    void win.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
  win.on('closed', () => (win = null));
  // Ventana de salida limpia (window.open desde la interfaz): misma sesión, sin menú.
  win.webContents.setWindowOpenHandler(() => ({
    action: 'allow',
    overrideBrowserWindowOptions: {
      title: 'QuiroHome Live · Salida',
      backgroundColor: '#000000',
      autoHideMenuBar: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    },
  }));
}

// ---- Transmisión -----------------------------------------------------------
engine.on('status', (s) => {
  send('stream:status', s);
  if (s.state === 'live' && s.recordingPath && s.startedAt && !commentLog.active) {
    commentLog.start(s.recordingPath, s.startedAt);
  }
  if ((s.state === 'idle' || s.state === 'error') && commentLog.active) {
    commentLog.stop();
  }
});
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
function engineOptions() {
  return {
    faq: settings.faq,
    business: settings.business,
    useAi: settings.autoAnswer.useAi,
    anthropicApiKey: settings.autoAnswer.anthropicApiKey,
    answerEverything: settings.autoAnswer.answerEverything,
    history: settings.answeredHistory,
  };
}

function isBlocked(m: ChatMessage): boolean {
  const a = normalize(m.author);
  return settings.blockedUsers.some((b) => b.platform === m.platform && normalize(b.author) === a);
}

/** Guarda la respuesta como aprendizaje: historial + nueva pregunta frecuente si fue editada o manual. */
function learn(message: ChatMessage, suggestion: SuggestedAnswer) {
  settings.answeredHistory = [...settings.answeredHistory, {
    question: message.text, answer: suggestion.answer, platform: message.platform, source: suggestion.source, timestamp: Date.now(),
  }].slice(-300);

  if (settings.autoAnswer.learnFromAnswers) {
    const original = suggestion.faqId ? settings.faq.find((f) => f.id === suggestion.faqId) : undefined;
    const isSocial = suggestion.faqId?.startsWith('social-');
    const unchanged = original && normalize(original.answer) === normalize(suggestion.answer);
    if (!isSocial && !unchanged && suggestion.answer.trim()) {
      const keywords = keywordsFromQuestion(message.text);
      if (keywords.length > 0) {
        const entry: FaqEntry = {
          id: `aprendida-${Date.now()}`,
          question: message.text.slice(0, 120),
          keywords,
          answer: suggestion.answer,
          enabled: true,
        };
        settings.faq = [...settings.faq, entry];
        send('faq:learned', entry);
      }
    }
  }
  saveSettings(settings);
  send('settings:changed', settings);
}

/** Última respuesta automática por persona, para no contestar cada "hola" de la misma persona. */
const lastAutoReply = new Map<string, number>();

chat.on('message', async (m: ChatMessage) => {
  if (isBlocked(m)) return;
  send('chat:message', m);
  commentLog.add(m);
  if (settings.autoAnswer.mode === 'off') return;
  const suggestion = await suggestAnswer(m, engineOptions());
  if (!suggestion) return;
  if (settings.autoAnswer.mode === 'auto') {
    const key = `${m.platform}:${normalize(m.author)}`;
    const isSocial = suggestion.faqId?.startsWith('social-');
    const last = lastAutoReply.get(key) ?? 0;
    // Saludos y gracias: como mucho una respuesta por persona cada 10 minutos.
    if (isSocial && Date.now() - last < 10 * 60_000) return;
    lastAutoReply.set(key, Date.now());
  }
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
  commentLog.add(message, suggestion.answer);
  learn(message, suggestion);
}

ipcMain.handle('chat:connect', async () => {
  await chat.connectAll(settings.accounts, facebookLiveIds);
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
    accountId: 'manual',
    accountLabel: 'Manual',
    author: 'Pregunta manual',
    text: payload.text,
    timestamp: Date.now(),
  };
  send('chat:message', m);
  commentLog.add(m);
  const suggestion = await suggestAnswer(m, engineOptions());
  if (suggestion) send('chat:suggestion', suggestion);
  return suggestion;
});
ipcMain.handle('chat:block', (_e, user: { platform: ChatMessage['platform']; author: string }) => {
  const entry: BlockedUser = { platform: user.platform, author: user.author, blockedAt: Date.now() };
  if (!settings.blockedUsers.some((b) => b.platform === entry.platform && normalize(b.author) === normalize(entry.author))) {
    settings.blockedUsers = [...settings.blockedUsers, entry];
    saveSettings(settings);
  }
  send('settings:changed', settings);
  return settings.blockedUsers;
});
ipcMain.handle('chat:unblock', (_e, user: { platform: ChatMessage['platform']; author: string }) => {
  settings.blockedUsers = settings.blockedUsers.filter((b) => !(b.platform === user.platform && normalize(b.author) === normalize(user.author)));
  saveSettings(settings);
  send('settings:changed', settings);
  return settings.blockedUsers;
});
ipcMain.handle('chat:canReply', (_e, accountId: string) => chat.canReply(accountId));

// ---- Integraciones de plataformas -----------------------------------------
function findAccount<T extends ChatAccount['platform']>(id: string, platform: T) {
  const a = settings.accounts.find((x) => x.id === id && x.platform === platform);
  if (!a) throw new Error('Cuenta no encontrada. Guarda la cuenta en Ajustes primero.');
  return a as Extract<ChatAccount, { platform: T }>;
}

ipcMain.handle('youtube:login', async (_e, accountId: string) => {
  const account = findAccount(accountId, 'youtube');
  const refreshToken = await youtubeLogin(account);
  settings.accounts = settings.accounts.map((a) => (a.id === accountId ? { ...a, refreshToken } : a));
  saveSettings(settings);
  send('settings:changed', settings);
  return true;
});
ipcMain.handle('youtube:streamKey', async (_e, accountId: string) => {
  const api = new YouTubeApi(findAccount(accountId, 'youtube'));
  return api.getStreamKey();
});
ipcMain.handle('facebook:createLive', async (_e, payload: { accountId: string; title: string }) => {
  const live = await facebookCreateLive(findAccount(payload.accountId, 'facebook'), payload.title);
  facebookLiveIds[payload.accountId] = live.id;
  return live;
});
ipcMain.handle('app:openExternal', (_e, url: string) => shell.openExternal(url));
ipcMain.handle('app:ffmpegPath', () => resolveFfmpegPath());

/** Elige un archivo de audio propio para usarlo como efecto. */
ipcMain.handle('sounds:pick', async () => {
  const r = await dialog.showOpenDialog({
    title: 'Elegir sonido',
    filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'] }],
    properties: ['openFile', 'multiSelections'],
  });
  return r.canceled ? [] : r.filePaths;
});
ipcMain.handle('sounds:read', async (_e, filePath: string) => {
  const fs = await import('node:fs/promises');
  const data = await fs.readFile(filePath);
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
});

/** Silencia o reactiva los parlantes del computador (para cortar acoples). */
ipcMain.handle('app:setSystemMute', async (_e, muted: boolean) => {
  const { execFile } = await import('node:child_process');
  const run = (cmd: string, args: string[]) =>
    new Promise<boolean>((resolve) => execFile(cmd, args, (err) => resolve(!err)));
  if (process.platform === 'darwin') {
    return run('osascript', ['-e', `set volume output muted ${muted ? 'true' : 'false'}`]);
  }
  if (process.platform === 'win32') {
    // Alterna el silencio con la tecla multimedia (no hay forma directa sin dependencias).
    const ps = '(New-Object -ComObject WScript.Shell).SendKeys([char]173)';
    return run('powershell', ['-NoProfile', '-Command', ps]);
  }
  return run('pactl', ['set-sink-mute', '@DEFAULT_SINK@', muted ? '1' : '0']);
});

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
