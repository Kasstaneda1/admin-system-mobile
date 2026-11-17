// Salary of the technician app = Salary of the technician portal on the site (owner 2026-11-12:
// the same screens, the same data, the same words; design-mockups/app-salary-parts README).
// The data is the portal's: POST /api/technician-salary for a year (its jobs) and for a month
// (its jobs plus totalPaid, totalCash, totalChecks, totalUnpaid, totalToPay). The words and the
// arithmetic of the job breakdown are those of the site's js/technician-salary.js. Nothing here
// draws; the screens take what these functions give.

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// $1,234.56; below zero «−$62.50» (a minus sign before the dollar, as money everywhere)
export function money(value) {
  const cents = Math.round(num(value) * 100);
  const abs = Math.abs(cents);
  const whole = String(Math.floor(abs / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const text = `$${whole}.${String(abs % 100).padStart(2, '0')}`;
  return cents < 0 ? `−${text}` : text;
}

export const jobsWord = (n) => `${n} job${n === 1 ? '' : 's'}`;

// '2026-11-12' (or with a time after it) → 'Nov 12, 2026'; the date as written, no time zone shift
export function dateText(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || ''));
  if (!m) return 'N/A';
  return `${MONTHS_SHORT[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

// «Balance as of Nov 30, 2026»: the last day of the month (the site's toPayDate)
export function balanceDate(year, month) {
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${MONTHS_SHORT[month]} ${last}, ${year}`;
}

export const monthTitle = (year, month) => `${MONTHS[month]} ${year}`;

// ---------- the year ----------
// The year's jobs by month (the site's loadYearData): the sum of Your Earnings and how many
export function monthsOf(jobs, year) {
  const months = MONTHS.map(() => ({ total: 0, count: 0 }));
  (jobs || []).forEach((job) => {
    const m = /^(\d{4})-(\d{2})/.exec(String(job.date || ''));
    if (!m || Number(m[1]) !== year) return;
    const slot = months[Number(m[2]) - 1];
    if (!slot) return;
    slot.total += num(job.calculated_salary);
    slot.count += 1;
  });
  return months;
}

// The twelve tiles (design salary-year): a month without jobs is grey and says «No jobs»; the
// month of today is marked. Every tile opens its month, as on the site.
export function yearTiles(months, year, today) {
  return months.map((m, i) => ({
    key: MONTHS_SHORT[i],
    month: i,
    name: MONTHS_SHORT[i],
    amount: m.count ? money(m.total) : '—',
    sub: m.count ? jobsWord(m.count) : 'No jobs',
    empty: !m.count,
    now: today.year === year && today.month === i,
  }));
}

// The year switcher: no year after this one
export const canGoNext = (year, today) => year < today.year;

// ---------- the month ----------
// The month's rows (design salary-month; site monthSummary*): Paid opens Payments, Checks opens
// Receipts, Unpaid opens Unpaid Clients; To Pay is the balance as the server counts it, as of the
// last day of the month, and can be below zero
export function summaryOf(data, year, month) {
  const d = data || {};
  const toPay = num(d.totalToPay);
  return {
    total: money(d.total),
    jobs: jobsWord((d.jobs || []).length),
    rows: [
      { key: 'paid', label: 'Paid', value: money(d.totalPaid), go: 'Payments', ok: true },
      { key: 'cash', label: 'Cash', value: money(d.totalCash) },
      { key: 'checks', label: 'Checks', value: money(d.totalChecks), go: 'Receipts' },
      { key: 'toPay', label: 'To Pay', sub: `Balance as of ${balanceDate(year, month)}`, value: money(toPay), strong: true, minus: Math.round(toPay * 100) < 0 },
      { key: 'unpaid', label: 'Unpaid', value: money(d.totalUnpaid), go: 'Unpaid' },
    ],
    minus: Math.round(toPay * 100) < 0,
  };
}

// A month with nothing in it: no jobs and no money moved (design salary-empty)
export function isEmptyMonth(data) {
  const d = data || {};
  return !(d.jobs || []).length && !['totalPaid', 'totalCash', 'totalChecks', 'totalUnpaid', 'totalToPay'].some((k) => Math.round(num(d[k]) * 100) !== 0);
}

export const MINUS_NOTE = {
  title: 'To Pay is below zero',
  text: 'A minus means you have more than you earned so far: cash you kept or a payout ahead of your jobs.',
};

// ---------- work statuses (the PD set of colours, as the site's badges) ----------
const TAGS = {
  done: ['done', 'wrench'],
  diagnostics: ['diagnostics', 'search'],
  installation: ['installation', 'install'],
  deposit: ['deposit', 'money'],
  recall: ['recall', 'replay'],
  '2nd tech payout': ['helper', 'people'],
};
const ORDER = ['done', 'diagnostics', 'installation', 'deposit', 'recall', '2nd tech payout'];

export function tagOf(status, count = null) {
  const word = status || 'Job';
  const [kind, icon] = TAGS[String(status || '').toLowerCase()] || ['neutral', 'doc'];
  return { kind, icon, text: count == null ? word : `${word} · ${count}` };
}

// Breakdown (site monthBreakdown): one row per work status — its badge with the count, the money
export function breakdownOf(breakdown) {
  const rank = (s) => {
    const i = ORDER.indexOf(String(s).toLowerCase());
    return i < 0 ? ORDER.length : i;
  };
  return Object.entries(breakdown || {})
    .sort(([a], [b]) => rank(a) - rank(b) || String(a).localeCompare(String(b)))
    .map(([status, d]) => ({ key: status, tag: tagOf(status, num(d && d.count)), value: money(d && d.total) }));
}

