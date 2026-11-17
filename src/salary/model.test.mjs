import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  balanceDate, breakdownOf, canGoNext, dateText, detailOf, isEmptyMonth, jobCardOf, jobsWord, money, monthTitle, monthsOf,
  salaryError, summaryOf, tagOf, yearTiles,
} from './model.js';

// The design's November (design-mockups/app-salary-parts README «Суммы сходятся»), as the server
// answers it: numeric columns come as strings from Postgres
const J = (id, date, client, status, method, pst, amount, salary, extra = {}) => ({
  id, date, client_name: client, company: 'SEMIX NY', work_status: status, payment_method: method, payment_status: pst,
  amount: String(amount), calculated_salary: String(salary), cash_received: '0', check_amount: '0', check_submitted: false,
  tax: '0', parts: '0', second_tech: '0', tips: '0', installation: '0', ...extra,
});
const JOBS = [
  J(1, '2026-11-16', 'Haddad L.', 'Done', 'Zelle', 'Paid', 320, 112),
  J(2, '2026-11-12', 'Kowalski M.', 'Done', 'Cash', 'Paid', 480, 96, { cash_received: '240', tax: '39', parts: '201' }),
  J(3, '2026-11-12', 'Nguyen T.', '2nd Tech Payout', 'Zelle', 'Paid', 60, 60),
  J(4, '2026-11-11', 'Lee H.', 'Done', 'Cash', 'Not Paid', 185, 0),
  J(5, '2026-11-11', 'Chen W.', 'Recall', 'Cash', 'Paid', 0, 0),
  J(6, '2026-11-10', 'Kim D.', 'Installation', 'Zelle', 'Paid', 400, 160, { installation: '400' }),
  J(7, '2026-11-09', 'Rossi A.', 'Done', 'Check', 'Paid', 350, 0, { check_amount: '350' }),
  J(8, '2026-11-09', 'Patel S.', 'Diagnostics', 'Cash', 'Paid', 95, 47.5, { cash_received: '95' }),
  J(9, '2026-11-04', 'Brooks K.', 'Installation', 'Check', 'Paid', 425, 170, { check_amount: '425', check_submitted: true, installation: '425' }),
  J(10, '2026-11-03', 'Green P.', 'Done', 'Card', 'Paid', 350, 140),
];
const BREAKDOWN = { Done: { total: 348, count: 5 }, '2nd Tech Payout': { total: 60, count: 1 }, Recall: { total: 0, count: 1 }, Installation: { total: 330, count: 2 }, Diagnostics: { total: 47.5, count: 1 } };
const MONTH = { jobs: JOBS, total: 785.5, breakdown: BREAKDOWN, totalPaid: 1250, totalCash: 335, totalChecks: 350, totalUnpaid: 185, totalToPay: 412.3 };

test('money: cents, thousands, a minus sign before the dollar, strings and nothing', () => {
  assert.equal(money(785.5), '$785.50');
  assert.equal(money('1250'), '$1,250.00');
  assert.equal(money(1234567.891), '$1,234,567.89');
  assert.equal(money(-62.5), '−$62.50');
  assert.equal(money(-0.001), '$0.00');
  assert.equal(money(null), '$0.00');
  assert.equal(money('abc'), '$0.00');
  assert.equal(money(0.1 + 0.2), '$0.30');
});

test('dates and words: as written, no time zone shift', () => {
  assert.equal(dateText('2026-11-01'), 'Nov 1, 2026');
  assert.equal(dateText('2026-12-31T00:00:00.000Z'), 'Dec 31, 2026');
  assert.equal(dateText(null), 'N/A');
  assert.equal(balanceDate(2026, 10), 'Nov 30, 2026');
  assert.equal(balanceDate(2028, 1), 'Feb 29, 2028');
  assert.equal(balanceDate(2026, 11), 'Dec 31, 2026');
  assert.equal(monthTitle(2026, 10), 'November 2026');
  assert.equal(jobsWord(1), '1 job');
  assert.equal(jobsWord(10), '10 jobs');
});

