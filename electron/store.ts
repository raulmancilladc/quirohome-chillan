import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings, ChatAccount } from '../shared/types';
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
      business: stale ? base.business : { ...base.business, ...(saved.business ?? {}) },
      targets: saved.targets?.length ? saved.targets : base.targets,
      blockedUsers: saved.blockedUsers ?? [],
      answeredHistory: saved.answeredHistory ?? [],
      faq: stale || !saved.faq?.length ? base.faq : saved.faq,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(settings, null, 2), 'utf8');
}
