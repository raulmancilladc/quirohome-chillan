import type { AppSettings, BusinessInfo, FaqEntry } from '../../shared/types';

interface Props {
  settings: AppSettings;
  onSave: (s: AppSettings) => Promise<void>;
}

const BUSINESS_FIELDS: Array<{ key: keyof BusinessInfo; label: string; placeholder: string; multiline?: boolean }> = [
  { key: 'name', label: 'Nombre del centro', placeholder: 'QuiroHome Chillán' },
  { key: 'address', label: 'Dirección', placeholder: 'Calle Ejemplo 123, Chillán' },
  { key: 'howToGet', label: 'Cómo llegar', placeholder: 'A dos cuadras de la Plaza de Armas, frente a…', multiline: true },
  { key: 'website', label: 'Página web', placeholder: 'https://www.quirohome.cl' },
  { key: 'bookingUrl', label: 'Link para agendar', placeholder: 'https://…/agendar' },
  { key: 'phone', label: 'Teléfono / WhatsApp', placeholder: '+56 9 1234 5678' },
  { key: 'hours', label: 'Horario de atención', placeholder: 'Lunes a viernes 9:00 a 19:00, sábados 9:00 a 13:00' },
  { key: 'services', label: 'Qué tratan / diagnósticos', placeholder: 'Dolor lumbar, cervical, hernias, ciática, escoliosis…', multiline: true },
  { key: 'extra', label: 'Otros datos útiles', placeholder: 'Estacionamiento, convenios, primera consulta…', multiline: true },
];

/** Datos del negocio + preguntas frecuentes que alimentan las respuestas automáticas. */
export function FaqEditor({ settings, onSave }: Props) {
  const setBusiness = (patch: Partial<BusinessInfo>) => onSave({ ...settings, business: { ...settings.business, ...patch } });
  const setFaq = (faq: FaqEntry[]) => onSave({ ...settings, faq });
  const updateFaq = (id: string, patch: Partial<FaqEntry>) => setFaq(settings.faq.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const auto = settings.autoAnswer;
  const setAuto = (patch: Partial<AppSettings['autoAnswer']>) => onSave({ ...settings, autoAnswer: { ...auto, ...patch } });

  return (
    <div className="page">
      <h2>Respuestas automáticas</h2>

      <div className="card">
        <h3>¿Cómo responder?</h3>
        <div className="grid-2">
          <div className="field">
            <label>Modo</label>
            <select value={auto.mode} onChange={(e) => setAuto({ mode: e.target.value as typeof auto.mode })}>
              <option value="suggest">Sugerir: la app propone y yo apruebo con un clic</option>
              <option value="auto">Automático: responde sola las preguntas frecuentes</option>
              <option value="off">Apagado</option>
            </select>
          </div>
          <div className="field">
            <label>Segundos que la respuesta se muestra sobre el video</label>
            <input type="number" min={4} max={60} value={auto.overlaySeconds} onChange={(e) => setAuto({ overlaySeconds: Number(e.target.value) })} />
          </div>
        </div>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={auto.showOverlay} onChange={(e) => setAuto({ showOverlay: e.target.checked })} /> Mostrar la respuesta en pantalla (todos la ven, en todas las plataformas)</label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={auto.postToChat} onChange={(e) => setAuto({ postToChat: e.target.checked })} /> Publicar también en el chat (YouTube y Facebook; TikTok si configuras la sesión)</label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={auto.answerEverything} onChange={(e) => setAuto({ answerEverything: e.target.checked })} /> Contestar todo: también saludos, agradecimientos y comentarios que no son preguntas</label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={auto.learnFromAnswers} onChange={(e) => setAuto({ learnFromAnswers: e.target.checked })} /> Aprender: cada respuesta que edite o escriba a mano se guarda como nueva pregunta frecuente</label>
        <label className="row"><input type="checkbox" style={{ width: 'auto' }} checked={auto.useAi} onChange={(e) => setAuto({ useAi: e.target.checked })} /> Usar IA (Claude) para preguntas que no están en la lista, usando solo los datos del negocio y tus respuestas anteriores</label>
        {auto.useAi && (
          <div className="field" style={{ marginTop: 8 }}>
            <label>Clave de API de Anthropic</label>
            <input type="password" value={auto.anthropicApiKey} onChange={(e) => setAuto({ anthropicApiKey: e.target.value })} placeholder="sk-ant-…" />
          </div>
        )}
      </div>

      <div className="card">
        <h3>Datos del negocio</h3>
        <p className="help">Estos datos rellenan las respuestas. Donde la respuesta diga <code>{'{{address}}'}</code>, se pone la dirección, y así con cada campo.</p>
        <div className="grid-2">
          {BUSINESS_FIELDS.map((f) => (
            <div className="field" key={f.key} style={f.multiline ? { gridColumn: '1 / -1' } : undefined}>
              <label>{f.label}</label>
              {f.multiline ? (
                <textarea value={settings.business[f.key]} placeholder={f.placeholder} onChange={(e) => setBusiness({ [f.key]: e.target.value })} />
              ) : (
                <input value={settings.business[f.key]} placeholder={f.placeholder} onChange={(e) => setBusiness({ [f.key]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3>Preguntas frecuentes</h3>
        <p className="help">Cuando un comentario contiene alguna de las palabras clave, se propone (o publica) la respuesta. Campos disponibles: {'{{address}} {{howToGet}} {{website}} {{bookingUrl}} {{phone}} {{hours}} {{services}} {{name}} {{extra}}'}</p>
        {settings.faq.map((f) => (
          <div className="faq-item" key={f.id} style={f.id.startsWith('aprendida-') ? { borderColor: 'var(--accent)' } : undefined}>
            {f.id.startsWith('aprendida-') && <div className="small-text" style={{ color: 'var(--accent)', marginBottom: 6 }}>✨ Aprendida en un live</div>}
            <div className="row" style={{ marginBottom: 8 }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={f.enabled} onChange={(e) => updateFaq(f.id, { enabled: e.target.checked })} />
              <input className="grow" value={f.question} onChange={(e) => updateFaq(f.id, { question: e.target.value })} placeholder="Pregunta modelo" />
              <button className="small" onClick={() => setFaq(settings.faq.filter((x) => x.id !== f.id))}>Quitar</button>
            </div>
            <div className="field">
              <label>Palabras clave (separadas por coma)</label>
              <input value={f.keywords.join(', ')} onChange={(e) => updateFaq(f.id, { keywords: e.target.value.split(',').map((k) => k.trim()).filter(Boolean) })} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Respuesta</label>
              <textarea value={f.answer} onChange={(e) => updateFaq(f.id, { answer: e.target.value })} />
            </div>
          </div>
        ))}
        <button onClick={() => setFaq([...settings.faq, { id: `faq-${Date.now()}`, question: '', keywords: [], answer: '', enabled: true }])}>+ Agregar pregunta</button>
      </div>
    </div>
  );
}
