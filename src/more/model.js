// More, the technician app's last tab (design-mockups/app-more): who is signed in, the screens
// with no tab of their own (Warehouse, Payments, Receipts, Unpaid), Sign out and the app's
// version. Salary and Parts are tabs already, so they are not here. Words of the design.

// The rows by section: [screen, title, line under it, icon of src/myDay/Icon.js]
export const MORE_SECTIONS = [
  { title: 'Your van', rows: [
    { screen: 'Warehouse', title: 'Warehouse', sub: 'Parts you carry in your van', icon: 'truck' },
  ] },
  { title: 'Money', rows: [
    { screen: 'Payments', title: 'Payments', sub: 'Your payouts by date', icon: 'wallet' },
    { screen: 'Receipts', title: 'Receipts', sub: 'Checks to hand in to the office', icon: 'doc' },
    { screen: 'Unpaid', title: 'Unpaid', sub: 'Customers who still owe for a job', icon: 'money' },
  ] },
];

export const SIGN_OUT = {
  button: 'Sign out',
  title: 'Sign out of SEMIX Tech?',
  text: 'You will need your email and password to sign in again.',
  cancel: 'Cancel',
  confirm: 'Sign out',
};

const words = (s) => (typeof s === 'string' ? s.trim().split(/\s+/).filter(Boolean) : []);
// The first letter, a whole letter even outside the basic plane
const first = (w) => Array.from(w)[0] || '';

// The circle: the first letters of the first and the last word of the name («Ivan Petrov» →
// «IP», «Ivan» → «I»); no name — the first letter of the username; nothing — none
export function initials(user) {
  const name = words(user && user.fullName);
  if (name.length) {
    const pick = name.length > 1 ? [name[0], name[name.length - 1]] : [name[0]];
    return pick.map(first).join('').toUpperCase();
  }
  const login = words(user && user.username);
  return login.length ? first(login[0]).toUpperCase() : '';
}

// The name in bold: the full name, or the username when the office left it empty
export function nameLine(user) {
  const name = words(user && user.fullName).join(' ');
  if (name) return name;
  return words(user && user.username).join(' ') || 'Technician';
}

// «Technician · SEMIX CORP» when the server gives the company's name (/api/me does not yet),
// otherwise «Technician»; only technicians sign in to the app (LoginScreen)
export function roleLine(user) {
  const company = words(user && user.companyName).join(' ');
  return company ? `Technician · ${company}` : 'Technician';
}

// «Signed in as ivan.petrov»; no username — no line
export function signedInLine(user) {
  const login = words(user && user.username).join(' ');
  return login ? `Signed in as ${login}` : null;
}

// «SEMIX Tech 1.0.0 (2)»: the installed build's own numbers (native: { version, build },
// utils/nativeVersion.js — after an update without a build app.json is main's); on a build
// without that module app.json (expo.version, expo.ios.buildNumber, which the release script sets)
export function versionLine(config, native = null) {
  const expo = (config && config.expo) || config || {};
  const fromNative = native && typeof native.version === 'string' && native.version.trim();
  const version = fromNative ? native.version.trim() : typeof expo.version === 'string' && expo.version.trim() ? expo.version.trim() : null;
  const raw = fromNative ? native.build : expo.ios && expo.ios.buildNumber;
  const build = raw === undefined || raw === null ? '' : String(raw).trim();
  if (!version) return 'SEMIX Tech';
  return build ? `SEMIX Tech ${version} (${build})` : `SEMIX Tech ${version}`;
}
