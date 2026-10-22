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
    this.sfxGain = this.ctx.createGain();
    this.monitorGain = this.ctx.createGain();
    this.monitorGain.gain.value = 0;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.micGain.connect(this.analyser);
    this.micGain.connect(this.destination);
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

  async loadSound(id: string, data: ArrayBuffer): Promise<number> {
    const buffer = await this.ctx.decodeAudioData(data.slice(0));
    this.buffers.set(id, buffer);
    return buffer.duration;
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
    src.onended = () => this.playing.delete(src);
    this.playing.add(src);
    src.start();
  }

  stopAll() {
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
