import { test } from 'node:test';
import assert from 'node:assert/strict';
import { billRow, issueFailText, linesLine, orderOf, pressOf, threeOf, threeOffersNext } from './three.js';
import { knownOf } from './model.js';

const NOW = { date: '2026-11-24', minutes: 10 * 60 + 40 };
const visit = (o = {}) => ({ id: 7, role: 'main', legacy: false, status: 'in_progress', outcome: null, visit_kind: 'diagnostics', actions: ['finish'], steps: null, ...o });
const closed = (o = {}) => visit({ status: 'completed', outcome: 'diagnostics_only', actions: [], ...o });
const draft = (o = {}) => ({ status: 'draft', total_cents: 13609, tax_cents: 1109, lines: [{ name: 'Diagnostics', amount_cents: 12500 }], ...o });
const issued = (o = {}) => ({ ...draft(), status: 'issued', label: 'NY-1053', bill_number: 1053, payment_status: 'unpaid', balance_cents: 13609, payments: [], ...o });
const ctx = (o = {}) => ({ visit: visit(), known: knownOf(draft()), ack: null, money: true, now: NOW, ...o });
const keys = (t) => t.buttons.map((b) => `${b.key}:${b.state}${b.lit ? '*' : ''}`).join(' ');

test('before Finish: the three are there, calm; the bill row with Change (d0)', () => {
  const t = threeOf(ctx());
  assert.equal(t.kind, 'three');
  assert.equal(keys(t), 'sign:todo pay:todo send:todo');
  assert.equal(t.lit, null);
  assert.deepEqual(t.row, { title: 'Bill · $136.09', line: 'Diagnostics $125.00 + tax', change: true, head: 'Bill', amount: '$136.09', text: 'Diagnostics $125.00 + tax' });
  assert.equal(t.buttons[1].line, '$136.09');
  assert.equal(t.buttons[2].line, 'Email, share, print or show');
});

test('after Finish: the first not done in the company\'s order is orange (d1, d3)', () => {
  assert.equal(keys(threeOf(ctx({ visit: closed() }))), 'sign:todo* pay:todo send:todo');
  const signed = threeOf(ctx({ visit: closed(), known: knownOf(issued()), ack: { status: 'ok', signed: true, name: 'Test Customer', at: '2026-11-24T15:27:00Z' } }));
  assert.equal(keys(signed), 'sign:done pay:todo* send:todo');
  assert.deepEqual([signed.buttons[0].title, signed.buttons[0].line], ['Signed 10:27', 'Test Customer']);
  assert.deepEqual(signed.row, { title: 'Bill NY-1053 · $136.09', line: 'Final · the office can correct it', change: false, head: 'Bill NY-1053', amount: '$136.09', text: 'Final · the office can correct it' });
});

test('all done: three green, the bill paid, allDone (d7)', () => {
  const bill = issued({ payment_status: 'paid', balance_cents: 0, delivered_at: '2026-11-24T15:30:00Z', delivered_via: 'email', delivered_to: 'test@example.com',
    payments: [{ kind: 'payment', method: 'cash', amount_cents: 13609, received_at: '2026-11-24T15:28:00Z' }] });
  const t = threeOf(ctx({ visit: closed(), known: knownOf(bill), ack: { status: 'ok', signed: true, name: 'Test Customer', at: '2026-11-24T15:27:00Z' } }));
  assert.equal(keys(t), 'sign:done pay:done send:done');
  assert.equal(t.allDone, true);
  assert.deepEqual([t.buttons[1].title, t.buttons[1].line], ['Paid $136.09 cash', '10:28 · with you, turn it in']);
  assert.deepEqual([t.buttons[2].title, t.buttons[2].line], ['Sent to test@example.com', '10:30 · PDF']);
  assert.deepEqual(t.row, { title: 'Bill NY-1053 · Paid', line: '$136.09 · final', change: false, head: 'Bill NY-1053', amount: '$136.09', text: 'Paid · final' });
});

test('a part paid stays orange: «Paid $50.00 · $86.09 left»', () => {
  const bill = issued({ payment_status: 'partly_paid', balance_cents: 8609, payments: [{ kind: 'payment', method: 'card', amount_cents: 5000, received_at: '2026-11-24T15:28:00Z' }] });
  const t = threeOf(ctx({ visit: closed(), known: knownOf(bill), ack: { status: 'ok', signed: true } }));
  assert.equal(keys(t), 'sign:done pay:part* send:todo');
  assert.deepEqual([t.buttons[1].title, t.buttons[1].line], ['Paid $50.00', '$86.09 left']);
});

