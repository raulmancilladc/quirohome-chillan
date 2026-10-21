import { useEffect, useRef } from 'react';
import type { Compositor } from '../lib/compositor';

/** Muestra el canvas que se está transmitiendo. */
export function Preview({ compositor, live }: { compositor: Compositor | null; live: boolean }) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!compositor || !host.current) return;
    const el = compositor.canvas;
    host.current.appendChild(el);
    return () => {
      el.remove();
    };
  }, [compositor]);
  return (
    <div className="preview-wrap" ref={host}>
      {live && <span className="live-badge">EN VIVO</span>}
    </div>
  );
}
