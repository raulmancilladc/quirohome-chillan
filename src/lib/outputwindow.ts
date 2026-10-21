/**
 * Ventana de salida limpia: muestra solo el video compuesto (sin botones ni paneles).
 * Sirve para que otro programa (TikTok LIVE Studio, Zoom, OBS) la capture como fuente.
 * Se abre desde el mismo proceso, así que podemos copiar el canvas cuadro a cuadro.
 */
export class OutputWindow {
  private win: Window | null = null;
  private raf = 0;

  get isOpen(): boolean {
    return Boolean(this.win && !this.win.closed);
  }

  open(source: HTMLCanvasElement): void {
    if (this.isOpen) {
      this.win!.focus();
      return;
    }
    const w = window.open('', 'quirolive-salida', 'width=540,height=960');
    if (!w) return;
    this.win = w;
    w.document.title = 'QuiroHome Live · Salida';
    w.document.body.style.cssText = 'margin:0;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center;height:100vh;cursor:none';
    const canvas = w.document.createElement('canvas');
    canvas.style.cssText = 'max-width:100vw;max-height:100vh;';
    w.document.body.appendChild(canvas);
    const ctx = canvas.getContext('2d')!;
    const hint = w.document.createElement('div');
    hint.textContent = 'Doble clic: pantalla completa';
    hint.style.cssText = 'position:fixed;top:8px;left:8px;color:#fff;font:12px sans-serif;opacity:.6;background:rgba(0,0,0,.5);padding:4px 8px;border-radius:6px';
    w.document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 6000);
    w.document.body.addEventListener('dblclick', () => {
      if (w.document.fullscreenElement) void w.document.exitFullscreen();
      else void w.document.documentElement.requestFullscreen();
    });

    const loop = () => {
      if (!this.isOpen) return;
      if (canvas.width !== source.width || canvas.height !== source.height) {
        canvas.width = source.width;
        canvas.height = source.height;
      }
      ctx.drawImage(source, 0, 0);
      this.raf = w.requestAnimationFrame(loop);
    };
    loop();
    w.addEventListener('beforeunload', () => {
      this.win = null;
    });
  }

  close(): void {
    if (this.isOpen) this.win!.close();
    this.win = null;
  }
}
