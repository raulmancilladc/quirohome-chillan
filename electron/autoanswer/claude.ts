import Anthropic from '@anthropic-ai/sdk';
import type { BusinessInfo, FaqEntry } from '../../shared/types';
import { fillTemplate } from './engine';
import knowledge from './knowledge.default.md?raw';

const NO_ANSWER = 'NO_RESPONDER';

function buildSystemPrompt(faq: FaqEntry[], business: BusinessInfo): string {
  const faqText = faq
    .filter((f) => f.enabled)
    .map((f) => `- P: ${f.question}\n  R: ${fillTemplate(f.answer, business)}`)
    .join('\n');
  return `Eres el asistente de ${business.name || 'un centro de quiropraxia'} y respondes preguntas del público durante una transmisión en vivo.

Información del negocio:
- Dirección: ${business.address || 'no informada'}
- Cómo llegar: ${business.howToGet || 'no informado'}
- Página web: ${business.website || 'no informada'}
- Agendar hora: ${business.bookingUrl || 'no informado'}
- Teléfono / WhatsApp: ${business.phone || 'no informado'}
- Horario: ${business.hours || 'no informado'}
- Servicios y diagnósticos que se tratan: ${business.services || 'no informado'}
- Otros datos: ${business.extra || 'ninguno'}

Preguntas frecuentes ya preparadas:
${faqText}

Base de conocimiento detallada del centro (servicios, precios, políticas, qué se trata y qué no, preguntas frecuentes):
${knowledge}

Reglas:
- Hablas como Raúl Mancilla respondiendo en su live: español chileno, cercano, directo, en primera persona ("lo veo harto", "escríbeme y lo vemos"). Máximo 2 frases.
- Cuando alguien cuenta un dolor o síntoma, no diagnostiques: di que eso lo ves seguido, que hay que evaluarlo en persona, y entrega el WhatsApp de la sede (o ambos si no se sabe la sede).
- Nunca digas qué horas hay disponibles, nunca prometas resultados ni cantidad de sesiones, nunca ofrezcas nada gratis.
- Ante accidente reciente, fractura, pérdida de fuerza o de control de esfínteres, cefalea súbita con fiebre: deriva a urgencias o médico, sin ofrecer hora.
- Usa SOLO la información de arriba. Nunca inventes direcciones, precios, horarios ni datos médicos.
- No des diagnósticos ni indicaciones médicas personalizadas; invita a evaluarse en consulta.
- Si el mensaje no es una pregunta para el negocio, o no tienes la información, responde exactamente: ${NO_ANSWER}`;
}

/** Pide a Claude una respuesta corta basada solo en los datos del negocio. */
export async function askClaude(
  question: string,
  faq: FaqEntry[],
  business: BusinessInfo,
  apiKey: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey });
  try {
    const response = await client.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 300,
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: buildSystemPrompt(faq, business), cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: question }],
    });
    if (response.stop_reason === 'refusal') return null;
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { text: string }).text)
      .join('')
      .trim();
    if (!text || text.includes(NO_ANSWER)) return null;
    return text;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      console.error('[claude] API key inválida');
    } else if (err instanceof Anthropic.RateLimitError) {
      console.error('[claude] límite de uso alcanzado');
    } else {
      console.error('[claude] error', err);
    }
    return null;
  }
}
