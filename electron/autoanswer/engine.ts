import type { BusinessInfo, ChatMessage, FaqEntry, SuggestedAnswer } from '../../shared/types';
import { askClaude } from './claude';

/** Normaliza texto: minúsculas, sin acentos, sin signos. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Reemplaza {{campo}} con los datos del negocio. */
export function fillTemplate(template: string, business: BusinessInfo): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const value = (business as unknown as Record<string, string>)[key];
    return value && value.trim() ? value : `[${key} no configurado]`;
  });
}

const QUESTION_HINTS = ['donde', 'como ', 'cual', 'cuanto', 'quien', 'cuando', 'tienen', 'atienden', 'puedo', 'se puede', 'sirve para', 'precio', 'valor', 'horario', 'direccion'];

/** ¿Parece una pregunta o una consulta que merece respuesta? */
export function looksLikeQuestion(text: string): boolean {
  const n = normalize(text);
  if (text.includes('?') || text.includes('¿')) return true;
  const padded = ` ${n} `;
  return QUESTION_HINTS.some((h) => padded.includes(h.endsWith(' ') ? ` ${h}` : ` ${h}`));
}

export interface FaqMatch {
  entry: FaqEntry;
  score: number;
}

export function matchFaq(text: string, faq: FaqEntry[]): FaqMatch | null {
  const n = normalize(text);
  if (!n) return null;
  const tokens = new Set(n.split(' '));
  let best: FaqMatch | null = null;

  for (const entry of faq) {
    if (!entry.enabled) continue;
    let score = 0;
    const seen = new Set<string>();
    for (const kw of entry.keywords) {
      const k = normalize(kw);
      if (!k || seen.has(k)) continue;
      seen.add(k);
      if (k.includes(' ')) {
        if (n.includes(k)) score += 3; // frase completa
      } else if (tokens.has(k)) {
        score += 2; // palabra exacta
      } else if (k.length >= 5 && n.includes(k)) {
        score += 1; // palabra contenida (ej. "agend" en "agendar")
      }
    }
    if (score > 0 && (!best || score > best.score)) best = { entry, score };
  }
  return best;
}

export interface EngineOptions {
  faq: FaqEntry[];
  business: BusinessInfo;
  useAi: boolean;
  anthropicApiKey: string;
}

/**
 * Propone una respuesta para un mensaje del chat.
 * 1) Busca en las preguntas frecuentes (rápido, sin costo).
 * 2) Si no hay coincidencia y la IA está activada, consulta a Claude
 *    usando solo la información del negocio.
 */
export async function suggestAnswer(msg: ChatMessage, opts: EngineOptions): Promise<SuggestedAnswer | null> {
  const match = matchFaq(msg.text, opts.faq);
  if (match && match.score >= 2) {
    return {
      messageId: msg.id,
      question: msg.text,
      answer: fillTemplate(match.entry.answer, opts.business),
      source: 'faq',
      confidence: Math.min(1, match.score / 6),
      faqId: match.entry.id,
    };
  }

  if (opts.useAi && opts.anthropicApiKey && looksLikeQuestion(msg.text)) {
    const answer = await askClaude(msg.text, opts.faq, opts.business, opts.anthropicApiKey);
    if (answer) {
      return { messageId: msg.id, question: msg.text, answer, source: 'ia', confidence: 0.6 };
    }
  }
  return null;
}