test('the given bill: handed or shared', () => {
  const handed = threeOf(ctx({ known: knownOf(issued({ delivered_at: '2026-11-24T15:30:00Z', delivered_via: 'handed' })) }));
  assert.deepEqual([handed.buttons[2].title, handed.buttons[2].line], ['Printed copy handed', '10:30']);
  const shared = threeOf(ctx({ known: knownOf(issued({ delivered_at: '2026-11-24T15:30:00Z', delivered_via: 'shared' })) }));
  assert.equal(shared.buttons[2].title, 'Shared as PDF');
});

test('an empty draft: all calm, «Add the work first», every press opens Change', () => {
  const known = knownOf(draft({ lines: [], total_cents: 0, tax_cents: 0 }));
  const t = threeOf(ctx({ visit: closed(), known }));
  assert.equal(t.empty, true);
  assert.equal(t.buttons[1].line, 'Add the work first');
  assert.equal(t.row.line, 'Nothing to charge for yet');
  for (const k of ['sign', 'pay', 'send']) assert.equal(pressOf(t, k, known), 'change');
  // closed with nothing to charge for: the way on to the next visit is there (QA 25.11, Rita)
  assert.equal(threeOffersNext(t), true);
  assert.equal(threeOffersNext(threeOf(ctx({ visit: closed(), known: knownOf(issued()) }))), false);
  assert.equal(threeOffersNext(null), false);
  // no bill yet: Change too
  const none = threeOf(ctx({ known: knownOf(null) }));
  assert.equal(none.buttons[1].line, 'Add the work first');
  assert.equal(pressOf(none, 'pay', knownOf(null)), 'change');
});

test('a press: a draft is made final first; issued opens; done opens what was done', () => {
  const d = knownOf(draft());
  assert.equal(pressOf(threeOf(ctx({ known: d })), 'sign', d), 'issue');
  const i = knownOf(issued());
  assert.equal(pressOf(threeOf(ctx({ known: i })), 'pay', i), 'open');
  const paid = knownOf(issued({ payment_status: 'paid' }));
  assert.equal(pressOf(threeOf(ctx({ known: paid })), 'pay', paid), 'open');
});

test('the modes of visit.steps: signs/collect off are not there, required kept', () => {
  const steps = [{ key: 'omw', mode: 'optional' }, { key: 'finish', mode: 'required' }, { key: 'issue', mode: 'required' },
    { key: 'give', mode: 'required' }, { key: 'collect', mode: 'required' }, { key: 'signs', mode: 'off' }];
  assert.deepEqual(orderOf(visit({ steps })), { list: [{ key: 'pay', mode: 'required' }, { key: 'send', mode: 'required' }], issue: 'required', next: ['pay', 'send'] });
  const t = threeOf(ctx({ visit: closed({ steps }) }));
  assert.equal(keys(t), 'pay:todo* send:todo');
  assert.equal(t.buttons[1].line, 'Email, share or print');
});

test('Issue off: nothing until the office makes it final, then Get paid alone, calm', () => {
  const steps = [{ key: 'issue', mode: 'off' }, { key: 'give', mode: 'off' }, { key: 'collect', mode: 'optional' }, { key: 'signs', mode: 'off' }];
  const before = threeOf(ctx({ visit: closed({ steps }) }));
  assert.equal(keys(before), '');
  assert.deepEqual(before.row, { title: 'Bill', line: 'The office makes it final', change: false, head: 'Bill', amount: null, text: 'The office makes it final' });
  const after = threeOf(ctx({ visit: closed({ steps }), known: knownOf(issued()) }));
  assert.equal(keys(after), 'pay:todo');
});

test('no bill on the visit: a recall — nothing before Finish, the green line after; Deposit taken', () => {
  assert.equal(threeOf(ctx({ visit: visit({ visit_kind: 'recall' }) })), null);
  assert.deepEqual(threeOf(ctx({ visit: closed({ visit_kind: 'recall', outcome: 'recall' }) })), { kind: 'nobill', title: 'Finished · no bill', line: null });
  assert.deepEqual(threeOf(ctx({ visit: closed({ visit_kind: 'repair', outcome: 'deposit' }), deposits: 20000 })),
    { kind: 'nobill', title: 'Finished · no bill', line: 'Deposit $200.00 on the job' });
  // the time of the Finish in the line itself (the Designer on #98), New York's wall clock
  assert.equal(threeOf(ctx({ visit: closed({ visit_kind: 'repair', outcome: 'deposit', closed_at: '2026-11-10T15:52:00.000Z' }), deposits: 20000 })).title,
    'Finished 10:52 · no bill');
});

