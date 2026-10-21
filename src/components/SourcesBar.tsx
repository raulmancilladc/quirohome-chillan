import type { AudioReport } from '../lib/audiomonitor';

interface Props {
  devices: { cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] };
  camId: string;
  pipCamId: string;
  micId: string;
  mirror: boolean;
  micMuted: boolean;
  audio: AudioReport;
  onCam: (id: string) => void;
  onPip: (id: string) => void;
  onMic: (id: string) => void;
  onMirror: (v: boolean) => void;
  onMute: () => void;
  onSwap: () => void;
}

function shortName(name: string): string {
  return name.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)\s*$/i, '').slice(0, 22);
}

/** Selección de cámaras y micrófono, con medidor de audio. Todo se puede cambiar en vivo. */
export function SourcesBar({ devices, camId, pipCamId, micId, mirror, micMuted, audio, onCam, onPip, onMic, onMirror, onMute, onSwap }: Props) {
  const label = (d: MediaDeviceInfo, fallback: string) => d.label || fallback;
  return (
    <>
      <div className="source">
        <label>Cámara principal (tecla 1, 2, 3… para cambiar al instante)</label>
        <div className="cam-buttons">
          {devices.cams.map((d, i) => {
            const active = camId ? camId === d.deviceId : i === 0;
            return (
              <button key={d.deviceId} className={`cam-btn ${active ? 'active' : ''}`} onClick={() => onCam(d.deviceId)} title={label(d, 'Cámara')}>
                <span className="num">{i + 1}</span>
                <span className="name">{shortName(label(d, `Cámara ${i + 1}`))}</span>
              </button>
            );
          })}
          {devices.cams.length === 0 && <span className="muted small-text">Sin cámaras detectadas</span>}
        </div>
      </div>
      <div className="source">
        <label>Segunda cámara (recuadro)</label>
        <div className="row">
          <select value={pipCamId} onChange={(e) => onPip(e.target.value)}>
            <option value="">Sin segunda cámara</option>
            {devices.cams.filter((d) => d.deviceId !== camId).map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{label(d, 'Cámara')}</option>
            ))}
          </select>
          {pipCamId && <button className="small" title="Intercambiar principal y recuadro" onClick={onSwap}>⇄</button>}
        </div>
      </div>
      <div className="source">
        <label>Micrófono</label>
        <div className="row">
          <select value={micId} onChange={(e) => onMic(e.target.value)}>
            <option value="">Predeterminado</option>
            {devices.mics.map((d) => (
              <option key={d.deviceId} value={d.deviceId}>{label(d, 'Micrófono')}</option>
            ))}
          </select>
          <button className={`small ${micMuted ? 'danger' : ''}`} title={micMuted ? 'Activar micrófono' : 'Silenciar micrófono'} onClick={onMute}>
            {micMuted ? '🔇' : '🎙️'}
          </button>
        </div>
        <div className={`meter ${audio.clipping ? 'clip' : ''}`} title="Nivel del micrófono">
          <div style={{ width: `${Math.round((micMuted ? 0 : audio.level) * 100)}%` }} />
        </div>
      </div>
      <label className="row" style={{ marginBottom: 0 }}>
        <input type="checkbox" style={{ width: 'auto' }} checked={mirror} onChange={(e) => onMirror(e.target.checked)} /> Espejo
      </label>
    </>
  );
}
