// Tap log -> moments, and notifications without spam.
import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Db } from '../server/db.ts';
import { seed } from '../server/seed.ts';
import { loadConfig } from '../server/config.ts';
import { EventHub } from '../server/events.ts';
import { closeStaleMoments, listMoments, momentSent, recordTaps } from '../server/moments.ts';
import { enqueue, flushNotifications } from '../server/notify.ts';
import type { NotifyBatch, ServerEvent } from '../shared/types.ts';

const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'jt-act-')) });
let db: Db;
let sent: { to: number[] | 'all'; e: ServerEvent }[];
const hub = { publish: (to: number[] | 'all', e: ServerEvent) => sent.push({ to, e }) } as unknown as EventHub;
const at = (hhmm: string) => new Date(`2026-09-23T${hhmm}:00`);
const uid = (u: string) => db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', u)!.id;
const batchesFor = (u: string) => sent.filter((s) => s.e.type === 'notify' && Array.isArray(s.to) && s.to.includes(uid(u))).map((s) => (s.e as { batch: NotifyBatch }).batch);
const day = () => listMoments(db, at('00:00').toISOString(), at('23:59').toISOString());

beforeEach(() => {
  db = new Db(':memory:');
  seed(db, cfg);
  sent = [];
});

test('taps close together are one moment; a quiet spell starts a new one', () => {
  recordTaps(db, hub, at('10:01'), [
    { at: at('10:00').toISOString(), action: 'open', screen: 'orbit', item_id: 'eat' },
    { at: new Date(at('10:00').getTime() + 5000).toISOString(), action: 'add', screen: 'orbit', item_id: 'eat' },
    { at: new Date(at('10:00').getTime() + 9000).toISOString(), action: 'add', screen: 'orbit:eat', item_id: 'grapes' },
  ]);
  recordTaps(db, hub, at('10:05'), [{ at: at('10:05').toISOString(), action: 'add', screen: 'orbit', item_id: 'bath' }]);
  const [later, first] = day();
  assert.equal(first.outcome, 'not_sent');
  assert.equal(first.sentence_en, 'I want to eat grapes.');
  assert.deepEqual(first.chips.map((c) => c.id), ['eat', 'eat', 'grapes']);
  assert.equal(later.outcome, 'open');
});

test('a message closes the moment as sent; Clear closes it as cleared', () => {
  recordTaps(db, hub, at('10:00'), [{ at: at('10:00').toISOString(), action: 'add', screen: 'orbit', item_id: 'water' }]);
  const msg = db.run("INSERT INTO messages(from_user_id, tokens, sentence_en, sentence_es, created_at) VALUES(1,'[]','x','x',?)", at('10:00').toISOString()).lastId;
  momentSent(db, hub, at('10:00'), msg);
  recordTaps(db, hub, at('10:02'), [
    { at: at('10:02').toISOString(), action: 'add', screen: 'orbit', item_id: 'bath' },
    { at: at('10:02').toISOString(), action: 'clear', screen: 'orbit' },
  ]);
  const [cleared, done] = day();
  assert.equal(done.outcome, 'sent');
  assert.equal(done.message_id, msg);
  assert.equal(cleared.outcome, 'cleared');
});

test('an unsent moment with a face goes to that person, riding along later, not on its own', () => {
  recordTaps(db, hub, at('10:00'), [
    { at: at('10:00').toISOString(), action: 'person', screen: 'orbit', person_id: 'pilar' },
    { at: at('10:00').toISOString(), action: 'add', screen: 'person', item_id: 'eat' },
  ]);
  closeStaleMoments(db, hub, at('10:01'));
  assert.deepEqual(day()[0].notified, ['pilar']);
  flushNotifications(db, hub, at('10:02'));
  assert.equal(batchesFor('pilar').length, 0, '💭 alone does not buzz right away');
  // A real message arrives: the 💭 rides along in the same update.
  enqueue(db, hub, at('10:10'), uid('pilar'), 'message', 'Abuela Pilar, I love you!');
  const [b] = batchesFor('pilar');
  assert.deepEqual(b.lines.map((l) => l.kind).sort(), ['face', 'message']);
});

test('first message right away, the rest as one update after the window; repeats collapse', () => {
  const joyce = uid('joyce');
  enqueue(db, hub, at('10:00'), joyce, 'message', 'I want water.');
  enqueue(db, hub, at('10:02'), joyce, 'message', 'I want grapes.');
  enqueue(db, hub, at('10:03'), joyce, 'message', 'I want grapes.');
  assert.equal(batchesFor('joyce').length, 1);
  flushNotifications(db, hub, at('10:05'));
  assert.equal(batchesFor('joyce').length, 1, 'still inside the 10-minute window');
  flushNotifications(db, hub, at('10:10'));
  const b = batchesFor('joyce')[1];
  assert.deepEqual(b.lines, [{ kind: 'message', summary: 'I want grapes.', count: 2, message_id: null }]);
  assert.equal(b.total, 2);
});

test('urgent is never held back; quiet hours hold everything else until morning', () => {
  const joyce = uid('joyce');
  enqueue(db, hub, at('22:00'), joyce, 'message', 'I want water.');
  flushNotifications(db, hub, at('23:30'));
  assert.equal(batchesFor('joyce').length, 0);
  enqueue(db, hub, at('23:40'), joyce, 'urgent', 'Help!');
  const b = batchesFor('joyce')[0];
  assert.equal(b.lines[0].kind, 'urgent', 'urgent first, and the held message comes with it');
  assert.equal(b.total, 2);
});

test('settings: no grouping, and 💭 turned off', () => {
  const pilar = uid('pilar');
  db.run('INSERT INTO notify_prefs(user_id, batch_min, face_taps) VALUES(?, 0, 0)', pilar);
  enqueue(db, hub, at('10:00'), pilar, 'message', 'a');
  enqueue(db, hub, at('10:01'), pilar, 'message', 'b');
  enqueue(db, hub, at('10:02'), pilar, 'face', '💭 tapped your face');
  assert.equal(batchesFor('pilar').length, 2);
  assert.equal(db.get<{ n: number }>("SELECT COUNT(*) AS n FROM notify_queue WHERE kind = 'face'")!.n, 0);
});
