import { useState } from 'react';
import type { AppSettings, StreamTarget } from '../../shared/types';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (t: string) => void;
}

const HELP: Record<string, { how: string; link: string }> = {
  youtube: {
    how: 'YouTube Studio → Crear → Emitir en directo → pestaña “Transmitir”. Copia la “Clave de retransmisión”. O inicia sesión con Google en Ajustes y usa el botón “Obtener clave automáticamente”.',
    link: 'https://studio.youtube.com/channel/UC/livestreaming',
  },
  facebook: {
    how: 'Facebook → Live Producer → “Usar clave de transmisión”. Copia la clave. O configura la página en Ajustes y usa “Crear transmisión en Facebook” para obtenerla automáticamente.',
    link: 'https://www.facebook.com/live/producer',
  },
  instagram: {
    how: 'Instagram en el computador → Crear → “Transmisión en vivo” → “Software de transmisión”. Copia la URL y la clave. Requiere cuenta profesional. Instagram publica en vertical (9:16), elige el modo Vertical.',
    link: 'https://www.instagram.com/',
  },
  tiktok: {
    how: 'TikTok LIVE Studio o tiktok.com/live (requiere acceso a “Servidor” habilitado por TikTok). Copia la “URL del servidor” y la “Clave de transmisión”.',
    link: 'https://www.tiktok.com/live',
  },
};

/** Configuración de a qué plataformas se transmite y con qué clave. */
export function Destinations({ settings, onSave, onToast }: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  const update = (id: string, patch: Partial<StreamTarget>) =>
    onSave({ ...settings, targets: settings.targets.map((t) => (t.id === id ? { ...t, ...patch } : t)) });

  const URLS: Record<string, string> = {
    youtube: 'rtmp://a.rtmp.youtube.com/live2',
    facebook: 'rtmps://live-api-s.facebook.com:443/rtmp',
    instagram: 'rtmps://live-upload.instagram.com:443/rtmp',
    tiktok: '',
    custom: '',
  };
  const NAMES: Record<string, string> = { youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', custom: 'Otro destino RTMP' };

  const addTarget = (platform: StreamTarget['platform']) => {
    const n = settings.targets.filter((t) => t.platform === platform).length + 1;
    onSave({
      ...settings,
      targets: [...settings.targets, { id: `${platform}-${Date.now()}`, platform, name: `${NAMES[platform]} ${n}`, url: URLS[platform], key: '', enabled: false }],
    });
  };

  const accountsFor = (platform: StreamTarget['platform']) => settings.accounts.filter((a) => a.platform === platform);

  const remove = (id: string) => onSave({ ...settings, targets: settings.targets.filter((t) => t.id !== id) });

  const fetchYouTubeKey = async (id: string, accountId: string) => {
    setBusy(id);
    try {
      const r = await window.quirolive.youtube.streamKey(accountId);
      if (!r) return onToast('YouTube no devolvió una clave. Crea primero una transmisión en YouTube Studio.');
      await update(id, { url: r.url, key: r.key, enabled: true });
      onToast('Clave de YouTube cargada ✅');
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createFacebookLive = async (id: string, accountId: string) => {
    setBusy(id);
    try {
      const r = await window.quirolive.facebook.createLive(accountId, `En vivo · ${settings.business.name}`);
      await update(id, { url: r.url, key: r.key, enabled: true });
      onToast('Transmisión de Facebook creada. Al iniciar, se verá en tu página ✅');
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="page">
      <h2>Plataformas de transmisión</h2>
      <p className="help">
        Activa los destinos donde quieres salir en vivo y pega la clave de transmisión de cada uno. Puedes tener varias cuentas de la misma plataforma: la app envía el mismo video a todas al mismo tiempo.
        Las claves se guardan solo en este computador.
      </p>
      <div className="row wrap" style={{ marginBottom: 16 }}>
        {(['youtube', 'facebook', 'instagram', 'tiktok'] as const).map((p) => (
          <button key={p} className="small" onClick={() => addTarget(p)}>+ {NAMES[p]}</button>
        ))}
        <button className="small" onClick={() => addTarget('custom')}>+ Otro RTMP (Twitch, Kick…)</button>
        <span className="help">Ancho de banda aproximado: {(settings.targets.filter((t) => t.enabled && t.key).length * settings.videoBitrateKbps / 1000).toFixed(1)} Mbps de subida con {settings.targets.filter((t) => t.enabled && t.key).length} destino(s) activo(s).</span>
      </div>

      {settings.targets.map((t) => (
        <div className="card" key={t.id}>
          <h3>
            <input type="checkbox" style={{ width: 'auto' }} checked={t.enabled} onChange={(e) => update(t.id, { enabled: e.target.checked })} />
            <span className={`plat ${t.platform}`} style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, color: '#fff', textTransform: 'uppercase' }}>{t.platform}</span>
            <input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} style={{ width: 240 }} placeholder="Nombre de la cuenta" />
            {(t.platform === 'youtube' || t.platform === 'facebook') && accountsFor(t.platform).length > 0 && (
              <select value={t.accountId ?? ''} onChange={(e) => update(t.id, { accountId: e.target.value || undefined })} style={{ width: 200 }} title="Cuenta conectada en Ajustes">
                <option value="">Cuenta conectada…</option>
                {accountsFor(t.platform).map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            )}
            <div className="grow" />
            {t.platform === 'youtube' && t.accountId && (
              <button className="small" disabled={busy === t.id} onClick={() => fetchYouTubeKey(t.id, t.accountId!)}>Obtener clave automáticamente</button>
            )}
            {t.platform === 'facebook' && t.accountId && (
              <button className="small" disabled={busy === t.id} onClick={() => createFacebookLive(t.id, t.accountId!)}>Crear transmisión en Facebook</button>
            )}
            <button className="small" onClick={() => remove(t.id)}>Quitar</button>
          </h3>
          <div className="grid-2">
            <div className="field">
              <label>Servidor (URL RTMP)</label>
              <input value={t.url} onChange={(e) => update(t.id, { url: e.target.value })} placeholder="rtmps://…" />
            </div>
            <div className="field">
              <label>Clave de transmisión</label>
              <input type="password" value={t.key} onChange={(e) => update(t.id, { key: e.target.value })} placeholder="xxxx-xxxx-xxxx" />
            </div>
          </div>
          {HELP[t.platform] && (
            <div className="help">
              {HELP[t.platform].how}{' '}
              <a onClick={() => window.quirolive.app.openExternal(HELP[t.platform].link)}>Abrir {t.name} ↗</a>
            </div>
          )}
        </div>
      ))}

    </div>
  );
}
