import type { AnsweredRecord, BusinessInfo, ChatMessage, FaqEntry, SuggestedAnswer } from '../../shared/types';

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
    // En empate gana la entrada más abajo en la lista: las específicas van después de las generales.
    if (score > 0 && (!best || score >= best.score)) best = { entry, score };
  }
  return best;
}

export interface EngineOptions {
  faq: FaqEntry[];
  business: BusinessInfo;
  useAi: boolean;
  anthropicApiKey: string;
  /** Responder también saludos, agradecimientos y comentarios sin pregunta. */
  answerEverything?: boolean;
  /** Respuestas anteriores aprobadas por el streamer (para aprender el estilo). */
  history?: AnsweredRecord[];
}

type SocialKind = 'saludo' | 'gracias' | 'testimonio' | 'despedida';

const SOCIAL: Record<SocialKind, { keywords: string[]; replies: string[] }> = {
  saludo: {
    keywords: ['hola', 'holaa', 'holaaa', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'saludos', 'presente', 'aqui estoy', 'llegue', 'llegué', 'que tal', 'qué tal'],
    replies: ['¡Hola! Bienvenido/a 🙌 ¿De dónde nos ves?', '¡Hola! Qué bueno que llegaste 🙌', '¡Buenas! Cuéntame desde dónde nos escribes 👋', '¡Hola! Pregunta lo que quieras, acá estoy 🙌'],
  },
  gracias: {
    keywords: ['gracias', 'muchas gracias', 'se agradece', 'mil gracias', 'graciasss', 'grax'],
    replies: ['¡A ti por estar! 🙌', '¡De nada! Cualquier duda, pregunta 👍', '¡Gracias a ti por acompañarme! 🤍'],
  },
  testimonio: {
    keywords: ['me sirvio', 'me sirvió', 'me ayudo', 'me ayudó', 'quede bien', 'quedé bien', 'excelente', 'lo recomiendo', 'los recomiendo', 'me atendi', 'me atendí', 'fui y', 'muy bueno', 'buenisimo', 'buenísimo', 'lo mejor', 'crack', 'genio', 'maestro', 'el mejor', 'la mejor'],
    replies: ['¡Gracias por contarlo! 🙌 Nos alegra un montón 😊', 'Qué bueno leer esto 🙌 Gracias por la confianza ❤️', '¡Muchas gracias! 😊 Se agradece que lo compartas 🙌', 'Gracias por la recomendación 🙌 Un abrazo grande ❤️'],
  },
  despedida: {
    keywords: ['chao', 'chau', 'adios', 'adiós', 'me voy', 'nos vemos', 'hasta luego', 'bye'],
    replies: ['¡Nos vemos! Gracias por acompañarme 🙌', '¡Chao! Cuídate 🤍', '¡Hasta la próxima! 👋'],
  },
};

/** Detecta saludos, agradecimientos, testimonios y despedidas. */
export function matchSocial(text: string): { kind: SocialKind; reply: string } | null {
  const n = normalize(text);
  if (!n || n.split(' ').length > 25) return null;
  const padded = ` ${n} `;
  const order: SocialKind[] = ['testimonio', 'gracias', 'despedida', 'saludo'];
  for (const kind of order) {
    if (SOCIAL[kind].keywords.some((k) => padded.includes(` ${normalize(k)} `))) {
      const replies = SOCIAL[kind].replies;
      return { kind, reply: replies[Math.floor(Math.random() * replies.length)] };
    }
  }
  return null;
}

const STOPWORDS = new Set('a al algo alguien ante aqui aquí asi así aun aún bien buenas buenos cada casi como cómo con contra cual cuál cuando cuándo cuanto cuánto de del desde donde dónde dos el ella ellas ellos en entre era eres es esa esas ese eso esos esta está estan están este esto estos fue ha hace hacen hacer hasta hay hola la las le les lo los mas más me mi mis muy nada ni no nos o os otra otro para pero poco por porque que qué quien quién se sea ser si sí sin sobre solo sólo son soy su sus tal tambien también tan te tengo tener ti tiene tienen todo tu tus un una uno unos ustedes va ya yo'.split(' '));

/** Saca palabras clave de una pregunta para crear una nueva respuesta frecuente. */
export function keywordsFromQuestion(question: string): string[] {
  const n = normalize(question);
  const words = n.split(' ').filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const unique = [...new Set(words)];
  const phrases: string[] = [];
  const all = n.split(' ');
  for (let i = 0; i < all.length - 1; i++) {
    const a = all[i];
    const b = all[i + 1];
    if (!STOPWORDS.has(a) && !STOPWORDS.has(b)) phrases.push(`${a} ${b}`);
  }
  return [...phrases.slice(0, 3), ...unique.slice(0, 6)];
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

  const isQuestion = looksLikeQuestion(msg.text);

  // Saludos, gracias, testimonios: respuesta corta sin usar la IA.
  if (opts.answerEverything && !isQuestion) {
    const social = matchSocial(msg.text);
    if (social) {
      return { messageId: msg.id, question: msg.text, answer: social.reply, source: 'faq', confidence: 0.5, faqId: `social-${social.kind}` };
    }
  }

  if (opts.useAi && opts.anthropicApiKey && (isQuestion || opts.answerEverything)) {
    const { askClaude } = await import('./claude');
    const answer = await askClaude(msg.text, opts.faq, opts.business, opts.anthropicApiKey, opts.history ?? [], Boolean(opts.answerEverything));
    if (answer) {
      return { messageId: msg.id, question: msg.text, answer, source: 'ia', confidence: 0.6 };
    }
  }
  return null;
}
