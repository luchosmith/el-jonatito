// "My body": the parts he can point to, and how a pain report is said out loud.
import type { Lang } from './types.ts';

export interface BodyPart {
  /** item id is `body_<id>` */
  id: string;
  en: string;
  /** Spanish with its article: "la barriga" */
  es: string;
  plural: boolean;
  emoji: string;
}

export const BODY_PARTS: BodyPart[] = [
  { id: 'head', en: 'head', es: 'la cabeza', plural: false, emoji: '🤕' },
  { id: 'eyes', en: 'eyes', es: 'los ojos', plural: true, emoji: '👀' },
  { id: 'ear', en: 'ear', es: 'el oído', plural: false, emoji: '👂' },
  { id: 'mouth', en: 'mouth', es: 'la boca', plural: false, emoji: '👄' },
  { id: 'throat', en: 'throat', es: 'la garganta', plural: false, emoji: '🗣️' },
  { id: 'chest', en: 'chest', es: 'el pecho', plural: false, emoji: '🫁' },
  { id: 'tummy', en: 'tummy', es: 'la barriga', plural: false, emoji: '🤢' },
  { id: 'potty', en: 'bottom', es: 'la colita', plural: false, emoji: '🚽' },
  { id: 'arm', en: 'arm', es: 'el brazo', plural: false, emoji: '💪' },
  { id: 'hand', en: 'hand', es: 'la mano', plural: false, emoji: '✋' },
  { id: 'leg', en: 'leg', es: 'la pierna', plural: false, emoji: '🦵' },
  { id: 'foot', en: 'foot', es: 'el pie', plural: false, emoji: '🦶' },
];

export const bodyItemId = (part: string) => `body_${part}`;
export const PAIN_LEVELS = [0, 1, 2, 3, 4, 5] as const;

export interface PainPolicy {
  /** levels from here send a message to the caretaker on duty (below: only logged) */
  notify_from: number;
  /** levels from here are urgent: everyone on duty, with escalation */
  urgent_from: number;
}
export const DEFAULT_PAIN_POLICY: PainPolicy = { notify_from: 1, urgent_from: 3 };

const EN_ONE = ["doesn't hurt", 'hurts a little', 'hurts', 'hurts a lot', 'hurts very much', 'hurts so much'];
const EN_MANY = ["don't hurt", 'hurt a little', 'hurt', 'hurt a lot', 'hurt very much', 'hurt so much'];

/** "My tummy hurts a lot." / "Me duele mucho la barriga." */
export function painSentence(part: { en: string; es: string; plural: boolean }, level: number, lang: Lang): string {
  const l = Math.max(0, Math.min(5, Math.round(level)));
  if (lang === 'en') return `My ${part.en} ${(part.plural ? EN_MANY : EN_ONE)[l]}${l === 5 ? '!' : '.'}`;
  const v = part.plural ? 'duelen' : 'duele';
  return [
    `No me ${v} ${part.es}.`,
    `Me ${v} un poco ${part.es}.`,
    `Me ${v} ${part.es}.`,
    `Me ${v} mucho ${part.es}.`,
    `Me ${v} muchísimo ${part.es}.`,
    `¡Me ${v} demasiado ${part.es}!`,
  ][l];
}
