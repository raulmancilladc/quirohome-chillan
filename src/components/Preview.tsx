import { useEffect, useRef } from 'react';
import type { Compositor } from '../lib/compositor';

/** Muestra el canvas que se está transmitiendo. */
export function Preview({ compositor, live, mirror }: { compositor: Compositor | null; live: boolean; mirror: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compositor || !host.current) return;
    const el = compositor.canvas;
    host.current.appendChild(el);
    return () => {
      el.remove();
    };
  }, [compositor]);
  useEffect(() => {
    if (compositor) compositor.canvas.style.transform = mirror ? 'scaleX(-1)' : '';
  }, [compositor, mirror]);
  return (
    <div className="preview-wrap" ref={host}>
      {live && <span className="live-badge">EN VIVO</span>}
      {mirror && <span className="mirror-hint">Espejo solo en tu vista: el público lo ve al derecho</span>}
    </div>
  );
}
