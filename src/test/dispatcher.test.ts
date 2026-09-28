import { beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Db } from '../server/db.ts';
import { seed } from '../server/seed.ts';
import { loadConfig } from '../server/config.ts';
import { dispatch, isAvailable } from '../server/dispatcher.ts';

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-unit-'));
const cfg = loadConfig({ TEST_MODE: '1', DATA_DIR: dataDir });
let db: Db;
const at = (hhmm: string) => new Date(`2026-09-23T${hhmm}:00`);
const uid = (username: string) => db.get<{ id: number }>('SELECT id FROM users WHERE username = ?', username)!.id;
const child = () => uid('jonatito');

beforeEach(() => {
  db = new Db(':memory:');
  seed(db, cfg);
});

test('delivers to the chosen person and builds both sentences', () => {
  const r = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'person', id: 'pilar' }, { kind: 'thing', id: 'pancakes' }] });
  assert.deepEqual(r.recipients, [uid('pilar')]);
  assert.equal(r.sentence_en, 'Abuela Pilar, I want pancakes.');
  assert.equal(r.sentence_es, 'Abuela Pilar, quiero panqueques.');
});

test('"Me" in the strip is ignored; pets are never addressees', () => {
  const r = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'person', id: 'jonatito' }, { kind: 'pet', id: 'loki' }, { kind: 'action', id: 'hug' }] });
  assert.equal(r.sentence_en, 'I want to hug Loki.');
  assert.deepEqual(r.notes[0], { kind: 'delivered', person_id: 'mommy_joyce' });
});

test('recent + limit notes use aliases across pages', () => {
  db.run("INSERT INTO log_entries(type, symbol_id, at, entered_by) VALUES('drink','smoothie',?,?)", at('08:00').toISOString(), uid('joyce'));
  db.run("INSERT INTO log_entries(type, symbol_id, at, entered_by) VALUES('drink','smoothie',?,?)", at('09:30').toISOString(), uid('joyce'));
  const r = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'thing', id: 'smoothie_d' }] });
  assert.ok(r.notes.some((n) => n.kind === 'limit' && n.count === 2 && n.suggest_symbol_id === 'water'));
});

test('busy recipient: still delivered, alternatives offered', () => {
  db.run("UPDATE availability SET status='busy', until=? WHERE user_id=?", at('11:00').toISOString(), uid('lucho'));
  const r = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: 'lucho', tokens: [{ kind: 'social', id: 'yes' }] });
  assert.deepEqual(r.recipients, [uid('lucho')]);
  const busy = r.notes.find((n) => n.kind === 'busy');
  assert.ok(busy && busy.kind === 'busy' && !busy.alternatives.includes('lucho') && busy.alternatives.includes('mommy_joyce'));
});

test('isAvailable honours expiry', () => {
  assert.equal(isAvailable({ status: 'busy', until: at('09:00').toISOString() }, at('10:00')), true);
  assert.equal(isAvailable({ status: 'busy', until: at('11:00').toISOString() }, at('10:00')), false);
  assert.equal(isAvailable({ status: 'away', until: null }, at('10:00')), false);
});

test('rejects unknown and empty input', () => {
  assert.throws(() => dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [] }));
  assert.throws(() => dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'thing', id: 'nope' }] }));
});

test('on duty: the caretaker with him gets every message too, next to the person he chose; with no name, it goes to them', () => {
  db.run("UPDATE availability SET status='on_duty', until=NULL WHERE user_id=?", uid('lucho'));
  const chosen = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'person', id: 'pilar' }, { kind: 'thing', id: 'pancakes' }] });
  assert.deepEqual([...chosen.recipients].sort(), [uid('lucho'), uid('pilar')].sort());
  const noName = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'thing', id: 'water' }] });
  assert.deepEqual(noName.recipients, [uid('lucho')]);
  assert.deepEqual(noName.notes[0], { kind: 'delivered', person_id: 'lucho' });
  const help = dispatch(db, at('10:00'), { fromUserId: child(), toPersonId: null, tokens: [{ kind: 'urgent', id: 'help' }] });
  assert.ok(help.recipients.includes(uid('lucho')));
  assert.equal(isAvailable({ status: 'on_duty', until: null }, at('10:00')), true);
});
