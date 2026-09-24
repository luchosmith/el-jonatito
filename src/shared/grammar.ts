// Turns a strip of picture tokens into a short sentence, in any order.
// [Abuelo][grapes][eat] -> "Abuelo, I want to eat grapes." / "Abuelo, quiero comer uvas."
import type { Lang, TokenKind } from './types.ts';

export interface ResolvedToken {
  kind: TokenKind;
  en: string;
  es: string;
}

const WANT: Record<Lang, string> = { en: 'I want', es: 'quiero' };
const TO: Record<Lang, string> = { en: 'to ', es: '' };
const WITH: Record<Lang, string> = { en: 'with', es: 'con' };
const AND: Record<Lang, string> = { en: 'and', es: 'y' };

function list(words: string[], lang: Lang): string {
  if (words.length <= 1) return words.join('');
  return `${words.slice(0, -1).join(', ')} ${AND[lang]} ${words[words.length - 1]}`;
}

export function renderSentence(tokens: ResolvedToken[], lang: Lang): string {
  if (tokens.length === 0) return '';
  const word = (t: ResolvedToken) => (lang === 'es' ? t.es || t.en : t.en || t.es);

  const addressee = tokens.find((t) => t.kind === 'person');
  const actions = tokens.filter((t) => t.kind === 'action');
  const pets = tokens.filter((t) => t.kind === 'pet');
  const things = tokens.filter((t) => t.kind === 'thing' || t.kind === 'desc');
  const social = tokens.filter((t) => t.kind === 'social' || t.kind === 'urgent');

  const prefix = addressee ? `${word(addressee)}, ` : '';

  // Only social / urgent words: "Mommy Joyce, help!"
  if (actions.length === 0 && pets.length === 0 && things.length === 0) {
    const s = social.map(word).join(', ');
    return `${prefix}${s}!`.replace(/^(.)/, (c) => c.toUpperCase());
  }

  const parts: string[] = [WANT[lang]];
  if (actions.length) parts.push(TO[lang] + actions.map(word).join(' '));
  if (pets.length) {
    const needsWith = actions.some((a) => a.en === 'play' || a.en === 'walk');
    parts.push((needsWith ? `${WITH[lang]} ` : '') + list(pets.map(word), lang));
  }
  if (things.length) parts.push(list(things.map(word), lang));
  let sentence = prefix + parts.join(' ').replace(/\s+/g, ' ').trim();
  if (social.length) sentence += `, ${social.map(word).join(', ')}`;
  sentence += '.';
  return sentence.charAt(0).toUpperCase() + sentence.slice(1);
}
