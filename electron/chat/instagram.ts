import { EventEmitter } from 'node:events';
import type { ChatMessage } from '../../shared/types';
import type { ChatConnector } from './types';

/**
 * Instagram no ofrece una API pública para leer ni responder comentarios de un LIVE.
 * Este conector existe para que la interfaz muestre el estado con claridad y permita
 * ingresar preguntas a mano (el streamer las lee desde el celular y las escribe o dicta).
 * Las respuestas sí llegan a Instagram a través del texto sobre el video (overlay).
 */
export class InstagramChat extends EventEmitter implements ChatConnector {
  readonly platform = 'instagram' as const;
  readonly canReply = false;

  async connect(): Promise<void> {
    this.emit('status', false, 'Instagram: sin API de comentarios en vivo. Usa "Agregar pregunta manual".');
  }

  async disconnect(): Promise<void> {
    /* nada que cerrar */
  }

  async reply(_message: ChatMessage, _text: string): Promise<boolean> {
    return false;
  }
}
