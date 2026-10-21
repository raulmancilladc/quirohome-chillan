import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AppSettings } from '../shared/types';
import defaultFaq from './autoanswer/faq.default.json';

const FILE = () => path.join(app.getPath('userData'), 'settings.json');

export const defaultSettings = (): AppSettings => ({
  orientation: 'vertical',
  fps: 30,
  videoBitrateKbps: 3500,
  audioBitrateKbps: 128,
  recordLocally: true,
  targets: [
    { id: 'youtube', platform: 'youtube', name: 'YouTube', url: 'rtmp://a.rtmp.youtube.com/live2', key: '', enabled: false },
    { id: 'facebook', platform: 'facebook', name: 'Facebook', url: 'rtmps://live-api-s.facebook.com:443/rtmp', key: '', enabled: false },
    { id: 'instagram', platform: 'instagram', name: 'Instagram', url: 'rtmps://live-upload.instagram.com:443/rtmp', key: '', enabled: false },
    { id: 'tiktok', platform: 'tiktok', name: 'TikTok', url: '', key: '', enabled: false },
  ],
  chat: {
    youtube: { enabled: false, clientId: '', clientSecret: '' },
    facebook: { enabled: false, pageId: '', pageAccessToken: '' },
    instagram: { enabled: false },
    tiktok: { enabled: false, username: '' },
  },
  autoAnswer: {
    mode: 'suggest',
    showOverlay: true,
    postToChat: true,
    useAi: false,
    anthropicApiKey: '',
    overlaySeconds: 12,
  },
  business: {
    name: 'QuiroHome Chillán',
    address: '',
    howToGet: '',
    website: '',
    bookingUrl: '',
    phone: '',
    hours: '',
    services: '',
    extra: '',
  },
  faq: defaultFaq as AppSettings['faq'],
});

export function loadSettings(): AppSettings {
  try {
    const raw = fs.readFileSync(FILE(), 'utf8');
    const saved = JSON.parse(raw) as Partial<AppSettings>;
    const base = defaultSettings();
    return {
      ...base,
      ...saved,
      chat: { ...base.chat, ...(saved.chat ?? {}) },
      autoAnswer: { ...base.autoAnswer, ...(saved.autoAnswer ?? {}) },
      business: { ...base.business, ...(saved.business ?? {}) },
      targets: saved.targets?.length ? saved.targets : base.targets,
      faq: saved.faq?.length ? saved.faq : base.faq,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: AppSettings): void {
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(settings, null, 2), 'utf8');
}
