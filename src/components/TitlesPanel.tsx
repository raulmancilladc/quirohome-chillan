import { useEffect, useRef, useState } from 'react';
import type { AppSettings, SoundEffect, TitleFont, TitleOverlay, TitlePosition, TitleStyle } from '../../shared/types';
import { Compositor } from '../lib/compositor';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (t: string) => void;
  onToggleTitle: (id: string) => boolean;
  onPlaySound: (id: string) => void;
  isVisible: (id: string) => boolean;
  onHideAll: () => void;
}

const FONTS: TitleFont[] = ['Poppins', 'Bebas Neue', 'Playfair Display', 'Montserrat', 'Pacifico', 'Oswald', 'Lobster', 'Anton', 'Caveat', 'Righteous'];
const STYLES: Array<{ id: TitleStyle; name: string; desc: string }> = [
  { id: 'titulo', name: 'Título grande', desc: 'Texto grande con borde, para abrir o cerrar' },
  { id: 'tercio', name: 'Nombre y cargo', desc: 'Tercio inferior tipo noticiero' },
  { id: 'banda', name: 'Banda', desc: 'Franja de color de borde a borde' },
  { id: 'burbuja', name: 'Burbuja', desc: 'Sticker redondeado, llama la atención' },
  { id: 'cinta', name: 'Cinta en movimiento', desc: 'Texto que se desplaza, ideal para teléfonos y links' },
];
const POSITIONS: Array<{ id: TitlePosition; name: string }> = [
  { id: 'arriba', name: 'Arriba' },
  { id: 'centro', name: 'Centro' },
  { id: 'abajo', name: 'Abajo' },
];
const PALETTE = ['#ffffff', '#6bc048', '#1b3a5c', '#4fd1c5', '#f56565', '#ecc94b', '#ed64a6', '#000000'];

