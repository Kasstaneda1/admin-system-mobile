// The photo of a check (PR 8б-2, BILLS_MV_DESIGN.md §2.3, backend #191), without React Native:
// checkPhoto.test.mjs runs it on node. The photo is taken with the camera (not kept in the
// phone's photos), made at most 2000 px on its long side and JPEG 0.7 (a HEIC from the camera
// becomes JPEG too) by expo-image-manipulator in the screen, uploaded by itself first
// (POST /api/my/visits/:id/check-photos, the bytes, up to 2 MB), and the payment by check then
// names it (check_photo_file_id). Who may see it and for how long is the server's: the office's
// admin; the technician who recorded it for a day. The app never shows it again.

// The server's limit (checkPhotos.js), and the size the photo is made to
export const CHECK_PHOTO_MAX_BYTES = 2 * 1024 * 1024;
export const CHECK_PHOTO_LONG_SIDE = 2000;
export const CHECK_PHOTO_QUALITY = 0.7;

// The resize for a photo width × height: { width } or { height } of the long side, the other
// kept in proportion by the manipulator; null when it is small enough already or unknown
export function resizeFor(width, height, longSide = CHECK_PHOTO_LONG_SIDE) {
  if (!(width > 0 && height > 0)) return null;
  if (Math.max(width, height) <= longSide) return null;
  return width >= height ? { width: longSide } : { height: longSide };
}

// Base64 (what the manipulator gives) → the bytes. Our own: atob and Buffer are not to be
// relied on in Hermes. Spaces and line breaks are skipped; anything else not of base64 → null.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) table[ALPHABET.charCodeAt(i)] = i;
  table['-'.charCodeAt(0)] = 62; // the URL-safe alphabet too
  table['_'.charCodeAt(0)] = 63;
  return table;
})();
export function base64Bytes(text) {
  if (typeof text !== 'string') return null;
  const clean = text.replace(/[\s]/g, '').replace(/=+$/, '');
  if (clean.length % 4 === 1) return null;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let bits = 0;
  let count = 0;
  let at = 0;
  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? VALUE[code] : -1;
    if (value < 0) return null;
    bits = (bits << 6) | value;
    count += 6;
    if (count >= 8) {
      count -= 8;
      out[at] = (bits >> count) & 0xff;
      at += 1;
    }
  }
  return out;
}

// The start of a JPEG file: what the server checks too
export const isJpeg = (bytes) => !!bytes && bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

// The prepared photo → { bytes } ready to upload, or { error } for the technician
export function photoBytes(base64) {
  const bytes = base64Bytes(base64);
  if (!bytes || !isJpeg(bytes)) return { error: 'This photo could not be read. Take it again.' };
  if (bytes.length > CHECK_PHOTO_MAX_BYTES) return { error: 'The photo is larger than 2 MB. Take it again, a little farther away.' };
  return { bytes };
}

// The server's refusals of a photo (upload or the payment that names it), as the screen says
// them; null for any other failure (payError says those). again: the photo must be taken anew.
export function checkPhotoRefusal(error) {
  const response = error && error.response;
  if (!response) return null;
  const data = response.data || {};
  if (response.status === 413) return { again: true, text: 'The photo is larger than 2 MB. Take it again, a little farther away.' };
  switch (data.code) {
    case 'photo_unknown':
    case 'photo_stale':
    case 'photo_used':
      return { again: true, text: 'The photo of the check has to be taken again.' };
    default:
      break;
  }
  if (response.status === 400 && /image|photo|png|jpeg/i.test(String(data.error || ''))) {
    return { again: true, text: 'This photo could not be sent. Take it again.' };
  }
  return null;
}

// After the photo's upload on Record (the Architect on #52): the technician may have left the
// screen meanwhile (Back, the swipe) — then no payment starts, nothing is recorded (the uploaded
// file stays unused; the server forgets it). file: photoFile's { fileId } or { stop }.
// → { go: true, fileId } · { go: false, text } (shown, or null) · { go: false, left: true } (quiet)
export function afterPhotoUpload(file, { left = false } = {}) {
  if (left) return { go: false, left: true };
  if (file && file.stop !== undefined) return { go: false, text: file.stop || null };
  return { go: true, fileId: file ? file.fileId : null };
}

// The line of the photo under Check on the Pay screen
export const PHOTO_ADDED = 'Photo of the front added';
export const PHOTO_ASK = 'Add a photo of the front';
export const PHOTO_NOTE = 'Not saved to your photos. Deleted by itself 90 days after the payment.';
