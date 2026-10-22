import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, BusinessInfo, ChatAccount } from '../shared/types';
import defaultFaq from './autoanswer/faq.default.json';

const FILE = () => path.join(app.getPath('userData'), 'settings.json');

/** Sube este número cuando cambien los datos por defecto del negocio o las FAQ. */
const DEFAULTS_VERSION = 3;

export const defaultSettings = (): AppSettings => ({
  defaultsVersion: DEFAULTS_VERSION,
  orientation: 'vertical',
  fps: 30,
  videoBitrateKbps: 3500,
  audioBitrateKbps: 128,
  recordLocally: true,
  recordingQuality: 'high',
  titles: [
    { id: 't-nombre', text: 'Raúl Mancilla', subtext: 'Quiropráctico · Kinesiólogo · QuiroHome', style: 'tercio', font: 'Poppins', position: 'abajo', color: '#ffffff', accent: '#6bc048', seconds: 10, hotkey: 1 },
    { id: 't-agenda', text: 'Agenda tu hora', subtext: 'quirohome.cl/agenda-tu-cita', style: 'banda', font: 'Montserrat', position: 'arriba', color: '#ffffff', accent: '#1b3a5c', seconds: 15, hotkey: 2 },
    { id: 't-pregunta', text: '¿Qué te duele?', subtext: 'Escríbelo en el chat', style: 'burbuja', font: 'Caveat', position: 'centro', color: '#1b3a5c', accent: '#ffffff', seconds: 12, hotkey: 3 },
    { id: 't-whatsapp', text: 'WhatsApp', subtext: 'Santiago +56 9 7630 3081 · Chillán +56 9 8630 2937', style: 'cinta', font: 'Oswald', position: 'abajo', color: '#ffffff', accent: '#6bc048', seconds: 20, hotkey: 4 },
    { id: 't-bienvenida', text: '¡Bienvenidos!', subtext: '', style: 'titulo', font: 'Bebas Neue', position: 'centro', color: '#ffffff', accent: '#6bc048', seconds: 6, hotkey: 5 },
  ],
  sounds: [
    { id: 'builtin-tada', name: 'Tadá', source: 'builtin-tada', hotkey: 'q', emoji: '🎉' },
    { id: 'builtin-aplausos', name: 'Aplausos', source: 'builtin-aplausos', hotkey: 'w', emoji: '👏' },
    { id: 'builtin-ding', name: 'Campanita', source: 'builtin-ding', hotkey: 'e', emoji: '🔔' },
    { id: 'builtin-tambor', name: 'Tambor', source: 'builtin-tambor', hotkey: 'r', emoji: '🥁' },
    { id: 'builtin-risa', name: 'Risa', source: 'builtin-risa', hotkey: 't', emoji: '😄' },
    { id: 'builtin-error', name: 'Error', source: 'builtin-error', hotkey: 'y', emoji: '❌' },
    { id: 'builtin-silbato', name: 'Silbato', source: 'builtin-silbato', hotkey: 'u', emoji: '📣' },
    { id: 'builtin-latido', name: 'Latido', source: 'builtin-latido', hotkey: 'i', emoji: '❤️' },
  ],
  sfxVolume: 0.8,
  sfxMonitor: false,
  performance: 'normal',
  cameraMax: '1080p',
  hardwareEncoder: true,
  showCommentsOnVideo: true,
  blockedUsers: [],
  answeredHistory: [],
  targets: [
    { id: 'youtube', platform: 'youtube', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', key: '', enabled: false },
    { id: 'facebook', platform: 'facebook', name: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp', key: '', enabled: false },
    { id: 'instagram', platform: 'instagram', name: 'Instagram', url: 'rtmps://live-upload.instagram.com:443/rtmp', key: '', enabled: false },
    { id: 'tiktok', platform: 'tiktok', name: 'TikTok', url: '', key: '', enabled: false },
  ],
  accounts: [],
  autoAnswer: {
    mode: 'suggest',
    showOverlay: true,
    postToChat: true,
    useAi: false,
    anthropicApiKey: '',
    overlaySeconds: 12,
    answerEverything: true,
    learnFromAnswers: true,
  },
  business: {
    name: 'QuiroHome',
    address: 'Santiago: Pérez Valenzuela 1276, Providencia. Chillán: El Roble 224',
    howToGet:
      'Providencia: a una cuadra del metro Manuel Montt (línea 1); sin estacionamiento propio, hay parquímetros en Manuel Montt y el SABA de Av. Providencia. Chillán: El Roble 224, a pasos de Av. O\'Higgins, con estacionamiento en el lugar',
    website: 'quirohome.cl',
    bookingUrl: 'quirohome.cl/agenda-tu-cita',
    phone: 'Santiago +56 9 7630 3081 · Chillán +56 9 8630 2937',
    hours: 'Lunes a viernes 8:20 a 19:30 (Chillán desde 8:55), sábados 8:20 a 14:10. Domingos cerrado',
    services:
      'Quiropraxia (ingreso con evaluación completa $33.000 promocional, control $33.000, sesión con Raúl Mancilla en Providencia $40.000), kinesiología (Chillán, $20.000, plan de 10 por $180.000, convenio Fonasa), masaje descontracturante 45 min $30.000, masaje tren superior/inferior 25 min, masoterapia maxilofacial para bruxismo, osteopatía (Chillán $30.000), rehabilitación de piso pélvico (Chillán $30.000). Tratamos hernias discales, lumbago, ciática, cervicalgia, contracturas, túnel carpiano, manguito rotador, fascitis plantar, tendinopatías y sobrecarga postural',
    extra:
      'Raúl Mancilla es quiropráctico, kinesiólogo y entrenador deportivo, fundador de QuiroHome; atiende en Providencia. Equipo de quiroprácticos y kinesiólogos universitarios y titulados; nunca usar los títulos "Doctor", "Dr." ni "DC". No prometer curas ni resultados; todo parte con una evaluación. No dar horas disponibles al aire (la agenda cambia sola), no diagnosticar por pantalla, no prometer cantidad de sesiones, no ofrecer nada gratis. Atendemos desde los 14 años con adulto responsable. Llegar 10 minutos antes; el pago es en el centro. No se atiende (se deriva al médico) fractura o esguince reciente, accidente reciente, cáncer, infección activa, pérdida de control de esfínteres con debilidad en piernas. Instagram: @quirohome (Santiago), @quirohomechillan (Chillán), @raulmancilladc',
  },
  faq: defaultFaq as AppSettings['faq'],
});

/** Formato antiguo: una sola cuenta por plataforma. */
interface LegacyChat {
  youtube?: { enabled: boolean; clientId: string; clientSecret: string; refreshToken?: string };
  facebook?: { enabled: boolean; pageId: string; pageAccessToken: string };
  instagram?: { enabled: boolean };
  tiktok?: { enabled: boolean; username: string; sessionId?: string; ttTargetIdc?: string; signApiKey?: string };
}

function migrateLegacyChat(chat?: LegacyChat): ChatAccount[] {
  if (!chat) return [];
  const out: ChatAccount[] = [];
  if (chat.youtube?.clientId) out.push({ id: 'youtube-1', platform: 'youtube', label: 'YouTube', ...chat.youtube });
  if (chat.facebook?.pageId) out.push({ id: 'facebook-1', platform: 'facebook', label: 'Facebook', ...chat.facebook });
  if (chat.tiktok?.username) out.push({ id: 'tiktok-1', platform: 'tiktok', label: `@${chat.tiktok.username.replace(/^@/, '')}`, ...chat.tiktok });
  if (chat.instagram?.enabled) out.push({ id: 'instagram-1', platform: 'instagram', label: 'Instagram', enabled: true });
  return out;
}

/** Rellena solo los campos vacíos con los valores por defecto. */
function fillEmpty(saved: Partial<BusinessInfo>, base: BusinessInfo): BusinessInfo {
  const out: BusinessInfo = { ...base };
  for (const k of Object.keys(base) as Array<keyof BusinessInfo>) {
    const v = saved[k];
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

/** Nuevas FAQ por defecto se agregan; las editadas y las aprendidas se conservan. */
function mergeFaq(saved: AppSettings['faq'], base: AppSettings['faq']): AppSettings['faq'] {
  const savedIds = new Set(saved.map((f) => f.id));
  const defaults = base.filter((f) => !savedIds.has(f.id));
  return [...saved, ...defaults];
}

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    const saved = JSON.parse(raw) as Partial<AppSettings> & { chat?: LegacyChat };
    const base = defaultSettings();
    // Si la app traía datos antiguos por defecto y el usuario no alcanzó a editarlos,
    // cargamos los nuevos datos del negocio y las nuevas preguntas frecuentes.
    const stale = (saved.defaultsVersion ?? 0) < DEFAULTS_VERSION;
    return {
      ...base,
      ...saved,
      accounts: saved.accounts ?? migrateLegacyChat(saved.chat),
      autoAnswer: { ...base.autoAnswer, ...(saved.autoAnswer ?? {}) },
      defaultsVersion: DEFAULTS_VERSION,
      business: stale ? fillEmpty(saved.business ?? {}, base.business) : { ...base.business, ...(saved.business ?? {}) },
      targets: saved.targets?.length ? saved.targets : base.targets,
      blockedUsers: saved.blockedUsers ?? [],
      titles: saved.titles ?? base.titles,
      sounds: saved.sounds ?? base.sounds,
      answeredHistory: saved.answeredHistory ?? [],
      faq: stale ? mergeFaq(saved.faq ?? [], base.faq) : saved.faq?.length ? saved.faq : base.faq,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(settings, null, 2), 'utf8');
}