test('the year: jobs by month, empty months, the month of today, no year ahead', () => {
  const months = monthsOf([...JOBS, J(11, '2026-01-31', 'X', 'Done', 'Cash', 'Paid', 100, 40), J(12, '2025-12-31', 'Y', 'Done', 'Cash', 'Paid', 100, 40)], 2026);
  assert.equal(months[10].count, 10);
  assert.equal(Math.round(months[10].total * 100), 78550);
  assert.equal(months[0].count, 1);
  assert.equal(months[11].count, 0);
  const tiles = yearTiles(months, 2026, { year: 2026, month: 10 });
  assert.deepEqual(tiles[10], { key: 'Nov', month: 10, name: 'Nov', amount: '$785.50', sub: '10 jobs', empty: false, now: true });
  assert.deepEqual(tiles[11], { key: 'Dec', month: 11, name: 'Dec', amount: '—', sub: 'No jobs', empty: true, now: false });
  assert.equal(tiles[0].sub, '1 job');
  assert.equal(yearTiles(months, 2025, { year: 2026, month: 10 }).some((t) => t.now), false);
  assert.equal(canGoNext(2026, { year: 2026 }), false);
  assert.equal(canGoNext(2025, { year: 2026 }), true);
});

test('the month: the rows of the design, To Pay as of the last day', () => {
  const s = summaryOf(MONTH, 2026, 10);
  assert.equal(s.total, '$785.50');
  assert.equal(s.jobs, '10 jobs');
  assert.deepEqual(s.rows.map((r) => [r.label, r.value, r.go || null]), [
    ['Paid', '$1,250.00', 'Payments'], ['Cash', '$335.00', null], ['Checks', '$350.00', 'Receipts'], ['To Pay', '$412.30', null], ['Unpaid', '$185.00', 'Unpaid'],
  ]);
  assert.equal(s.rows[3].sub, 'Balance as of Nov 30, 2026');
  assert.equal(s.minus, false);
  const neg = summaryOf({ ...MONTH, totalToPay: -62.5 }, 2026, 10);
  assert.equal(neg.minus, true);
  assert.equal(neg.rows[3].value, '−$62.50');
  assert.equal(neg.rows[3].minus, true);
  // a tiny float below zero is not a debt
  assert.equal(summaryOf({ ...MONTH, totalToPay: -0.0001 }, 2026, 10).minus, false);
});

test('an empty month: no jobs and no money; a payout alone is not empty', () => {
  assert.equal(isEmptyMonth({ jobs: [], total: 0, breakdown: {}, totalPaid: 0, totalCash: 0, totalChecks: 0, totalUnpaid: 0, totalToPay: 0 }), true);
  assert.equal(isEmptyMonth({ jobs: [], totalPaid: 400 }), false);
  assert.equal(isEmptyMonth({ jobs: [], totalToPay: -20 }), false);
  assert.equal(isEmptyMonth(MONTH), false);
  assert.equal(isEmptyMonth(null), true);
});

test('breakdown: the order of the design, badges with the count, the sums add up', () => {
  const rows = breakdownOf(BREAKDOWN);
  assert.deepEqual(rows.map((r) => [r.tag.text, r.value]), [
    ['Done · 5', '$348.00'], ['Diagnostics · 1', '$47.50'], ['Installation · 2', '$330.00'], ['Recall · 1', '$0.00'], ['2nd Tech Payout · 1', '$60.00'],
  ]);
  assert.equal(348 + 47.5 + 330 + 0 + 60, 785.5);
  assert.deepEqual(rows.map((r) => r.tag.kind), ['done', 'diagnostics', 'installation', 'recall', 'helper']);
  const odd = breakdownOf({ Other: { total: '5', count: '1' }, Deposit: { total: 0, count: 2 } });
  assert.deepEqual(odd.map((r) => r.tag.text), ['Deposit · 2', 'Other · 1']);
  assert.equal(odd[1].tag.kind, 'neutral');
  assert.deepEqual(breakdownOf(null), []);
});

test('work status tags: the PD colours, an unknown status is neutral', () => {
  assert.deepEqual(tagOf('Done'), { kind: 'done', icon: 'wrench', text: 'Done' });
  assert.deepEqual(tagOf('2nd Tech Payout'), { kind: 'helper', icon: 'people', text: '2nd Tech Payout' });
  assert.deepEqual(tagOf(null), { kind: 'neutral', icon: 'doc', text: 'Job' });
});

test('job cards: not paid, cash, a check in hand and a check handed in', () => {
  const cards = JOBS.map(jobCardOf);
  assert.deepEqual(cards[0], { key: '1', client: 'Haddad L.', date: 'Nov 16, 2026', tag: tagOf('Done'), unpaid: false, earnings: '$112.00', cash: '$0.00', check: '$0.00', handedIn: false });
  assert.equal(cards[1].cash, '$240.00');
  assert.equal(cards[3].unpaid, true);
  assert.equal(cards[6].check, '$350.00');
  assert.equal(cards[6].handedIn, false);
  assert.equal(cards[8].check, '$425.00 · handed in');
  assert.equal(cards[8].handedIn, true);
  assert.equal(jobCardOf({ id: 7, payment_status: 'NOT PAID' }).unpaid, true);
  assert.equal(jobCardOf({ id: 7 }).client, 'N/A');
});

