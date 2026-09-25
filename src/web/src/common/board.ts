import type { BoardSymbol, Item, Lang, Person } from '../../../shared/types.ts';

export interface Page {
  id: string;
  emoji: string;
  label: { en: string; es: string };
}

export interface Board {
  people: Person[];
  symbols: BoardSymbol[];
  pages: Page[];
  /** the whole catalog, with orbit slots, sounds and time rules */
  items: Item[];
}

/** A picture in the sentence strip. */
export interface StripToken {
  kind: BoardSymbol['kind'] | 'person' | 'pet';
  id: string;
  label: string;
  emoji: string | null;
  photo_url: string | null;
  badge_color?: string | null;
  /** a recorded word, when a caretaker added one */
  audio_url?: string | null;
}

export const GRID_ROWS = 3;
export const GRID_COLS = 6;

export function symbolToken(s: BoardSymbol, lang: 'en' | 'es' = 'en', item?: Item): StripToken {
  return {
    kind: s.kind, id: s.id, label: (lang === 'es' ? s.labels.es : s.labels.en) ?? '', emoji: s.emoji, photo_url: s.photo_url,
    badge_color: s.badge_color, audio_url: item?.audio[lang] ?? null,
  };
}

export function personToken(p: Person, item?: Item, lang: Lang = 'en'): StripToken {
  return {
    kind: p.kind === 'pet' ? 'pet' : 'person', id: p.id, label: p.short_label, emoji: p.emoji, photo_url: p.photo_url,
    audio_url: item?.audio[lang] ?? null,
  };
}

/** A catalog item in the sentence strip: its picture, and the spoken word in the tablet's language. */
export function itemToken(item: Item, lang: Lang = 'en'): StripToken {
  return {
    kind: item.kind, id: item.id, label: item.labels[lang] || item.labels.en, emoji: item.emoji, photo_url: item.photo_url,
    badge_color: item.badge_color, audio_url: item.audio[lang],
  };
}

/** What shows under a picture: the short label ("Bath") or the word itself. */
export const shownLabel = (item: Item) => item.short_label || item.labels.en;

/** Looks up how to draw a token id that came back from the server. */
export function lookupToken(board: Board, t: { kind: string; id: string }): StripToken | null {
  if (t.kind === 'person' || t.kind === 'pet') {
    const p = board.people.find((x) => x.id === t.id);
    return p ? personToken(p) : null;
  }
  const s = board.symbols.find((x) => x.id === t.id);
  return s ? symbolToken(s) : null;
}

export const WEATHER_EMOJI = (code: number) =>
  code === 0 ? '☀️' : code <= 2 ? '⛅' : code === 3 ? '☁️' : code <= 48 ? '🌫️' : code <= 67 ? '🌧️' : code <= 77 ? '❄️' : code <= 82 ? '🌦️' : '⛈️';

export const SEASON_EMOJI: Record<string, string> = { winter: '❄️', spring: '🌸', summer: '☀️', autumn: '🍂' };
export const DAY_COLORS = ['#f4a3a3', '#f7d64a', '#f39a45', '#5cc27a', '#5aa4e6', '#b48be0', '#ec8cc0'];
