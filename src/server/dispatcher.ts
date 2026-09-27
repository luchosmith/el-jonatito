// The "brain": decides who receives a message and what gentle context to show Jonatito.
// Notes are informational only — a message is never blocked.
import type { Db } from './db.ts';
import type { DispatchNote, Token, TokenKind } from '../shared/types.ts';
import { renderSentence, type ResolvedToken } from '../shared/grammar.ts';
import { HttpError } from './http.ts';
import { inWindow, localDay, minutesOfDay, startOfDay } from '../shared/time.ts';

export interface DispatchInput {
  fromUserId: number;
  toPersonId: string | null;
  tokens: Token[];
  audioFile?: string | null;
  /** a sentence written by the server (pain reports) instead of one built from the tokens */
  sentence?: { en: string; es: string };
  /** force the urgent path (pain reports at a high level) */
  urgent?: boolean;
}

export interface DispatchResult {
  messageId: number;
  recipients: number[];
  notes: DispatchNote[];
  sentence_en: string;
  sentence_es: string;
  priority: 'normal' | 'urgent';
}

interface SymbolRow { id: string; kind: TokenKind; label_en: string; label_es: string; is_hidden: number; log_trackable: number; alias_of: string | null }
interface PersonRow { id: string; kind: 'person' | 'pet'; short_label: string; label_es: string | null; is_self: number; role: string | null }

const PERSON_SQL = `SELECT p.id, p.kind, COALESCE(i.short_label, i.label_en) AS short_label, i.label_es, p.is_self, p.role
  FROM people p JOIN items i ON i.id = p.id WHERE p.id = ?`;
interface StaffRow { user_id: number; person_id: string; role: string; status: string | null; until: string | null; sort_order: number }

const DEFAULT_RECENT_MIN = 60;

/** Canonical symbol id: "water" on the Drinks page is the same word as "water" on the Food page. */
export function canonicalSymbol(db: Db, id: string): string {
  const r = db.get<{ alias_of: string | null }>('SELECT alias_of FROM items WHERE id = ?', id);
  return r?.alias_of ?? id;
}

function staff(db: Db): StaffRow[] {
  return db.all<StaffRow>(
    `SELECT u.id AS user_id, u.person_id, u.role, a.status, a.until, p.sort_order
     FROM users u JOIN people p ON p.id = u.person_id LEFT JOIN availability a ON a.user_id = u.id
     WHERE u.role IN ('caretaker','friend') ORDER BY p.sort_order`,
  );
}

export function isAvailable(s: { status: string | null; until: string | null }, now: Date): boolean {
  if (!s.status || s.status === 'available') return true;
  // A busy/away status with an "until" time expires by itself.
  return !!s.until && new Date(s.until) <= now;
}

