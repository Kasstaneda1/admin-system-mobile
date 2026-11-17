// The phone's unsent messages (outbox.js) on the real store (outboxQueue.js) and the API.
import { estimateAPI } from '../services/api';
import { outboxQueue } from './outboxQueue';
import { makeOutbox } from './outbox.js';

// The technician's own zone, as the site sends it (author_tz)
function timeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

export const outbox = makeOutbox({
  queue: outboxQueue,
  api: { comments: (id) => estimateAPI.comments(id), post: (id, body) => estimateAPI.send(id, body) },
  timeZone,
});
