// «Estimate requested · EST-202611-014» under the visit card (D3, design-mockups/visit-diagnosis
// app-after): the visit closed as Estimate needed made or found the job's estimate, and the
// server names it (visit.estimate_request: { id, number, status } — only when this technician
// may open it, else null). A tap opens the estimate (EstimateScreen). No React Native:
// estimateRequest.test.mjs runs it on node.
import { statusWord } from '../estimate/model.js';

// { id, title, line } or null
export function estimateRequestOf(visit) {
  const e = visit && visit.estimate_request;
  if (!e || !Number.isInteger(e.id)) return null;
  const number = typeof e.number === 'string' && e.number.trim() ? e.number.trim() : `#${e.id}`;
  const word = statusWord(e.status);
  return {
    id: e.id,
    title: `Estimate requested · ${number}`,
    // while it waits for its price the office prices it; later, only where it is
    line: e.status === 'diagnostics' ? `${word} · the office prices it` : word,
  };
}