/** Pestaña de títulos (textos sobre el video) y sonidos. */
export function TitlesPanel({ settings, onSave, onToast, onToggleTitle, onPlaySound, isVisible, onHideAll }: Props) {
  const [selected, setSelected] = useState<string>(settings.titles[0]?.id ?? '');
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(t);
  }, []);

  const titles = settings.titles;
  const current = titles.find((t) => t.id === selected) ?? titles[0];
  const updateTitle = (id: string, patch: Partial<TitleOverlay>) => onSave({ ...settings, titles: titles.map((t) => (t.id === id ? { ...t, ...patch } : t)) });
  const addTitle = () => {
    const used = new Set(titles.map((t) => t.hotkey));
    const hotkey = [1, 2, 3, 4, 5, 6, 7, 8, 9].find((n) => !used.has(n));
    const t: TitleOverlay = { id: `t-${Date.now()}`, text: 'Nuevo título', subtext: '', style: 'titulo', font: 'Poppins', position: 'centro', color: '#ffffff', accent: '#6bc048', seconds: 8, hotkey };
    void onSave({ ...settings, titles: [...titles, t] });
    setSelected(t.id);
  };
  const removeTitle = (id: string) => onSave({ ...settings, titles: titles.filter((t) => t.id !== id) });

  const sounds = settings.sounds;
  const updateSound = (id: string, patch: Partial<SoundEffect>) => onSave({ ...settings, sounds: sounds.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const addSounds = async () => {
    const paths = await window.quirolive.sounds.pick();
    if (!paths.length) return;
    const used = new Set(sounds.map((s) => s.hotkey));
    const free = 'opasdfghjklzxcvbnm'.split('').filter((k) => !used.has(k));
    const added: SoundEffect[] = paths.map((p, i) => ({
      id: `snd-${Date.now()}-${i}`,
      name: p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Sonido',
      source: p,
      hotkey: free[i],
      emoji: '🔊',
    }));
    await onSave({ ...settings, sounds: [...sounds, ...added] });
    onToast(`${added.length} sonido(s) agregado(s)`);
  };

  return (
    <div className="page wide">
      <h2>Títulos y sonidos</h2>
      <p className="help">
        Los títulos se muestran sobre el video con un clic o con <b>Shift + número</b>. Los sonidos suenan en la transmisión con un clic o con su letra.
        <b> Esc</b> oculta todos los títulos y corta los sonidos. Todo funciona también desde la barra rápida de la pestaña En vivo.
      </p>

      <div className="titles-layout">
        <div className="card">
          <h3>
            Títulos
            <div className="grow" />
            <button className="small" onClick={onHideAll}>Ocultar todos</button>
            <button className="small primary" onClick={addTitle}>+ Nuevo</button>
          </h3>
          {titles.map((t) => (
            <div key={t.id} className={`title-row ${t.id === current?.id ? 'selected' : ''}`} onClick={() => setSelected(t.id)}>
              <button className={`small ${isVisible(t.id) ? 'primary' : ''}`} onClick={(e) => { e.stopPropagation(); onToggleTitle(t.id); }} title="Mostrar / ocultar">
                {isVisible(t.id) ? '● En pantalla' : '▶ Mostrar'}
              </button>
              <span className="grow" style={{ fontFamily: `'${t.font}', sans-serif` }}>{t.text || '(sin texto)'}</span>
              <span className="muted small-text">{t.hotkey ? `⇧${t.hotkey}` : ''}</span>
            </div>
          ))}
        </div>

        {current && (
          <div className="card">
            <h3>
              Editar
              <div className="grow" />
              <button className="small" onClick={() => removeTitle(current.id)}>Quitar</button>
            </h3>
            <TitlePreview title={current} orientation={settings.orientation} />
            <div className="grid-2">
              <div className="field"><label>Texto</label><input value={current.text} onChange={(e) => updateTitle(current.id, { text: e.target.value })} /></div>
              <div className="field"><label>Texto secundario</label><input value={current.subtext} onChange={(e) => updateTitle(current.id, { subtext: e.target.value })} /></div>
            </div>
            <div className="field">
              <label>Estilo</label>
              <div className="row wrap">
                {STYLES.map((s) => (
                  <button key={s.id} className={`small ${current.style === s.id ? 'primary' : ''}`} title={s.desc} onClick={() => updateTitle(current.id, { style: s.id })}>{s.name}</button>
                ))}
              </div>
            </div>
            <div className="field">
              <label>Tipografía</label>
              <div className="row wrap">
                {FONTS.map((f) => (
                  <button key={f} className={`small font-btn ${current.font === f ? 'primary' : ''}`} style={{ fontFamily: `'${f}', sans-serif` }} onClick={() => updateTitle(current.id, { font: f })}>{f}</button>
                ))}
              </div>
            </div>
            <div className="grid-2">
              <div className="field">
                <label>Posición</label>
                <div className="segment">
                  {POSITIONS.map((p) => (
                    <button key={p.id} className={current.position === p.id ? 'active' : ''} onClick={() => updateTitle(current.id, { position: p.id })}>{p.name}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label>Segundos en pantalla (0 = hasta ocultarlo)</label>
                <input type="number" min={0} max={600} value={current.seconds} onChange={(e) => updateTitle(current.id, { seconds: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Color del texto</label>
                <ColorPicker value={current.color} onChange={(c) => updateTitle(current.id, { color: c })} />
              </div>
              <div className="field">
                <label>Color de fondo / acento</label>
                <ColorPicker value={current.accent} onChange={(c) => updateTitle(current.id, { accent: c })} />
              </div>
              <div className="field">
                <label>Tecla rápida (Shift + número)</label>
                <select value={current.hotkey ?? ''} onChange={(e) => updateTitle(current.id, { hotkey: e.target.value ? Number(e.target.value) : undefined })}>
                  <option value="">Sin tecla</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>Shift + {n}</option>)}
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3>
          Sonidos
          <div className="grow" />
          <label className="row small-text" style={{ marginBottom: 0 }}>
            Volumen <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume} onChange={(e) => onSave({ ...settings, sfxVolume: Number(e.target.value) })} style={{ width: 110 }} />
          </label>
          <label className="row small-text" style={{ marginBottom: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={settings.sfxMonitor} onChange={(e) => onSave({ ...settings, sfxMonitor: e.target.checked })} /> Escucharlos yo también
          </label>
          <button className="small primary" onClick={addSounds}>+ Agregar mis sonidos (mp3, wav…)</button>
        </h3>
        <p className="help">Los sonidos van directo a la transmisión y a la grabación. Si marcas "Escucharlos yo también" salen por tus parlantes: con el micrófono cerca puede acoplar, usa audífonos.</p>
        <div className="sound-grid">
          {sounds.map((s) => (
            <div key={s.id} className="sound-card">
              <button className="sound-play" onClick={() => onPlaySound(s.id)} title="Reproducir">
                <span className="emoji">{s.emoji}</span>
                <span>{s.name}</span>
              </button>
              <div className="row">
                <input value={s.emoji} onChange={(e) => updateSound(s.id, { emoji: e.target.value.slice(0, 2) })} style={{ width: 44, textAlign: 'center' }} title="Emoji" />
                <input value={s.name} onChange={(e) => updateSound(s.id, { name: e.target.value })} className="grow" title="Nombre" />
                <input value={s.hotkey ?? ''} maxLength={1} onChange={(e) => updateSound(s.id, { hotkey: e.target.value.toLowerCase() || undefined })} style={{ width: 44, textAlign: 'center' }} title="Tecla" placeholder="tecla" />
                <button className="small ghost" onClick={() => onSave({ ...settings, sounds: sounds.filter((x) => x.id !== s.id) })} title="Quitar">✕</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div className="row wrap">
      {PALETTE.map((c) => (
        <button key={c} className={`swatch ${value === c ? 'active' : ''}`} style={{ background: c }} onClick={() => onChange(c)} title={c} />
      ))}
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} style={{ width: 40, padding: 0, height: 28 }} />
    </div>
  );
}

/** Vista previa del título sobre un fondo neutro, con el mismo dibujo que en la transmisión. */
function TitlePreview({ title, orientation }: { title: TitleOverlay; orientation: AppSettings['orientation'] }) {
  const host = useRef<HTMLDivElement>(null);
  const comp = useRef<Compositor | null>(null);
  useEffect(() => {
    const c = new Compositor(orientation);
    c.setOrientation(orientation, true);
    c.showComments = false;
    c.canvas.style.cssText = 'max-width:100%;max-height:260px;border-radius:8px;background:#222';
    host.current?.appendChild(c.canvas);
    c.start();
    comp.current = c;
    return () => {
      c.stop();
      c.canvas.remove();
    };
  }, [orientation]);
  useEffect(() => {
    const c = comp.current;
    if (!c) return;
    c.hideAllTitles();
    const t = setTimeout(() => c.toggleTitle({ ...title, seconds: 0 }), 50);
    return () => clearTimeout(t);
  }, [title]);
  return <div ref={host} style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }} />;
}