test('job details: the design job Kowalski adds up to its salary', () => {
  const d = detailOf(JOBS[1]);
  assert.equal(d.client, 'Kowalski M.');
  assert.equal(d.company, 'SEMIX NY');
  assert.deepEqual(d.work.map((r) => r.value), ['Done', 'Cash', 'Paid']);
  assert.equal(d.note, null);
  assert.deepEqual(d.rows.map((r) => [r.label, r.value]), [
    ['Amount', '$480.00'], ['− Tax', '−$39.00'], ['− Parts', '−$201.00'], ['Base', '$240.00'], ['Your share (40%)', '$96.00'],
  ]);
  assert.equal(d.rows[3].kind, 'base');
  assert.equal(d.salary, '$96.00');
  assert.deepEqual(d.after.map((r) => [r.label, r.value]), [['Cash Received', '$240.00']]);
});

test('job details: installation, tips, no parts, no deductions', () => {
  const d = detailOf(J(1, '2026-11-10', 'Kim D.', 'Installation', 'Zelle', 'Paid', 900, 175, { installation: '400', tips: '15' }));
  assert.deepEqual(d.rows.map((r) => [r.label, r.value]), [
    ['Installation', '$400.00'], ['− Parts', 'No parts'], ['Your share (40%)', '$160.00'], ['+ Tips', '+$15.00'],
  ]);
  assert.equal(d.rows[1].kind, 'muted');
  const two = detailOf(J(1, '2026-11-10', 'A', 'Done', 'Split', 'Paid', 500, 160, { second_tech: '100' }));
  assert.deepEqual(two.rows.map((r) => r.label), ['Amount', '− Parts', '− 2nd Tech', 'Base', 'Your share (40%)']);
});

test('job details: the notes instead of the arithmetic, words of the site', () => {
  assert.equal(detailOf(JOBS[4]).note, 'Recall — warranty/repeat work, no salary.');
  assert.deepEqual(detailOf(JOBS[4]).rows, []);
  assert.equal(detailOf(JOBS[6]).note, 'Check not submitted yet — salary is credited once the check is turned in.');
  assert.deepEqual(detailOf(JOBS[6]).after.map((r) => [r.label, r.value]), [['Check Amount', '$350.00']]);
  const handed = detailOf(JOBS[8]);
  assert.equal(handed.note, null);
  assert.deepEqual(handed.after.map((r) => [r.label, r.value, r.kind]), [['Check Amount', '$425.00 · handed in', 'muted']]);
  assert.equal(detailOf(J(1, '2026-11-01', 'A', 'Deposit', 'Cash', 'Paid', 100, 0)).note, 'Deposit — unfinished work, no salary.');
  const minus = detailOf(J(1, '2026-11-01', 'A', 'Done', 'Minus', 'Paid', 100, 10, { tips: '10' }));
  assert.equal(minus.note, 'Minus — only tips are paid for this job.');
  assert.deepEqual(minus.rows.map((r) => [r.label, r.value]), [['Tips', '$10.00']]);
  const split = detailOf(J(1, '2026-11-01', 'A', 'Done', 'Split', 'Paid', 500, 0, { check_amount: '200' }));
  assert.equal(split.note, 'Paid in parts. $200.00 is still in a check you have not handed in — your share is credited once it is.');
  assert.deepEqual(split.rows.map((r) => r.label), ['Amount']);
});

test('job details: the helper payout says when it is released', () => {
  assert.equal(detailOf(JOBS[2]).note, 'Helped on this job — flat payout, not a percentage.');
  assert.deepEqual(detailOf(JOBS[2]).rows.map((r) => [r.label, r.value]), [['Payout', '$60.00']]);
  assert.equal(detailOf(J(1, 'x', 'A', '2nd Tech Payout', 'Cash', 'Not Paid', 60, 0)).note, 'Helped on this job — the payout is released once the customer pays.');
  assert.equal(detailOf(J(1, 'x', 'A', '2nd Tech Payout', 'Check', 'Paid', 60, 0)).note, 'Helped on this job — the payout is released once the check is submitted.');
  assert.equal(detailOf(J(1, 'x', 'A', '2nd Tech Payout', 'Check', 'Paid', 60, 0, { check_submitted: true })).note, 'Helped on this job — flat payout.');
});

test('errors: no connection or a refusal', () => {
  assert.equal(salaryError(new Error('Network Error')).kind, 'offline');
  assert.equal(salaryError({ response: { status: 500 } }).kind, 'failed');
});
