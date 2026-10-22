import type { Orientation, TitleOverlay } from '../../shared/types';

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

interface ActiveTitle {
  title: TitleOverlay;
  shownAt: number;
  /** Momento en que empieza a salir (para la animación de salida). */
  hideAt: number | null;
}
const TITLE_ANIM_MS = 450;

export const SIZES: Record<Orientation, { width: number; height: number }> = {
  vertical: { width: 1080, height: 1920 },
  horizontal: { width: 1920, height: 1080 },
};
/** Modo ligero: 720p, la mitad de píxeles que procesar. */
export const SIZES_LIGHT: Record<Orientation, { width: number; height: number }> = {
  vertical: { width: 720, height: 1280 },
  horizontal: { width: 1280, height: 720 },
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
  private pip: HTMLVideoElement | null = null;
  /** Esquina del recuadro de la segunda cámara. */
  pipCorner: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right';
  private raf = 0;
  private running = false;
  overlay: OverlayText | null = null;
  brandLabel = '';
  mirror = false;
  showComments = true;
  /** 'cover' llena la pantalla recortando; 'contain' muestra la cámara completa con fondo difuminado. */
  fit: 'cover' | 'contain' = 'contain';
  /** Fondo cuando la cámara no llena la pantalla: difuminado, oscuro o color de marca. */
  background: 'blur' | 'dark' | 'brand' = 'dark';
  brandColor = '#1b3a5c';
  /** Zoom adicional sobre la cámara principal (1 = sin zoom). */
  zoom = 1;
  /** Rotación de la cámara principal en grados (0, 90, 180, 270). */
  rotation = 0;
  private comments: OverlayComment[] = [];
  private titles: ActiveTitle[] = [];

  /** Muestra un título; si ya está visible, lo oculta (funciona como interruptor). */
  toggleTitle(title: TitleOverlay) {
    const existing = this.titles.find((t) => t.title.id === title.id && t.hideAt === null);
    if (existing) {
      existing.hideAt = Date.now();
      return false;
    }
    // Un solo título por posición: el nuevo reemplaza al que estaba.
    for (const t of this.titles) if (t.title.position === title.position && t.hideAt === null) t.hideAt = Date.now();
    this.titles.push({ title, shownAt: Date.now(), hideAt: null });
    return true;
  }

  hideAllTitles() {
    const now = Date.now();
    for (const t of this.titles) if (t.hideAt === null) t.hideAt = now;
  }

  isTitleVisible(id: string): boolean {
    return this.titles.some((t) => t.title.id === id && t.hideAt === null);
  }

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

  setOrientation(o: Orientation, light = false) {
    this.orientation = o;
    const { width, height } = (light ? SIZES_LIGHT : SIZES)[o];
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
  }

  setVideo(v: HTMLVideoElement | null) {
    this.video = v;
  }

  setPip(v: HTMLVideoElement | null) {
    this.pip = v;
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
      const rotated = this.rotation % 180 !== 0;
      const vw = rotated ? video.videoHeight : video.videoWidth;
      const vh = rotated ? video.videoWidth : video.videoHeight;
      const cover = Math.max(W / vw, H / vh);
      const contain = Math.min(W / vw, H / vh);

      if (this.fit === 'contain' && contain < cover) {
        if (this.background === 'blur') {
          // La misma imagen ampliada y difuminada.
          ctx.save();
          ctx.filter = `blur(${Math.round(W * 0.03)}px)`;
          this.drawCamera(video, cover * 1.1, rotated);
          ctx.restore();
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          ctx.fillRect(0, 0, W, H);
        } else if (this.background === 'brand') {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, this.brandColor);
          g.addColorStop(1, '#0b1722');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        } else {
          const g = ctx.createLinearGradient(0, 0, 0, H);
          g.addColorStop(0, '#15181d');
          g.addColorStop(1, '#000');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, W, H);
        }
      }
      const scale = (this.fit === 'contain' ? contain : cover) * this.zoom;
      this.drawCamera(video, scale, rotated);
    } else {
      ctx.fillStyle = '#9aa0a6';
      ctx.font = `${Math.round(W * 0.035)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Esperando cámara…', W / 2, H / 2);
    }

    if (this.pip && this.pip.videoWidth > 0) {
      const pw = Math.round(W * 0.3);
      const ph = Math.round((pw * 9) / 16);
      const m = Math.round(W * 0.035);
      const x = this.pipCorner.endsWith('left') ? m : W - pw - m;
      const y = this.pipCorner.startsWith('top') ? m * 2.4 : H - ph - m * (this.orientation === 'vertical' ? 5 : 2);
      const vw = this.pip.videoWidth;
      const vh = this.pip.videoHeight;
      const sc = Math.max(pw / vw, ph / vh);
      const sw = pw / sc;
      const sh = ph / sc;
      ctx.save();
      roundRect(ctx, x, y, pw, ph, m * 0.4);
      ctx.clip();
      ctx.drawImage(this.pip, (vw - sw) / 2, (vh - sh) / 2, sw, sh, x, y, pw, ph);
      ctx.restore();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(2, W * 0.003);
      roundRect(ctx, x, y, pw, ph, m * 0.4);
      ctx.stroke();
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

    this.drawTitles();

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

  /** Títulos y textos con animación de entrada y salida. */
  private drawTitles() {
    const now = Date.now();
    for (const t of this.titles) {
      if (t.hideAt === null && t.title.seconds > 0 && now - t.shownAt > t.title.seconds * 1000) t.hideAt = now;
    }
    this.titles = this.titles.filter((t) => t.hideAt === null || now - t.hideAt < TITLE_ANIM_MS);
    for (const t of this.titles) {
      const inP = Math.min(1, (now - t.shownAt) / TITLE_ANIM_MS);
      const outP = t.hideAt === null ? 0 : Math.min(1, (now - t.hideAt) / TITLE_ANIM_MS);
      const p = easeOut(inP) * (1 - easeIn(outP));
      this.drawTitle(t.title, p);
    }
  }

  private drawTitle(t: TitleOverlay, p: number) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const vertical = this.orientation === 'vertical';
    const m = Math.round(W * 0.05);
    const font = `'${t.font}', Poppins, sans-serif`;
    const maxWidth = W - m * 2;
    const yAnchor = t.position === 'arriba' ? m * 2.6 : t.position === 'centro' ? H * 0.42 : H - m * (vertical ? 6 : 2.2);
    const slide = (1 - p) * m * 1.5;

    ctx.save();
    ctx.globalAlpha = p;
    ctx.textBaseline = 'alphabetic';

    if (t.style === 'titulo') {
      const fs = Math.round(W * (vertical ? 0.12 : 0.085));
      ctx.font = `800 ${fs}px ${font}`;
      const lines = wrap(ctx, t.text, maxWidth).slice(0, 3);
      ctx.textAlign = 'center';
      let y = yAnchor + (t.position === 'centro' ? -((lines.length - 1) * fs * 0.55) : 0) + slide;
      for (const l of lines) {
        ctx.lineWidth = fs * 0.12;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineJoin = 'round';
        ctx.strokeText(l, W / 2, y);
        ctx.fillStyle = t.color;
        ctx.fillText(l, W / 2, y);
        y += fs * 1.1;
      }
      if (t.subtext) {
        ctx.font = `600 ${Math.round(fs * 0.38)}px ${font}`;
        ctx.fillStyle = t.accent;
        ctx.fillText(t.subtext, W / 2, y - fs * 0.5);
      }
    } else if (t.style === 'tercio') {
      // Tercio inferior: barra de color + nombre y cargo.
      const fs = Math.round(W * (vertical ? 0.055 : 0.04));
      const fs2 = Math.round(fs * 0.6);
      ctx.font = `800 ${fs}px ${font}`;
      const w1 = ctx.measureText(t.text).width;
      ctx.font = `500 ${fs2}px ${font}`;
      const w2 = t.subtext ? ctx.measureText(t.subtext).width : 0;
      const boxW = Math.min(maxWidth, Math.max(w1, w2) + fs * 1.6);
      const boxH = fs * 1.5 + (t.subtext ? fs2 * 1.6 : 0);
      const x = m - slide;
      const y = yAnchor - boxH;
      ctx.fillStyle = 'rgba(10,14,24,0.78)';
      roundRect(ctx, x, y, boxW, boxH, fs * 0.25);
      ctx.fill();
      ctx.fillStyle = t.accent;
      ctx.fillRect(x, y, fs * 0.22, boxH);
      ctx.textAlign = 'left';
      ctx.fillStyle = t.color;
      ctx.font = `800 ${fs}px ${font}`;
      ctx.fillText(t.text, x + fs * 0.7, y + fs * 1.1);
      if (t.subtext) {
        ctx.font = `500 ${fs2}px ${font}`;
        ctx.fillStyle = t.accent;
        ctx.fillText(t.subtext, x + fs * 0.7, y + fs * 1.1 + fs2 * 1.4);
      }
    } else if (t.style === 'banda') {
      // Banda de borde a borde.
      const fs = Math.round(W * (vertical ? 0.06 : 0.045));
      const fs2 = Math.round(fs * 0.62);
      const boxH = fs * 1.6 + (t.subtext ? fs2 * 1.5 : 0);
      const y = (t.position === 'arriba' ? m * 1.2 : t.position === 'centro' ? H / 2 - boxH / 2 : yAnchor - boxH) - slide;
      ctx.fillStyle = t.accent;
      ctx.fillRect(0, y, W, boxH);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(0, y + boxH - fs * 0.12, W, fs * 0.12);
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.font = `800 ${fs}px ${font}`;
      ctx.fillText(t.text, W / 2, y + fs * 1.15);
      if (t.subtext) {
        ctx.font = `600 ${fs2}px ${font}`;
        ctx.fillText(t.subtext, W / 2, y + fs * 1.15 + fs2 * 1.4);
      }
    } else if (t.style === 'burbuja') {
      // Burbuja redondeada centrada, estilo sticker.
      const fs = Math.round(W * (vertical ? 0.075 : 0.055));
      const fs2 = Math.round(fs * 0.5);
      ctx.font = `700 ${fs}px ${font}`;
      const lines = wrap(ctx, t.text, maxWidth - fs * 2).slice(0, 2);
      const w = Math.min(maxWidth, Math.max(...lines.map((l) => ctx.measureText(l).width), t.subtext ? ctx.measureText(t.subtext).width * 0.6 : 0) + fs * 1.6);
      const h = lines.length * fs * 1.15 + fs * 0.9 + (t.subtext ? fs2 * 1.6 : 0);
      const x = W / 2 - w / 2;
      const y = (t.position === 'centro' ? H / 2 - h / 2 : t.position === 'arriba' ? m * 2 : yAnchor - h) - slide;
      const scale = 0.85 + 0.15 * p;
      ctx.translate(W / 2, y + h / 2);
      ctx.scale(scale, scale);
      ctx.translate(-W / 2, -(y + h / 2));
      ctx.fillStyle = t.accent;
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = fs * 0.6;
      ctx.shadowOffsetY = fs * 0.15;
      roundRect(ctx, x, y, w, h, h / 2.2);
      ctx.fill();
      ctx.shadowColor = 'transparent';
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.font = `700 ${fs}px ${font}`;
      let cy = y + fs * 1.2;
      for (const l of lines) {
        ctx.fillText(l, W / 2, cy);
        cy += fs * 1.15;
      }
      if (t.subtext) {
        ctx.font = `600 ${fs2}px ${font}`;
        ctx.globalAlpha = p * 0.8;
        ctx.fillText(t.subtext, W / 2, cy - fs * 0.15);
      }
    } else {
      // Cinta: texto que se desplaza (ticker) en una franja.
      const fs = Math.round(W * (vertical ? 0.045 : 0.034));
      const boxH = fs * 1.8;
      const y = (t.position === 'arriba' ? m : t.position === 'centro' ? H / 2 - boxH / 2 : H - boxH - m * (vertical ? 5 : 1.5));
      ctx.fillStyle = 'rgba(10,14,24,0.82)';
      ctx.fillRect(0, y, W, boxH);
      ctx.fillStyle = t.accent;
      ctx.fillRect(0, y, W, fs * 0.14);
      const label = t.text ? `${t.text}  ·  ` : '';
      const msg = `${label}${t.subtext}     `;
      ctx.font = `600 ${fs}px ${font}`;
      const tw = ctx.measureText(msg).width;
      const speed = W * 0.12; // px por segundo
      const offset = ((Date.now() / 1000) * speed) % tw;
      ctx.textAlign = 'left';
      ctx.fillStyle = t.color;
      for (let x = -offset; x < W; x += tw) ctx.fillText(msg, x, y + fs * 1.25);
    }
    ctx.restore();
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

  /** Dibuja la cámara centrada con escala, espejo y rotación. */
  private drawCamera(video: HTMLVideoElement, scale: number, rotated: boolean) {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const sw = video.videoWidth;
    const sh = video.videoHeight;
    const dw = (rotated ? sh : sw) * scale;
    const dh = (rotated ? sw : sh) * scale;
    ctx.save();
    ctx.translate(W / 2, H / 2);
    if (this.mirror) ctx.scale(-1, 1);
    ctx.rotate((this.rotation * Math.PI) / 180);
    if (rotated) ctx.drawImage(video, -dh / 2, -dw / 2, dh, dw);
    else ctx.drawImage(video, -dw / 2, -dh / 2, dw, dh);
    ctx.restore();
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

function easeOut(p: number) {
  return 1 - Math.pow(1 - p, 3);
}
function easeIn(p: number) {
  return p * p * p;
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
