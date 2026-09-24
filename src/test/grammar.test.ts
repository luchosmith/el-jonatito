import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderSentence, type ResolvedToken } from '../shared/grammar.ts';

const p = (en: string): ResolvedToken => ({ kind: 'person', en, es: en });
const t = (kind: ResolvedToken['kind'], en: string, es: string): ResolvedToken => ({ kind, en, es });

test('person + thing + action, in any order', () => {
  const tokens = [t('thing', 'grapes', 'uvas'), p('Abuelo Lucho'), t('action', 'eat', 'comer')];
  assert.equal(renderSentence(tokens, 'en'), 'Abuelo Lucho, I want to eat grapes.');
  assert.equal(renderSentence(tokens, 'es'), 'Abuelo Lucho, quiero comer uvas.');
});

test('no person, no action', () => {
  assert.equal(renderSentence([t('thing', 'water', 'agua')], 'en'), 'I want water.');
  assert.equal(renderSentence([t('thing', 'water', 'agua')], 'es'), 'Quiero agua.');
});

test('play with a pet', () => {
  const tokens = [p('TinTin'), { kind: 'pet', en: 'Lexi', es: 'Lexi' } as ResolvedToken, t('action', 'play', 'jugar')];
  assert.equal(renderSentence(tokens, 'en'), 'TinTin, I want to play with Lexi.');
  assert.equal(renderSentence(tokens, 'es'), 'TinTin, quiero jugar con Lexi.');
});

test('lists use "and" / "y"', () => {
  const tokens = [t('thing', 'rice bowl', 'tazón de arroz'), t('thing', 'grapes', 'uvas')];
  assert.equal(renderSentence(tokens, 'en'), 'I want rice bowl and grapes.');
  assert.equal(renderSentence(tokens, 'es'), 'Quiero tazón de arroz y uvas.');
});

test('social / urgent words only', () => {
  assert.equal(renderSentence([p('Mommy Joyce'), t('urgent', 'help', 'ayuda')], 'en'), 'Mommy Joyce, help!');
  assert.equal(renderSentence([t('social', 'yes', 'sí')], 'es'), 'Sí!');
});

test('empty strip', () => {
  assert.equal(renderSentence([], 'en'), '');
});
