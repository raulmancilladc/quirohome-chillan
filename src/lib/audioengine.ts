/**
 * Mezclador de audio de la transmisión.
 *
 *   micrófono ──► ganancia (silencio) ──┐
 *   sonidos   ──► ganancia de efectos ──┴──► salida (va a la transmisión y grabación)
 *                                        └──► parlantes (solo los efectos, opcional)
 *
 * Al pasar todo por un mezclador, el micrófono se puede cambiar en vivo sin
 * cortar la transmisión, y los sonidos quedan en el video final.
 */
export interface AudioReport {
  /** Nivel del micrófono 0..1 */
  level: number;
  /** true cuando se detecta acople sostenido */
  feedback: boolean;
  /** true cuando el audio satura */
  clipping: boolean;
}

export class AudioEngine {
  readonly ctx: AudioContext;
  private destination: MediaStreamAudioDestinationNode;
  private micGain: GainNode;
  /** Baja la voz unos 5 dB mientras suena un efecto, para que no lo tape. */
  private duckGain: GainNode;
  private sfxGain: GainNode;
  private monitorGain: GainNode;
  private analyser: AnalyserNode;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private timer = 0;
  private feedbackSince = 0;
  private freq = new Float32Array(0);
  private time = new Float32Array(0);
  private buffers = new Map<string, AudioBuffer>();
  private playing = new Set<AudioBufferSourceNode>();

  constructor() {
    this.ctx = new AudioContext({ sampleRate: 48000 });
    this.destination = this.ctx.createMediaStreamDestination();
    this.micGain = this.ctx.createGain();
    this.duckGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = 0;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.micGain.connect(this.analyser);
    this.micGain.connect(this.duckGain);
    this.duckGain.connect(this.destination);
    this.sfxGain.connect(this.destination);
    this.sfxGain.connect(this.monitorGain);
    this.monitorGain.connect(this.ctx.destination);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.time = new Float32Array(this.analyser.fftSize);
  }

  /** Pista de audio mezclada, para el grabador. */
  get outputTrack(): MediaStreamTrack {
    return this.destination.stream.getAudioTracks()[0];
  }

