import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECK_PHOTO_MAX_BYTES, afterPhotoUpload, base64Bytes, checkPhotoRefusal, isJpeg, photoBytes, resizeFor } from './checkPhoto.js';
import { paymentBody } from './model.js';

test('the long side is made 2000 px; a small or unknown photo stays', () => {
  assert.deepEqual(resizeFor(4032, 3024), { width: 2000 }, 'a landscape 12 MP shot');
  assert.deepEqual(resizeFor(3024, 4032), { height: 2000 }, 'a portrait one');
  assert.deepEqual(resizeFor(4000, 4000), { width: 2000 });
  assert.equal(resizeFor(2000, 1500), null);
  assert.equal(resizeFor(1200, 900), null);
  assert.equal(resizeFor(0, 900), null);
  assert.equal(resizeFor(undefined, undefined), null);
});

test('base64 to bytes, our own decoder (no atob in Hermes)', () => {
  const sample = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xfe]);
  for (const cut of [0, 1, 2, 3, 13]) {
    const part = sample.subarray(0, cut);
    assert.deepEqual(Array.from(base64Bytes(part.toString('base64'))), Array.from(part), `${cut} bytes`);
  }
  const random = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 37 + 11) % 256));
  assert.deepEqual(Buffer.from(base64Bytes(random.toString('base64'))), random);
  assert.deepEqual(Buffer.from(base64Bytes(random.toString('base64').replace(/(.{76})/g, '$1\n'))), random, 'line breaks skipped');
  assert.deepEqual(Buffer.from(base64Bytes(random.toString('base64url'))), random, 'URL-safe');
  assert.equal(base64Bytes('ab$d'), null);
  assert.equal(base64Bytes('abcde'), null, 'a length that cannot be');
  assert.equal(base64Bytes('é'), null);
  assert.equal(base64Bytes(null), null);
  assert.deepEqual(Array.from(base64Bytes('')), []);
});

test('the photo to upload: a JPEG of at most 2 MB', () => {
  const jpeg = (size) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.alloc(size - 4, 7)]);
  const ok = photoBytes(jpeg(500000).toString('base64'));
  assert.deepEqual([ok.bytes.length, isJpeg(ok.bytes)], [500000, true]);
  assert.equal(photoBytes(jpeg(CHECK_PHOTO_MAX_BYTES).toString('base64')).bytes.length, CHECK_PHOTO_MAX_BYTES, 'exactly 2 MB passes, as on the server');
  assert.deepEqual(photoBytes(jpeg(CHECK_PHOTO_MAX_BYTES + 1).toString('base64')), { error: 'The photo is larger than 2 MB. Take it again, a little farther away.' });
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.deepEqual(photoBytes(png.toString('base64')), { error: 'This photo could not be read. Take it again.' });
  assert.deepEqual(photoBytes('###'), { error: 'This photo could not be read. Take it again.' });
});

test('the server refuses the photo: take it again; anything else is not a photo matter', () => {
  const server = (status, data = {}) => ({ response: { status, data } });
  assert.deepEqual(checkPhotoRefusal(server(413, { error: 'The check photo is larger than 2 MB' })), { again: true, text: 'The photo is larger than 2 MB. Take it again, a little farther away.' });
  for (const code of ['photo_unknown', 'photo_stale', 'photo_used']) {
    assert.deepEqual(checkPhotoRefusal(server(code === 'photo_used' ? 409 : 400, { code })), { again: true, text: 'The photo of the check has to be taken again.' }, code);
  }
  assert.deepEqual(checkPhotoRefusal(server(400, { error: 'The file is not a PNG or JPEG image' })), { again: true, text: 'This photo could not be sent. Take it again.' });
  assert.equal(checkPhotoRefusal(server(409, { code: 'over_balance' })), null);
  // a 400 that is not about the photo stays the payment's (payError), not «take the photo again»
  assert.equal(checkPhotoRefusal(server(400, { error: 'note is required for part of the balance', code: 'note_required' })), null);
  assert.equal(checkPhotoRefusal(server(400, {})), null);
  assert.equal(checkPhotoRefusal(server(500)), null);
  assert.equal(checkPhotoRefusal({ message: 'Network Error' }), null, 'no answer: payError says it');
});

test('the payment by check names the photo; no other method does', () => {
  const base = { cents: 7529, requestId: 'req-00000001' };
  assert.equal(paymentBody({ ...base, method: 'check', checkNumber: '1042', checkPhotoFileId: 55 }).body.check_photo_file_id, 55);
  assert.equal('check_photo_file_id' in paymentBody({ ...base, method: 'check' }).body, false);
  assert.equal('check_photo_file_id' in paymentBody({ ...base, method: 'cash', checkPhotoFileId: 55 }).body, false);
  assert.equal('check_photo_file_id' in paymentBody({ ...base, method: 'check', checkPhotoFileId: '55' }).body, false);
  assert.equal('check_photo_file_id' in paymentBody({ ...base, method: 'check', checkPhotoFileId: 0 }).body, false);
});

test('Back while the photo goes up: no payment starts (the Architect on #52)', () => {
  assert.deepEqual(afterPhotoUpload({ fileId: 'f1' }, { left: true }), { go: false, left: true });
  assert.deepEqual(afterPhotoUpload({ stop: 'The photo of the check did not go.' }, { left: true }), { go: false, left: true });
  assert.deepEqual(afterPhotoUpload({ fileId: 'f1' }), { go: true, fileId: 'f1' });
  assert.deepEqual(afterPhotoUpload({ fileId: null }), { go: true, fileId: null });
  assert.deepEqual(afterPhotoUpload({ stop: 'The photo of the check did not go.' }), { go: false, text: 'The photo of the check did not go.' });
  assert.deepEqual(afterPhotoUpload({ stop: null }), { go: false, text: null });
});
