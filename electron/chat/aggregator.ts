import { EventEmitter } from 'node:events';
import type { ChatMessage, Platform, PlatformChatConfig, PlatformConnectionStatus } from '../../shared/types';
import type { ChatConnector } from './types';
import { YouTubeChat } from './youtube';
import { FacebookChat } from './facebook';
import { TikTokChat } from './tiktok';
import { InstagramChat } from './instagram';

/** Une los chats de todas las plataformas en un solo flujo de mensajes. */
export class ChatAggregator extends EventEmitter {
  private connectors = new Map<Platform, ChatConnector>();
  private statuses = new Map<Platform, PlatformConnectionStatus>();

  async connectAll(cfg: PlatformChatConfig, facebookLiveId?: string): Promise<void> {
    await this.disconnectAll();
    const list: ChatConnector[] = [];
    if (cfg.youtube.enabled && cfg.youtube.clientId && cfg.youtube.refreshToken) list.push(new YouTubeChat(cfg.youtube));
    if (cfg.facebook.enabled && cfg.facebook.pageId && cfg.facebook.pageAccessToken) list.push(new FacebookChat(cfg.facebook, facebookLiveId));
    if (cfg.tiktok.enabled && cfg.tiktok.username) list.push(new TikTokChat(cfg.tiktok));
    if (cfg.instagram.enabled) list.push(new InstagramChat());

    for (const c of list) {
      this.connectors.set(c.platform, c);
      c.on('message', (m: ChatMessage) => this.emit('message', m));
      c.on('status', (connected: boolean, message?: string) => {
        const s = { platform: c.platform, connected, message };
        this.statuses.set(c.platform, s);
        this.emit('status', s);
      });
      c.connect().catch((err: Error) => this.emit('status', { platform: c.platform, connected: false, message: err.message }));
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

  canReply(platform: Platform): boolean {
    return this.connectors.get(platform)?.canReply ?? false;
  }

  async reply(message: ChatMessage, text: string): Promise<boolean> {
    const c = this.connectors.get(message.platform);
    if (!c) return false;
    return c.reply(message, text);
  }
}
