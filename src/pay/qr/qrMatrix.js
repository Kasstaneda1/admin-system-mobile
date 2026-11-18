// COPY of admin-system-frontend js/modules/qrMatrix.js at 564f1cb (fe#375, fe#377) — change it there first, then copy here with the new hash.
/**
 * A QR code as a matrix of modules (ONL-FE3b: «Show QR» of a «Pay online» link). Written for
 * SEMIX from the QR standard (ISO/IEC 18004): byte mode, error correction level M, the smallest
 * version 1–10 the text fits in (up to 213 bytes of UTF-8 — a link of the pay page is about 80).
 *
 * No DOM, no imports, no globals: the same file runs in the browser (bills/billPayOnline.js draws
 * it), in Node (tests/qr/qr-matrix.test.mjs) and in the technician's app (ONL-APP1).
 *
 *   qrMatrix(text) → { version, size, mask, modules }  modules[row][col]: true = dark
 *   throws RangeError when the text is longer than version 10 holds
 *
 * Drawing is the caller's: a quiet zone of 4 light modules around, dark on light.
 */

'use strict';

// Level M of versions 1–10 (ISO/IEC 18004 table 9): [error correction codewords per block,
// [blocks, data codewords] of group 1, of group 2]
const BLOCKS_M = [
  null,
  [10, [1, 16]],
  [16, [1, 28]],
  [26, [1, 44]],
  [18, [2, 32]],
  [24, [2, 43]],
  [16, [4, 27]],
  [18, [4, 31]],
  [22, [2, 38], [2, 39]],
  [22, [3, 36], [2, 37]],
  [26, [4, 43], [1, 44]]
];
// The centres of the alignment patterns of versions 1–10 (table E.1)
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];
const MAX_VERSION = 10;
const LEVEL_M = 0; // the format bits of level M (L 1, M 0, Q 3, H 2)

// ---- the text and the data codewords ---------------------------------------------------------

// The text as UTF-8 bytes (by hand: TextEncoder is not everywhere the app runs)
export function utf8(text) {
  const out = [];
  const s = String(text);
  for (let i = 0; i < s.length; i++) {
    let c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      const low = s.charCodeAt(i + 1);
      if (low >= 0xdc00 && low <= 0xdfff) { c = 0x10000 + ((c - 0xd800) << 10) + (low - 0xdc00); i++; }
    }
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

const dataCodewords = version => {
  const [, g1, g2] = BLOCKS_M[version];
  return g1[0] * g1[1] + (g2 ? g2[0] * g2[1] : 0);
};
const countBits = version => (version <= 9 ? 8 : 16);

// The smallest version whose level M holds the bytes, or 0
export function versionFor(byteCount) {
  for (let v = 1; v <= MAX_VERSION; v++) {
    if (4 + countBits(v) + 8 * byteCount <= dataCodewords(v) * 8) return v;
  }
  return 0;
}

// Mode 0100, the count, the bytes, the terminator, then 0xEC 0x11 to the end
export function dataOf(bytes, version) {
  const bits = [];
  const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  for (const b of bytes) put(b, 8);
  const capacity = dataCodewords(version) * 8;
  for (let i = 0; i < 4 && bits.length < capacity; i++) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const out = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < capacity / 8; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

// ---- Reed–Solomon over GF(256), x^8 + x^4 + x^3 + x^2 + 1 ------------------------------------

function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z;
}

// The generator of degree n: (x − α^0)(x − α^1)…(x − α^(n−1)), its coefficients from the highest
// power down, the leading 1 left out
function generator(degree) {
  const poly = new Array(degree).fill(0);
  poly[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      poly[j] = gfMul(poly[j], root);
      if (j + 1 < degree) poly[j] ^= poly[j + 1];
    }
    root = gfMul(root, 2);
  }
  return poly;
}

// The error correction codewords of a block
export function errorCodewords(data, degree) {
  const gen = generator(degree);
  const rest = new Array(degree).fill(0);
  for (const b of data) {
    const factor = b ^ rest.shift();
    rest.push(0);
    for (let i = 0; i < degree; i++) rest[i] ^= gfMul(gen[i], factor);
  }
  return rest;
}

// The final codewords: the blocks' data interleaved, then their error correction interleaved
export function codewordsOf(data, version) {
  const [ec, g1, g2] = BLOCKS_M[version];
  const blocks = [];
  let at = 0;
  for (const [count, length] of [g1, g2].filter(Boolean)) {
    for (let i = 0; i < count; i++) {
      const part = data.slice(at, at + length);
      at += length;
      blocks.push({ data: part, ec: errorCodewords(part, ec) });
    }
  }
  const out = [];
  const longest = Math.max(...blocks.map(b => b.data.length));
  for (let i = 0; i < longest; i++) for (const b of blocks) if (i < b.data.length) out.push(b.data[i]);
  for (let i = 0; i < ec; i++) for (const b of blocks) out.push(b.ec[i]);
  return out;
}

// ---- format and version information -------------------------------------------------------

// 15 bits: level and mask, BCH(15,5) with 0x537, XOR 0x5412
export function formatBits(mask, level = LEVEL_M) {
  const data = (level << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | (rem & 0x3ff)) ^ 0x5412;
}

// 18 bits of a version from 7: BCH(18,6) with 0x1F25
export function versionBits(version) {
  let rem = version;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | (rem & 0xfff);
}

