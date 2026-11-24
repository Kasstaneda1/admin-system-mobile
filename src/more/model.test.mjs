import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MORE_SECTIONS, SIGN_OUT, initials, nameLine, roleLine, signedInLine, versionLine } from './model.js';

const IVAN = { id: 7, username: 'ivan.petrov', role: 'technician', fullName: 'Ivan Petrov' };

test('initials: first and last word, one word, no name, nothing', () => {
  assert.equal(initials(IVAN), 'IP');
  assert.equal(initials({ fullName: '  ivan   de la  petrov ' }), 'IP');
  assert.equal(initials({ fullName: 'Ivan' }), 'I');
  assert.equal(initials({ fullName: '', username: 'nia' }), 'N');
  assert.equal(initials({ fullName: null, username: '  ' }), '');
  assert.equal(initials(null), '');
  assert.equal(initials({ fullName: 'Élodie Øst' }), 'ÉØ');
});

test('nameLine: full name, else the username, else Technician', () => {
  assert.equal(nameLine(IVAN), 'Ivan Petrov');
  assert.equal(nameLine({ fullName: '  Ivan   Petrov ' }), 'Ivan Petrov');
  assert.equal(nameLine({ fullName: ' ', username: 'nia' }), 'nia');
  assert.equal(nameLine({}), 'Technician');
  assert.equal(nameLine(undefined), 'Technician');
});

test('roleLine: Technician, with the company only when the server gives it', () => {
  assert.equal(roleLine(IVAN), 'Technician');
  assert.equal(roleLine({ ...IVAN, companyName: 'SEMIX CORP' }), 'Technician · SEMIX CORP');
  assert.equal(roleLine({ ...IVAN, companyName: '  ' }), 'Technician');
  assert.equal(roleLine(null), 'Technician');
});

test('signedInLine: the username, none without it', () => {
  assert.equal(signedInLine(IVAN), 'Signed in as ivan.petrov');
  assert.equal(signedInLine({ username: '' }), null);
  assert.equal(signedInLine(null), null);
});

test('versionLine: version and build, version alone, nothing', () => {
  assert.equal(versionLine({ expo: { version: '1.0.0', ios: { buildNumber: '2' } } }), 'SEMIX Tech 1.0.0 (2)');
  assert.equal(versionLine({ version: '1.0.0', ios: { buildNumber: 3 } }), 'SEMIX Tech 1.0.0 (3)');
  assert.equal(versionLine({ expo: { version: '1.0.0' } }), 'SEMIX Tech 1.0.0');
  assert.equal(versionLine({ expo: { version: '1.0.0', ios: { buildNumber: ' ' } } }), 'SEMIX Tech 1.0.0');
  assert.equal(versionLine({ expo: {} }), 'SEMIX Tech');
  assert.equal(versionLine(null), 'SEMIX Tech');
});

test('versionLine reads the real app.json', () => {
  const config = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
  assert.match(versionLine(config), /^SEMIX Tech \d+\.\d+\.\d+ \(\d+\)$/);
});

test('sections: no Salary and no Parts (tabs), the four screens in the design order', () => {
  const rows = MORE_SECTIONS.flatMap((s) => s.rows);
  assert.deepEqual(MORE_SECTIONS.map((s) => s.title), ['Your van', 'Money']);
  assert.deepEqual(rows.map((r) => r.screen), ['Warehouse', 'Payments', 'Receipts', 'Unpaid']);
  assert.deepEqual(rows.map((r) => r.icon), ['truck', 'wallet', 'doc', 'money']);
  assert.deepEqual(rows.map((r) => r.sub), [
    'Parts you carry in your van', 'Your payouts by date', 'Checks to hand in to the office', 'Customers who still owe for a job',
  ]);
  for (const r of rows) assert.ok(!/[\u{1F300}-\u{1FAFF}]/u.test(r.title + r.sub), 'no emoji');
});

test('every icon exists in Icon.js', () => {
  const icons = readFileSync(new URL('../myDay/Icon.js', import.meta.url), 'utf8');
  for (const name of [...MORE_SECTIONS.flatMap((s) => s.rows.map((r) => r.icon)), 'door', 'chev']) {
    assert.match(icons, new RegExp(`\\n\\s*${name}: require\\(`), name);
  }
});

test('sign out words', () => {
  assert.deepEqual(SIGN_OUT, {
    button: 'Sign out',
    title: 'Sign out of SEMIX Tech?',
    text: 'You will need your email and password to sign in again.',
    cancel: 'Cancel',
    confirm: 'Sign out',
  });
});