test('a recall or Deposit taken with a bill the office issued: the three as usual, not «no bill» (the Architect on #96)', () => {
  const office = knownOf(issued());
  for (const v of [closed({ visit_kind: 'recall', outcome: 'recall' }), closed({ visit_kind: 'repair', outcome: 'deposit' }), visit({ visit_kind: 'recall' })]) {
    const t = threeOf(ctx({ visit: v, known: office, deposits: 20000 }));
    assert.equal(t.kind, 'three', `${v.visit_kind} ${v.outcome}`);
    assert.ok(t.buttons.some((b) => b.key === 'pay' && b.state === 'todo'), 'Get paid is there');
    assert.equal(t.row.title, 'Bill NY-1053 · $136.09');
  }
  // without an issued bill (a draft, none) — still the green line
  assert.equal(threeOf(ctx({ visit: closed({ visit_kind: 'repair', outcome: 'deposit' }), known: knownOf(null) })).kind, 'nobill');
});

test('not here: a helper, an old task, no money permission, closed without work', () => {
  assert.equal(threeOf(ctx({ visit: visit({ role: 'helper' }) })), null);
  assert.equal(threeOf(ctx({ visit: visit({ legacy: true }) })), null);
  assert.equal(threeOf(ctx({ money: false })), null);
  assert.equal(threeOf(ctx({ visit: closed({ outcome: 'no_access' }) })), null);
});

test('a signature waiting on this phone; the bill row while loading or offline', () => {
  const t = threeOf(ctx({ known: knownOf(issued()), ack: { status: 'ok', signed: true, pending: true } }));
  assert.deepEqual([t.buttons[0].state, t.buttons[0].line, t.buttons[0].warn], ['done', 'Waiting for signal — it sends by itself', true]);
  assert.deepEqual(billRow({ status: 'loading' }), { title: 'Bill', line: 'Loading…', change: false, head: 'Bill', amount: null, text: 'Loading…' });
  assert.deepEqual(billRow({ status: 'unknown' }), { title: 'Bill', line: 'Needs connection', change: false, head: 'Bill', amount: null, text: 'Needs connection' });
  assert.equal(linesLine(draft({ lines: [{ name: 'Labor', amount_cents: 18000 }, { name: 'Part' }, { name: 'X' }], tax_cents: 0 })), 'Labor $180.00 + 2 more');
});

test('the words when making the bill final did not go through', () => {
  assert.equal(issueFailText({ kind: 'offline' }), 'No signal: the bill can’t be made final now. Try again when you have signal.');
  assert.equal(issueFailText({ kind: 'refused', text: 'Write the diagnosis first: it is printed on the bill.' }), 'The bill can’t be made final: Write the diagnosis first: it is printed on the bill.');
});

test('on the screen always sign · pay · send; the company\'s order picks the orange one; give required last (SO)', () => {
  const step = (key, mode) => ({ key, mode });
  // today's server default: give → collect → signs, all optional — the screen keeps sign · pay ·
  // send (the lead 25.11), Send the bill is orange: first in the company's order
  const old = [step('issue', 'optional'), step('give', 'optional'), step('collect', 'optional'), step('signs', 'optional')];
  assert.equal(keys(threeOf(ctx({ visit: closed({ steps: old }) }))), 'sign:todo pay:todo send:todo*');
  // the new default (SO-BE): give required, then signs, collect — give goes last: d1
  const ny = [step('issue', 'required'), step('give', 'required'), step('signs', 'optional'), step('collect', 'required')];
  const v = closed({ steps: ny });
  assert.equal(keys(threeOf(ctx({ visit: v }))), 'sign:todo* pay:todo send:todo');
  const signed = { status: 'ok', signed: true, name: 'X', at: '2026-11-24T15:27:00Z' };
  assert.equal(keys(threeOf(ctx({ visit: v, known: knownOf(issued()), ack: signed }))), 'sign:done pay:todo* send:todo');
  // paid before the copy («Take payment now, send the copy later»), not signed: the signature is lit
  const paid = issued({ payment_status: 'paid', balance_cents: 0, payments: [{ kind: 'payment', method: 'card', amount_cents: 13609, received_at: '2026-11-24T15:28:00Z' }] });
  assert.equal(keys(threeOf(ctx({ visit: v, known: knownOf(paid) }))), 'sign:todo* pay:done send:todo');
  // signed and paid, no copy yet: now Send the bill is lit
  assert.equal(keys(threeOf(ctx({ visit: v, known: knownOf(paid), ack: signed }))), 'sign:done pay:done send:todo*');
  // signs off: give required lights as soon as it is the first not done
  const noSign = [step('give', 'required'), step('signs', 'off'), step('collect', 'required')];
  assert.equal(keys(threeOf(ctx({ visit: closed({ steps: noSign }), known: knownOf(paid) }))), 'pay:done send:todo*');
});

