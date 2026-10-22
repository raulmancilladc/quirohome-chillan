// Tipos compartidos entre el proceso principal (Electron) y la interfaz (React).

export type Platform = 'youtube' | 'facebook' | 'instagram' | 'tiktok' | 'custom';

export type Orientation = 'vertical' | 'horizontal';

export interface StreamTarget {
  id: string;
  platform: Platform;
  name: string;
  /** Cuenta asociada (para obtener la clave automáticamente), opcional. */
  accountId?: string;
  /** URL RTMP/RTMPS del servidor de ingesta, sin la clave. */
  url: string;
  /** Clave de transmisión (stream key). */
  key: string;
  enabled: boolean;
}

export interface StreamStartOptions {
  targets: StreamTarget[];
  recordingQuality: RecordingQuality;
  hardwareEncoder: boolean;
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
  /** Cuenta por la que llegó el mensaje (una plataforma puede tener varias). */
  accountId: string;
  accountLabel: string;
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

interface ChatAccountBase {
  id: string;
  /** Nombre para reconocerla, ej. "@raulmancilladc" o "QuiroHome Chillán". */
  label: string;
  enabled: boolean;
}
export interface YouTubeAccount extends ChatAccountBase {
  platform: 'youtube';
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}
export interface FacebookAccount extends ChatAccountBase {
  platform: 'facebook';
  pageId: string;
  pageAccessToken: string;
}
export interface TikTokAccount extends ChatAccountBase {
  platform: 'tiktok';
  username: string;
  /** Cookie sessionid (opcional) para poder responder en el chat de TikTok. */
  sessionId?: string;
  ttTargetIdc?: string;
  /** API key de Euler Stream (opcional, mejora la estabilidad de la conexión). */
  signApiKey?: string;
}
export interface InstagramAccount extends ChatAccountBase {
  platform: 'instagram';
}
export type ChatAccount = YouTubeAccount | FacebookAccount | TikTokAccount | InstagramAccount;

export interface BlockedUser {
  platform: Platform;
  author: string;
  blockedAt: number;
}

/** Respuesta aprobada o escrita por el streamer; sirve para aprender. */
export interface AnsweredRecord {
  question: string;
  answer: string;
  platform: Platform;
  source: AnswerSource;
  timestamp: number;
}

export type RecordingQuality = 'stream' | 'high';

/** 'light' baja resolución interna, fps y resolución de cámara para Macs cargados. */
export type PerformanceMode = 'normal' | 'light';
export type CameraMax = '1080p' | '4k';

export interface SourceSettings {
  camId: string;
  pipCamId: string;
  micId: string;
  mirror: boolean;
  fit: 'cover' | 'contain';
  zoom: number;
  rotation: number;
  background: 'blur' | 'dark' | 'brand';
}

export type TitleStyle = 'titulo' | 'tercio' | 'banda' | 'burbuja' | 'cinta';
export type TitlePosition = 'arriba' | 'centro' | 'abajo';
export type TitleFont = 'Poppins' | 'Bebas Neue' | 'Playfair Display' | 'Montserrat' | 'Pacifico' | 'Oswald' | 'Lobster' | 'Anton' | 'Caveat' | 'Righteous';

/** Texto que se muestra sobre el video (título, nombre, aviso, etc.). */
export interface TitleOverlay {
  id: string;
  text: string;
  subtext: string;
  style: TitleStyle;
  font: TitleFont;
  position: TitlePosition;
  color: string;
  accent: string;
  /** Segundos en pantalla; 0 = hasta que lo ocultes. */
  seconds: number;
  /** Tecla rápida: Shift + número (1-9). */
  hotkey?: number;
}

export interface SoundEffect {
  id: string;
  name: string;
  /** 'builtin-...' para los incluidos; ruta de archivo para los propios. */
  source: string;
  /** Tecla rápida: una letra. */
  hotkey?: string;
  emoji: string;
}

export interface AppSettings {
  /** Versión de los datos por defecto cargados (negocio y FAQ). */
  defaultsVersion?: number;
  titles: TitleOverlay[];
  sounds: SoundEffect[];
  sfxVolume: number;
  /** Escuchar los efectos también por los parlantes (cuidado con el acople). */
  sfxMonitor: boolean;
  /** Cámaras, micrófono y encuadre elegidos la última vez. */
  sources?: SourceSettings;
  orientation: Orientation;
  fps: number;
  videoBitrateKbps: number;
  audioBitrateKbps: number;
  recordLocally: boolean;
  /** 'high' graba un archivo aparte en alta calidad (ideal para sacar reels). */
  recordingQuality: RecordingQuality;
  performance: PerformanceMode;
  cameraMax: CameraMax;
  /** Usar el codificador de hardware (VideoToolbox / NVENC / QuickSync) si está disponible. */
  hardwareEncoder: boolean;
  /** Mostrar los comentarios del público sobre el video (quedan en la grabación). */
  showCommentsOnVideo: boolean;
  blockedUsers: BlockedUser[];
  /** Historial de respuestas dadas (las últimas), para aprender. */
  answeredHistory: AnsweredRecord[];
  targets: StreamTarget[];
  /** Cuentas conectadas para leer y responder chats (varias por plataforma). */
  accounts: ChatAccount[];
  autoAnswer: {
    mode: AutoAnswerMode;
    /** Mostrar la respuesta como texto sobre el video (visible en todas las plataformas). */
    showOverlay: boolean;
    /** Publicar la respuesta en el chat de la plataforma cuando la API lo permita. */
    postToChat: boolean;
    useAi: boolean;
    anthropicApiKey: string;
    overlaySeconds: number;
    /** Responder también saludos, agradecimientos y comentarios que no son preguntas. */
    answerEverything: boolean;
    /** Guardar como pregunta frecuente cada respuesta editada o escrita a mano. */
    learnFromAnswers: boolean;
  };
  business: BusinessInfo;
  faq: FaqEntry[];
}

export interface PlatformConnectionStatus {
  platform: Platform;
  accountId: string;
  accountLabel: string;
  connected: boolean;
  message?: string;
}
