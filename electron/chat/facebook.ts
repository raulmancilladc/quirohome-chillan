import { EventEmitter } from 'node:events';
import type { ChatMessage, FacebookAccount } from '../../shared/types';
import type { ChatConnector } from './types';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface FacebookCredentials {
  pageId: string;
  pageAccessToken: string;
}

async function graph<T>(path: string, token: string, params: Record<string, string> = {}, method = 'GET'): Promise<T> {
  const url = new URL(`${GRAPH}/${path}`);
  url.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { method });
  const data = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok || data.error) throw new Error(`Facebook: ${data.error?.message ?? res.statusText}`);
  return data;
}

/**
 * Crea un "live video" en la página y devuelve la URL RTMPS con la clave.
 * Así el usuario no tiene que copiar la clave desde Facebook cada vez.
 */
export async function facebookCreateLive(creds: FacebookCredentials, title: string): Promise<{ id: string; url: string; key: string }> {
  const data = await graph<{ id: string; secure_stream_url: string }>(
    `${creds.pageId}/live_videos`, creds.pageAccessToken,
    { status: 'LIVE_NOW', title },
    'POST',
  );
  const full = data.secure_stream_url;
  const idx = full.lastIndexOf('/');
  return { id: data.id, url: full.slice(0, idx), key: full.slice(idx + 1) };
}

export class FacebookChat extends EventEmitter implements ChatConnector {
  readonly platform = 'facebook' as const;
  readonly canReply = true;
  readonly accountId: string;
  readonly accountLabel: string;
  private creds: FacebookCredentials;
  private liveVideoId: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private seen = new Set<string>();
  private since = Math.floor(Date.now() / 1000);

  constructor(account: FacebookAccount, liveVideoId?: string) {
    super();
    this.accountId = account.id;
    this.accountLabel = account.label;
    this.creds = account;
    this.liveVideoId = liveVideoId ?? null;
  }

  async connect(): Promise<void> {
    this.running = true;
    this.emit('status', false, 'Buscando transmisión activa en Facebook…');
    await this.poll();
  }

  private async findLive(): Promise<string | null> {
    const data = await graph<{ data: Array<{ id: string; status: string }> }>(
      `${this.creds.pageId}/live_videos`, this.creds.pageAccessToken,
      { fields: 'id,status', broadcast_status: '["LIVE"]', limit: '1' },
    );
    return data.data?.[0]?.id ?? null;
  }

  private async poll(): Promise<void> {
    if (!this.running) return;
    let wait = 4000;
    try {
      if (!this.liveVideoId) {
        this.liveVideoId = await this.findLive();
        if (!this.liveVideoId) {
          this.emit('status', false, 'Facebook: aún no hay transmisión activa (reintentando)');
          wait = 10_000;
        } else {
          this.emit('status', true, 'Facebook conectado');
        }
      }
      if (this.liveVideoId) {
        const data = await graph<{ data: Array<{ id: string; message: string; created_time: string; from?: { name: string } }> }>(
          `${this.liveVideoId}/comments`, this.creds.pageAccessToken,
          { fields: 'id,message,created_time,from', live_filter: 'no_filter', order: 'chronological', since: String(this.since), limit: '100' },
        );
        for (const c of data.data ?? []) {
          if (!c.message || this.seen.has(c.id)) continue;
          this.seen.add(c.id);
          const ts = Date.parse(c.created_time);
          this.since = Math.max(this.since, Math.floor(ts / 1000) - 1);
          const m: ChatMessage = {
            id: `fb-${this.accountId}-${c.id}`,
            platform: 'facebook',
            accountId: this.accountId,
            accountLabel: this.accountLabel,
            author: c.from?.name ?? 'Usuario de Facebook',
            text: c.message,
            timestamp: ts,
            replyRef: c.id,
          };
          this.emit('message', m);
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
    this.emit('status', false, 'Facebook desconectado');
  }

  async reply(message: ChatMessage, text: string): Promise<boolean> {
    if (!message.replyRef) return false;
    await graph(`${message.replyRef}/comments`, this.creds.pageAccessToken, { message: text }, 'POST');
    return true;
  }
}
