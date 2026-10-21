// Tipos compartidos entre el proceso principal (Electron) y la interfaz (React).

export type Platform = 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'custom';

export type Orientation = 'vertical' | 'horizontal';

export interface StreamTarget {
  id: string;
  platform: Platform;
  name: string;
  /** URL RTMP/RTMPS del servidor de ingesta, sin la clave. */
  url: string;
  /** Clave de transmisión (stream key). */
  key: string;
  enabled: boolean;
}

export interface StreamStartOptions {
  targets: StreamTarget[];
  orientation: Orientation;
  width: number;
  height: number;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  /** Guardar una copia local de la transmisión. */
  recordLocally: boolean;
}

export type StreamState = 'idle' | 'starting' | 'live' | 'stopping' | 'error';

export interface StreamStatus {
  state: StreamState;
  message?: string;
  startedAt?: number;
  recordingPath?: string | null;
}

export interface ChatMessage {
  id: string;
  platform: Platform;
  author: string;
  text: string;
  timestamp: number;
  /** Datos necesarios para responder en la plataforma de origen. */
  replyRef?: string;
}

export type AnswerSource = 'faq' | 'ia' | 'manual';

export interface SuggestedAnswer {
  messageId: string;
  question: string;
  answer: string;
  source: AnswerSource;
  confidence: number;
  faqId?: string;
}

export interface FaqEntry {
  id: string;
  /** Pregunta modelo, ej. "¿Dónde queda?" */
  question: string;
  /** Palabras o frases que disparan esta respuesta. */
  keywords: string[];
  answer: string;
  enabled: boolean;
}

export type AutoAnswerMode = 'off' | 'suggest' | 'auto';

export interface BusinessInfo {
  name: string;
  address: string;
  howToGet: string;
  website: string;
  bookingUrl: string;
  phone: string;
  hours: string;
  services: string;
  extra: string;
}

export interface PlatformChatConfig {
  youtube: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
    refreshToken?: string;
  };
  facebook: {
    enabled: boolean;
    pageId: string;
    pageAccessToken: string;
  };
  instagram: {
    enabled: boolean;
    note?: string;
  };
  tiktok: {
    enabled: boolean;
    username: string;
    /** Cookie sessionid (opcional) para poder responder en el chat de TikTok. */
    sessionId?: string;
    ttTargetIdc?: string;
    /** API key de Euler Stream (opcional, mejora la estabilidad de la conexión). */
    signApiKey?: string;
  };
}

export interface AppSettings {
  /** Versión de los datos por defecto cargados (negocio y FAQ). */
  defaultsVersion?: number;
  orientation: Orientation;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  recordLocally: boolean;
  targets: StreamTarget[];
  chat: PlatformChatConfig;
  autoAnswer: {
    mode: AutoAnswerMode;
    /** Mostrar la respuesta como texto sobre el video (visible en todas las plataformas). */
    showOverlay: boolean;
    /** Publicar la respuesta en el chat de la plataforma cuando la API lo permita. */
    postToChat: boolean;
    useAi: boolean;
    anthropicApiKey: string;
    overlaySeconds: number;
  };
  business: BusinessInfo;
  faq: FaqEntry[];
}

export interface PlatformConnectionStatus {
  platform: Platform;
  connected: boolean;
  message?: string;
}
