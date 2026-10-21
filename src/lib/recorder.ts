/**
 * Convierte el canvas compuesto + el micrófono en un flujo WebM y lo envía
 * al proceso principal (FFmpeg) en trozos de 1 segundo.
 */
export class StreamRecorder {
  private recorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;

  static pickMimeType(): string {
    const candidates = [
      'video/webm;codecs=h264,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp9,opus',
      'video/webm',
    ];
    return candidates.find((c) => MediaRecorder.isTypeSupported(c)) ?? 'video/webm';
  }

  start(canvas: HTMLCanvasElement, audio: MediaStreamTrack | null, fps: number, videoBitrateKbps: number) {
    const canvasStream = canvas.captureStream(fps);
    const tracks = [...canvasStream.getVideoTracks()];
    if (audio) tracks.push(audio);
    this.stream = new MediaStream(tracks);
    this.recorder = new MediaRecorder(this.stream, {
      mimeType: StreamRecorder.pickMimeType(),
      // Grabamos a mayor calidad que la salida: FFmpeg recomprime una vez.
      videoBitsPerSecond: videoBitrateKbps * 2000,
      audioBitsPerSecond: 160_000,
    });
    this.recorder.ondataavailable = async (e) => {
      if (e.data.size > 0) {
        const buf = await e.data.arrayBuffer();
        window.quirolive.stream.chunk(buf);
      }
    };
    this.recorder.start(1000);
  }

  /** Cambia el micrófono sin cortar la transmisión. */
  replaceAudio(track: MediaStreamTrack) {
    if (!this.stream) return;
    this.stream.getAudioTracks().forEach((t) => this.stream!.removeTrack(t));
    this.stream.addTrack(track);
  }

  stop() {
    this.recorder?.stop();
    this.recorder = null;
    this.stream?.getVideoTracks().forEach((t) => t.stop());
    this.stream = null;
  }
}