  /** Cambia el micrófono (se puede hacer en vivo). */
  setMic(stream: MediaStream | null) {
    this.micSource?.disconnect();
    this.micStream?.getTracks().forEach((t) => t.stop());
    this.micSource = null;
    this.micStream = stream;
    if (stream) {
      this.micSource = this.ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.micGain);
    }
    void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.micGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.02);
  }

  /** Volumen de los efectos (0..1) y si se escuchan también por los parlantes. */
  setSfx(volume: number, monitor: boolean) {
    this.sfxGain.gain.value = volume;
    this.monitorGain.gain.value = monitor ? 1 : 0;
  }

  /** Decodifica, normaliza (al cargar, no al reproducir) y guarda en memoria para disparar sin latencia. */
  async loadSound(id: string, data: ArrayBuffer): Promise<number> {
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    normalizeBuffer(buffer);
    this.buffers.set(id, buffer);
    return buffer.duration;
  }

  /** Mide cuánto pierde un sonido en el parlante de un teléfono (dB) con ventanas de 80 ms. */
  async analyzeForPhone(data: ArrayBuffer): Promise<{ dur: number; lossDb: number }> {
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    const sr = buffer.sampleRate;
    const off = new OfflineAudioContext(1, buffer.length, sr);
    const src = off.createBufferSource();
    src.buffer = buffer;
    // Pasa-altos 4.º orden a 500 Hz + pasa-bajos 4.º orden a 11 kHz (dos biquads Butterworth cada uno).
    const hp1 = off.createBiquadFilter(); hp1.type = 'highpass'; hp1.frequency.value = 500; hp1.Q.value = 0.541;
    const hp2 = off.createBiquadFilter(); hp2.type = 'highpass'; hp2.frequency.value = 500; hp2.Q.value = 1.307;
    const lp1 = off.createBiquadFilter(); lp1.type = 'lowpass'; lp1.frequency.value = 11000; lp1.Q.value = 0.541;
    const lp2 = off.createBiquadFilter(); lp2.type = 'lowpass'; lp2.frequency.value = 11000; lp2.Q.value = 1.307;
    src.connect(hp1); hp1.connect(hp2); hp2.connect(lp1); lp1.connect(lp2); lp2.connect(off.destination);
    src.start();
    const filtered = await off.startRendering();
    const before = windowPeak(mono(buffer), sr, 0.08);
    const after = windowPeak(filtered.getChannelData(0), sr, 0.08);
    const lossDb = 20 * Math.log10(Math.max(1e-6, before) / Math.max(1e-6, after));
    return { dur: buffer.duration, lossDb: Math.round(lossDb * 10) / 10 };
  }

  hasSound(id: string): boolean {
    return this.buffers.has(id);
  }

  play(id: string) {
    const buffer = this.buffers.get(id);
    if (!buffer) return;
    void this.ctx.resume();
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.connect(this.sfxGain);
    src.onended = () => {
      this.playing.delete(src);
      if (this.playing.size === 0) this.duck(false);
    };
    this.playing.add(src);
    this.duck(true);
    src.start();
  }

  /** Voz a -5 dB en 30 ms al entrar un efecto; vuelve en 180 ms al terminar. */
  private duck(on: boolean) {
    const now = this.ctx.currentTime;
    this.duckGain.gain.cancelScheduledValues(now);
    this.duckGain.gain.setValueAtTime(this.duckGain.gain.value, now);
    this.duckGain.gain.linearRampToValueAtTime(on ? 0.562 : 1, now + (on ? 0.03 : 0.18));
  }

  stopAll() {
    this.duck(false);
    for (const s of this.playing) {
      try {
        s.stop();
      } catch {
        /* ya terminó */
      }
    }
    this.playing.clear();
  }

  /** Sonidos sintetizados incluidos (sin archivos externos). */
  async loadBuiltins(): Promise<void> {
    const sr = this.ctx.sampleRate;
    const make = (seconds: number, fn: (t: number, i: number) => number) => {
      const buf = this.ctx.createBuffer(1, Math.floor(sr * seconds), sr);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = fn(i / sr, i);
      return buf;
    };
    const env = (t: number, a: number, r: number, dur: number) => Math.min(1, t / a) * Math.max(0, 1 - Math.max(0, t - (dur - r)) / r);
    // Campanita
    this.buffers.set('builtin-ding', make(1.2, (t) => (Math.sin(2 * Math.PI * 1760 * t) * 0.6 + Math.sin(2 * Math.PI * 2637 * t) * 0.3) * Math.exp(-4 * t) * 0.7));
    // Tada (arpegio)
    this.buffers.set('builtin-tada', make(1.6, (t) => {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      let v = 0;
      notes.forEach((f, k) => {
        const start = k * 0.12;
        if (t >= start) v += Math.sin(2 * Math.PI * f * (t - start)) * Math.exp(-2.2 * (t - start)) * 0.25;
      });
      return v * env(t, 0.01, 0.4, 1.6);
    }));
    // Aplausos (ráfagas de ruido filtrado)
    let last = 0;
    this.buffers.set('builtin-aplausos', make(2.2, (t, i) => {
      const burst = Math.sin(t * 95) > 0.92 ? 1 : 0.25;
      const n = (Math.random() * 2 - 1) * burst;
      last = last * 0.72 + n * 0.28;
      return last * env(t, 0.15, 0.6, 2.2) * 0.9 * (i % 2 ? 1 : 0.9);
    }));
    // Tambor (redoble corto + golpe)
    this.buffers.set('builtin-tambor', make(1.0, (t) => {
      const hit = Math.sin(2 * Math.PI * 70 * t) * Math.exp(-9 * t);
      const roll = (Math.random() * 2 - 1) * Math.exp(-6 * t) * (t < 0.35 ? 0.4 : 0);
      return (hit * 0.9 + roll) * 0.9;
    }));
    // Error / fallo
    this.buffers.set('builtin-error', make(0.7, (t) => (Math.sin(2 * Math.PI * 220 * t) + Math.sin(2 * Math.PI * 233 * t)) * 0.3 * env(t, 0.01, 0.2, 0.7)));
    // Risa (burbujeo)
    this.buffers.set('builtin-risa', make(1.4, (t) => {
      const f = 420 + 60 * Math.sin(2 * Math.PI * 7 * t);
      const pulse = (Math.sin(2 * Math.PI * 7 * t) + 1) / 2;
      return Math.sin(2 * Math.PI * f * t) * pulse * 0.25 * env(t, 0.05, 0.4, 1.4);
    }));
    // Silbato
    this.buffers.set('builtin-silbato', make(0.6, (t) => Math.sin(2 * Math.PI * (2200 + 600 * Math.sin(2 * Math.PI * 30 * t)) * t) * 0.35 * env(t, 0.02, 0.15, 0.6)));
    // Corazón / like (dos pulsos graves)
    this.buffers.set('builtin-latido', make(0.9, (t) => {
      const p = (s: number) => (t >= s ? Math.sin(2 * Math.PI * 60 * (t - s)) * Math.exp(-14 * (t - s)) : 0);
      return (p(0) + p(0.28)) * 0.9;
    }));
  }

  /** Mide nivel y acople cada 120 ms. */
  startMonitor(onReport: (r: AudioReport) => void) {
    window.clearInterval(this.timer);
    this.timer = window.setInterval(() => {
      this.analyser.getFloatTimeDomainData(this.time);
      this.analyser.getFloatFrequencyData(this.freq);
      let sum = 0;
      let peak = 0;
      for (const v of this.time) {
        sum += v * v;
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
      const rms = Math.sqrt(sum / this.time.length);
      const level = Math.min(1, rms * 4);
      const clipping = peak > 0.98;
      let maxDb = -Infinity;
      let avg = 0;
      let n = 0;
      for (let i = 4; i < this.freq.length; i++) {
        const d = this.freq[i];
        if (!Number.isFinite(d)) continue;
        if (d > maxDb) maxDb = d;
        avg += d;
        n++;
      }
      avg = n ? avg / n : -100;
      const tonal = maxDb - avg > 38 && maxDb > -30 && level > 0.25;
      const now = performance.now();
      if (tonal) {
        if (!this.feedbackSince) this.feedbackSince = now;
      } else {
        this.feedbackSince = 0;
      }
      onReport({ level, feedback: this.feedbackSince > 0 && now - this.feedbackSince > 1200, clipping });
    }, 120);
  }

  stopMonitor() {
    window.clearInterval(this.timer);
  }
}

