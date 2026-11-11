// node --test: notes and photos of a visit, without the screen (notesPhotos.js).
// Times are New York: Wednesday Nov 11 2026, EST (UTC−5).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_MAX, NOTE_CHIPS, canAddExtras, cleanNote, noteToSend, noteLength, noteReady, withChip, noteRequest, noteBody, noteError,
  photoFile, photosOf, photoPath, photosTitle, photoError, photoMoment, photoSource,
} from './notesPhotos.js';
import { nowWall } from './model.js';

const NOW = nowWall(Date.parse('2026-11-11T16:30:00Z'));   // 11:30 AM
const visit = (o = {}) => ({ id: 11, job_id: 6, legacy: false, role: 'main', status: 'scheduled', outcome: null, closed_at: null, ...o });

test('who may add: main and helper, closed visits too; not a cancelled visit or an old task', () => {
  assert.equal(canAddExtras(visit()), true);
  assert.equal(canAddExtras(visit({ role: 'helper' })), true);
  assert.equal(canAddExtras(visit({ status: 'completed', outcome: 'done', closed_at: '2026-11-11T15:00:00Z' })), true);
  assert.equal(canAddExtras(visit({ status: 'cancelled' })), false);
  assert.equal(canAddExtras(visit({ legacy: true, job_id: null })), false);
  assert.equal(canAddExtras(null), false);
});

test('the text: control characters out (the server refuses them), lines and tabs stay, trimmed', () => {
  assert.equal(cleanNote('Pump\u0000 replaced\u0007.\nOld\those\u007F'), 'Pump replaced.\nOld\those');
  assert.equal(noteToSend('  \n Pump replaced \n '), 'Pump replaced');
  assert.equal(noteReady('   '), false);
  assert.equal(noteReady('\u0000'), false);
  assert.equal(noteReady('ok'), true);
  // the server counts characters, not UTF-16 units: 2000 emoji are fine, 2001 are not
  assert.equal(noteLength('👍'.repeat(NOTE_MAX)), NOTE_MAX);
  assert.equal(noteReady('👍'.repeat(NOTE_MAX)), true);
  assert.equal(noteReady('a'.repeat(NOTE_MAX + 1)), false);
});

test('a chip adds its words after what is typed', () => {
  assert.deepEqual(NOTE_CHIPS, ['Needs a part', 'Customer not home', 'Call before next visit']);
  assert.equal(withChip('', 'Needs a part'), 'Needs a part');
  assert.equal(withChip('Pump replaced', 'Needs a part'), 'Pump replaced. Needs a part');
  assert.equal(withChip('Pump replaced.  \n', 'Needs a part'), 'Pump replaced. Needs a part');
  assert.equal(withChip('Who knows?', 'Call before next visit'), 'Who knows? Call before next visit');
  assert.equal(withChip('a'.repeat(NOTE_MAX), 'Needs a part').length, NOTE_MAX);
});

test('Try again sends the same note with the same id; a changed text is a new note', () => {
  const first = noteRequest(null, ' Pump replaced ', 0, () => 0);
  assert.deepEqual(first, { text: 'Pump replaced', requestId: 'app-0-000000000000' });
  assert.match(noteRequest(null, 'x').requestId, /^[A-Za-z0-9_-]{8,64}$/);
  assert.deepEqual(noteRequest(first, 'Pump replaced'), first);
  assert.notEqual(noteRequest(first, 'Pump replaced, hose old').requestId, first.requestId);
  assert.deepEqual(noteBody(first), { text: 'Pump replaced', client_request_id: 'app-0-000000000000' });
});

test('a failed save in a note\'s words', () => {
  assert.equal(noteError(new Error('Network Error')).kind, 'offline');
  assert.equal(noteError({ response: { status: 404, data: { error: 'Visit not found' } } }).kind, 'gone');
  assert.deepEqual(noteError({ response: { status: 409, data: { error: 'The office cancelled this visit', visit: { id: 11 } } } }),
    { kind: 'refused', text: 'The office cancelled this visit', visit: { id: 11 }, retry: false });
  assert.equal(noteError({ response: { status: 400, data: {} } }).text, 'The note could not be saved');
  assert.equal(noteError({ response: { status: 400, data: { error: 'text must not be empty' } } }).text, 'text must not be empty');
  assert.equal(noteError({ response: { status: 503, data: '' } }).kind, 'failed');
});

