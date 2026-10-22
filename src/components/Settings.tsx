import { useEffect, useState } from 'react';
import { Accounts } from './Accounts';
import type { AppSettings } from '../../shared/types';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (t: string) => void;
}

/** Calidad de video y conexión a los chats de cada plataforma. */
export function Settings({ settings, onSave, onToast }: Props) {
  const [ffmpeg, setFfmpeg] = useState('');
  useEffect(() => {
    window.quirolive.app.ffmpegPath().then(setFfmpeg);
  }, []);

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
        <div className="grid-2">
          <div className="field">
            <label>Rendimiento</label>
            <select value={settings.performance} onChange={(e) => onSave({ ...settings, performance: e.target.value as AppSettings['performance'] })}>
              <option value="normal">Normal (1080p)</option>
              <option value="light">Ligero (720p, 24 fps) — si el Mac se traba o usas TikTok LIVE Studio a la vez</option>
            </select>
          </div>
          <div className="field">
            <label>Resolución pedida a la cámara</label>
            <select value={settings.cameraMax} onChange={(e) => onSave({ ...settings, cameraMax: e.target.value as AppSettings['cameraMax'] })}>
              <option value="1080p">1080p (recomendado)</option>
              <option value="4k">4K (más nítido, mucho más pesado)</option>
            </select>
          </div>
        </div>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={settings.hardwareEncoder} onChange={(e) => onSave({ ...settings, hardwareEncoder: e.target.checked })} /> Usar el codificador de video del chip (VideoToolbox en Mac): mucho menos uso de procesador</label>
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

      <h2 style={{ marginTop: 24 }}>Cuentas conectadas</h2>
      <p className="help">Puedes conectar varias cuentas por plataforma. Cada cuenta lee su chat y responde desde sí misma. Al agregar una cuenta se crea también su destino de transmisión en la pestaña Plataformas.</p>
      <Accounts settings={settings} onSave={onSave} onToast={onToast} />

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

    </div>
  );
}
