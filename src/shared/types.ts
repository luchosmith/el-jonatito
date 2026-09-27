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

export type ReplyKind = 'yes' | 'wait' | 'no' | 'coming' | 'voice' | 'text';

export interface Reply {
  id: number;
  message_id: number;
  from_user_id: number;
  from_person_id: string | null;
  kind: ReplyKind;
  eta_at: string | null;
  audio_url: string | null;
  /** typed reply, read aloud on the tablet */
  text: string | null;
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
  /** set when the message came from the My body screen */
  pain: { part: string; side: string | null; level: number } | null;
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
  type: 'food' | 'drink' | 'meds' | 'sleep' | 'toilet' | 'mood' | 'activity' | 'pain';
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
  /** the word it shows (its photo, when there is one): e.g. bedtime -> bed */
  symbol_id: string | null;
  /** minutes after midnight, local time */
  start_min: number;
  /** a block (sleep 20:30 -> 7:00): its picture repeats until then; earlier than start_min = the next morning */
  end_min: number | null;
  /** a full-size picture on the timeline (the morning chain: wake-up, breakfast) */
  big: boolean;
}

export interface MediaItem {
  id: number;
  title: string;
  kind: 'movie' | 'song' | 'photos' | 'story' | 'sensory';
  emoji: string | null;
  cover_url: string | null;
  bedtime_ok: boolean;
  sort_order: number;
  /** the video / song, when one was uploaded */
  file_url: string | null;
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
  | { type: 'symbols'; }
  | { type: 'items'; }
  /** autoplay: a new note the tablet plays once by itself (never during quiet hours) */
  | { type: 'voice_note'; note: VoiceNote; autoplay?: boolean }
  | { type: 'location'; person_id: string }
  | { type: 'notify'; batch: NotifyBatch }
  | { type: 'timeline' };

// ---- v0.3: item catalog, voice notes, locations ------------------------------------------

export type ItemCategory =
  | 'person' | 'pet' | 'food' | 'drink' | 'action' | 'place' | 'feeling' | 'play' | 'media' | 'body' | 'social' | 'urgent' | 'core';
export type TapAction = 'add' | 'open' | 'play' | 'body' | 'none';
export type Orbit = 'inner' | 'outer';

export interface ItemRule {
  id: number;
  item_id: string;
  kind: 'window' | 'limit' | 'interval';
  /** true: the item is closed (dimmed, with a clock) in the orbit; false: only a gentle reminder */
  blocks: boolean;
  /** bitmask Sun..Sat (bit 0 = Sunday); null = every day */
  days: number | null;
  start_min: number | null;
  end_min: number | null;
  routine_item_id: number | null;
  routine_open_min: number | null;
  max_per_day: number | null;
  min_interval_min: number | null;
  suggest_item_id: string | null;
}

/** One row for everything Jonatito can touch: people, pets, foods, actions, media, body parts. */
export interface Item {
  id: string;
  category: ItemCategory;
  kind: TokenKind;
  labels: { en: string; es: string };
  /** shown under the picture ("Bath"); the spoken label can be longer ("take a bath") */
  short_label: string | null;
  emoji: string | null;
  tap: TapAction;
  parent_id: string | null;
  orbit: Orbit | null;
  orbit_slot: number | null;
  grid_page: string | null;
  grid_row: number | null;
  grid_col: number | null;
  user_id: number | null;
  media_id: number | null;
  badge_color: string | null;
  log_trackable: boolean;
  alias_of: string | null;
  is_hidden: boolean;
  photo_url: string | null;
  audio: { en: string | null; es: string | null };
  rules: ItemRule[];
  /** when a blocking rule closes the item right now: when it opens again */
  closed_until: string | null;
  closed_by: ItemRule['kind'] | null;
}

export interface ItemImage {
  id: number;
  url: string;
  is_active: boolean;
  created_at: string;
}

export interface VoiceNote {
  id: number;
  from_user_id: number;
  from_person_id: string | null;
  audio_url: string;
  duration_s: number | null;
  created_at: string;
  heard_at: string | null;
  pinned: boolean;
  hidden: boolean;
  source: 'app' | 'reply' | 'whatsapp';
  /** the sender's own name for the clip ("I'll be right there"), so it can be sent again */
  label: string | null;
}

export interface Place {
  place_label: string;
  country_code: string;
  tz: string;
  lat: number;
  lon: number;
}

export interface PersonLocation extends Place {
  person_id: string;
  source: 'manual' | 'phone';
  until: string | null;
  updated_at: string;
}

export interface Locations {
  home: Place;
  people: PersonLocation[];
}


// ---- v0.4: tap log, moments, batched notifications ------------------------------------------

/** What a logged tap did (not to be confused with TapAction: what an item does when tapped). */
export type LoggedTap =
  | 'add' | 'open' | 'closed' | 'person' | 'hear' | 'talk' | 'social' | 'body' | 'pain' | 'media' | 'send' | 'clear' | 'say';

export interface TapInput {
  at: string;
  action: LoggedTap;
  screen: string;
  item_id?: string | null;
  person_id?: string | null;
  detail?: Record<string, unknown> | null;
}

/** One picture in a moment, as he tapped it. */
export interface MomentChip {
  at: string;
  action: LoggedTap;
  id: string | null;
  kind: TokenKind | 'body' | null;
  label: string;
  emoji: string | null;
  photo_url: string | null;
  /** the item was closed when he tapped it: when it opens */
  closed_until: string | null;
}

export interface Moment {
  id: number;
  started_at: string;
  ended_at: string | null;
  outcome: 'open' | 'sent' | 'cleared' | 'not_sent';
  chips: MomentChip[];
  sentence_en: string | null;
  sentence_es: string | null;
  message_id: number | null;
  sent_to: string[];
  notified: string[];
  answered_by: string | null;
}

export type TimelineEntry =
  | { kind: 'moment'; at: string; moment: Moment }
  | { kind: 'pain'; at: string; part: string; level: number; message_id: number | null }
  | { kind: 'voice'; at: string; person_id: string | null; note_id: number; audio_url: string }
  | { kind: 'media'; at: string; title: string; cover_url: string | null; emoji: string | null }
  | { kind: 'log'; at: string; type: string; label: string; emoji: string | null; amount: number | null; by: string }
  | { kind: 'photo'; at: string; event: CalendarEvent }
  | { kind: 'event'; at: string; event: CalendarEvent };

export interface CalendarEvent {
  id: number;
  starts_at: string;
  /** optional: a block of time; its picture repeats across it on his timeline */
  ends_at: string | null;
  title: string;
  emoji: string | null;
  kind: 'event' | 'photo';
  person_ids: string[];
  show_from_min: number;
  photo_url: string | null;
  created_by: string | null;
}

export interface NotifyBatch {
  id: number;
  at: string;
  /** one line each; repeats collapsed */
  lines: { kind: 'message' | 'face' | 'reply' | 'urgent' | 'panic'; summary: string; count: number; message_id: number | null }[];
  total: number;
}

export interface NotifyPrefs {
  batch_min: number;
  face_taps: boolean;
}
