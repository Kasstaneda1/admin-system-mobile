// «How to get in» where the hand is (usability п. 2, design design-mockups/tech-app/shots/
// usab-u2-access.png), without React Native (access.test.mjs runs it on node). The text is the
// office's access_notes of the job as the server gives it, with every visit and in the day's list.
//   - on the visit: right under the address while the technician is on the way, on site or inside
//     the visit's window today; else in its old place under the tiles;
//   - on the NOW card of My day: the same text in one line;
//   - a door code, a buzzer or a gate number (a word of 3 to 8 digits) in large digits.
import { parseWall, stateOf } from './model.js';

// Does the block stand under the address now? now: New York wall clock { date, minutes }
export function accessUp(visit, now) {
  if (!visit || !now) return false;
  const state = stateOf(visit);
  if (state === 'onway' || state === 'onsite') return true;
  if (state !== 'sched') return false;
  const start = parseWall(visit.scheduled_start);
  const end = parseWall(visit.scheduled_end);
  if (!start || start.date !== now.date) return false;
  const until = end && end.date === now.date ? end.minutes : 24 * 60;
  return now.minutes >= start.minutes && now.minutes < until;
}

// The text in pieces, the codes apart: [{ text, big }]. A code is a word of 3 to 8 digits, a «#»
// before it or a stop after it stay small ('#4521,' → '#', '4521', ','); '42nd', '3C' and the parts
// of a phone number ('718-555-0142') are not codes.
const CODE = /^(#?)(\d{3,8})([.,;:!)]?)$/;
export function accessParts(text) {
  const out = [];
  const push = (piece, big) => {
    if (!piece) return;
    const last = out[out.length - 1];
    if (last && !last.big && !big) last.text += piece;
    else out.push({ text: piece, big });
  };
  for (const word of String(text || '').split(/(\s+)/)) {
    const m = CODE.exec(word);
    if (m) {
      push(m[1], false);
      push(m[2], true);
      push(m[3], false);
    } else push(word, false);
  }
  return out;
}

// One line for the NOW card: the lines of the text joined by « · » ('Buzz 3C · door code 4521 ·
// Park on 42nd Ave'); null when there is none
export function accessLine(text) {
  const lines = String(text || '').split(/\n+/).map((l) => l.trim().replace(/\s+/g, ' ')).filter(Boolean);
  return lines.length ? lines.join(' · ') : null;
}
