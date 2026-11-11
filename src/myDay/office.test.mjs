import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OFFICE_V, officeCall, officeFrom, officeOf } from './office.js';

test('officeFrom keeps the phone and the name of the answer', () => {
  assert.deepEqual(officeFrom({ success: true, phone: ' (718) 555-0100 ', company_name: 'SEMIX Corp' }, 2, 1000),
    { v: OFFICE_V, userId: 2, phone: '(718) 555-0100', name: 'SEMIX Corp', at: 1000 });
  // not filled in: null, blank counts as not filled
  assert.deepEqual(officeFrom({ success: true, phone: null, company_name: '  ' }, 2, 1000),
    { v: OFFICE_V, userId: 2, phone: null, name: null, at: 1000 });
  // another shape or no technician: nothing to keep
  assert.equal(officeFrom({ success: true }, 2, 1000), null);
  assert.equal(officeFrom('<html>', 2, 1000), null);
  assert.equal(officeFrom(null, 2, 1000), null);
  assert.equal(officeFrom({ phone: '7185550100' }, null, 1000), null);
});

test('officeOf gives only this technician\'s office', () => {
  const kept = officeFrom({ phone: '7185550100', company_name: 'SEMIX Corp' }, 2, 1000);
  assert.equal(officeOf(kept, 2), kept);
  assert.equal(officeOf(kept, 3), null);      // another technician signed in on the phone
  assert.equal(officeOf(kept, null), null);
  assert.equal(officeOf({ ...kept, v: 0 }, 2), null);
  assert.equal(officeOf(null, 2), null);
});

test('officeCall: dial, say the phone is missing, or ask the server', () => {
  assert.deepEqual(officeCall({ phone: '(718) 555-0100' }), { call: 'tel:7185550100' });
  assert.deepEqual(officeCall({ phone: '+1 718 555 0100' }), { call: 'tel:+17185550100' });
  assert.deepEqual(officeCall({ phone: null }), { missing: true });
  assert.deepEqual(officeCall({ phone: 'ask Anna' }), { missing: true });
  assert.equal(officeCall(null), null);
});
