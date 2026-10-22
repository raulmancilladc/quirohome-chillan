import { EventEmitter } from 'node:events';
import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import type { ChatMessage, TikTokAccount } from '../../shared/types';
import type { ChatConnector } from './types';

export interface TikTokCredentials {
  username: string;
  sessionId?: string;
  ttTargetIdc?: string;
  signApiKey?: string;
}

/**
 * Lee el chat de TikTok LIVE a través de una conexión no oficial (tiktok-live-connector).
 * Responder en el chat solo es posible si se entrega la cookie de sesión.
 */
export class TikTokChat extends EventEmitter implements ChatConnector {
  readonly platform = 'tiktok' as const;
  readonly canReply: boolean;
  readonly accountId: string;
  readonly accountLabel: string;
  private creds: TikTokCredentials;
  private conn: TikTokLiveConnection | null = null;
  private retry: NodeJS.Timeout | null = null;
  private running = false;

  constructor(account: TikTokAccount) {
    super();
    this.accountId = account.id;
    this.accountLabel = account.label;
    this.creds = account;
    this.canReply = Boolean(account.sessionId && account.ttTargetIdc);
  }

  private seen = new Set<string>();

  async connect(): Promise<void> {
    this.running = true;
    // Cerrar la conexión anterior antes de abrir otra (si no, llegan mensajes duplicados).
    if (this.conn) {
      const old = this.conn;
      this.conn = null;
      try {
        old.removeAllListeners();
        await old.disconnect();
      } catch {
        /* ya estaba cerrada */
      }
    }
    const username = this.creds.username.replace(/^@/, '').trim();
    const session = this.canReply
      ? { cookie: { type: 'cookie' as const, value: { sessionId: this.creds.sessionId!, ttTargetIdc: this.creds.ttTargetIdc! } } }
      : undefined;

    const base = {
      processInitialData: false,
      enableExtendedGiftInfo: false,
      signApiKey: this.creds.signApiKey || undefined,
    };
    const conn = session
      ? new TikTokLiveConnection(username, { ...base, session, authenticateWs: true })
      : new TikTokLiveConnection(username, base);
    this.conn = conn;

    conn.on(WebcastEvent.CHAT, (data) => {
      if (!data.content) return;
      const msgId = data.common?.msgId;
      if (msgId) {
        if (this.seen.has(msgId)) return;
        this.seen.add(msgId);
        if (this.seen.size > 5000) this.seen.clear();
      }
      const m: ChatMessage = {
        id: `tt-${this.accountId}-${data.common?.msgId ?? `${Date.now()}-${Math.random()}`}`,
        platform: 'tiktok',
        accountId: this.accountId,
        accountLabel: this.accountLabel,
        author: data.user?.nickname || data.user?.displayId || 'Usuario de TikTok',
        text: data.content,
        timestamp: Date.now(),
      };
      this.emit('message', m);
    });
    conn.on(ControlEvent.CONNECTED, () => {
      this.emit('status', true, 'TikTok conectado');
    });
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.conn !== conn) return; // conexión antigua: ignorar
      this.emit('status', false, 'TikTok desconectado');
      this.scheduleRetry();
    });
    conn.on(ControlEvent.ERROR, (err: unknown) => {
      this.emit('status', false, `TikTok: ${(err as Error)?.message ?? String(err)}`);
    });

    try {
      await conn.connect();
    } catch (err) {
      this.emit('status', false, `TikTok: ${(err as Error).message} (¿ya estás en vivo?)`);
      this.scheduleRetry();
    }
  }

  private scheduleRetry() {
    if (!this.running || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      if (this.running) void this.connect();
    }, 15_000);
  }

  async disconnect(): Promise<void> {
    this.running = false;
    if (this.retry) clearTimeout(this.retry);
    try {
      await this.conn?.disconnect();
    } catch {
      /* ignorar */
    }
    this.conn = null;
  }

  async reply(_message: ChatMessage, text: string): Promise<boolean> {
    if (!this.canReply || !this.conn) return false;
    await this.conn.sendMessage(text);
    return true;
  }
}
