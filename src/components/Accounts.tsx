import { useState } from 'react';
import type { AppSettings, ChatAccount, Platform } from '../../shared/types';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (t: string) => void;
}

const PLATFORMS: Array<{ platform: Platform; title: string; help: string; link: string }> = [
  {
    platform: 'youtube',
    title: '▶️ YouTube',
    help: 'Cada canal necesita iniciar sesión con su cuenta de Google. El Client ID y el secreto pueden ser los mismos para todos los canales (se crean una vez en Google Cloud, API "YouTube Data API v3", credenciales de "Aplicación de escritorio").',
    link: 'https://console.cloud.google.com/apis/credentials',
  },
  {
    platform: 'facebook',
    title: '📘 Facebook',
    help: 'Una cuenta por página. Cada página necesita su propio Page Access Token (permisos pages_read_engagement, pages_manage_engagement y publish_video), obtenido en el Graph API Explorer.',
    link: 'https://developers.facebook.com/tools/explorer/',
  },
  {
    platform: 'tiktok',
    title: '🎵 TikTok',
    help: 'Una cuenta por usuario. Solo se necesita el nombre de usuario para leer el chat. Para responder desde esa cuenta, agrega la cookie sessionid y tt-target-idc de esa cuenta (opcional).',
    link: 'https://www.tiktok.com/live',
  },
  {
    platform: 'instagram',
    title: '📸 Instagram',
    help: 'Instagram no entrega los comentarios del LIVE por API. Agrega la cuenta solo para que aparezca en el panel y usar "Agregar pregunta manual".',
    link: 'https://www.instagram.com/',
  },
];

function newAccount(platform: Platform, n: number): ChatAccount {
  const id = `${platform}-${Date.now()}`;
  const label = `${platform.charAt(0).toUpperCase() + platform.slice(1)} ${n}`;
  switch (platform) {
    case 'youtube': return { id, platform, label, enabled: true, clientId: '', clientSecret: '' };
    case 'facebook': return { id, platform, label, enabled: true, pageId: '', pageAccessToken: '' };
    case 'tiktok': return { id, platform, label, enabled: true, username: '' };
    default: return { id, platform: 'instagram', label, enabled: true };
  }
}

/** Cuentas conectadas para leer y responder chats: varias por plataforma. */
export function Accounts({ settings, onSave, onToast }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const accounts = settings.accounts;

  const update = (id: string, patch: Partial<ChatAccount>) =>
    onSave({ ...settings, accounts: accounts.map((a) => (a.id === id ? ({ ...a, ...patch } as ChatAccount) : a)) });
  const remove = (id: string) =>
    onSave({ ...settings, accounts: accounts.filter((a) => a.id !== id), targets: settings.targets.map((t) => (t.accountId === id ? { ...t, accountId: undefined } : t)) });
  const add = (platform: Platform) => {
    const n = accounts.filter((a) => a.platform === platform).length + 1;
    const acc = newAccount(platform, n);
    // Creamos también el destino de transmisión para esa cuenta.
    const urls: Record<string, string> = {
      youtube: 'rtmp://a.rtmp.youtube.com/live2',
      facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
      instagram: 'rtmps://live-upload.instagram.com:443/rtmp',
      tiktok: '',
    };
    const target = { id: `target-${acc.id}`, platform, name: acc.label, accountId: acc.id, url: urls[platform] ?? '', key: '', enabled: false };
    void onSave({ ...settings, accounts: [...accounts, acc], targets: [...settings.targets, target] });
  };

  const loginYouTube = async (id: string) => {
    setBusy(id);
    try {
      await window.quirolive.youtube.login(id);
      onToast('Sesión de Google iniciada ✅');
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  // Al cambiar el nombre de la cuenta, el destino asociado toma el mismo nombre.
  const rename = (id: string, label: string) =>
    onSave({
      ...settings,
      accounts: accounts.map((a) => (a.id === id ? { ...a, label } : a)),
      targets: settings.targets.map((t) => (t.accountId === id ? { ...t, name: label } : t)),
    });

  return (
    <>
      {PLATFORMS.map(({ platform, title, help, link }) => {
        const list = accounts.filter((a) => a.platform === platform);
        return (
          <div className="card" key={platform}>
            <h3>
              {title}: cuentas conectadas ({list.length})
              <div className="grow" />
              <button className="small" onClick={() => add(platform)}>+ Agregar cuenta</button>
            </h3>
            <p className="help">
              {help} <a onClick={() => window.quirolive.app.openExternal(link)}>Abrir ↗</a>
            </p>
            {list.length === 0 && <p className="muted small-text">Sin cuentas. Pulsa “Agregar cuenta”.</p>}
            {list.map((a) => (
              <div className="faq-item" key={a.id}>
                <div className="row" style={{ marginBottom: 8 }}>
                  <input type="checkbox" style={{ width: 'auto' }} checked={a.enabled} onChange={(e) => update(a.id, { enabled: e.target.checked })} title="Leer el chat de esta cuenta" />
                  <input className="grow" value={a.label} onChange={(e) => rename(a.id, e.target.value)} placeholder="Nombre de la cuenta, ej. @raulmancilladc" />
                  <button className="small" onClick={() => remove(a.id)}>Quitar</button>
                </div>
                {a.platform === 'youtube' && (
                  <>
                    <div className="grid-2">
                      <div className="field"><label>Client ID</label><input value={a.clientId} onChange={(e) => update(a.id, { clientId: e.target.value } as Partial<ChatAccount>)} /></div>
                      <div className="field"><label>Client secret</label><input type="password" value={a.clientSecret} onChange={(e) => update(a.id, { clientSecret: e.target.value } as Partial<ChatAccount>)} /></div>
                    </div>
                    <div className="row">
                      <button onClick={() => loginYouTube(a.id)} disabled={busy === a.id || !a.clientId || !a.clientSecret}>Iniciar sesión con Google</button>
                      <span className="small-text">{a.refreshToken ? '✅ Sesión guardada' : 'Sin sesión'}</span>
                    </div>
                  </>
                )}
                {a.platform === 'facebook' && (
                  <div className="grid-2">
                    <div className="field"><label>ID de la página</label><input value={a.pageId} onChange={(e) => update(a.id, { pageId: e.target.value } as Partial<ChatAccount>)} /></div>
                    <div className="field"><label>Page Access Token</label><input type="password" value={a.pageAccessToken} onChange={(e) => update(a.id, { pageAccessToken: e.target.value } as Partial<ChatAccount>)} /></div>
                  </div>
                )}
                {a.platform === 'tiktok' && (
                  <div className="grid-2">
                    <div className="field"><label>Usuario (sin @)</label><input value={a.username} onChange={(e) => update(a.id, { username: e.target.value } as Partial<ChatAccount>)} /></div>
                    <div className="field"><label>API key de Euler Stream (opcional)</label><input type="password" value={a.signApiKey ?? ''} onChange={(e) => update(a.id, { signApiKey: e.target.value } as Partial<ChatAccount>)} /></div>
                    <div className="field"><label>sessionid (opcional, para responder)</label><input type="password" value={a.sessionId ?? ''} onChange={(e) => update(a.id, { sessionId: e.target.value } as Partial<ChatAccount>)} /></div>
                    <div className="field"><label>tt-target-idc (opcional)</label><input value={a.ttTargetIdc ?? ''} onChange={(e) => update(a.id, { ttTargetIdc: e.target.value } as Partial<ChatAccount>)} /></div>
                  </div>
                )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}
