// Types shared by the server, the web app and the tests.

export type Role = 'child' | 'caretaker' | 'friend';
export type Lang = 'en' | 'es';
export type Labels = Partial<Record<Lang, string | null>>;

/** Word classes follow the modified Fitzgerald Key used on the board. */
export type TokenKind = 'person' | 'pet' | 'action' | 'thing' | 'desc' | 'social' | 'urgent';

export type AvailabilityStatus = 'available' | 'busy' | 'away';

export interface User {
  id: number;
  username: string;
  role: Role;
  person_id: string | null;
  display_name: string;
}

export interface Person {
  id: string;
  kind: 'person' | 'pet';
  display_name: string;
  short_label: string;
  relation: string | null;
  role: Role | null;
  is_self: boolean;
  is_visible: boolean;
  sort_order: number;
  species: string | null;
  breed: string | null;
  emoji: string | null;
  photo_url: string | null;
  user_id: number | null;
  status: AvailabilityStatus | null;
  status_until: string | null;
}

export interface BoardSymbol {
  id: string;
  category: string;
  kind: TokenKind;
  emoji: string;
  labels: Labels;
  grid_page: string;
  grid_row: number;
  grid_col: number;
  is_hidden: boolean;
  badge_color: string | null;
  photo_url: string | null;
  log_trackable: boolean;
}

export interface Token {
  kind: TokenKind;
  /** person id for person/pet tokens, symbol id otherwise */
  id: string;
}

export type ReplyKind = 'yes' | 'wait' | 'no' | 'coming' | 'voice';

export interface Reply {
  id: number;
  message_id: number;
  from_user_id: number;
  from_person_id: string | null;
  kind: ReplyKind;
  eta_at: string | null;
  audio_url: string | null;
  created_at: string;
}

export interface Message {
  id: number;
  from_user_id: number;
  to_person_id: string | null;
  tokens: Token[];
  sentence_en: string;
  sentence_es: string;
  priority: 'normal' | 'urgent';
  audio_url: string | null;
  created_at: string;
  recipients: number[];
  replies: Reply[];
}

export type DispatchNote =
  | { kind: 'recent'; symbol_id: string; at: string }
  | { kind: 'limit'; symbol_id: string; count: number; max: number; suggest_symbol_id: string | null }
  | { kind: 'upcoming'; symbol_id: string; at: string }
  | { kind: 'busy'; person_id: string; until: string | null; alternatives: string[] }
  | { kind: 'delivered'; person_id: string | null }
  | { kind: 'urgent'; recipient_person_ids: string[] };

export interface LogEntry {
  id: number;
  type: 'food' | 'drink' | 'meds' | 'sleep' | 'toilet' | 'mood' | 'activity';
  symbol_id: string | null;
  amount: number | null;
  note: string | null;
  at: string;
  entered_by: number;
  entered_by_name: string;
}

export interface ScheduleItem {
  id: number;
  symbol_emoji: string;
  label: string;
  /** minutes after midnight, local time */
  start_min: number;
}

export interface MediaItem {
  id: number;
  title: string;
  kind: 'movie' | 'song' | 'photos' | 'story' | 'sensory';
  emoji: string | null;
  cover_url: string | null;
  bedtime_ok: boolean;
  sort_order: number;
}

export interface MediaPolicy {
  session_max_min: number;
  sleep_start_min: number; // e.g. 20:30 -> 1230
  sleep_end_min: number; // e.g. 07:00 -> 420
}

export interface NowInfo {
  now: string;
  season: 'winter' | 'spring' | 'summer' | 'autumn';
  weather: { temp_c: number; code: number } | null;
  place: string;
}

/** Server-sent event payloads. */
export type ServerEvent =
  | { type: 'message'; message: Message }
  | { type: 'reply'; reply: Reply; message_id: number }
  | { type: 'availability'; person_id: string; status: AvailabilityStatus; until: string | null }
  | { type: 'log'; entry: LogEntry }
  | { type: 'people'; }
  | { type: 'symbols'; };
