// «How they pay» on the Pay screen itself (USABILITY_2026-11-24 §5, design tech-app
// usab-u4-pay: a full payment in two taps — Cash, Record). Without React Native:
// method.test.mjs runs it on node. The form and its record are pay/MethodForm.js.
import { linesLocked } from './attempts.js';
import { usd } from '../bill/model.js';
import { dueOf } from './model.js';

// What the form shows. A payment sent before without an answer (pay/attempts.js): what it sent —
// the amount, the method and its fields — not to be changed; the next press sends the same lines.
// Else the technician's choice (picked: { tile, otherKey, otherName, checkNumber, note, photo });
// a card payment already gone (cardKept, entryKept) keeps the Card tile.
export function shownOf({ kept = null, cardKept = false, entryKept = false, picked }) {
  if (linesLocked(kept) && kept.view) {
    const v = kept.view;
    return {
      locked: true,
      tile: v.tile,
      otherKey: v.otherKey || null,
      otherName: v.otherName || '',
      checkNumber: v.checkNumber || '',
      note: v.note || '',
      photo: v.photo || null,
      cents: v.cents,
      part: !!v.part,
    };
  }
  return { ...picked, locked: false, tile: cardKept || entryKept ? 'card' : picked.tile, cents: null, part: null };
}

// The payment's note: a part says why (the «Why only part?» note above the methods); a full
// payment takes the method's own note (Card, Zelle, Venmo, Other)
export const noteOf = (part, partNote, methodNote) => String((part ? partNote : methodNote) || '').trim();

// The word for all that is due: «Full balance» while nothing is taken on the bill, «Balance left»
// once a payment or a deposit took part of it (the Designer on #92: «Full balance $33.43» reads
// as the whole bill)
export const balanceWord = (bill) => (bill && dueOf(bill) < (bill.total_cents || 0) ? 'Balance left' : 'Full balance');

// The line under the amount in the «Collect now» box
export const collectSub = (part, cents, due, word = 'Full balance') => (part ? `Part of ${usd(due)} · ${usd(Math.max(0, due - cents))} left after this` : word);
