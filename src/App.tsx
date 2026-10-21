import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppSettings, ChatMessage, Orientation, StreamStatus, SuggestedAnswer } from '../shared/types';
import type { AnsweredEvent } from '../electron/preload';
import { Compositor, SIZES } from './lib/compositor';
import { StreamRecorder } from './lib/recorder';
import { AudioMonitor, type AudioReport } from './lib/audiomonitor';
import { SourcesBar } from './components/SourcesBar';
import { OutputWindow } from './lib/outputwindow';
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
  const [pipCamId, setPipCamId] = useState<string>('');
  const [micId, setMicId] = useState<string>('');
  const [mirror, setMirror] = useState(true);
  const [micMuted, setMicMuted] = useState(false);
  const [audio, setAudio] = useState<AudioReport>({ level: 0, feedback: false, clipping: false });
  const [echoDismissed, setEchoDismissed] = useState(0);
  const [macMuted, setMacMuted] = useState(false);
  const [fit, setFit] = useState<'cover' | 'contain'>('contain');
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const c = compositor.current;
    if (!c) return;
    c.fit = fit;
    c.zoom = zoom;
    c.rotation = rotation;
  }, [fit, zoom, rotation]);

  const compositor = useRef<Compositor | null>(null);
  const recorder = useRef<StreamRecorder | null>(null);
  const camStream = useRef<MediaStream | null>(null);
  const pipStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const monitor = useRef<AudioMonitor | null>(null);
  const output = useRef(new OutputWindow());

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

  const refreshDevices = useCallback(async () => {
    const list = await navigator.mediaDevices.enumerateDevices();
    setDevices({ cams: list.filter((d) => d.kind === 'videoinput'), mics: list.filter((d) => d.kind === 'audioinput') });
  }, []);

  // Si se conecta o desconecta una cámara (ej. la Osmo por USB), refrescar la lista.
  useEffect(() => {
    navigator.mediaDevices.addEventListener('devicechange', refreshDevices);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshDevices);
  }, [refreshDevices]);

  async function openCamera(deviceId: string): Promise<{ stream: MediaStream; video: HTMLVideoElement }> {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: deviceId ? { exact: deviceId } : undefined, width: { ideal: 3840 }, height: { ideal: 2160 }, frameRate: { ideal: 30 } },
      audio: false,
    });
    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;
    await video.play();
    return { stream, video };
  }

  // Cámara principal (se puede cambiar en vivo: el audio va aparte).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { stream, video } = await openCamera(camId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        camStream.current?.getTracks().forEach((t) => t.stop());
        camStream.current = stream;
        compositor.current?.setVideo(video);
        await refreshDevices();
      } catch (err) {
        showToast(`No se pudo abrir la cámara: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [camId, showToast, refreshDevices]);

  // Segunda cámara en recuadro (opcional).
  useEffect(() => {
    let cancelled = false;
    pipStream.current?.getTracks().forEach((t) => t.stop());
    pipStream.current = null;
    compositor.current?.setPip(null);
    if (!pipCamId) return;
    (async () => {
      try {
        const { stream, video } = await openCamera(pipCamId);
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        pipStream.current = stream;
        compositor.current?.setPip(video);
      } catch (err) {
        showToast(`No se pudo abrir la segunda cámara: ${(err as Error).message}`);
        setPipCamId('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pipCamId, showToast]);

  // Micrófono: con medidor de nivel y detector de acople.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: micId ? { exact: micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        micStream.current?.getTracks().forEach((t) => t.stop());
        micStream.current = stream;
        const track = stream.getAudioTracks()[0];
        track.enabled = !micMuted;
        monitor.current?.stop();
        monitor.current = new AudioMonitor();
        monitor.current.start(track, setAudio);
        // Si ya estamos en vivo, cambiamos la pista de audio sin cortar la transmisión.
        recorder.current?.replaceAudio(track);
        await refreshDevices();
      } catch (err) {
        showToast(`No se pudo abrir el micrófono: ${(err as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micId, showToast, refreshDevices]);

  useEffect(() => {
    const track = micStream.current?.getAudioTracks()[0];
    if (track) track.enabled = !micMuted;
  }, [micMuted]);

  // Teclas 1, 2, 3… cambian la cámara principal al instante (salvo si estás escribiendo).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const n = Number(e.key);
      if (!Number.isInteger(n) || n < 1 || n > 9) return;
      const cam = devices.cams[n - 1];
      if (!cam) return;
      e.preventDefault();
      setCamId(cam.deviceId);
      showToast(`Cámara ${n}: ${cam.label || 'Cámara'}`);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [devices.cams, showToast]);

  const toggleMacMute = async () => {
    const next = !macMuted;
    const ok = await window.quirolive.app.setSystemMute(next);
    if (ok) setMacMuted(next);
    else showToast('No pude cambiar el volumen del sistema. Usa la tecla de silencio del teclado.');
  };

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
      rec.start(compositor.current.canvas, micStream.current?.getAudioTracks()[0] ?? null, settings.fps, settings.videoBitrateKbps);
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
            {audio.feedback && Date.now() - echoDismissed > 60_000 && (
              <div className="echo-banner">
                <strong>🔊 Se está escuchando eco o acople.</strong> El micrófono está captando los parlantes. Qué apagar, en orden:
                <ol>
                  <li>Silencia los parlantes del Mac (botón de al lado o tecla de silencio). La transmisión no lo necesita.</li>
                  <li>Si estás mirando el live en el celular o en otra pestaña, silencia ese dispositivo.</li>
                  <li>Si hay otro micrófono abierto (Osmo, audífonos, Zoom), déjalo solo en uno. Aquí se usa: <em>{devices.mics.find((d) => d.deviceId === micId)?.label || 'micrófono predeterminado'}</em>.</li>
                </ol>
                <div className="row">
                  <button className="primary small" onClick={toggleMacMute}>{macMuted ? '🔈 Reactivar parlantes' : '🔇 Silenciar parlantes del Mac'}</button>
                  <button className="small" onClick={() => setEchoDismissed(Date.now())}>Ya lo arreglé</button>
                </div>
              </div>
            )}
            <div className="controls">
              <div className="segment">
                <button className={settings.orientation === 'vertical' ? 'active' : ''} disabled={live} onClick={() => setOrientation('vertical')}>
                  📱 Vertical
                </button>
                <button className={settings.orientation === 'horizontal' ? 'active' : ''} disabled={live} onClick={() => setOrientation('horizontal')}>
                  🖥️ Horizontal
                </button>
              </div>
              <SourcesBar
                devices={devices}
                camId={camId}
                pipCamId={pipCamId}
                micId={micId}
                mirror={mirror}
                micMuted={micMuted}
                audio={audio}
                onCam={(id) => {
                  setCamId(id);
                  if (id && id === pipCamId) setPipCamId('');
                }}
                onPip={setPipCamId}
                onMic={setMicId}
                onMirror={setMirror}
                onMute={() => setMicMuted((m) => !m)}
                onSwap={() => compositor.current?.swap()}
              />
              <div className="source">
                <label>Encuadre</label>
                <div className="row">
                  <div className="segment">
                    <button className={fit === 'cover' ? 'active' : ''} onClick={() => setFit('cover')} title="Llena la pantalla recortando los lados">Llenar</button>
                    <button className={fit === 'contain' ? 'active' : ''} onClick={() => setFit('contain')} title="Muestra la cámara completa con fondo difuminado">Completo</button>
                  </div>
                  <input type="range" min={1} max={2.5} step={0.05} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: 110 }} title={`Zoom ${zoom.toFixed(2)}x`} />
                  <button className="small" title="Rotar la cámara 90° (si la Osmo está montada de lado)" onClick={() => setRotation((r) => (r + 90) % 360)}>⟳ {rotation}°</button>
                </div>
              </div>
              <button
                className="small"
                title="Abre una ventana solo con el video, para capturarla desde TikTok LIVE Studio u otro programa"
                onClick={() => compositor.current && output.current.open(compositor.current.canvas)}
              >
                🖥️ Ventana de salida
              </button>
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