test('give off: Send the bill stays, calm, never orange; the visit is done without it', () => {
  const steps = [{ key: 'give', mode: 'off' }, { key: 'signs', mode: 'optional' }, { key: 'collect', mode: 'required' }];
  const t = threeOf(ctx({ visit: closed({ steps }) }));
  assert.equal(keys(t), 'sign:todo* pay:todo send:todo');
  const paid = issued({ payment_status: 'paid', balance_cents: 0, payments: [{ kind: 'payment', method: 'cash', amount_cents: 13609, received_at: '2026-11-24T15:28:00Z' }] });
  const done = threeOf(ctx({ visit: closed({ steps }), known: knownOf(paid), ack: { status: 'ok', signed: true } }));
  assert.equal(keys(done), 'sign:done pay:done send:todo');
  assert.equal(done.lit, null);
  assert.equal(done.allDone, true);
});

// VS-APP (design-mockups/app-skip): a skipped step is grey and finished for the lit one and «all done»
test('skip: the link under the lit one only; skipped grey, the next lit; all finished → allDone; done wins', () => {
  const st = (o = {}) => ['omw', 'diagnosis', 'approve', 'finish', 'issue', 'give', 'signs', 'collect']
    .map((key) => ({ key, mode: key === 'finish' ? 'required' : key === 'give' ? 'optional' : 'optional', skipped: null, ...(o[key] || {}) }));
  const at = '2026-11-24T15:31:00Z';
  const base = (o = {}, known = knownOf(issued())) => ctx({ visit: closed({ steps: st(o) }), known });
  const t0 = threeOf(base());
  assert.equal(t0.lit, 'send', 'give Optional above signs: Send the bill first in the company\'s order');
  assert.deepEqual(t0.skip, { key: 'give', words: 'Skip sending the bill' });
  const t1 = threeOf(base({ give: { skipped: { at, reason: 'The office sends it' } } }));
  assert.equal(keys(t1), 'sign:todo* pay:todo send:skipped');
  const sent = t1.buttons.find((b) => b.key === 'send');
  assert.equal(sent.title, 'Bill not sent');
  assert.equal(sent.line, 'The office sends it · 10:31');
  assert.equal(sent.icon, 'skipc');
  assert.equal(sent.label, 'Bill not sent: the office sends it, at 10:31. Opens sending.');
  assert.deepEqual(t1.skip, { key: 'signs', words: 'Skip the signature' });
  assert.equal(pressOf(t1, 'send', knownOf(issued())), 'open', 'a skipped button still opens its action');
  const all = threeOf(base({ give: { skipped: { at, reason: 'x' } }, signs: { skipped: { at, reason: 'y' } }, collect: { skipped: { at, reason: 'z' } } }));
  assert.equal(all.lit, null);
  assert.equal(all.allDone, true);
  assert.equal(all.skip, null);
  // collect Required: «Customer didn't pay» still there (the server's rule)
  const req = threeOf(base({ give: { skipped: { at, reason: 'x' } }, signs: { skipped: { at, reason: 'y' } }, collect: { mode: 'required' } }));
  assert.deepEqual(req.skip, { key: 'collect', words: 'Customer didn’t pay' });
  // done wins over skipped: delivered since
  const done = threeOf(base({ give: { skipped: { at, reason: 'x' } } }, knownOf(issued({ delivered_at: at, delivered_via: 'handed' }))));
  assert.equal(done.buttons.find((b) => b.key === 'send').state, 'done');
  // signs Required: no link under it
  assert.equal(threeOf(base({ give: { skipped: { at, reason: 'x' } }, signs: { mode: 'required' } })).skip, null);
  // a helper never gets the link
  const helper = threeOf(ctx({ visit: closed({ role: 'helper', steps: st() }), known: knownOf(issued()) }));
  assert.ok(helper === null || helper.skip === null);
});

