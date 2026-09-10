/**
 * Parse a date string (YYYY-MM-DD or ISO) as local date without UTC timezone shift.
 * Fixes the issue where new Date("2025-02-12") creates UTC midnight,
 * which displays as Feb 11 in US timezones (EST/CST/PST).
 */
export const parseLocalDate = (dateStr) => {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};

// Zone used for author-time display when a record carries no author timezone
// (comments written before author_tz existed, or clients that do not send it).
const COMPANY_TIME_ZONE = 'America/New_York';

/** A usable IANA zone: the given one if Intl accepts it, otherwise the company zone. */
const resolveTimeZone = (tz) => {
  if (typeof tz !== 'string' || tz.trim() === '') return COMPANY_TIME_ZONE;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz.trim() });
    return tz.trim();
  } catch (_) {
    return COMPANY_TIME_ZONE;
  }
};

/** "America/New_York" → "New York", "Asia/Tokyo" → "Tokyo", "UTC" → "UTC" */
const timeZoneLabel = (zone) => (zone.split('/').pop() || zone).replace(/_/g, ' ');

/**
 * Instant from a server timestamp that has no zone marker: the API returns
 * TIMESTAMP columns as "2026-09-07 14:00:00.123", which is the UTC wall clock.
 */
const instantFromRawUtc = (raw) => {
  if (!raw) return null;
  const s = String(raw).trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(s)) return new Date(s); // already carries a zone
  return new Date(s.replace(' ', 'T') + 'Z');
};

/**
 * Time of a comment as the AUTHOR saw it on their own clock, with the zone spelled
 * out: "Sep 7, 2026, 10:00 AM (New York)". Same rule and format as the web app.
 *
 * @param {string} createdAtUtc - instant as ISO with "Z" (API field created_at_utc)
 * @param {string|null} authorTz - author's IANA zone (API field author_tz); missing or
 *        unknown → company zone (New York)
 * @param {string} [createdAtRaw] - fallback: the zone-less server value (API field
 *        created_at), treated as UTC wall clock
 * @returns {string} never "Invalid Date"; "" if nothing usable was given
 */
export const formatAuthorTime = (createdAtUtc, authorTz, createdAtRaw) => {
  let date = createdAtUtc ? new Date(createdAtUtc) : null;
  if (!date || Number.isNaN(date.getTime())) date = instantFromRawUtc(createdAtRaw);
  if (!date || Number.isNaN(date.getTime())) return '';

  const zone = resolveTimeZone(authorTz);
  const options = { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' };

  try {
    return `${date.toLocaleString('en-US', { ...options, timeZone: zone })} (${timeZoneLabel(zone)})`;
  } catch (_) {
    // JS engine without timeZone support: device-local time, no label
    return date.toLocaleString('en-US', options);
  }
};
