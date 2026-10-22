import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { StreamStartOptions, StreamStatus } from '../../shared/types';

/**
 * Motor de transmisión: recibe el video ya compuesto desde la interfaz
 * (WebM generado por MediaRecorder) y lo re-codifica una sola vez con FFmpeg,
 * enviándolo en paralelo a todas las plataformas con el muxer "tee".
 */
export type VideoEncoder = 'libx264' | 'h264_videotoolbox' | 'h264_nvenc' | 'h264_qsv' | 'h264_amf';

/** Detecta qué codificadores de hardware trae este FFmpeg, en orden de preferencia por sistema. */
export function detectHardwareEncoder(ffmpegPath: string): Promise<VideoEncoder | null> {
  const prefer: VideoEncoder[] =
    process.platform === 'darwin' ? ['h264_videotoolbox']
    : process.platform === 'win32' ? ['h264_nvenc', 'h264_qsv', 'h264_amf']
    : ['h264_nvenc', 'h264_qsv'];
  return new Promise((resolve) => {
    execFile(ffmpegPath, ['-hide_banner', '-encoders'], { timeout: 10_000 }, (err, stdout) => {
      if (err) return resolve(null);
      const found = prefer.find((e) => new RegExp(`\\s${e}\\s`).test(stdout));
      resolve(found ?? null);
    });
  });
}

/** Argumentos de video según el codificador. 'stream' = tiempo real a bitrate fijo; 'hq' = grabación de alta calidad. */
function videoArgs(encoder: VideoEncoder, kind: 'stream' | 'hq', fps: number, kbps: number): string[] {
  const gop = String(fps * 2);
  const common = ['-pix_fmt', 'yuv420p', '-r', String(fps), '-g', gop];
  const vb = `${kbps}k`;
  switch (encoder) {
    case 'h264_videotoolbox':
      return kind === 'stream'
        ? ['-c:v', 'h264_videotoolbox', '-realtime', '1', '-profile:v', 'main', '-b:v', vb, '-maxrate', vb, '-bufsize', `${kbps * 2}k`, ...common]
        : ['-c:v', 'h264_videotoolbox', '-profile:v', 'high', '-b:v', '16000k', ...common];
    case 'h264_nvenc':
      return kind === 'stream'
        ? ['-c:v', 'h264_nvenc', '-preset', 'p4', '-tune', 'll', '-rc', 'cbr', '-b:v', vb, '-maxrate', vb, '-bufsize', `${kbps * 2}k`, ...common]
        : ['-c:v', 'h264_nvenc', '-preset', 'p5', '-rc', 'vbr', '-cq', '19', '-b:v', '0', ...common];
    case 'h264_qsv':
      return kind === 'stream'
        ? ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-b:v', vb, '-maxrate', vb, '-bufsize', `${kbps * 2}k`, ...common]
        : ['-c:v', 'h264_qsv', '-preset', 'medium', '-global_quality', '19', ...common];
    case 'h264_amf':
      return kind === 'stream'
        ? ['-c:v', 'h264_amf', '-usage', 'lowlatency', '-rc', 'cbr', '-b:v', vb, '-maxrate', vb, '-bufsize', `${kbps * 2}k`, ...common]
        : ['-c:v', 'h264_amf', '-quality', 'quality', '-rc', 'cqp', '-qp_i', '19', '-qp_p', '21', ...common];
    default:
      return kind === 'stream'
        ? ['-c:v', 'libx264', '-preset', 'veryfast', '-tune', 'zerolatency', '-profile:v', 'main', '-keyint_min', gop, '-sc_threshold', '0', '-b:v', vb, '-maxrate', vb, '-bufsize', `${kbps * 2}k`, ...common]
        : ['-c:v', 'libx264', '-preset', 'fast', '-crf', '17', ...common];
  }
}

export class StreamEngine extends EventEmitter {
  private proc: ChildProcess | null = null;
  /** Codificador de hardware detectado (null = solo software). */
  hardwareEncoder: VideoEncoder | null = null;
  private status: StreamStatus = { state: 'idle' };
  private stderrTail: string[] = [];

  constructor(private readonly ffmpegPath: string, private readonly recordingsDir: string) {
    super();
    void detectHardwareEncoder(ffmpegPath).then((e) => {
      this.hardwareEncoder = e;
      this.emit('log', e ? `Codificador de hardware disponible: ${e}` : 'Sin codificador de hardware: se usa libx264 (CPU)');
    });
  }

  getStatus(): StreamStatus {
    return this.status;
  }

  private setStatus(next: StreamStatus) {
    this.status = next;
    this.emit('status', next);
  }

