import { EventEmitter } from 'node:events';
import http from 'node:http';
import { shell } from 'electron';
import type { ChatMessage } from '../../shared/types';
import type { ChatConnector } from './types';

const SCOPES = ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/youtube.force-ssl'];

export interface YouTubeCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

/**
 * Inicia sesión con Google abriendo el navegador. Devuelve el refresh token
 * para no tener que volver a iniciar sesión.
 */
export async function youtubeLogin(creds: YouTubeCredentials): Promise<string> {
  const { port, codePromise, close } = await startLoopbackServer();
  const redirectUri = `http://127.0.0.1:${port}/`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', creds.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('scope', SCOPES.join(' '));
  await shell.openExternal(url.toString());

  try {
    const code = await codePromise;
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const data = (await res.json()) as { refresh_token?: string; error_description?: string };
    if (!data.refresh_token) throw new Error(data.error_description ?? 'Google no devolvió refresh_token');
    return data.refresh_token;
  } finally {
    close();
  }
}

async function startLoopbackServer(): Promise<{ port: number; codePromise: Promise<string>; close: () => void }> {
  let resolveCode!: (c: string) => void;
  let rejectCode!: (e: Error) => void;
  const codePromise = new Promise<string>((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });
  const server = http.createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://127.0.0.1');
    const code = u.searchParams.get('code');
    const error = u.searchParams.get('error');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (code) {
      res.end('<h2>✅ Listo. Ya puedes volver a QuiroHome Live.</h2>');
      resolveCode(code);
    } else {
      res.end(`<h2>❌ Error: ${error ?? 'sin código'}</h2>`);
      rejectCode(new Error(error ?? 'Sin código de autorización'));
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const port = (server.address() as { port: number }).port;
  const timer = setTimeout(() => rejectCode(new Error('Tiempo de espera agotado al iniciar sesión')), 5 * 60_000);
  return {
    port,
    codePromise,
    close: () => {
      clearTimeout(timer);
      server.close();
    },
  };
}

export class YouTubeApi {
  private accessToken: string | null = null;
  private expiresAt = 0;

  constructor(private creds: YouTubeCredentials) {}

  private async token(): Promise<string> {
    if (this.accessToken && Date.now() < this.expiresAt - 30_000) return this.accessToken;
    if (!this.creds.refreshToken) throw new Error('YouTube: falta iniciar sesión con Google');
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.creds.clientId,
        client_secret: this.creds.clientSecret,
        refresh_token: this.creds.refreshToken,
        grant_type: 'refresh_token',
      }),
    });
    const data = (await res.json()) as { access_token?: string; expires_in?: number; error_description?: string };
    if (!data.access_token) throw new Error(`YouTube: ${data.error_description ?? 'no se pudo renovar el acceso'}`);
    this.accessToken = data.access_token;
    this.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
    return this.accessToken;
  }

  async request<T>(method: string, path: string, query: Record<string, string> = {}, body?: unknown): Promise<T> {
    const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const res = await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${await this.token()}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = (await res.json()) as T & { error?: { message: string } };
    if (!res.ok) throw new Error(`YouTube API: ${data.error?.message ?? res.statusText}`);
    return data;
  }

  /** Clave de transmisión del stream "por defecto" de la cuenta. */
  async getStreamKey(): Promise<{ url: string; key: string } | null> {
    const data = await this.request<{ items: Array<{ cdn: { ingestionInfo: { ingestionAddress: string; streamName: string } } }> }>(
      'GET', 'liveStreams', { part: 'cdn', mine: 'true', maxResults: '5' },
    );
    const s = data.items?.[0];
    if (!s) return null;
    return { url: s.cdn.ingestionInfo.ingestionAddress, key: s.cdn.ingestionInfo.streamName };
  }

  async getActiveLiveChatId(): Promise<string | null> {
    for (const status of ['active', 'upcoming']) {
      const data = await this.request<{ items: Array<{ snippet: { liveChatId?: string } }> }>(
        'GET', 'liveBroadcasts', { part: 'snippet', broadcastStatus: status, broadcastType: 'all', maxResults: '5' },
      );
      const id = data.items?.find((i) => i.snippet.liveChatId)?.snippet.liveChatId;
      if (id) return id;
    }
    return null;
  }
}

export class YouTubeChat extends EventEmitter implements ChatConnector {
  readonly platform = 'youtube' as const;
  readonly canReply = true;
  private api: YouTubeApi;
  private liveChatId: string | null = null;
  private pageToken: string | undefined;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private seen = new Set<string>();

  constructor(creds: YouTubeCredentials) {
    super();
    this.api = new YouTubeApi(creds);
  }

  async connect(): Promise<void> {
    this.running = true;
    this.emit('status', false, 'Buscando transmisión activa en YouTube…');
    await this.poll();
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    let wait = 5000;
    try {
      if (!this.liveChatId) {
        this.liveChatId = await this.api.getActiveLiveChatId();
        if (!this.liveChatId) {
          this.emit('status', false, 'YouTube: aún no hay transmisión activa (reintentando)');
          wait = 10_000;
        } else {
          this.emit('status', true, 'YouTube conectado');
        }
      }
      if (this.liveChatId) {
        const q: Record<string, string> = { part: 'snippet,authorDetails', liveChatId: this.liveChatId, maxResults: '200' };
        if (this.pageToken) q.pageToken = this.pageToken;
        const data = await this.api.request<{
          nextPageToken?: string;
          pollingIntervalMillis?: number;
          items: Array<{ id: string; snippet: { displayMessage?: string; publishedAt: string }; authorDetails: { displayName: string } }>;
        }>('GET', 'liveChatMessages', q);
        const first = !this.pageToken;
        this.pageToken = data.nextPageToken;
        wait = Math.max(data.pollingIntervalMillis ?? 5000, 3000);
        if (!first) {
          for (const item of data.items ?? []) {
            if (!item.snippet.displayMessage || this.seen.has(item.id)) continue;
            this.seen.add(item.id);
            const m: ChatMessage = {
              id: `yt-${item.id}`,
              platform: 'youtube',
              author: item.authorDetails.displayName,
              text: item.snippet.displayMessage,
              timestamp: Date.parse(item.snippet.publishedAt),
            };
            this.emit('message', m);
          }
        }
      }
    } catch (err) {
      this.emit('status', false, (err as Error).message);
      wait = 15_000;
    }
    if (this.running) this.timer = setTimeout(() => this.poll(), wait);
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.emit('status', false, 'YouTube desconectado');
  }

  async reply(_message: ChatMessage, text: string): Promise<boolean> {
    if (!this.liveChatId) return false;
    await this.api.request('POST', 'liveChatMessages', { part: 'snippet' }, {
      snippet: { liveChatId: this.liveChatId, type: 'textMessageEvent', textMessageDetails: { messageText: text.slice(0, 200) } },
    });
    return true;
  }
}
