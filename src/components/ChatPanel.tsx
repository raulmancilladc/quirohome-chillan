import { useEffect, useRef, useState } from 'react';
import type { AppSettings, ChatMessage, Platform, PlatformConnectionStatus, SuggestedAnswer } from '../../shared/types';
import type { AnsweredEvent } from '../../electron/preload';

interface Props {
  settings: AppSettings;
  onOverlay: (question: string, answer: string) => void;
  onToast: (t: string) => void;
}

interface Row {
  message: ChatMessage;
  suggestion?: SuggestedAnswer;
  answered?: { posted: boolean; text: string };
}

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: 'YouTube', facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok', custom: 'Otro',
};

/** Chat unificado con sugerencias de respuesta y botón de "Responder". */
export function ChatPanel({ settings, onOverlay, onToast }: Props) {
  const [rows, setRows] = useState<Row[]>([]);
  const [conn, setConn] = useState<Record<string, PlatformConnectionStatus>>({});
  const [manual, setManual] = useState('');
  const [manualPlatform, setManualPlatform] = useState<Platform>('instagram');
  const [onlyQuestions, setOnlyQuestions] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const offs = [
      window.quirolive.chat.onMessage((m) => setRows((r) => [...r.slice(-300), { message: m }])),
      window.quirolive.chat.onSuggestion((s) => setRows((r) => r.map((row) => (row.message.id === s.messageId ? { ...row, suggestion: s } : row)))),
      window.quirolive.chat.onAnswered((e: AnsweredEvent) => {
        setRows((r) => r.map((row) => (row.message.id === e.message.id ? { ...row, suggestion: e.suggestion, answered: { posted: e.posted, text: e.suggestion.answer } } : row)));
        if (e.overlay) onOverlay(e.message.text, e.suggestion.answer);
      }),
      window.quirolive.chat.onStatus((s) => setConn((c) => ({ ...c, [s.platform]: s }))),
    ];
    return () => offs.forEach((f) => f());
  }, [onOverlay]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [rows.length]);

  const answer = async (row: Row, text: string) => {
    const suggestion: SuggestedAnswer = row.suggestion
      ? { ...row.suggestion, answer: text }
      : { messageId: row.message.id, question: row.message.text, answer: text, source: 'manual', confidence: 1 };
    try {
      await window.quirolive.chat.answer(row.message, suggestion);
    } catch (err) {
      onToast((err as Error).message);
    }
  };

  const sendManual = async () => {
    if (!manual.trim()) return;
    await window.quirolive.chat.manualQuestion(manualPlatform, manual.trim());
    setManual('');
  };

  const visible = onlyQuestions ? rows.filter((r) => r.suggestion || /[?¿]/.test(r.message.text)) : rows;

  return (
    <aside className="side">
      <header>
        <h2>💬 Preguntas del público</h2>
        <div className="grow" />
        <label className="row small-text" style={{ marginBottom: 0 }}>
          <input type="checkbox" style={{ width: 'auto' }} checked={onlyQuestions} onChange={(e) => setOnlyQuestions(e.target.checked)} /> Solo preguntas
        </label>
      </header>
      <div className="conn-list">
        {Object.values(conn).length === 0 && <span className="muted">Los chats se conectan al iniciar la transmisión.</span>}
        {Object.values(conn).map((s) => (
          <span key={s.platform} className={s.connected ? 'ok' : 'bad'}>
            {s.connected ? '●' : '○'} {PLATFORM_LABEL[s.platform]}: {s.message}
          </span>
        ))}
      </div>
      <div className="messages" ref={listRef}>
        {visible.length === 0 && <div className="muted small-text" style={{ padding: 12 }}>Aquí aparecerán los comentarios de todas las plataformas. Las preguntas reconocidas traerán una respuesta sugerida.</div>}
        {visible.map((row) => (
          <MessageRow key={row.message.id} row={row} mode={settings.autoAnswer.mode} onAnswer={answer} />
        ))}
      </div>
      <div className="manual">
        <label>Agregar pregunta manual (ej. la que ves en Instagram desde el celular)</label>
        <div className="row">
          <select value={manualPlatform} onChange={(e) => setManualPlatform(e.target.value as Platform)} style={{ width: 120 }}>
            {(Object.keys(PLATFORM_LABEL) as Platform[]).map((p) => <option key={p} value={p}>{PLATFORM_LABEL[p]}</option>)}
          </select>
          <input className="grow" placeholder="¿Dónde quedan?" value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && sendManual()} />
          <button onClick={sendManual}>Agregar</button>
        </div>
      </div>
    </aside>
  );
}

function MessageRow({ row, mode, onAnswer }: { row: Row; mode: AppSettings['autoAnswer']['mode']; onAnswer: (row: Row, text: string) => void }) {
  const [text, setText] = useState(row.suggestion?.answer ?? '');
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (row.suggestion) setText(row.suggestion.answer);
  }, [row.suggestion]);

  const isQuestion = Boolean(row.suggestion) || /[?¿]/.test(row.message.text);
  return (
    <div className={`msg ${isQuestion ? 'question' : ''}`}>
      <div className="meta">
        <span className={`plat ${row.message.platform}`}>{row.message.platform}</span>
        <strong>{row.message.author}</strong>
        <span>{new Date(row.message.timestamp).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
      <div>{row.message.text}</div>

      {row.answered ? (
        <div className="answered">
          ✅ Respondido {row.answered.posted ? 'en el chat y en pantalla' : 'en pantalla'}: “{row.answered.text}”
        </div>
      ) : row.suggestion || editing ? (
        <div className="suggestion">
          {row.suggestion && (
            <div className="small-text muted" style={{ marginBottom: 4 }}>
              Sugerencia {row.suggestion.source === 'faq' ? 'de preguntas frecuentes' : row.suggestion.source === 'ia' ? 'generada por IA' : 'manual'}
              {mode === 'auto' && ' · (modo automático)'}
            </div>
          )}
          <textarea value={text} onChange={(e) => setText(e.target.value)} />
          <div className="row">
            <button className="primary small" onClick={() => onAnswer(row, text)} disabled={!text.trim()}>Responder</button>
            {editing && <button className="small" onClick={() => setEditing(false)}>Cancelar</button>}
          </div>
        </div>
      ) : (
        <div className="row" style={{ marginTop: 6 }}>
          <button className="small" onClick={() => setEditing(true)}>Responder…</button>
        </div>
      )}
    </div>
  );
}
