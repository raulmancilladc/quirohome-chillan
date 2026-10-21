import type { Orientation } from '../../shared/types';

export interface OverlayText {
  question: string;
  answer: string;
  until: number;
}

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

    if (this.overlay && Date.now() < this.overlay.until) {
      this.drawOverlay(this.overlay);
    } else if (this.overlay) {
      this.overlay = null;
    }
  }

  private drawOverlay(o: OverlayText) {
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
