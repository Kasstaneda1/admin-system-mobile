// COPY of admin-system-frontend tests/qr at 564f1cb (fe#375, fe#377); only the path of the module differs. Run: npm test.
// js/modules/qrMatrix.js against another encoder: whole matrices of libqrencode, kept in
// qrencode-fixtures.json (made by make-qrencode-fixtures.mjs; the test does not need qrencode).
// Every mask 0–7; every version 1–10 (each its own alignment places; 7 and up with version
// information); the edges of versions (14 / 15, 122 / 123, 213 bytes).
// The mask is given (qrMatrix(text, { mask })): libqrencode scores the masks its own way, so
// its choice may differ, and the choice is checked apart (qr-matrix.test.mjs, penalty).
// Holds what the known values alone do not: the order of the data modules (the skip of column 6),
// each mask's formula, the places of the alignment patterns, the format and version information,
// the error correction codewords (Teamlead on PR 375).
// Run from the repo root: node --test "tests/qr/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const Q = await import(new URL('./qrMatrix.js', import.meta.url));
const { fixtures } = JSON.parse(readFileSync(new URL('./qrencode-fixtures.json', import.meta.url), 'utf8'));

test('the fixtures cover every mask, every version 1–10 and the edges of versions', () => {
  assert.deepEqual([...new Set(fixtures.map(f => f.version))].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual([...new Set(fixtures.map(f => f.mask))].sort(), [0, 1, 2, 3, 4, 5, 6, 7]);
  const edge = (bytes, version) => fixtures.some(f => f.text.length === bytes && f.version === version);
  for (const [bytes, version] of [[14, 1], [15, 2], [122, 7], [123, 8], [213, 10]]) assert.ok(edge(bytes, version), `${bytes} bytes → version ${version}`);
  assert.ok(fixtures.some(f => f.version === 7 && f.mask === 7), 'version 7 with mask 7');
  assert.ok(fixtures.some(f => f.version === 10), 'version 10');
});

for (const f of fixtures) {
  test(`version ${f.version}, mask ${f.mask}, ${f.text.length} bytes: the same matrix as libqrencode, module by module`, () => {
    const m = Q.qrMatrix(f.text, { mask: f.mask });
    assert.equal(m.version, f.version);
    assert.equal(m.mask, f.mask);
    assert.equal(m.size, f.rows.length);
    const wrong = [];
    m.modules.forEach((row, r) => row.forEach((dark, c) => {
      if ((dark ? '1' : '0') !== f.rows[r][c]) wrong.push([r, c]);
    }));
    assert.deepEqual(wrong.slice(0, 10), [], `${wrong.length} modules differ (row, column)`);
  });
}