/** Mezcla a mono para medir. */
function mono(buffer: AudioBuffer): Float32Array {
  if (buffer.numberOfChannels === 1) return buffer.getChannelData(0);
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) out[i] += d[i] / buffer.numberOfChannels;
  }
  return out;
}

/** Pico máximo de RMS en ventanas de `win` segundos. */
function windowPeak(d: Float32Array, sr: number, win: number): number {
  const n = Math.max(1, Math.floor(sr * win));
  let best = 0;
  for (let i = 0; i + n <= d.length; i += Math.floor(n / 2)) {
    let sum = 0;
    for (let j = i; j < i + n; j++) sum += d[j] * d[j];
    best = Math.max(best, Math.sqrt(sum / n));
  }
  return best;
}

/** Normaliza al cargar: RMS (ventanas de 80 ms, pico) a -14 dBFS, con tope de pico en -1 dBFS. */
function normalizeBuffer(buffer: AudioBuffer) {
  const target = Math.pow(10, -14 / 20);
  const peakCap = Math.pow(10, -1 / 20);
  const m = mono(buffer);
  const rms = windowPeak(m, buffer.sampleRate, 0.08);
  let peak = 0;
  for (const v of m) if (Math.abs(v) > peak) peak = Math.abs(v);
  if (rms <= 0 || peak <= 0) return;
  const gain = Math.min(target / rms, peakCap / peak);
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const d = buffer.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= gain;
  }
}
