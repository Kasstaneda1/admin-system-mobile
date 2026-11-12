// The PDF of an issued bill on the phone (backend GET /api/my/visits/:id/bill/pdf): downloaded
// with the technician's token into the app's cache, so it can be shown (BillPdfScreen) and
// shared from the phone (iOS share sheet: AirDrop, Mail, Print, Files). The file is the
// server's, frozen at the issue; the phone keeps only a copy in its cache (iOS may clear it,
// then it is downloaded again). No PDF of a draft: the server has none.
import * as FileSystem from 'expo-file-system/legacy';
import { photoUri, session } from '../services/api';
import { pdfName } from './model';

// Downloads the bill's PDF: { uri } or throws an error shaped as axios's (error.response.status,
// none without the connection), so billError reads it the same way
export async function downloadBillPdf(visitId, bill) {
  const target = `${FileSystem.cacheDirectory}${pdfName(bill)}`;
  const url = photoUri(`/api/my/visits/${encodeURIComponent(visitId)}/bill/pdf`);
  let result = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers = await session.authHeader();
    if (!headers) throw Object.assign(new Error('Signed out'), { response: { status: 401, data: {} } });
    try {
      result = await FileSystem.downloadAsync(url, target, { headers, cache: false });
    } catch (error) {
      throw Object.assign(new Error('No connection'), { cause: error });
    }
    if (result.status !== 401) break;
  }
  if (!result || result.status !== 200) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => {});
    throw Object.assign(new Error('PDF not downloaded'), { response: { status: result ? result.status : 0, data: {} } });
  }
  return { uri: result.uri };
}
