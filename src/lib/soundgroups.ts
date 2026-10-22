import type { SoundGroup } from '../../shared/types';

export const GROUPS: Array<{ id: SoundGroup; name: string; emoji: string }> = [
  { id: 'asombro', name: 'Asombro', emoji: '😮' },
  { id: 'risa', name: 'Risa', emoji: '😂' },
  { id: 'fail', name: 'Fail', emoji: '🙈' },
  { id: 'golpe', name: 'Golpe', emoji: '💥' },
  { id: 'transicion', name: 'Transición', emoji: '🌀' },
  { id: 'campana', name: 'Acierto', emoji: '🔔' },
  { id: 'crujido', name: 'Crujidos', emoji: '🦴' },
  { id: 'otro', name: 'Otros', emoji: '🔊' },
];

const RULES: Array<[SoundGroup, RegExp]> = [
  ['crujido', /cruj|crack|ajuste|cavit|pop_|_pop|cuello|espalda|lumbar/i],
  ['risa', /risa|laugh|lol|jaja|haha|rie|giggle|chuckle|comedia_risa/i],
  ['fail', /fail|error|wrong|buzzer|sad|trombone|womp|fallo|nope|boo|derrota/i],
  ['golpe', /golpe|punch|hit|slap|bonk|caida|caída|crash|bruh|thud|smack|bofet|porrazo|drama/i],
  ['transicion', /trans|whoosh|swoosh|barrido|swipe|sweep|riser|page|turn/i],
  ['campana', /ding|bell|campana|correct|acierto|ta-?da|cash|coin|success|exito|éxito|win|level|aplaus|clap|moneda/i],
  ['asombro', /wow|shock|omg|asombro|sorpresa|vine|boom|dun|suspens|what|que_|gasp|grito|scream|terror|dramatic|quack/i],
];

/** Adivina el grupo por el nombre del archivo o la carpeta. */
export function guessGroup(name: string, folder = ''): SoundGroup {
  const hay = `${folder} ${name}`;
  for (const [g, re] of RULES) if (re.test(hay)) return g;
  return 'otro';
}

export const GROUP_EMOJI: Record<SoundGroup, string> = Object.fromEntries(GROUPS.map((g) => [g.id, g.emoji])) as Record<SoundGroup, string>;

/** Criterio para live: corto y que aguante el parlante del teléfono. */
export const MAX_DUR = 2.2;
export const MAX_LOSS_DB = 5;