test('a photo to send: JPEG or PNG as the server takes them; HEIC is refused here, not by the server', () => {
  assert.deepEqual(photoFile({ uri: 'file:///tmp/ABC.jpg', mimeType: 'image/jpeg', fileName: 'IMG_0001.JPG' }),
    { uri: 'file:///tmp/ABC.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  assert.deepEqual(photoFile({ uri: 'file:///tmp/ABC.jpg' }), { uri: 'file:///tmp/ABC.jpg', name: 'photo.jpg', type: 'image/jpeg' });
  assert.equal(photoFile({ uri: 'file:///tmp/shot.PNG', mimeType: null }).type, 'image/png');
  assert.equal(photoFile({ uri: 'file:///tmp/x.jpg', mimeType: 'image/jpg' }).type, 'image/jpeg');
  assert.equal(photoFile({ uri: 'file:///tmp/IMG_1.heic', mimeType: 'image/heic' }), null);
  assert.equal(photoFile({ uri: 'file:///tmp/IMG_1.heic' }), null);
  assert.equal(photoFile({ uri: '' }), null);
  assert.equal(photoFile(null), null);
});

test('the visit\'s photos: the server\'s rows, newest first, each with its own address', () => {
  // the server gives the database's UTC time without a zone (the stand showed 1:09 PM for 8:09 AM)
  const rows = [
    { id: 9, task_id: 11, filename: 'b.jpg', url: '/uploads/tasks/b.jpg', created_at: '2026-11-11 13:09:37.114509' },
    { id: 7, task_id: 11, filename: 'a.jpg', url: '/uploads/tasks/a.jpg', created_at: '2026-11-06T15:00:00.000Z' },
    { id: 8, created_at: null },
    { id: 'x' }, null,
  ];
  assert.deepEqual(photosOf(rows, 11, NOW), [
    { id: 9, key: 'p9', when: '8:09 AM', path: '/api/scheduler/tasks/11/photos/9/file' },
    { id: 7, key: 'p7', when: 'Nov 6', path: '/api/scheduler/tasks/11/photos/7/file' },
    { id: 8, key: 'p8', when: '', path: '/api/scheduler/tasks/11/photos/8/file' },
  ]);
  assert.equal(photoMoment('2026-11-11 13:09:37.114509'), Date.parse('2026-11-11T13:09:37.114Z'));
  assert.equal(photoMoment('2026-11-11 13:09'), Date.parse('2026-11-11T13:09:00.000Z'));
  assert.equal(photoMoment('2026-11-11T13:09:37.000Z'), Date.parse('2026-11-11T13:09:37.000Z'));
  assert.equal(photoMoment('soon'), null);
  assert.deepEqual(photosOf(null, 11, NOW), []);
  assert.equal(photoPath(11, 9), '/api/scheduler/tasks/11/photos/9/file');
  assert.equal(photosTitle(2), 'Photos · 2');
});

test('a failed upload: no answer tries the same photo again; too large or refused says why', () => {
  assert.deepEqual(photoError(new Error('Network Error')), { kind: 'offline', text: 'Photo not sent. No connection.', retry: true });
  assert.equal(photoError({ response: { status: 404, data: { error: 'Task not found' } } }).kind, 'gone');
  assert.deepEqual(photoError({ response: { status: 413, data: '' } }), { kind: 'refused', text: 'The photo is too large', retry: false });
  assert.equal(photoError({ response: { status: 400, data: { error: 'No file uploaded' } } }).text, 'No file uploaded');
  assert.deepEqual(photoError({ response: { status: 500, data: { error: 'Failed to upload photo' } } }),
    { kind: 'failed', text: 'Photo not sent. The server did not answer.', retry: true });
});

test('a photo on the screen: the address, the token, never from the phone\'s cache', () => {
  const uri = 'http://127.0.0.1:8291/api/scheduler/tasks/11/photos/9/file';
  assert.deepEqual(photoSource(uri, { Authorization: 'Bearer t' }), { uri, headers: { Authorization: 'Bearer t' }, cache: 'reload' });
  // no token (yet): no header at all, not a null one
  assert.deepEqual(photoSource(uri, null), { uri, headers: undefined, cache: 'reload' });
});