export function dispatch(db: Db, now: Date, input: DispatchInput): DispatchResult {
  if (!input.tokens.length && !input.audioFile && !input.sentence) throw new HttpError(400, 'Empty message');
  if (input.tokens.length > 8) throw new HttpError(400, 'Too many pictures');

  // 1. Resolve tokens
  const resolved: ResolvedToken[] = [];
  const foodSymbols: string[] = [];
  let urgent = !!input.urgent;
  let addressee: PersonRow | undefined;

  for (const t of input.tokens) {
    if (t.kind === 'person' || t.kind === 'pet') {
      const p = db.get<PersonRow>(PERSON_SQL, t.id);
      if (!p) throw new HttpError(400, `Unknown person ${t.id}`);
      if (p.is_self) continue; // "Me" is implicit
      resolved.push({ kind: p.kind === 'pet' ? 'pet' : 'person', en: p.short_label, es: p.label_es ?? p.short_label });
      if (p.kind === 'person' && !addressee) addressee = p;
    } else {
      const s = db.get<SymbolRow>("SELECT id, kind, label_en, label_es, is_hidden, log_trackable, alias_of FROM items WHERE id = ? AND category NOT IN ('person','pet')", t.id);
      if (!s) throw new HttpError(400, `Unknown symbol ${t.id}`);
      resolved.push({ kind: s.kind, en: s.label_en, es: s.label_es });
      if (s.kind === 'urgent') urgent = true;
      if (s.log_trackable) foodSymbols.push(s.alias_of ?? s.id);
    }
  }
  if (input.toPersonId) {
    const p = db.get<PersonRow>(PERSON_SQL, input.toPersonId);
    if (!p) throw new HttpError(400, 'Unknown recipient');
    addressee = p;
  }

  const sentence_en = input.sentence?.en ?? (input.tokens.length ? renderSentence(resolved, 'en') : `${addressee?.short_label ?? ''} 🔊`.trim());
  const sentence_es = input.sentence?.es ?? (input.tokens.length ? renderSentence(resolved, 'es') : sentence_en);

  const notes: DispatchNote[] = [];
  const people = staff(db);
  const onDuty = people.filter((s) => s.role === 'caretaker' && isAvailable(s, now));
  const caretakers = people.filter((s) => s.role === 'caretaker');
  const target = addressee ? people.find((s) => s.person_id === addressee!.id) : undefined;
  let recipients: number[];

  if (urgent) {
    // 2a. Urgent: everyone on duty right now (or every caretaker if nobody is), plus the person he chose.
    const set = new Set((onDuty.length ? onDuty : caretakers).map((s) => s.user_id));
    if (target) set.add(target.user_id);
    recipients = [...set];
    notes.push({
      kind: 'urgent',
      recipient_person_ids: people.filter((s) => set.has(s.user_id)).map((s) => s.person_id),
    });
  } else {
    // 2b. Normal
    const quiet = db.setting<{ start_min: number; end_min: number }>('quiet_hours', { start_min: 1260, end_min: 420 });
    const isQuiet = inWindow(minutesOfDay(now), quiet.start_min, quiet.end_min);
    const fallback = onDuty[0] ?? caretakers[0];

    if (!target || (isQuiet && target.role !== 'caretaker')) {
      recipients = fallback ? [fallback.user_id] : [];
      notes.push({ kind: 'delivered', person_id: fallback?.person_id ?? null });
    } else {
      recipients = [target.user_id];
      if (!isAvailable(target, now)) {
        // Still delivered (they'll see it later) — but offer who is free now.
        notes.push({
          kind: 'busy',
          person_id: target.person_id,
          until: target.until,
          alternatives: people.filter((s) => s.user_id !== target.user_id && isAvailable(s, now)).map((s) => s.person_id),
        });
      } else {
        notes.push({ kind: 'delivered', person_id: target.person_id });
      }
    }

    // 3. Food & drink context from the daily log
    const dayStart = startOfDay(now).toISOString();
    for (const sym of [...new Set(foodSymbols)]) {
      const limit = db.get<{ max_per_day: number | null; min_interval_min: number | null; suggest_symbol_id: string | null }>(
        `SELECT MAX(max_per_day) AS max_per_day, MAX(min_interval_min) AS min_interval_min, MAX(suggest_item_id) AS suggest_symbol_id
         FROM item_rules WHERE item_id = ? AND kind IN ('limit','interval')`, sym,
      );
      const aliases = db.all<{ id: string }>('SELECT id FROM items WHERE id = ? OR alias_of = ?', sym, sym).map((r) => r.id);
      const marks = aliases.map(() => '?').join(',');
      const last = db.get<{ at: string }>(
        `SELECT at FROM log_entries WHERE symbol_id IN (${marks}) AND at <= ? ORDER BY at DESC LIMIT 1`, ...aliases, now.toISOString(),
      );
      const window = limit?.min_interval_min ?? DEFAULT_RECENT_MIN;
      if (last && now.getTime() - new Date(last.at).getTime() <= window * 60_000) {
        notes.push({ kind: 'recent', symbol_id: sym, at: last.at });
      }
      if (limit?.max_per_day) {
        const count = db.get<{ n: number }>(
          `SELECT COUNT(*) AS n FROM log_entries WHERE symbol_id IN (${marks}) AND at >= ? AND at <= ?`, ...aliases, dayStart, now.toISOString(),
        )!.n;
        if (count >= limit.max_per_day) {
          notes.push({ kind: 'limit', symbol_id: sym, count, max: limit.max_per_day, suggest_symbol_id: limit.suggest_symbol_id });
        }
      }
    }

    // 4. Next meal coming up (within 3 hours)
    const nowMin = minutesOfDay(now);
    // next *meal* only (bedtime links the bed); today's pick ("breakfast: eggs") wins over the everyday picture
    const next = db.get<{ start_min: number; symbol_id: string }>(
      `SELECT s.start_min, COALESCE(d.item_id, s.symbol_id) AS symbol_id FROM schedule_items s
       LEFT JOIN schedule_days d ON d.schedule_id = s.id AND d.day = ?
       JOIN items i ON i.id = COALESCE(d.item_id, s.symbol_id)
       WHERE i.category IN ('food','drink') AND s.start_min > ? ORDER BY s.start_min LIMIT 1`, localDay(now), nowMin,
    );
    if (next && next.start_min - nowMin <= 180) {
      const at = startOfDay(now);
      at.setMinutes(next.start_min);
      notes.push({ kind: 'upcoming', symbol_id: next.symbol_id, at: at.toISOString() });
    }
  }

  // 5. Store
  const created = now.toISOString();
  const messageId = db.tx(() => {
    const r = db.run(
      `INSERT INTO messages(from_user_id, to_person_id, tokens, sentence_en, sentence_es, priority, audio_file, notes, created_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      input.fromUserId, addressee?.kind === 'person' ? addressee.id : null, JSON.stringify(input.tokens), sentence_en, sentence_es,
      urgent ? 'urgent' : 'normal', input.audioFile ?? null, JSON.stringify(notes), created,
    );
    for (const uid of recipients) db.run('INSERT INTO message_recipients(message_id, user_id) VALUES(?,?)', r.lastId, uid);
    return r.lastId;
  });

  return { messageId, recipients, notes, sentence_en, sentence_es, priority: urgent ? 'urgent' : 'normal' };
}
