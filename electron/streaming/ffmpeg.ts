import { spawn, type ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import type { StreamStartOptions, StreamStatus } from '../../shared/types';

/**
 * Motor de transmisión: recibe el video ya compuesto desde la interfaz
 * (WebM generado por MediaRecorder) y lo re-codifica una sola vez con FFmpeg,
 * enviándolo en paralelo a todas las plataformas con el muxer "tee".
 */
export class StreamEngine extends EventEmitter {
  private proc: ChildProcess | null = null;
  private status: StreamStatus = { state: 'idle' };
  private stderrTail: string[] = [];

  constructor(private readonly ffmpegPath: string, private readonly recordingsDir: string) {
    super();
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

    let recordingPath: string | null = null;
    if (opts.recordLocally) {
      fs.mkdirSync(this.recordingsDir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      recordingPath = path.join(this.recordingsDir, `live-${stamp}-${opts.orientation}.mkv`);
      outputs.push(`[f=matroska]${escapeTee(recordingPath)}`);
    }

    if (outputs.length === 0) {
      throw new Error('No hay destinos activos con clave de transmisión ni grabación local.');
    }

    const gop = opts.fps * 2;
    const vb = `${opts.videoBitrateKbps}k`;
    const args = [
      '-hide_banner',
      '-loglevel', 'warning',
      '-fflags', '+genpts',
      '-i', 'pipe:0',
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-tune', 'zerolatency',
      '-profile:v', 'main',
      '-pix_fmt', 'yuv420p',
      '-r', String(opts.fps),
      '-g', String(gop),
      '-keyint_min', String(gop),
      '-sc_threshold', '0',
      '-b:v', vb,
      '-maxrate', vb,
      '-bufsize', `${opts.videoBitrateKbps * 2}k`,
      '-c:a', 'aac',
      '-b:a', `${opts.audioBitrateKbps}k`,
      '-ar', '44100',
      '-ac', '2',
      '-flags', '+global_header',
      '-f', 'tee',
      outputs.join('|'),
    ];

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
