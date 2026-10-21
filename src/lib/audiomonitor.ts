/**
 * Mide el nivel del micrófono y detecta acople (feedback): un tono que se
 * sostiene y crece porque el micrófono está captando los parlantes.
 */
export interface AudioReport {
  /** Nivel 0..1 */
  level: number;
  /** true cuando se detecta acople sostenido */
  feedback: boolean;
  /** true cuando el audio satura */
  clipping: boolean;
}

export class AudioMonitor {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private timer = 0;
  private feedbackSince = 0;
  private freq = new Float32Array(0);
  private time = new Float32Array(0);

  start(track: MediaStreamTrack, onReport: (r: AudioReport) => void) {
    this.stop();
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;
    this.source = this.ctx.createMediaStreamSource(new MediaStream([track]));
    this.source.connect(this.analyser);
    this.freq = new Float32Array(this.analyser.frequencyBinCount);
    this.time = new Float32Array(this.analyser.fftSize);

    const tick = () => {
      if (!this.analyser) return;
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

      // Acople: una sola frecuencia domina claramente el espectro, con volumen alto,
      // durante más de 1,2 s. La voz normal reparte la energía en muchas frecuencias.
      let maxDb = -Infinity;
      let avg = 0;
      let n = 0;
      for (let i = 4; i < this.freq.length; i++) {
        const d = this.freq[i];
        if (d > maxDb) maxDb = d;
        if (Number.isFinite(d)) {
          avg += d;
          n++;
        }
      }
      avg = n ? avg / n : -100;
      const tonal = maxDb - avg > 38 && maxDb > -30 && level > 0.25;
      const now = performance.now();
      if (tonal) {
        if (!this.feedbackSince) this.feedbackSince = now;
      } else {
        this.feedbackSince = 0;
      }
      const feedback = this.feedbackSince > 0 && now - this.feedbackSince > 1200;
      onReport({ level, feedback, clipping });
    };
    this.timer = window.setInterval(tick, 120);
  }

  stop() {
    window.clearInterval(this.timer);
    this.source?.disconnect();
    this.analyser?.disconnect();
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.feedbackSince = 0;
  }
}
