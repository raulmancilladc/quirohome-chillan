import type { Orientation } from '../../shared/types';

export interface OverlayText {
  question: string;
  answer: string;
  until: number;
}

export interface OverlayComment {
  author: string;
  text: string;
  platform: string;
  at: number;
}

const COMMENT_SECONDS = 18;
const MAX_COMMENTS = 5;

export const SIZES: Record<Orientation, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
};

/**
 * Dibuja la cámara en un canvas con la orientación elegida (recorte tipo "cover")
 * y superpone la respuesta a la pregunta activa. El canvas es lo que se transmite,
 * así que el texto se ve en todas las plataformas a la vez.
 */
export class Compositor {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null = null;
  private raf = 0;
  private running = false;
  overlay: OverlayText | null = null;
  brandLabel = '';
  mirror = false;
  showComments = true;
  private comments: OverlayComment[] = [];

  addComment(c: OverlayComment) {
    this.comments = [...this.comments, c].slice(-MAX_COMMENTS);
  }

  constructor(public orientation: Orientation) {
    this.canvas = document.createElement('canvas');
    const { width, height } = SIZES[orientation];
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
  }

  setOrientation(o: Orientation) {
    this.orientation = o;
    const { width, height } = SIZES[o];
    this.canvas.width = width;
    this.canvas.height = height;
  }

  setVideo(v: HTMLVideoElement | null) {
    this.video = v;
  }

  start() {
    if (this.running) return;
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.draw();
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private draw() {
    const { ctx, canvas, video } = this;
    const W = canvas.width;
    const H = canvas.height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);

    if (video && video.videoWidth > 0) {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const scale = Math.max(W / vw, H / vh);
      const dw = vw * scale;
      const dh = vh * scale;
      const dx = (W - dw) / 2;
      const dy = (H - dh) / 2;
      ctx.save();
      if (this.mirror) {
        ctx.translate(W, 0);
        ctx.scale(-1, 1);
      }
      ctx.drawImage(video, dx, dy, dw, dh);
      ctx.restore();
    } else {
      ctx.fillStyle = '#9aa0a6';
      ctx.font = `${Math.round(W * 0.035)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Esperando cámara…', W / 2, H / 2);
    }

    if (this.brandLabel) {
      const fs = Math.round(W * 0.028);
      ctx.font = `600 ${fs}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      const pad = fs * 0.5;
      const tw = ctx.measureText(this.brandLabel).width;
      roundRect(ctx, pad, pad, tw + pad * 2, fs + pad, fs * 0.4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillText(this.brandLabel, pad * 2, pad + fs * 0.95);
    }

    let answerBoxTop = H;
    if (this.overlay && Date.now() < this.overlay.until) {
      answerBoxTop = this.drawOverlay(this.overlay);
    } else if (this.overlay) {
      this.overlay = null;
    }

    if (this.showComments) {
      const now = Date.now();
      this.comments = this.comments.filter((c) => now - c.at < COMMENT_SECONDS * 1000);
      if (this.comments.length) this.drawComments(answerBoxTop);
    }
  }

  /** Comentarios recientes, estilo TikTok, sobre la zona inferior izquierda. */
  private drawComments(bottomLimit: number) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const margin = Math.round(W * 0.045);
    const fs = Math.round(W * 0.026);
    const maxWidth = Math.min(W * 0.72, W - margin * 2) - margin;
    const lineGap = 1.25;
    const bottom = Math.min(bottomLimit - margin * 0.5, H - margin * (this.orientation === 'vertical' ? 3.5 : 1.5));
    let y = bottom;
    const now = Date.now();
    ctx.textAlign = 'left';
    for (let i = this.comments.length - 1; i >= 0; i--) {
      const c = this.comments[i];
      const age = (now - c.at) / 1000;
      const alpha = age > COMMENT_SECONDS - 2 ? Math.max(0, (COMMENT_SECONDS - age) / 2) : 1;
      ctx.font = `600 ${fs}px sans-serif`;
      const name = `${c.author}  `;
      const nameW = ctx.measureText(name).width;
      ctx.font = `400 ${fs}px sans-serif`;
      const lines = wrap(ctx, c.text, maxWidth - nameW).slice(0, 2);
      const boxH = lines.length * fs * lineGap + fs * 0.7;
      y -= boxH + fs * 0.35;
      if (y < H * 0.35) break;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      roundRect(ctx, margin, y, Math.min(maxWidth + margin, W - margin * 2), boxH, fs * 0.5);
      ctx.fill();
      ctx.fillStyle = '#4fd1c5';
      ctx.font = `600 ${fs}px sans-serif`;
      ctx.fillText(name, margin + fs * 0.5, y + fs * 1.15);
      ctx.fillStyle = '#fff';
      ctx.font = `400 ${fs}px sans-serif`;
      let cy = y + fs * 1.15;
      for (const l of lines) {
        ctx.fillText(l, margin + fs * 0.5 + (cy === y + fs * 1.15 ? nameW : 0), cy);
        cy += fs * lineGap;
      }
      ctx.globalAlpha = 1;
    }
  }

  /** Dibuja la respuesta y devuelve la coordenada superior de la caja. */
  private drawOverlay(o: OverlayText): number {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const margin = Math.round(W * 0.045);
    const qSize = Math.round(W * 0.03);
    const aSize = Math.round(W * 0.038);
    const maxWidth = W - margin * 4;

    ctx.font = `500 ${qSize}px sans-serif`;
    const qLines = wrap(ctx, `❓ ${o.question}`, maxWidth).slice(0, 2);
    ctx.font = `700 ${aSize}px sans-serif`;
    const aLines = wrap(ctx, o.answer, maxWidth).slice(0, 4);

    const lineGap = 1.25;
    const boxH = margin * 1.6 + qLines.length * qSize * lineGap + aLines.length * aSize * lineGap;
    const y = H - boxH - margin * (this.orientation === 'vertical' ? 3.5 : 1.5);

    ctx.fillStyle = 'rgba(12, 18, 32, 0.82)';
    roundRect(ctx, margin, y, W - margin * 2, boxH, margin * 0.5);
    ctx.fill();
    ctx.fillStyle = '#4fd1c5';
    ctx.fillRect(margin, y, Math.round(W * 0.012), boxH);

    ctx.textAlign = 'left';
    let cy = y + margin * 0.8 + qSize;
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `500 ${qSize}px sans-serif`;
    for (const l of qLines) {
      ctx.fillText(l, margin * 2, cy);
      cy += qSize * lineGap;
    }
    cy += aSize * 0.2;
    ctx.fillStyle = '#ffffff';
    ctx.font = `700 ${aSize}px sans-serif`;
    for (const l of aLines) {
      ctx.fillText(l, margin * 2, cy);
      cy += aSize * lineGap;
    }
    return y;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = test;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