// ---------- the jobs ----------
const unpaidJob = (job) => String(job.payment_status || '').toLowerCase() === 'not paid';

// A card of View All Jobs (site createJobCard; design salary-jobs): the customer, the date, the
// status; «Not paid by the customer» with a red stripe; Your Earnings; the Cash and Check chips.
// A check handed in keeps its amount and says so.
export function jobCardOf(job) {
  const check = num(job.check_amount);
  const handedIn = check !== 0 && !!job.check_submitted;
  return {
    key: String(job.id),
    client: job.client_name || 'N/A',
    date: dateText(job.date),
    tag: tagOf(job.work_status),
    unpaid: unpaidJob(job),
    earnings: money(job.calculated_salary),
    cash: money(job.cash_received),
    check: check === 0 ? '$0.00' : handedIn ? `${money(check)} · handed in` : money(check),
    handedIn,
  };
}

// Job Details (site renderJobDetail and renderSalaryBreakdown): the rows of Your Earnings, or a
// note instead of the base × % arithmetic where the job earns nothing (yet). The numbers come
// from the stored calculated_salary: Your share = salary − tips, so the rows always add up to it.
export function detailOf(job) {
  const status = String(job.work_status || '').toLowerCase();
  const method = String(job.payment_method || '').toLowerCase();
  const cashless = ['card', 'zelle', 'venmo', 'bank transfer'];
  const amount = num(job.amount);
  const tax = num(job.tax);
  const parts = num(job.parts);
  const secondTech = num(job.second_tech);
  const tips = num(job.tips);
  const installation = num(job.installation);
  const salary = num(job.calculated_salary);
  const row = (label, value, kind = null) => ({ key: label, label, value, kind });
  let note = null;
  let rows = [];

  if (status === '2nd tech payout') {
    const paid = String(job.payment_status || '').toLowerCase() === 'paid';
    const waitingForCheck = method === 'check' && !job.check_submitted;
    if (salary > 0) note = 'Helped on this job — flat payout, not a percentage.';
    else if (!paid) note = 'Helped on this job — the payout is released once the customer pays.';
    else if (waitingForCheck) note = 'Helped on this job — the payout is released once the check is submitted.';
    else note = 'Helped on this job — flat payout.';
    rows = [row('Payout', money(amount))];
  } else if (method === 'split' && num(job.check_amount) > 0 && !job.check_submitted) {
    note = `Paid in parts. ${money(job.check_amount)} is still in a check you have not handed in — your share is credited once it is.`;
    rows = [row('Amount', money(amount))];
  } else {
    const earning = ['diagnostics', 'done', 'installation'].includes(status)
      && (method === 'cash' || cashless.includes(method) || method === 'split');
    if (!earning) {
      if (status === 'recall') note = 'Recall — warranty/repeat work, no salary.';
      else if (status === 'deposit') note = 'Deposit — unfinished work, no salary.';
      else if (method === 'check' && !job.check_submitted) note = 'Check not submitted yet — salary is credited once the check is turned in.';
      else if (method === 'minus') note = 'Minus — only tips are paid for this job.';
      if (method === 'minus' && tips) rows = [row('Tips', money(tips))];
    } else {
      const install = status === 'installation';
      const source = install ? installation : amount;
      const cut = Math.max(0, salary - tips);
      const base = source - tax - parts - secondTech;
      const pct = base > 0 ? Math.round((cut / base) * 100) : 0;
      rows.push(row(install ? 'Installation' : 'Amount', money(source)));
      if (tax) rows.push(row('− Tax', `−${money(tax)}`));
      rows.push(parts ? row('− Parts', `−${money(parts)}`) : row('− Parts', 'No parts', 'muted'));
      if (secondTech) rows.push(row('− 2nd Tech', `−${money(secondTech)}`));
      if (tax || parts || secondTech) rows.push(row('Base', money(base), 'base'));
      rows.push(row(`Your share (${pct}%)`, money(cut)));
      if (tips) rows.push(row('+ Tips', `+${money(tips)}`));
    }
  }

  const after = [];
  if (num(job.cash_received)) after.push(row('Cash Received', money(job.cash_received)));
  if (num(job.check_amount)) {
    after.push(row('Check Amount', job.check_submitted ? `${money(job.check_amount)} · handed in` : money(job.check_amount), job.check_submitted ? 'muted' : null));
  }

  return {
    tag: tagOf(job.work_status),
    date: dateText(job.date),
    client: job.client_name || 'N/A',
    company: job.company || null,
    work: [
      row('Status', job.work_status || 'N/A'),
      row('Payment', job.payment_method || 'N/A'),
      row('Payment Status', job.payment_status || 'N/A'),
    ],
    note,
    rows,
    salary: money(salary),
    after,
  };
}

// The server's answer, or why there is none (no connection, or another refusal)
export function salaryError(error) {
  const status = error && error.response ? error.response.status : 0;
  if (!status) return { kind: 'offline', title: 'No connection', text: 'Salary comes from the office’s server. Try again when you are back online.' };
  return { kind: 'failed', title: 'Could not load Salary', text: 'Something went wrong. Try again.' };
}
