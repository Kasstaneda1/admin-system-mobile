import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PEOPLE_FAILED, PEOPLE_LOADING, PEOPLE_NOBODY, PEOPLE_OFFLINE, insertMention, matchPeople, mentionsIn, notNotifiedLine,
  notifiedLine, peopleOf, pickerOf, queryAt, refusedMentions, roleLine, segments, shortName,
} from './mentions.js';

// GET /api/mentionable?target=estimate:<id> as the server gives it (by name)
const PEOPLE = [
  { user_id: 4, name: 'Anna Smith', role: 'admin' },
  { user_id: 2, name: 'Mike Torres', role: 'manager' },
  { user_id: 9, name: 'Ivan Petrov', role: 'technician' },
  { user_id: 7, name: 'Sam Anders', role: 'technician' },
];

test('the «@» being typed: at the start or after a space, no line break, up to the caret', () => {
  assert.deepEqual(queryAt('@', 1), { at: 0, query: '' });
  assert.deepEqual(queryAt('Hi @an', 6), { at: 3, query: 'an' });
  assert.deepEqual(queryAt('Hi @anna smi', 12), { at: 3, query: 'anna smi' });
  assert.deepEqual(queryAt('Hi (@mi', 7), { at: 4, query: 'mi' });
  assert.equal(queryAt('mail@an', 7), null);          // an address, not a mention
  assert.equal(queryAt('Hi @an\nx', 8), null);        // the line ended
  assert.equal(queryAt('Hi @ an', 7), null);          // a space right after «@»
  assert.equal(queryAt('Hi @an  x', 9), null);        // two spaces: writing on
  assert.equal(queryAt('Hi @an', 2), null);           // the caret before it
  assert.equal(queryAt('Hi there', 8), null);
  assert.equal(queryAt(null, 0), null);
});

test('who fits: by the first letters of the first or the last name; technicians first, then by name', () => {
  assert.deepEqual(matchPeople(PEOPLE, '').map((p) => p.user_id), [9, 7, 4, 2]);
  assert.deepEqual(matchPeople(PEOPLE, 'an').map((p) => p.user_id), [4, 7]);      // Anna, then Sam Anders
  assert.deepEqual(matchPeople(PEOPLE, 'PET').map((p) => p.user_id), [9]);
  assert.deepEqual(matchPeople(PEOPLE, 'mike t').map((p) => p.user_id), [2]);
  assert.deepEqual(matchPeople(PEOPLE, 'x'), []);
  assert.deepEqual(matchPeople([{ user_id: 'x', name: 'Bad' }, { user_id: 3, name: ' ' }, null], ''), []);
  assert.deepEqual(matchPeople([{ user_id: 5, name: 'José Núñez', role: 'manager' }], 'nun').map((p) => p.user_id), [5]);
});

test('a pick puts «@Full Name » in place of «@que», the caret after it', () => {
  assert.deepEqual(insertMention('Hi @an', 3, 6, 'Anna Smith'), { text: 'Hi @Anna Smith ', caret: 15 });
  assert.deepEqual(insertMention('Hi @an please', 3, 6, 'Anna Smith'), { text: 'Hi @Anna Smith please', caret: 15 });
  assert.deepEqual(insertMention('@', 0, 1, 'Mike Torres'), { text: '@Mike Torres ', caret: 13 });
});

test('the ids to send: picked and still in the text, each once; «@name» typed by hand is plain text', () => {
  const picked = [{ user_id: 4, name: 'Anna Smith' }, { user_id: 2, name: 'Mike Torres' }, { user_id: 4, name: 'Anna Smith' }];
  assert.deepEqual(mentionsIn('@Anna Smith and @Mike Torres, see', picked), [{ user_id: 4, name: 'Anna Smith' }, { user_id: 2, name: 'Mike Torres' }]);
  assert.deepEqual(mentionsIn('@Anna Smith only', picked).map((m) => m.user_id), [4]);  // Mike was erased
  assert.deepEqual(mentionsIn('@Anna Smithson', picked), []);                           // the name goes on
  assert.deepEqual(mentionsIn('@Ivan Petrov', picked), []);                             // typed, not picked
  const many = Array.from({ length: 25 }, (_, i) => ({ user_id: i + 1, name: `P${i + 1}` }));
  assert.equal(mentionsIn(many.map((p) => `@${p.name}`).join(' '), many).length, 20);   // the server's limit
});

