import type { EventEmitter } from 'node:events';
import type { ChatMessage, Platform } from '../../shared/types';

export interface ChatConnector extends EventEmitter {
  readonly platform: Platform;
  readonly accountId: string;
  readonly accountLabel: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Publica una respuesta en el chat de origen. Devuelve false si la plataforma no lo permite. */
  reply(message: ChatMessage, text: string): Promise<boolean>;
  readonly canReply: boolean;
}

export type ConnectorEvents = {
  message: (m: ChatMessage) => void;
  status: (connected: boolean, info?: string) => void;
};
