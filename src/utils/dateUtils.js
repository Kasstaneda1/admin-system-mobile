/**
 * Parse a date string (YYYY-MM-DD or ISO) as local date without UTC timezone shift.
 * Fixes the issue where new Date("2025-02-12") creates UTC midnight,
 * which displays as Feb 11 in US timezones (EST/CST/PST).
 */
export const parseLocalDate = (dateStr) => {
  const [year, month, day] = dateStr.split('T')[0].split('-').map(Number);
  return new Date(year, month - 1, day);
};
