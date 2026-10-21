import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, ChatMessage, Orientation, StreamStatus, SuggestedAnswer } from '../shared/types';
import type { AnsweredEvent } from '../electron/preload';
import { Compositor, SIZES } from './lib/compositor';
import { StreamRecorder } from './lib/recorder';
import { Preview } from './components/Preview';
import { ChatPanel } from './components/ChatPanel';
import { Destinations } from './components/Destinations';
import { Settings } from './components/Settings';
import { FaqEditor } from './components/FaqEditor';

type Tab = 'live' | 'destinos' | 'respuestas' | 'ajustes';

export default function App() {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [tab, setTab] = useState<Tab>('live');
  const [status, setStatus] = useState<StreamStatus>({ state: 'idle' });
  const [toast, setToast] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ cams: MediaDeviceInfo[]; mics: MediaDeviceInfo[] }>({ cams: [], mics: [] });
  const [camId, setCamId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const [mirror, setMirror] = useState(true);

  const compositor = useRef<Compositor | null>(null);
  const recorder = useRef<StreamRecorder | null>(null);
  const videoEl = useRef<HTMLVideoElement | null>(null);
  const mediaStream = useRef<MediaStream | null>(null);

  const showToast = useCallback((t: string) => {
    setToast(t);
    setTimeout(() => setToast(null), 3500);
  }, []);

  // Cargar configuración y preparar el compositor.
  useEffect(() => {
    window.quirolive.settings.get().then((s) => {
      setSettings(s);
      const c = new Compositor(s.orientation);
      c.brandLabel = s.business.name;
      c.mirror = true;
      compositor.current = c;
      c.start();
    });
    const offChanged = window.quirolive.settings.onChanged((s) => setSettings(s));
    const off = window.quirolive.stream.onStatus((s) => {
      setStatus(s);
      if (s.state === 'error' && s.message) showToast(s.message);
      if (s.state === 'idle' && recorder.current) {
        recorder.current.stop();
        recorder.current = null;
      }
    });
    return () => {
      off();
      offChanged();
      compositor.current?.stop();
    };
  }, [showToast]);

  useEffect(() => {
    if (compositor.current && settings) compositor.current.showComments = settings.showCommentsOnVideo;
  }, [settings]);

  // Enumerar cámaras y micrófonos.
  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then((list) => {
      setDevices({ cams: list.filter((d) => d.kind === 'videoinput'), mics: list.filter((d) => d.kind === 'audioinput') });
    });
  }, []);

  // Abrir la cámara seleccionada.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      mediaStream.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
          audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true },
        });
        if (cancelled) return;
        mediaStream.current = stream;
        const v = document.createElement('video');
        v.srcObject = stream;
        v.muted = true;
        v.playsInline = true;
        await v.play();
        videoEl.current = v;
        compositor.current?.setVideo(v);
        const list = await navigator.mediaDevices.enumerateDevices();
        setDevices({ cams: list.filter((d) => d.kind === 'videoinput'), mics: list.filter((d) => d.kind === 'audioinput') });
      } catch (err) {
        showToast(`No se pudo abrir la cámara: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camId, micId, showToast]);

  useEffect(() => {
    if (compositor.current) compositor.current.mirror = mirror;
  }, [mirror]);

  const save = useCallback(async (next: AppSettings) => {
    setSettings(next);
    await window.quirolive.settings.set(next);
    if (compositor.current) compositor.current.brandLabel = next.business.name;
  }, []);

  const setOrientation = (o: Orientation) => {
    if (!settings || status.state !== 'idle') return;
    compositor.current?.setOrientation(o);
    void save({ ...settings, orientation: o });
  };

  const goLive = async () => {
    if (!settings || !compositor.current) return;
    const { width, height } = SIZES[settings.orientation];
    try {
      await window.quirolive.stream.start({
        targets: settings.targets,
        orientation: settings.orientation,
        width,
        height,
        fps: settings.fps,
        videoBitrateKbps: settings.videoBitrateKbps,
        audioBitrateKbps: settings.audioBitrateKbps,
        recordLocally: settings.recordLocally,
        recordingQuality: settings.recordingQuality,
      });
      const rec = new StreamRecorder();
      rec.start(compositor.current.canvas, mediaStream.current?.getAudioTracks()[0] ?? null, settings.fps, settings.videoBitrateKbps);
      recorder.current = rec;
      await window.quirolive.chat.connect();
    } catch (err) {
      showToast((err as Error).message);
    }
  };

  const stopLive = async () => {
    recorder.current?.stop();
    recorder.current = null;
    await window.quirolive.stream.stop();
    await window.quirolive.chat.disconnect();
  };

  const showComment = useCallback((m: ChatMessage) => {
    compositor.current?.addComment({ author: m.author, text: m.text, platform: m.platform, at: Date.now() });
  }, []);

  const showOverlay = useCallback(
    (question: string, answer: string) => {
      if (!compositor.current || !settings) return;
      compositor.current.overlay = { question, answer, until: Date.now() + settings.autoAnswer.overlaySeconds * 1000 };
    },
    [settings],
  );

  if (!settings) return <div className="page">Cargando…</div>;

  const live = status.state === 'live' || status.state === 'starting';
  const activeTargets = settings.targets.filter((t) => t.enabled && t.key);

  return (
    <div className="app">
      <div className="topbar">
        <h1>🎥 QuiroHome Live</h1>
        <div className="tabs">
          {(['live', 'destinos', 'respuestas', 'ajustes'] as Tab[]).map((t) => (
            <button key={t} className={tab === t ? 'active' : ''} onClick={() => setTab(t)}>
              {{ live: 'En vivo', destinos: 'Plataformas', respuestas: 'Respuestas automáticas', ajustes: 'Ajustes' }[t]}
            </button>
          ))}
        </div>
        <div className="grow" />
        <span className={`status-line ${status.state === 'error' ? 'error' : ''}`}>
          {status.state === 'live' && `🔴 EN VIVO en ${activeTargets.length} plataforma(s)`}
          {status.state === 'starting' && 'Conectando…'}
          {status.state === 'stopping' && 'Finalizando…'}
          {status.state === 'error' && `Error: ${status.message}`}
        </span>
      </div>

      {tab === 'live' && (
        <div className="main">
          <div className="stage">
            <Preview compositor={compositor.current} live={status.state === 'live'} />
            <div className="controls">
              <div className="segment">
                <button className={settings.orientation === 'vertical' ? 'active' : ''} disabled={live} onClick={() => setOrientation('vertical')}>
                  📱 Vertical
                </button>
                <button className={settings.orientation === 'horizontal' ? 'active' : ''} disabled={live} onClick={() => setOrientation('horizontal')}>
                  🖥️ Horizontal
                </button>
              </div>
              <select value={camId} onChange={(e) => setCamId(e.target.value)} style={{ width: 200 }} disabled={live}>
                <option value="">Cámara predeterminada</option>
                {devices.cams.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Cámara'}</option>
                ))}
              </select>
              <select value={micId} onChange={(e) => setMicId(e.target.value)} style={{ width: 200 }} disabled={live}>
                <option value="">Micrófono predeterminado</option>
                {devices.mics.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label || 'Micrófono'}</option>
                ))}
              </select>
              <label className="row" style={{ marginBottom: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Espejo
              </label>
              <div className="grow" />
              {live ? (
                <button className="danger golive" onClick={stopLive}>■ Finalizar</button>
              ) : (
                <button className="primary golive" onClick={goLive} disabled={activeTargets.length === 0 && !settings.recordLocally}>
                  ● Iniciar transmisión
                </button>
              )}
            </div>
            <div className="dest-chips">
              {settings.targets.map((t) => (
                <span
                  key={t.id}
                  className={`chip ${t.enabled && t.key ? 'on' : ''} ${t.enabled && !t.key ? 'err' : ''}`}
                  title={t.enabled && !t.key ? 'Falta la clave de transmisión' : ''}
                  onClick={() => !live && save({ ...settings, targets: settings.targets.map((x) => (x.id === t.id ? { ...x, enabled: !x.enabled } : x)) })}
                >
                  <span className="dot" /> {t.name}
                </span>
              ))}
              {settings.recordLocally && <span className="chip on"><span className="dot" /> Grabación local</span>}
              {activeTargets.length === 0 && <span className="muted small-text">Activa una plataforma en la pestaña “Plataformas”.</span>}
            </div>
          </div>
          <ChatPanel settings={settings} onOverlay={showOverlay} onComment={showComment} onToast={showToast} />
        </div>
      )}

      {tab === 'destinos' && <Destinations settings={settings} onSave={save} onToast={showToast} />}
      {tab === 'respuestas' && <FaqEditor settings={settings} onSave={save} />}
      {tab === 'ajustes' && <Settings settings={settings} onSave={save} onToast={showToast} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

export type { ChatMessage, SuggestedAnswer, AnsweredEvent };
