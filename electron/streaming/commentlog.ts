import fs from 'node:fs';
import type { ChatMessage } from '../../shared/types';

/**
 * Guarda los comentarios del live junto a la grabación:
 * - un .jsonl con cada comentario y el segundo en que apareció,
 * - un .srt con los mismos comentarios, para abrirlos como subtítulos
 *   en el editor de video al armar reels.
 */
export class CommentLog {
  private jsonl: fs.WriteStream | null = null;
  private entries: Array<{ t: number; message: ChatMessage; answer?: string }> = [];
  private startedAt = 0;
  private basePath = '';

  start(recordingPath: string, startedAt: number) {
    this.basePath = recordingPath.replace(/\.[^.]+$/, '');
    this.startedAt = startedAt;
    this.entries = [];
    this.jsonl = fs.createWriteStream(`${this.basePath}-comentarios.jsonl`, { flags: 'a' });
  }

  get active(): boolean {
    return this.jsonl !== null;
  }

  add(message: ChatMessage, answer?: string) {
    if (!this.jsonl) return;
    const t = Math.max(0, (Date.now() - this.startedAt) / 1000);
    const entry = { t, message, answer };
    this.entries.push(entry);
    this.jsonl.write(JSON.stringify(entry) + '\n');
  }

  stop(): string | null {
    if (!this.jsonl) return null;
    this.jsonl.end();
    this.jsonl = null;
    const srtPath = `${this.basePath}-comentarios.srt`;
    const srt = this.entries
      .map((e, i) => {
        const text = `${e.message.author}: ${e.message.text}` + (e.answer ? `\n→ ${e.answer}` : '');
        return `${i + 1}\n${srtTime(e.t)} --> ${srtTime(e.t + 6)}\n${text}\n`;
      })
      .join('\n');
    fs.writeFileSync(srtPath, srt, 'utf8');
    return srtPath;
  }
}

function srtTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const p = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(ms, 3)}`;
}