  start(opts: StreamStartOptions): void {
    if (this.proc) throw new Error('Ya hay una transmisión en curso');

    const outputs: string[] = [];
    for (const t of opts.targets) {
      if (!t.enabled) continue;
      if (!t.url || !t.key) continue;
      const url = t.url.replace(/\/+$/, '') + '/' + t.key.trim();
      outputs.push(`[f=flv:onfail=ignore]${escapeTee(url)}`);
    }

    const encoder: VideoEncoder = opts.hardwareEncoder && this.hardwareEncoder ? this.hardwareEncoder : 'libx264';
    let recordingPath: string | null = null;
    let highQualityArgs: string[] = [];
    if (opts.recordLocally) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      if (opts.recordingQuality === 'high') {
        // Segunda codificación independiente, en alta calidad, para editar reels.
        // MP4 fragmentado: si la app se cierra de golpe, el archivo igual se puede abrir.
        recordingPath = path.join(this.recordingsDir, `live-${stamp}-${opts.orientation}-HQ.mp4`);
        highQualityArgs = [
          '-map', '0:v:0', '-map', '0:a:0?',
          ...videoArgs(encoder, 'hq', opts.fps, opts.videoBitrateKbps),
          '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
          '-movflags', '+frag_keyframe+empty_moov+default_base_moof',
          '-f', 'mp4', recordingPath,
        ];
      } else {
        recordingPath = path.join(this.recordingsDir, `live-${stamp}-${opts.orientation}.mkv`);
        outputs.push(`[f=matroska]${escapeTee(recordingPath)}`);
      }
    }

    if (outputs.length === 0 && highQualityArgs.length === 0) {
      throw new Error('No hay destinos activos con clave de transmisión ni grabación local.');
    }

    this.emit('log', `Codificador de video: ${encoder}`);
    const args = ['-hide_banner', '-loglevel', 'warning', '-fflags', '+genpts', '-i', 'pipe:0'];

    if (outputs.length > 0) {
      // Salida nula: si todas las plataformas fallan, FFmpeg sigue vivo y la grabación no se pierde.
      outputs.push('[f=null]null');
      // Salida 1: una sola codificación para todas las plataformas (muxer tee).
      args.push(
        '-map', '0:v:0',
        '-map', '0:a:0?',
        ...videoArgs(encoder, 'stream', opts.fps, opts.videoBitrateKbps),
        '-c:a', 'aac',
        '-b:a', `${opts.audioBitrateKbps}k`,
        '-ar', '44100',
        '-ac', '2',
        '-flags', '+global_header',
        '-f', 'tee',
        outputs.join('|'),
      );
    }
    // Salida 2 (opcional): grabación en alta calidad, codificación independiente.
    args.push(...highQualityArgs);

    this.stderrTail = [];
    this.setStatus({ state: 'starting', recordingPath });

    const proc = spawn(this.ffmpegPath, args, { stdio: ['pipe', 'ignore', 'pipe'] });
    this.proc = proc;

    proc.stderr!.setEncoding('utf8');
    proc.stderr!.on('data', (chunk: string) => {
      for (const line of chunk.split('\n')) {
        if (!line.trim()) continue;
        this.stderrTail.push(line);
        if (this.stderrTail.length > 40) this.stderrTail.shift();
        this.emit('log', line);
      }
    });

    proc.stdin!.on('error', (err: NodeJS.ErrnoException) => {
      // EPIPE ocurre cuando ffmpeg ya cerró; el evento 'close' lo informa.
      if (err.code !== 'EPIPE') this.emit('log', `stdin: ${err.message}`);
    });

    proc.on('error', (err) => {
      this.proc = null;
      this.setStatus({ state: 'error', message: `No se pudo iniciar FFmpeg: ${err.message}` });
    });

    proc.on('close', (code) => {
      const wasStopping = this.status.state === 'stopping';
      this.proc = null;
      if (wasStopping || code === 0) {
        this.setStatus({ state: 'idle', recordingPath });
      } else {
        this.setStatus({
          state: 'error',
          message: `FFmpeg terminó con código ${code}. ${this.stderrTail.slice(-3).join(' | ')}`,
          recordingPath,
        });
      }
    });

    // Consideramos la transmisión "en vivo" cuando ya aceptó los primeros datos.
    setTimeout(() => {
      if (this.proc === proc && this.status.state === 'starting') {
        this.setStatus({ state: 'live', startedAt: Date.now(), recordingPath });
      }
    }, 2500);
  }

  write(chunk: Buffer): void {
    const stdin = this.proc?.stdin;
    if (!stdin || stdin.destroyed) return;
    stdin.write(chunk);
  }

  stop(): void {
    if (!this.proc) return;
    this.setStatus({ ...this.status, state: 'stopping' });
    const proc = this.proc;
    proc.stdin?.end();
    // Si no cierra solo en 5 s, lo forzamos.
    setTimeout(() => {
      if (this.proc === proc) proc.kill('SIGKILL');
    }, 5000);
  }
}

/** El muxer tee usa ':' , '|' y '[' como separadores; hay que escaparlos en las rutas. */
function escapeTee(s: string): string {
  return s.replace(/\\/g, '/').replace(/([:|[\]])/g, '\\$1');
}

export function resolveFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('ffmpeg-static') as string | null;
    if (p) return p.replace('app.asar', 'app.asar.unpacked');
  } catch {
    /* no está instalado: usamos el ffmpeg del sistema */
  }
  return 'ffmpeg';
}