test('a message in pieces: «@Name» marked, the reader’s own stronger, the longer name wins', () => {
  const mentions = [{ user_id: 4, name: 'Anna' }, { user_id: 5, name: 'Anna Smith' }, { user_id: 9, name: 'Ivan Petrov' }];
  assert.deepEqual(segments('@Anna Smith, ask @Ivan Petrov. @Anna too', mentions, 9), [
    { text: '@Anna Smith', mention: { user_id: 5, name: 'Anna Smith' }, me: false },
    { text: ', ask ' },
    { text: '@Ivan Petrov', mention: { user_id: 9, name: 'Ivan Petrov' }, me: true },
    { text: '. ' },
    { text: '@Anna', mention: { user_id: 4, name: 'Anna' }, me: false },
    { text: ' too' },
  ]);
  assert.deepEqual(segments('@Annabel', mentions), [{ text: '@Annabel' }]);
  assert.deepEqual(segments('plain', null), [{ text: 'plain' }]);
  assert.deepEqual(segments('', []), []);
});

test('«Notified: …» under a sent message: its mentions but the author; «Not notified: …» for the refused', () => {
  const c = { user_id: 9, mentions: [{ user_id: 4, name: 'Anna Smith' }, { user_id: 9, name: 'Ivan Petrov' }, { user_id: 2, name: 'Mike Torres' }] };
  assert.equal(notifiedLine(c), 'Notified: Anna S., Mike T.');
  assert.equal(notifiedLine({ user_id: 9, mentions: [{ user_id: 9, name: 'Ivan Petrov' }] }), '');
  assert.equal(notifiedLine({ user_id: 9, mentions: null }), '');
  assert.equal(notifiedLine(null), '');
  assert.equal(notNotifiedLine([{ user_id: 7, name: 'Sam Anders' }]), 'Not notified: Sam A. can’t open this estimate');
  assert.equal(notNotifiedLine([{ user_id: 4, name: 'Anna Smith' }, { user_id: 2, name: 'Mike Torres' }, { user_id: 4, name: 'Anna Smith' }]),
    'Not notified: Anna S., Mike T. — they can’t open this estimate');
  assert.equal(notNotifiedLine([]), '');
  assert.equal(shortName('Cher'), 'Cher');
});

test('the list over the field: people, or one quiet line; no tight spot without a connection', () => {
  const q = (text) => queryAt(text, text.length);
  assert.equal(pickerOf({ query: null, people: PEOPLE }), null);
  assert.deepEqual(pickerOf({ query: q('@an'), people: PEOPLE }).rows.map((p) => p.user_id), [4, 7]);
  // no list yet: loading; no connection and nothing saved — type the name; failed — type on
  assert.deepEqual(pickerOf({ query: q('@an'), people: null, state: 'loading' }), { line: PEOPLE_LOADING });
  assert.deepEqual(pickerOf({ query: q('@an'), people: null, state: 'offline' }), { line: PEOPLE_OFFLINE });
  assert.equal(PEOPLE_OFFLINE, 'No connection — type the name');
  assert.deepEqual(pickerOf({ query: q('@an'), people: null, state: 'failed' }), { line: PEOPLE_FAILED });
  // the saved list without a connection: the people, no line
  assert.deepEqual(pickerOf({ query: q('@mi'), people: PEOPLE, state: 'offline' }).rows.map((p) => p.user_id), [2]);
  // nobody: a line; with a space — writing on, no list; 404 — no list on this estimate
  assert.deepEqual(pickerOf({ query: q('@zz'), people: PEOPLE }), { line: PEOPLE_NOBODY });
  assert.equal(pickerOf({ query: q('@zz yy'), people: PEOPLE }), null);
  assert.equal(pickerOf({ query: q('@an'), people: null, state: 'none' }), null);
  // right after a picked name: writing on, not picking again
  assert.equal(pickerOf({ query: q('@Anna Smith '), picked: [{ user_id: 4, name: 'Anna Smith' }], people: PEOPLE }), null);
});

test('roles in the list; the server answer; a refusal for mentions', () => {
  assert.deepEqual(PEOPLE.map(roleLine), ['Admin', 'Manager', 'Technician · on this estimate', 'Technician · on this estimate']);
  assert.equal(roleLine({ role: 'other' }), '');
  assert.deepEqual(peopleOf({ people: [{ user_id: '4', name: ' Anna ', role: 'admin' }, { user_id: 0, name: 'x' }] }), [{ user_id: 4, name: 'Anna', role: 'admin' }]);
  assert.deepEqual(peopleOf(null), []);
  assert.deepEqual(refusedMentions({ response: { status: 400, data: { code: 'mention_not_allowed', user_ids: [7, '4'] } } }), [7, 4]);
  assert.deepEqual(refusedMentions({ response: { status: 400, data: { code: 'mention_not_allowed' } } }), []);
  assert.equal(refusedMentions({ response: { status: 400, data: { error: 'Comment text is required' } } }), null);
  assert.equal(refusedMentions(new Error('Network Error')), null);
});
