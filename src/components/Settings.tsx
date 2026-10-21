import { useEffect, useState } from 'react';
import type { AppSettings } from '../../shared/types';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (t: string) => void;
}

/** Calidad de video y conexión a los chats de cada plataforma. */
export function Settings({ settings, onSave, onToast }: Props) {
  const [ffmpeg, setFfmpeg] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    window.quirolive.app.ffmpegPath().then(setFfmpeg);
  }, []);

  const chat = settings.chat;
  const setChat = <K extends keyof AppSettings['chat']>(k: K, patch: Partial<AppSettings['chat'][K]>) =>
    onSave({ ...settings, chat: { ...chat, [k]: { ...chat[k], ...patch } } });

  const loginYouTube = async () => {
    setBusy(true);
    try {
      await window.quirolive.youtube.login();
      const fresh = await window.quirolive.settings.get();
      await onSave(fresh);
      onToast('Sesión de Google iniciada ✅');
    } catch (err) {
      onToast((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h2>Ajustes</h2>

      <div className="card">
        <h3>Calidad de video</h3>
        <div className="grid-2">
          <div className="field">
            <label>Calidad</label>
            <select
              value={settings.videoBitrateKbps}
              onChange={(e) => onSave({ ...settings, videoBitrateKbps: Number(e.target.value) })}
            >
              <option value={2500}>Internet lento (2.5 Mbps)</option>
              <option value={3500}>Normal (3.5 Mbps) — recomendado</option>
              <option value={4500}>Alta (4.5 Mbps)</option>
              <option value={6000}>Muy alta (6 Mbps)</option>
            </select>
          </div>
          <div className="field">
            <label>Cuadros por segundo</label>
            <select value={settings.fps} onChange={(e) => onSave({ ...settings, fps: Number(e.target.value) })}>
              <option value={30}>30 fps</option>
              <option value={24}>24 fps</option>
            </select>
          </div>
        </div>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={settings.recordLocally} onChange={(e) => onSave({ ...settings, recordLocally: e.target.checked })} /> Guardar una copia de cada transmisión en la carpeta Videos</label>
        {settings.recordLocally && (
          <div className="field" style={{ marginTop: 8 }}>
            <label>Calidad de la grabación</label>
            <select value={settings.recordingQuality} onChange={(e) => onSave({ ...settings, recordingQuality: e.target.value as AppSettings['recordingQuality'] })}>
              <option value="high">Alta calidad para editar reels (archivo MP4 aparte, más pesado)</option>
              <option value="stream">Igual que la transmisión (más liviano)</option>
            </select>
            <p className="help">Junto al video se guarda un archivo .srt con cada comentario y el segundo en que apareció, para ubicar los mejores momentos al editar.</p>
          </div>
        )}
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={settings.showCommentsOnVideo} onChange={(e) => onSave({ ...settings, showCommentsOnVideo: e.target.checked })} /> Mostrar los comentarios del público sobre el video (quedan en la grabación)</label>
        <div className="row" style={{ marginTop: 8 }}>
          <button className="small" onClick={() => window.quirolive.stream.openRecordings()}>Abrir carpeta de grabaciones</button>
          <span className="help">FFmpeg: <code>{ffmpeg}</code></span>
        </div>
      </div>

      <div className="card">
        <h3>▶️ YouTube: leer y responder el chat</h3>
        <p className="help">
          1) En Google Cloud Console crea un proyecto, activa “YouTube Data API v3” y crea credenciales OAuth de tipo “Aplicación de escritorio”.
          2) Pega aquí el ID y el secreto. 3) Pulsa “Iniciar sesión con Google”.{' '}
          <a onClick={() => window.quirolive.app.openExternal('https://console.cloud.google.com/apis/credentials')}>Abrir Google Cloud ↗</a>
        </p>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={chat.youtube.enabled} onChange={(e) => setChat('youtube', { enabled: e.target.checked })} /> Conectar chat de YouTube</label>
        <div className="grid-2">
          <div className="field"><label>Client ID</label><input value={chat.youtube.clientId} onChange={(e) => setChat('youtube', { clientId: e.target.value })} /></div>
          <div className="field"><label>Client secret</label><input type="password" value={chat.youtube.clientSecret} onChange={(e) => setChat('youtube', { clientSecret: e.target.value })} /></div>
        </div>
        <div className="row">
          <button onClick={loginYouTube} disabled={busy || !chat.youtube.clientId || !chat.youtube.clientSecret}>Iniciar sesión con Google</button>
          <span className="small-text">{chat.youtube.refreshToken ? '✅ Sesión guardada' : 'Sin sesión'}</span>
        </div>
      </div>

      <div className="card">
        <h3>📘 Facebook: leer y responder comentarios de la página</h3>
        <p className="help">
          Necesitas un “Page Access Token” con permisos <code>pages_read_engagement</code>, <code>pages_manage_engagement</code> y <code>publish_video</code>.
          Lo obtienes en el Explorador de la API Graph (elige tu página) y luego lo conviertes en token de larga duración.{' '}
          <a onClick={() => window.quirolive.app.openExternal('https://developers.facebook.com/tools/explorer/')}>Abrir Graph API Explorer ↗</a>
        </p>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={chat.facebook.enabled} onChange={(e) => setChat('facebook', { enabled: e.target.checked })} /> Conectar comentarios de Facebook</label>
        <div className="grid-2">
          <div className="field"><label>ID de la página</label><input value={chat.facebook.pageId} onChange={(e) => setChat('facebook', { pageId: e.target.value })} /></div>
          <div className="field"><label>Page Access Token</label><input type="password" value={chat.facebook.pageAccessToken} onChange={(e) => setChat('facebook', { pageAccessToken: e.target.value })} /></div>
        </div>
      </div>

      <div className="card">
        <h3>🎵 TikTok: leer el chat</h3>
        <p className="help">
          Solo se necesita tu nombre de usuario. La lectura usa una conexión no oficial que funciona mientras estés en vivo.
          Para que la app pueda <em>escribir</em> en el chat de TikTok, pega la cookie <code>sessionid</code> y <code>tt-target-idc</code> de tu navegador (opcional).
        </p>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={chat.tiktok.enabled} onChange={(e) => setChat('tiktok', { enabled: e.target.checked })} /> Conectar chat de TikTok</label>
        <div className="grid-2">
          <div className="field"><label>Usuario (sin @)</label><input value={chat.tiktok.username} onChange={(e) => setChat('tiktok', { username: e.target.value })} /></div>
          <div className="field"><label>API key de Euler Stream (opcional)</label><input type="password" value={chat.tiktok.signApiKey ?? ''} onChange={(e) => setChat('tiktok', { signApiKey: e.target.value })} /></div>
          <div className="field"><label>sessionid (opcional, para responder)</label><input type="password" value={chat.tiktok.sessionId ?? ''} onChange={(e) => setChat('tiktok', { sessionId: e.target.value })} /></div>
          <div className="field"><label>tt-target-idc (opcional)</label><input value={chat.tiktok.ttTargetIdc ?? ''} onChange={(e) => setChat('tiktok', { ttTargetIdc: e.target.value })} /></div>
        </div>
      </div>

      <div className="card">
        <h3>🚫 Personas bloqueadas</h3>
        <p className="help">Sus comentarios no se muestran ni se responden. Se bloquean con el botón 🚫 de cada comentario en el panel En vivo.</p>
        {settings.blockedUsers.length === 0 && <p className="muted small-text">Nadie bloqueado.</p>}
        {settings.blockedUsers.map((b) => (
          <div className="row" key={`${b.platform}-${b.author}`} style={{ marginBottom: 6 }}>
            <span className={`plat ${b.platform}`} style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, color: '#fff', textTransform: 'uppercase', fontWeight: 700 }}>{b.platform}</span>
            <span className="grow">{b.author}</span>
            <button className="small" onClick={() => window.quirolive.chat.unblock(b.platform, b.author)}>Desbloquear</button>
          </div>
        ))}
      </div>

      <div className="card">
        <h3>📸 Instagram</h3>
        <p className="help">
          Instagram no entrega acceso a los comentarios de un LIVE por API. La app igual transmite a Instagram y muestra las respuestas sobre el video.
          Para las preguntas de Instagram usa “Agregar pregunta manual” en el panel de la derecha: la respuesta aparece en pantalla al instante.
        </p>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={chat.instagram.enabled} onChange={(e) => setChat('instagram', { enabled: e.target.checked })} /> Mostrar Instagram en el panel de chats</label>
      </div>
    </div>
  );
}
