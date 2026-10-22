import { useEffect, useRef, useState } from 'react';
import type { AppSettings, SoundEffect, TitleFont, TitleOverlay, TitlePosition, TitleStyle } from '../../shared/types';
import { Compositor } from '../lib/compositor';
import { GROUPS, GROUP_EMOJI, guessGroup, MAX_DUR, MAX_LOSS_DB } from '../lib/soundgroups';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
  onToast: (t: string) => void;
  onToggleTitle: (id: string) => boolean;
  onPlaySound: (id: string) => void;
  isVisible: (id: string) => boolean;
  onHideAll: () => void;
  /** Mide duración y pérdida en teléfono de un archivo (para importar carpetas). */
  onAnalyze: (path: string) => Promise<{ dur: number; lossDb: number }>;
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
export function TitlesPanel({ settings, onSave, onToast, onToggleTitle, onPlaySound, isVisible, onHideAll, onAnalyze }: Props) {
  const [importing, setImporting] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<Array<{ name: string; reason: string }>>([]);
  const [groupFilter, setGroupFilter] = useState<string>('todos');
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
  const LETTERS = 'qwertyuiopasdfghjklzxcvbnm'.split('');
  const freeKeys = (used: Set<string | undefined>) => LETTERS.filter((k) => !used.has(k));

  const addSounds = async () => {
    const paths = await window.quirolive.sounds.pick();
    if (!paths.length) return;
    await importFiles(paths.map((p) => ({ name: p.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') ?? 'Sonido', path: p, folder: '' })), true);
  };

  /** Importa archivos: mide cada uno, filtra los que no sirven en live y agrupa por tipo. */
  const importFiles = async (files: Array<{ name: string; path: string; folder: string; dur?: number; lossDb?: number }>, forceAll = false) => {
    setImporting(`Analizando 0 de ${files.length}…`);
    const used = new Set(sounds.map((s) => s.hotkey));
    const keys = freeKeys(used);
    const existing = new Set(sounds.map((s) => s.source));
    const added: SoundEffect[] = [];
    const skippedNow: Array<{ name: string; reason: string }> = [];
    let i = 0;
    for (const f of files) {
      i++;
      setImporting(`Analizando ${i} de ${files.length}: ${f.name}`);
      if (/^pedo$/i.test(f.name)) { skippedNow.push({ name: f.name, reason: 'excluido por pedido' }); continue; }
      if (existing.has(f.path)) { skippedNow.push({ name: f.name, reason: 'ya estaba' }); continue; }
      let dur = f.dur;
      let lossDb = f.lossDb;
      if (dur === undefined || lossDb === undefined) {
        try {
          const m = await onAnalyze(f.path);
          dur = dur ?? m.dur;
          lossDb = lossDb ?? m.lossDb;
        } catch {
          skippedNow.push({ name: f.name, reason: 'no se pudo leer' });
          continue;
        }
      }
      if (!forceAll && dur > MAX_DUR) { skippedNow.push({ name: f.name, reason: `muy largo (${dur.toFixed(1)} s)` }); continue; }
      if (!forceAll && lossDb > MAX_LOSS_DB) { skippedNow.push({ name: f.name, reason: `se pierde en teléfono (−${lossDb.toFixed(1)} dB)` }); continue; }
      const group = guessGroup(f.name, f.folder);
      added.push({ id: `snd-${Date.now()}-${i}`, name: f.name.replace(/[_-]+/g, ' '), source: f.path, hotkey: keys.shift(), emoji: GROUP_EMOJI[group], group, dur: Math.round(dur * 100) / 100, lossDb });
    }
    setImporting(null);
    setSkipped(skippedNow);
    if (added.length) await onSave({ ...settings, sounds: [...sounds, ...added] });
    onToast(`${added.length} sonido(s) agregado(s), ${skippedNow.length} descartado(s)`);
  };

  const importCatalog = async () => {
    const entries = await window.quirolive.sounds.importCatalog();
    if (!entries.length) return onToast('No se encontraron archivos del catálogo (revisa que el JSON esté dentro de la carpeta assets).');
    await importFiles(entries);
  };
  const importFolder = async () => {
    const entries = await window.quirolive.sounds.importFolder();
    if (!entries.length) return onToast('La carpeta no tiene audios.');
    await importFiles(entries);
  };

  const visibleSounds = groupFilter === 'todos' ? sounds : sounds.filter((s) => (s.group ?? 'otro') === groupFilter);

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
          Sonidos ({sounds.length})
          <div className="grow" />
          <label className="row small-text" style={{ marginBottom: 0 }}>
            Volumen <input type="range" min={0} max={1} step={0.05} value={settings.sfxVolume} onChange={(e) => onSave({ ...settings, sfxVolume: Number(e.target.value) })} style={{ width: 110 }} />
          </label>
          <label className="row small-text" style={{ marginBottom: 0 }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={settings.sfxMonitor} onChange={(e) => onSave({ ...settings, sfxMonitor: e.target.checked })} /> Escucharlos yo también
          </label>
        </h3>
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <button className="small primary" onClick={importCatalog} disabled={!!importing}>📂 Importar catálogo (APTOS-PARA-LIVE.json)</button>
          <button className="small" onClick={importFolder} disabled={!!importing}>📁 Importar carpeta completa</button>
          <button className="small" onClick={addSounds} disabled={!!importing}>+ Archivos sueltos</button>
          {importing && <span className="small-text muted">{importing}</span>}
        </div>
        <p className="help">
          Al importar, cada sonido se mide: se descartan los de más de {MAX_DUR} s y los que pierden más de {MAX_LOSS_DB} dB en el parlante de un teléfono.
          Todos se precargan en memoria y se normalizan al mismo nivel. Mientras suena un efecto tu voz baja 5 dB para que se escuche.
          Si marcas "Escucharlos yo también" salen por tus parlantes: usa audífonos para no acoplar.
        </p>
        {skipped.length > 0 && (
          <details style={{ marginBottom: 10 }}>
            <summary className="small-text muted">{skipped.length} descartado(s): ver por qué</summary>
            <ul className="small-text muted">{skipped.slice(0, 80).map((k, i) => <li key={i}>{k.name}: {k.reason}</li>)}</ul>
          </details>
        )}
        <div className="row wrap" style={{ marginBottom: 10 }}>
          <button className={`small ${groupFilter === 'todos' ? 'primary' : ''}`} onClick={() => setGroupFilter('todos')}>Todos</button>
          {GROUPS.filter((g) => sounds.some((s) => (s.group ?? 'otro') === g.id)).map((g) => (
            <button key={g.id} className={`small ${groupFilter === g.id ? 'primary' : ''}`} onClick={() => setGroupFilter(g.id)}>{g.emoji} {g.name}</button>
          ))}
        </div>
        <div className="sound-grid">
          {visibleSounds.map((s) => (
            <div key={s.id} className="sound-card">
              <button className="sound-play big" onClick={() => onPlaySound(s.id)} title={`${s.dur ? `${s.dur.toFixed(1)} s` : ''}${s.lossDb !== undefined ? ` · teléfono −${s.lossDb} dB` : ''}`}>
                <span className="emoji">{s.emoji}</span>
                <span className="name">{s.name}</span>
                {s.hotkey && <span className="key">{s.hotkey.toUpperCase()}</span>}
              </button>
              <div className="row">
                <select value={s.group ?? 'otro'} onChange={(e) => updateSound(s.id, { group: e.target.value as SoundEffect['group'], emoji: GROUP_EMOJI[e.target.value as keyof typeof GROUP_EMOJI] })} style={{ width: 120 }} title="Grupo">
                  {GROUPS.map((g) => <option key={g.id} value={g.id}>{g.emoji} {g.name}</option>)}
                </select>
                <input value={s.name} onChange={(e) => updateSound(s.id, { name: e.target.value })} className="grow" title="Nombre" />
                <input value={s.hotkey ?? ''} maxLength={1} onChange={(e) => updateSound(s.id, { hotkey: e.target.value.toLowerCase() || undefined })} style={{ width: 40, textAlign: 'center' }} title="Tecla" placeholder="·" />
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
