// The customer's copy of their approval (backend billCopies.js, 6 RCNY §2-258): the server's
// PDF of the record, downloaded with the technician's token into the app's cache, so it can be
// shared from the phone (AirDrop, Mail from the company account, Print, Files). Only a copy in
// the cache: iOS may clear it, then it is downloaded again.
import { downloadPdf } from '../bill/pdf';
import { copyName } from './model';

export const downloadApprovalPdf = (visitId, auth) =>
  downloadPdf(`/api/my/visits/${encodeURIComponent(visitId)}/authorizations/${encodeURIComponent(auth.id)}/pdf`, copyName(auth));
