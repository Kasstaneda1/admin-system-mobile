// The customer's copy of their signature «after the work» (backend billCopies.js): the server's
// PDF of the record, downloaded with the technician's token into the app's cache, so it can be
// shared from the phone. Only a copy in the cache: iOS may clear it, then it is downloaded again.
import { downloadPdf } from '../bill/pdf';
import { ackCopyName } from './model';

export const downloadAckPdf = (visitId, bill) =>
  downloadPdf(`/api/my/visits/${encodeURIComponent(visitId)}/bill/acknowledgment/pdf`, ackCopyName(bill));
