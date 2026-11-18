// COPY of admin-system-frontend tests/qr at 564f1cb (fe#375, fe#377); only the path of the module differs. Run: npm test.
// The QR code generator (js/modules/qrMatrix.js; ONL-FE3b): known values of the QR standard
// (ISO/IEC 18004) and of its worked examples, the patterns every symbol has, links of many lengths.
// A real reader checks it too: frontend-evidence/onl3b (Chrome's BarcodeDetector) and QA.
// Run from the repo root: node --test "tests/qr/*.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';

const Q = await import(new URL('./qrMatrix.js', import.meta.url));

test('Reed–Solomon: the worked example «HELLO WORLD» 1-M (data → error correction codewords)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(Q.errorCodewords(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('format information of level M, masks 0–7 (the standard’s table)', () => {
  const table = ['101010000010010', '101000100100101', '101111001111100', '101101101001011',
    '100010111111001', '100000011001110', '100111110010111', '100101010100000'];
  table.forEach((bits, mask) => assert.equal(Q.formatBits(mask).toString(2).padStart(15, '0'), bits, `mask ${mask}`));
});

test('version information of versions 7–10 (the standard’s table)', () => {
  assert.equal(Q.versionBits(7), 0x07c94);
  assert.equal(Q.versionBits(8), 0x085bc);
  assert.equal(Q.versionBits(9), 0x09a99);
  assert.equal(Q.versionBits(10), 0x0a4d3);
});

test('byte capacity of level M by version (the standard’s table): 14, 26, 42, 62, 84, 106, 122, 152, 180, 213', () => {
  const capacity = [14, 26, 42, 62, 84, 106, 122, 152, 180, 213];
  capacity.forEach((bytes, i) => {
    assert.equal(Q.versionFor(bytes), i + 1, `${bytes} bytes`);
    assert.equal(Q.versionFor(bytes + 1), i + 2 > 10 ? 0 : i + 2, `${bytes + 1} bytes`);
  });
  assert.throws(() => Q.qrMatrix('x'.repeat(214)), RangeError);
});

test('the data codewords: mode, count, bytes, terminator, 0xEC 0x11', () => {
  // «ab» in 1-M: 0100 00000010 01100001 01100010 0000 → 0x40 0x26 0x16 0x20, then the pad bytes
  assert.deepEqual(Q.dataOf(Q.utf8('ab'), 1), [0x40, 0x26, 0x16, 0x20, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11, 0xec, 0x11]);
  assert.deepEqual(Q.utf8('é€😀'), [0xc3, 0xa9, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x98, 0x80]);
});

// Every codeword sequence of a block is a code word: the syndromes at α^0…α^(n−1) are all zero
function gfMul(x, y) { let z = 0; for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; } return z; }
function syndromesZero(block, ec) {
  let a = 1;
  for (let i = 0; i < ec; i++) {
    let s = 0;
    for (const b of block) s = gfMul(s, a) ^ b;
    if (s !== 0) return false;
    a = gfMul(a, 2);
  }
  return true;
}
test('error correction: every block of versions 1–10 has zero syndromes', () => {
  for (let v = 1; v <= 10; v++) {
    const data = Q.dataOf(Q.utf8(`https://example.com/pay/${'k'.repeat(4 * v)}`), Q.versionFor(28 + 4 * v));
    const n = data.length;
    const ec = Q.errorCodewords(data.slice(0, Math.min(n, 30)), 18);
    assert.ok(syndromesZero([...data.slice(0, Math.min(n, 30)), ...ec], 18), `v${v}`);
  }
});

// The patterns every symbol has, read back from the matrix
function finderAt(m, r0, c0) {
  for (let dr = 0; dr < 7; dr++) {
    for (let dc = 0; dc < 7; dc++) {
      const d = Math.max(Math.abs(dr - 3), Math.abs(dc - 3));
      if (m[r0 + dr][c0 + dc] !== (d !== 2)) return false;
    }
  }
  return true;
}
function readFormat(m) {
  const size = m.length;
  const one = []; const two = [];
  const at = (r, c) => (m[r][c] ? 1 : 0);
  for (let i = 0; i <= 5; i++) one[i] = at(i, 8);
  one[6] = at(7, 8); one[7] = at(8, 8); one[8] = at(8, 7);
  for (let i = 9; i < 15; i++) one[i] = at(8, 14 - i);
  for (let i = 0; i < 8; i++) two[i] = at(8, size - 1 - i);
  for (let i = 8; i < 15; i++) two[i] = at(size - 15 + i, 8);
  const value = bits => bits.reduce((acc, b, i) => acc | (b << i), 0);
  return [value(one), value(two)];
}

const TOKEN = () => Array.from({ length: 43 }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[Math.floor(Math.random() * 64)]).join('');

test('links of many lengths: size, finders, timing, dark module, both format copies, the version block', () => {
  const texts = [
    'a', 'https://x.co', `https://pay.example.com/pay/${TOKEN()}`, `https://admin.semix.pro/pay/${TOKEN()}`,
    `https://semix-frontend-git-feature-very-long-branch-name.example.app/pay/${TOKEN()}`,
    `https://a-very-long-subdomain-for-a-company.semix.pro/pay/${TOKEN()}?checkout=done&utm=email-bill`, 'é'.repeat(70), 'x'.repeat(213)
  ];
  for (const text of texts) {
    const q = Q.qrMatrix(text);
    const m = q.modules;
    assert.equal(q.size, 17 + 4 * q.version);
    assert.equal(m.length, q.size);
    assert.ok(m.every(row => row.length === q.size));
    assert.ok(finderAt(m, 0, 0) && finderAt(m, 0, q.size - 7) && finderAt(m, q.size - 7, 0), `finders, ${text.length}`);
    for (let i = 8; i < q.size - 8; i++) {
      assert.equal(m[6][i], i % 2 === 0, `timing row, ${i}`);
      assert.equal(m[i][6], i % 2 === 0, `timing column, ${i}`);
    }
    assert.equal(m[q.size - 8][8], true, 'dark module');
    const [one, two] = readFormat(m);
    assert.equal(one, two, 'the two format copies');
    assert.equal(one, Q.formatBits(q.mask), 'the format says level M and the mask used');
    if (q.version >= 7) {
      const bits = Q.versionBits(q.version);
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        assert.equal(m[Math.floor(i / 3)][q.size - 11 + (i % 3)], dark);
        assert.equal(m[q.size - 11 + (i % 3)][Math.floor(i / 3)], dark);
      }
    }
  }
  // a pay link (about 80 characters) is version 5 or 6
  const link = Q.qrMatrix(`https://admin.semix.pro/pay/${TOKEN()}`);
  assert.ok(link.version >= 4 && link.version <= 6, String(link.version));
});

test('the same text gives the same matrix; a forced mask is kept', () => {
  const text = `https://pay.example.com/pay/${TOKEN()}`;
  assert.deepEqual(Q.qrMatrix(text), Q.qrMatrix(text));
  for (let mask = 0; mask < 8; mask++) assert.equal(Q.qrMatrix(text, { mask }).mask, mask);
});
