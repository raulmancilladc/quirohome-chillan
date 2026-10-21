import { EventEmitter } from 'node:events';
import type { ChatAccount, ChatMessage, PlatformConnectionStatus } from '../../shared/types';
import type { ChatConnector } from './types';
import { YouTubeChat } from './youtube';
import { FacebookChat } from './facebook';
import { TikTokChat } from './tiktok';
import { InstagramChat } from './instagram';

/** Une los chats de todas las cuentas (varias por plataforma) en un solo flujo de mensajes. */
export class ChatAggregator extends EventEmitter {
  private connectors = new Map<string, ChatConnector>();
  private statuses = new Map<string, PlatformConnectionStatus>();

  async connectAll(accounts: ChatAccount[], facebookLiveIds: Record<string, string> = {}): Promise<void> {
    await this.disconnectAll();
    const list: ChatConnector[] = [];
    for (const a of accounts) {
      if (!a.enabled) continue;
      if (a.platform === 'youtube' && a.clientId && a.refreshToken) list.push(new YouTubeChat(a));
      if (a.platform === 'facebook' && a.pageId && a.pageAccessToken) list.push(new FacebookChat(a, facebookLiveIds[a.id]));
      if (a.platform === 'tiktok' && a.username) list.push(new TikTokChat(a));
      if (a.platform === 'instagram') list.push(new InstagramChat(a));
    }

    for (const c of list) {
      this.connectors.set(c.accountId, c);
      c.on('message', (m: ChatMessage) => this.emit('message', m));
      c.on('status', (connected: boolean, message?: string) => {
        const s: PlatformConnectionStatus = { platform: c.platform, accountId: c.accountId, accountLabel: c.accountLabel, connected, message };
        this.statuses.set(c.accountId, s);
        this.emit('status', s);
      });
      c.connect().catch((err: Error) =>
        this.emit('status', { platform: c.platform, accountId: c.accountId, accountLabel: c.accountLabel, connected: false, message: err.message }),
      );
    }
  }

  async disconnectAll(): Promise<void> {
    for (const c of this.connectors.values()) await c.disconnect();
    this.connectors.clear();
    this.statuses.clear();
  }

  getStatuses(): PlatformConnectionStatus[] {
    return [...this.statuses.values()];
  }

  canReply(accountId: string): boolean {
    return this.connectors.get(accountId)?.canReply ?? false;
  }

  async reply(message: ChatMessage, text: string): Promise<boolean> {
    const c = this.connectors.get(message.accountId);
    if (!c) return false;
    return c.reply(message, text);
  }
}