test('an empty bill (nothing to charge for): the three calm, none lit, no Skip link (the Designer on #102)', () => {
  const st = ['omw', 'diagnosis', 'approve', 'finish', 'issue', 'give', 'signs', 'collect']
    .map((key) => ({ key, mode: key === 'finish' ? 'required' : 'optional', skipped: null }));
  for (const known of [knownOf(draft({ lines: [], total_cents: 0, tax_cents: 0 })), { status: 'none', bill: null }]) {
    const t = threeOf(ctx({ visit: closed({ steps: st }), known }));
    assert.equal(t.empty, true);
    assert.equal(t.lit, null);
    assert.equal(t.skip, null);
    assert.ok(t.buttons.every((b) => !b.lit));
  }
});

test('skip: collect skipped, then part of the bill paid — the part shows, not the skip (the Architect on #102)', () => {
  const st = ['omw', 'diagnosis', 'approve', 'finish', 'issue', 'give', 'signs', 'collect']
    .map((key) => ({ key, mode: key === 'finish' ? 'required' : 'optional', skipped: key === 'collect' ? { at: '2026-11-24T15:33:00Z', reason: 'Pays the office later' } : null }));
  const part = issued({ payment_status: 'partly_paid', payments: [{ kind: 'payment', amount_cents: 5000, method: 'cash', received_at: '2026-11-24T15:40:00Z', voided_at: null }] });
  const t = threeOf(ctx({ visit: closed({ steps: st }), known: knownOf(part) }));
  const pay = t.buttons.find((b) => b.key === 'pay');
  assert.equal(pay.state, 'part');
  assert.equal(pay.title, 'Paid $50.00');
  assert.ok(/left$/.test(pay.line), pay.line);
  assert.notEqual(pay.icon, 'skipc');
  // and fully paid: done, not skipped
  const paid = threeOf(ctx({ visit: closed({ steps: st }), known: knownOf(issued({ payment_status: 'paid', payments: [{ kind: 'payment', amount_cents: 13609, method: 'cash', received_at: '2026-11-24T15:40:00Z', voided_at: null }] })) }));
  assert.equal(paid.buttons.find((b) => b.key === 'pay').state, 'done');
});

test('a tile of the row (design app-dock): two words, the time when done; skipped, waiting, busy', async () => {
  const { tileOf } = await import('./three.js');
  assert.deepEqual(tileOf({ key: 'sign', state: 'todo', lit: true }), { word: 'Signature', line: 'next' });
  assert.deepEqual(tileOf({ key: 'sign', state: 'todo', lit: false }), { word: 'Signature', line: null });
  assert.deepEqual(tileOf({ key: 'sign', state: 'done', at: '9:42' }), { word: 'Signed', line: '9:42' });
  assert.deepEqual(tileOf({ key: 'sign', state: 'done', warn: true, at: '9:42' }), { word: 'Signed', line: 'waiting' });
  assert.deepEqual(tileOf({ key: 'pay', state: 'todo', line: '$103.43', lit: true }), { word: 'Get paid', line: '$103.43' });
  assert.deepEqual(tileOf({ key: 'pay', state: 'part', line: '$50.00 left' }), { word: 'Get paid', line: '$50.00 left' });
  assert.deepEqual(tileOf({ key: 'pay', state: 'wait', line: 'Add the work first' }), { word: 'Get paid', line: 'Add work' });
  assert.deepEqual(tileOf({ key: 'pay', state: 'done', title: 'Paid $10.00 cash', at: '9:47' }), { word: 'Paid', line: '9:47' });
  assert.deepEqual(tileOf({ key: 'send', state: 'skipped' }), { word: 'Not sent', line: 'skipped' });
  assert.deepEqual(tileOf({ key: 'send', state: 'todo', lit: true }), { word: 'Send bill', line: 'next' });
  assert.deepEqual(tileOf({ key: 'pay', state: 'todo' }, true), { word: 'Recording…', line: null });
  // a real bill through threeOf: the done ones carry their time
  const signed = threeOf(ctx({ visit: closed(), known: knownOf(issued()), ack: { status: 'ok', signed: true, name: 'X', at: '2026-11-24T15:27:00Z' } }));
  assert.deepEqual(tileOf(signed.buttons.find((b) => b.key === 'sign')), { word: 'Signed', line: '10:27' });
});

test('a tile: nothing to pay is «No charge», not «Paid» (the Teamlead on #108)', async () => {
  const { tileOf } = await import('./three.js');
  assert.deepEqual(tileOf({ key: 'pay', state: 'done', title: 'Nothing to pay', at: '' }), { word: 'No charge', line: null });
  const free = threeOf(ctx({ visit: closed(), known: knownOf(issued({ payment_status: 'no_charge', total_cents: 0, balance_cents: 0 })) }));
  assert.deepEqual(tileOf(free.buttons.find((b) => b.key === 'pay')), { word: 'No charge', line: null });
});