// ---- the matrix ------------------------------------------------------------------------------

const MASKS = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0
];

// The patterns every symbol of the version has; fixed[r][c] marks them (data never goes there)
function base(version) {
  const size = 17 + 4 * version;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const fixed = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (r, c, dark) => { modules[r][c] = dark; fixed[r][c] = true; };
  // timing
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  // finders and their separators
  for (const [cr, cc] of [[3, 3], [3, size - 4], [size - 4, 3]]) {
    for (let dr = -4; dr <= 4; dr++) {
      for (let dc = -4; dc <= 4; dc++) {
        const r = cr + dr; const c = cc + dc;
        if (r < 0 || c < 0 || r >= size || c >= size) continue;
        const d = Math.max(Math.abs(dr), Math.abs(dc));
        set(r, c, d !== 2 && d !== 4);
      }
    }
  }
  // alignment patterns (not over the finders)
  const at = ALIGN[version];
  const last = at.length - 1;
  for (let i = 0; i <= last; i++) {
    for (let j = 0; j <= last; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) set(at[i] + dr, at[j] + dc, Math.max(Math.abs(dr), Math.abs(dc)) !== 1);
    }
  }
  // the format areas (written after the mask is chosen), the dark module
  drawFormat(modules, fixed, 0);
  // version information
  if (version >= 7) {
    const bits = versionBits(version);
    for (let i = 0; i < 18; i++) {
      const dark = ((bits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      set(b, a, dark);
      set(a, b, dark);
    }
  }
  return { size, modules, fixed };
}

function drawFormat(modules, fixed, mask) {
  const size = modules.length;
  const bits = formatBits(mask);
  const bit = i => ((bits >>> i) & 1) === 1;
  const set = (r, c, dark) => { modules[r][c] = dark; fixed[r][c] = true; };
  // around the top-left finder
  for (let i = 0; i <= 5; i++) set(i, 8, bit(i));
  set(7, 8, bit(6));
  set(8, 8, bit(7));
  set(8, 7, bit(8));
  for (let i = 9; i < 15; i++) set(8, 14 - i, bit(i));
  // the second copy: under the top-right finder and right of the bottom-left one
  for (let i = 0; i < 8; i++) set(8, size - 1 - i, bit(i));
  for (let i = 8; i < 15; i++) set(size - 15 + i, 8, bit(i));
  set(size - 8, 8, true); // the dark module
}

// The codewords in the zigzag, two columns at a time from the right (the timing column skipped)
function placeData(modules, fixed, codewords) {
  const size = modules.length;
  let i = 0;
  const total = codewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let step = 0; step < size; step++) {
      const r = upward ? size - 1 - step : step;
      for (let k = 0; k < 2; k++) {
        const c = right - k;
        if (fixed[r][c]) continue;
        // the remainder bits after the last codeword stay light
        modules[r][c] = i < total ? ((codewords[i >>> 3] >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
      }
    }
  }
}

function applyMask(modules, fixed, mask) {
  const f = MASKS[mask];
  return modules.map((row, r) => row.map((dark, c) => (fixed[r][c] ? dark : dark !== f(r, c))));
}

// The penalty of a masked symbol (§7.8.3): runs, 2×2 blocks, finder-like patterns, the dark share
export function penalty(m) {
  const size = m.length;
  let score = 0;
  const lines = [];
  for (let r = 0; r < size; r++) lines.push(m[r]);
  for (let c = 0; c < size; c++) lines.push(m.map(row => row[c]));
  for (const line of lines) {
    let run = 1;
    for (let i = 1; i <= size; i++) {
      if (i < size && line[i] === line[i - 1]) { run++; continue; }
      if (run >= 5) score += 3 + (run - 5);
      run = 1;
    }
    // 1:1:3:1:1 with four light modules on a side
    for (let i = 0; i + 11 <= size; i++) {
      const s = line.slice(i, i + 11).map(x => (x ? 1 : 0)).join('');
      if (s === '10111010000' || s === '00001011101') score += 40;
    }
  }
  for (let r = 0; r + 1 < size; r++) {
    for (let c = 0; c + 1 < size; c++) {
      const v = m[r][c];
      if (m[r][c + 1] === v && m[r + 1][c] === v && m[r + 1][c + 1] === v) score += 3;
    }
  }
  let dark = 0;
  for (const row of m) for (const x of row) if (x) dark++;
  const total = size * size;
  score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
  return score;
}

// The QR code of a text: byte mode, level M; mask: 0–7 to force one (tests), else the best
export function qrMatrix(text, { mask = null } = {}) {
  const bytes = utf8(text);
  const version = versionFor(bytes.length);
  if (!version) throw new RangeError(`The text is too long for a QR code here: ${bytes.length} bytes`);
  const codewords = codewordsOf(dataOf(bytes, version), version);
  const { size, modules, fixed } = base(version);
  placeData(modules, fixed, codewords);
  const tries = mask === null ? [0, 1, 2, 3, 4, 5, 6, 7] : [mask];
  let best = null;
  for (const k of tries) {
    const masked = applyMask(modules, fixed, k);
    drawFormat(masked, fixed.map(row => row.slice()), k);
    const score = tries.length > 1 ? penalty(masked) : 0;
    if (!best || score < best.score) best = { mask: k, modules: masked, score };
  }
  return { version, size, mask: best.mask, modules: best.modules };
}
