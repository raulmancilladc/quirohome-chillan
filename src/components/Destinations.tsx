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

  const addCustom = () =>
    onSave({
      ...settings,
      targets: [...settings.targets, { id: `custom-${Date.now()}`, platform: 'custom', name: 'Otro destino RTMP', url: '', key: '', enabled: false }],
    });

  const remove = (id: string) => onSave({ ...settings, targets: settings.targets.filter((t) => t.id !== id) });

  const fetchYouTubeKey = async (id: string) => {
    setBusy(id);
    try {
      const r = await window.quirolive.youtube.streamKey();
      if (!r) return onToast('YouTube no devolvió una clave. Crea primero una transmisión en YouTube Studio.');
      await update(id, { url: r.url, key: r.key, enabled: true });
      onToast('Clave de YouTube cargada ✅');
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const createFacebookLive = async (id: string) => {
    setBusy(id);
    try {
      const r = await window.quirolive.facebook.createLive(`En vivo · ${settings.business.name}`);
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
        Activa las plataformas donde quieres salir en vivo y pega la clave de transmisión de cada una. La app envía el mismo video a todas al mismo tiempo.
        Las claves se guardan solo en este computador.
      </p>

      {settings.targets.map((t) => (
        <div className="card" key={t.id}>
          <h3>
            <input type="checkbox" style={{ width: 'auto' }} checked={t.enabled} onChange={(e) => update(t.id, { enabled: e.target.checked })} />
            {t.platform === 'custom' ? (
              <input value={t.name} onChange={(e) => update(t.id, { name: e.target.value })} style={{ width: 240 }} />
            ) : (
              t.name
            )}
            <div className="grow" />
            {t.platform === 'youtube' && settings.chat.youtube.refreshToken && (
              <button className="small" disabled={busy === t.id} onClick={() => fetchYouTubeKey(t.id)}>Obtener clave automáticamente</button>
            )}
            {t.platform === 'facebook' && settings.chat.facebook.pageAccessToken && (
              <button className="small" disabled={busy === t.id} onClick={() => createFacebookLive(t.id)}>Crear transmisión en Facebook</button>
            )}
            {t.platform === 'custom' && <button className="small" onClick={() => remove(t.id)}>Quitar</button>}
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

      <button onClick={addCustom}>+ Agregar otro destino RTMP (Twitch, Kick, etc.)</button>
    </div>
  );
}
