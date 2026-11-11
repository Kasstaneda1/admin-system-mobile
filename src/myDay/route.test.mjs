// node --test: the route of a day without the screen (route.js). The day is the design's
// Tuesday: Rossi and Kowalski in Forest Hills, Patel in Bayside on the way, Nguyen in Rego Park
// as the helper, Chen and Haddad back in Bayside and Little Neck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { milesText, flagKey, pickFlags, routeNoteText, routeView, hasIssue, routeLinks, regionOf, routeNoticeText, markerGroups, hasNativeMap, MAPS_STOPS_MAX } from './route.js';

const stop = (n, id, client, lat, lng, plan, w0, w1, leg, status = 'scheduled') => ({
  n, visit_id: id, client_name: client, status, lat, lng, has_map_point: lat !== null,
  planned_start: plan ? `2026-11-10 ${plan}:00` : null,
  window: { start: `2026-11-10 ${w0}:00`, end: `2026-11-10 ${w1}:00` }, leg_miles: leg,
});
const ROUTE = () => ({
  date: '2026-11-10', today: '2026-11-10',
  stops: [
    stop(1, 1, 'Anna Rossi', 40.7196, -73.8448, '08:15', '08:00', '10:00', null, 'completed'),
    stop(2, 2, 'Marta Kowalski', 40.7128, -73.8505, '09:40', '09:00', '11:00', 1.2, 'completed'),
    stop(3, 3, 'Sanjay Patel', 40.7637, -73.7710, '11:45', '11:00', '14:00', 9.4, 'omw'),
    stop(4, 4, 'Thanh Nguyen', 40.7262, -73.8607, '13:30', '11:00', '16:00', 10.6),
    stop(5, 5, 'Wei Chen', 40.7660, -73.7700, '15:45', '13:00', '18:00', 10.8),
    stop(6, 6, 'Lena Haddad', 40.7700, -73.7350, '17:30', '17:00', '20:00', 2.9),
  ],
  total_miles: 34.9,
  stops_without_point: 0,
  flags: [
    { between: [3, 4], visit_ids: [3, 4], saves_miles: 6.1, past: false, text: 'Visit 4 could go before 3: about 6 mi shorter' },
    { between: [4, 5], visit_ids: [4, 5], saves_miles: 9.8, past: false, text: 'Visit 5 could go before 4: about 10 mi shorter' },
  ],
});
const VISITS = [
  { id: 1, status: 'completed', outcome: 'diagnostics_only', role: 'main', city: 'Forest Hills', client_name: 'Anna Rossi' },
  { id: 2, status: 'completed', outcome: 'done', role: 'main', city: 'Forest Hills', client_name: 'Marta Kowalski' },
  { id: 3, status: 'omw', omw_at: '2026-11-10T16:08:00Z', role: 'main', city: 'Bayside', client_name: 'Sanjay Patel' },
  { id: 4, status: 'scheduled', role: 'helper', main_technician_name: 'Alex Kim', city: 'Rego Park', client_name: 'Thanh Nguyen' },
  { id: 5, status: 'scheduled', role: 'main', city: 'Bayside', client_name: 'Wei Chen' },
  { id: 6, status: 'scheduled', role: 'main', city: 'Little Neck', client_name: 'Lena Haddad' },
];

test('the hints shown: the biggest saving first, never two with a visit in common', () => {
  const picked = pickFlags(ROUTE().flags);
  assert.deepEqual(picked.map((f) => f.between), [[4, 5]], '3–4 shares visit 4 with the bigger 4–5');
  const apart = [
    { between: [1, 2], visit_ids: [11, 12], saves_miles: 5.5, text: 'a' },
    { between: [4, 5], visit_ids: [14, 15], saves_miles: 7.2, text: 'b' },
    { between: [2, 3], visit_ids: [12, 13], saves_miles: 6.0, text: 'c' },
  ];
  assert.deepEqual(pickFlags(apart).map((f) => f.text), ['b', 'c'], '1–2 and 2–3 share 12: 2–3 saves more');
  // same saving: earlier in the day first
  assert.deepEqual(pickFlags([{ between: [5, 6], visit_ids: [5, 6], saves_miles: 6, text: 'x' }, { between: [1, 2], visit_ids: [1, 2], saves_miles: 6, text: 'y' }]).map((f) => f.text), ['y', 'x']);
  // nothing usable
  assert.deepEqual(pickFlags(null), []);
  assert.deepEqual(pickFlags([{ between: [1, 2] }, null]), []);
  assert.equal(flagKey({ visit_ids: [4, 5] }), '4-5');
});

test('the route view: stops in the server\'s order, the words and miles as it counted them', () => {
  const v = routeView(ROUTE(), { visits: VISITS });
  assert.equal(v.title, 'Route · Tue, Nov 10');
  assert.equal(v.summary, '≈ 34.9 mi · 6 stops');
  assert.deepEqual(v.stops.map((s) => [s.n, s.time, s.client, s.state, s.flagged]), [
    [1, '8:15', 'Rossi A.', 'closed', false],
    [2, '9:40', 'Kowalski M.', 'closed', false],
    [3, '11:45', 'Patel S.', 'current', false],
    [4, '1:30', 'Nguyen T.', 'helper', true],
    [5, '3:45', 'Chen W.', 'sched', true],
    [6, '5:30', 'Haddad L.', 'sched', false],
  ]);
  assert.equal(v.stops[0].line, 'Forest Hills · window 8–10');
  assert.equal(v.stops[3].tag.text, 'Helping Alex');
  assert.deepEqual(v.stops.map((s) => s.leg && s.leg.text), [null, '≈ 1.2 mi', '≈ 9.4 mi', '≈ 10.6 mi', '≈ 10.8 mi', '≈ 2.9 mi']);
  // orange: the legs through the hint's two stops (3→4, 4→5, 5→6); grey: between two closed
  assert.deepEqual(v.legs.map((l) => [l.key, l.bad, l.done]), [['1-2', false, true], ['2-3', false, false], ['3-4', true, false], ['4-5', true, false], ['5-6', true, false]]);
  assert.deepEqual(v.stops.map((s) => !!(s.leg && s.leg.bad)), [false, false, false, true, true, true]);
  assert.deepEqual(v.legs[0].from, { latitude: 40.7196, longitude: -73.8448 });
  assert.deepEqual(v.hints, [{ key: '4-5', between: [4, 5], text: 'Visit 5 could go before 4: about 10 mi shorter', past: false, noteVisitId: 5, mark: null }]);
  assert.equal(v.issue, true);
  assert.equal(v.noPoint, 0);
});

// The same day from the technician's home (backend #157): stop 0, no customer; the first
// leg is from home and in the total
const HOME = { n: 0, kind: 'home', visit_id: null, client_name: null, status: null, lat: 40.7310, lng: -73.8100, has_map_point: true, planned_start: null, window: null, leg_miles: null };
const FROM_HOME = (patch = {}) => {
  const r = ROUTE();
  r.stops = [HOME, ...r.stops.map((s) => ({ ...s, kind: 'visit' }))];
  r.stops[1].leg_miles = 4.3;
  r.total_miles = 39.2;
  r.home_missing = false;
  return { ...r, ...patch };
};

test('from home: home is no visit — no number, no customer, the first leg starts there', () => {
  const v = routeView(FROM_HOME(), { visits: VISITS });
  assert.deepEqual(v.home, { key: 'home', home: true, n: 0, state: 'home', lat: 40.7310, lng: -73.8100 });
  assert.equal(v.homeMissing, false);
  assert.deepEqual(v.stops.map((s) => s.n), [1, 2, 3, 4, 5, 6]);
  assert.equal(v.summary, '≈ 39.2 mi · 6 stops');
  assert.deepEqual(v.stops.map((s) => s.leg && s.leg.text), ['≈ 4.3 mi', '≈ 1.2 mi', '≈ 9.4 mi', '≈ 10.6 mi', '≈ 10.8 mi', '≈ 2.9 mi']);
  // home → 1: driven (1 is closed); the rest as without home
  assert.deepEqual(v.legs.map((l) => [l.key, l.bad, l.done]), [['0-1', false, true], ['1-2', false, true], ['2-3', false, false], ['3-4', true, false], ['4-5', true, false], ['5-6', true, false]]);
  assert.deepEqual(v.legs[0].from, { latitude: 40.7310, longitude: -73.8100 });
  assert.deepEqual(v.mapPoints.map((p) => p.key), ['home', 's1-1', 's2-2', 's3-3', 's4-4', 's5-5', 's6-6']);
  assert.equal(v.points.length, 6, 'the stops alone');
  assert.equal(v.noPoint, 0);
  // Open in Maps goes from where the phone is, as before: not to home
  assert.ok(!routeLinks(v).apple.includes('40.731,-73.81'));
  // home and a close stop share one mark like two close stops
  const groups = markerGroups(v.mapPoints, regionOf(v.mapPoints), { width: 390, height: 280 });
  assert.ok(groups.some((g) => g.stops[0].home));
});

test('from home: a hint between 1 and 2 makes home → 1 orange; one stop has its miles too', () => {
  const r = FROM_HOME({ flags: [{ between: [1, 2], visit_ids: [1, 2], saves_miles: 8, past: false, text: 'Visit 2 could go before 1: about 8 mi shorter' }] });
  r.stops[1].status = 'scheduled';
  r.stops[2].status = 'scheduled';
  const v = routeView(r, { visits: [] });
  assert.deepEqual(v.legs.slice(0, 3).map((l) => [l.key, l.bad, l.done]), [['0-1', true, false], ['1-2', true, false], ['2-3', true, false]]);
  assert.deepEqual(v.stops.slice(0, 3).map((s) => s.leg.bad), [true, true, true]);
  assert.deepEqual(v.stops.slice(0, 2).map((s) => s.flagged), [true, true]);
  assert.deepEqual(v.hints.map((h) => [h.between, h.noteVisitId]), [[[1, 2], 2]]);
  const one = FROM_HOME();
  one.stops = one.stops.slice(0, 2);
  one.total_miles = 4.3;
  assert.equal(routeView(one).summary, '≈ 4.3 mi · 1 stop');
});

test('from home: the first visit without a point — the leg from home goes to the first with one', () => {
  const r = FROM_HOME();
  Object.assign(r.stops[1], { lat: null, lng: null, has_map_point: false, leg_miles: null });
  r.stops[2].leg_miles = 3.8;
  const v = routeView(r, { visits: VISITS });
  assert.deepEqual(v.stops.slice(0, 3).map((s) => s.leg && s.leg.text), ['distance unknown', '≈ 3.8 mi', '≈ 9.4 mi']);
  assert.deepEqual(v.legs[0].key, '0-2');
  assert.equal(v.noPoint, 1);
  // no visit on the map at all: home stays at the top of the list, no map, no miles
  const none = FROM_HOME();
  none.stops = none.stops.map((s) => (s.kind === 'home' ? s : { ...s, lat: null, lng: null, has_map_point: false, leg_miles: null }));
  const nv = routeView(none, { visits: VISITS });
  assert.ok(nv.home);
  assert.deepEqual(nv.points, []);
  assert.deepEqual(nv.mapPoints, []);
  assert.deepEqual(nv.legs, []);
  assert.ok(nv.stops.every((s) => s.leg === null));
  assert.equal(nv.summary, '6 stops');
});

test('home not set (home_missing): the route starts at the first stop, as before; an older server the same', () => {
  const r = ROUTE();
  r.stops = r.stops.map((s) => ({ ...s, kind: 'visit' }));
  r.home_missing = true;
  const v = routeView(r, { visits: VISITS });
  const old = routeView(ROUTE(), { visits: VISITS });
  assert.equal(v.home, null);
  assert.equal(v.homeMissing, true);
  assert.equal(old.home, null);
  assert.equal(old.homeMissing, false, 'a server before #157 says nothing of home');
  for (const key of ['summary', 'stops', 'legs', 'points', 'hints']) assert.deepEqual(v[key], old[key], key);
  assert.deepEqual(v.mapPoints, v.points);
  // a home stop without a point is not drawn, and never as a visit
  const broken = FROM_HOME();
  broken.stops[0] = { ...HOME, lat: null, lng: NaN };
  const bv = routeView(broken, { visits: VISITS });
  assert.equal(bv.home, null);
  assert.deepEqual(bv.stops.map((s) => s.n), [1, 2, 3, 4, 5, 6]);
  assert.equal(bv.stops[0].leg, null);
});

test('a stop without a map point: its own line, no miles, not on the map', () => {
  const r = ROUTE();
  r.stops[4] = { ...r.stops[4], lat: null, lng: null, has_map_point: false, leg_miles: null };
  r.stops[5] = { ...r.stops[5], leg_miles: 11.9 };
  r.flags = [];
  r.stops_without_point = 1;
  const v = routeView(r, { visits: VISITS });
  assert.equal(v.stops[4].line, 'No map point yet');
  assert.equal(v.stops[4].tag, null);
  assert.equal(v.stops[4].leg.text, 'distance unknown');
  assert.equal(v.stops[5].leg.text, '≈ 11.9 mi', 'the next leg comes from the stop before it with a point');
  assert.deepEqual(v.legs.map((l) => l.key), ['1-2', '2-3', '3-4', '4-6']);
  assert.equal(v.points.length, 5);
  assert.equal(v.noPoint, 1);
  assert.equal(v.issue, false);
  // the whole day without points (production today): no map, the stops still listed
  const none = ROUTE();
  none.stops = none.stops.map((s) => ({ ...s, lat: null, lng: null, has_map_point: false, leg_miles: null }));
  none.flags = [];
  const nv = routeView(none, { visits: VISITS });
  assert.deepEqual([nv.points.length, nv.legs.length, nv.summary], [0, 0, '6 stops']);
  assert.deepEqual(nv.stops.map((s) => s.line), Array(6).fill('No map point yet'));
  assert.deepEqual(nv.stops.map((s) => s.leg), Array(6).fill(null), 'no «distance unknown» on a day without points');
  // one stop, none
  assert.equal(routeView({ ...ROUTE(), stops: ROUTE().stops.slice(2, 3), flags: [] }, { visits: VISITS }).summary, 'One stop');
  assert.equal(routeView({ date: '2026-11-10', stops: [], flags: [] }).summary, 'No stops');
});

test('It\'s OK and Tell the office mark a hint on this phone; a hint already driven asks nothing', () => {
  const r = ROUTE();
  assert.equal(hasIssue(r, {}), true);
  assert.equal(hasIssue(r, { '4-5': 'ok' }), false);
  assert.equal(routeView(r, { visits: VISITS, marks: { '4-5': 'sent' } }).hints[0].mark, 'sent');
  // the 3–4 hint is not shown (it shares visit 4), so marking 4–5 leaves no dot
  assert.equal(hasIssue(r, { '4-5': 'sent' }), false);
  const past = { ...r, flags: [{ ...r.flags[1], past: true }] };
  assert.equal(hasIssue(past, {}), false);
  assert.equal(routeView(past, { visits: VISITS }).hints[0].past, true);
  assert.equal(hasIssue(null), false);
});

test('Tell the office: the hint\'s words, the technician\'s own under them', () => {
  const flag = ROUTE().flags[1];
  assert.equal(routeNoteText(flag), 'Route: Visit 5 could go before 4: about 10 mi shorter');
  assert.equal(routeNoteText(flag, '  Chen asked for after 4 PM.  '), 'Route: Visit 5 could go before 4: about 10 mi shorter\nChen asked for after 4 PM.');
  assert.equal(routeNoteText(flag, '   '), 'Route: Visit 5 could go before 4: about 10 mi shorter');
});

test('Open in Maps: the stops ahead with a point, in order; Google takes at most 10', () => {
  const v = routeView(ROUTE(), { visits: VISITS });
  const links = routeLinks(v);
  assert.equal(links.count, 4, 'the two closed ones are behind');
  assert.equal(links.apple, 'maps://?daddr=40.7637,-73.771+to:40.7262,-73.8607+to:40.766,-73.77+to:40.77,-73.735&dirflg=d');
  assert.equal(links.google, `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('40.77,-73.735')}&waypoints=${encodeURIComponent('40.7637,-73.771|40.7262,-73.8607|40.766,-73.77')}&travelmode=driving`);
  assert.equal(links.cut, false);
  // one stop ahead: no waypoints
  const one = routeLinks({ stops: [{ hasPoint: true, state: 'sched', lat: 1, lng: 2 }] });
  assert.equal(one.google, `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('1,2')}&travelmode=driving`);
  // twelve ahead: Apple all of them, Google the next ten
  const many = routeLinks({ stops: Array.from({ length: 12 }, (_, i) => ({ hasPoint: true, state: 'sched', lat: i, lng: i })) });
  assert.equal(many.cut, true);
  assert.equal(many.apple.split('+to:').length, 12);
  assert.equal(decodeURIComponent(many.google).split('|').length, MAPS_STOPS_MAX - 1);
  // nothing ahead, or no points
  assert.equal(routeLinks({ stops: [{ hasPoint: true, state: 'closed', lat: 1, lng: 2 }, { hasPoint: false, state: 'sched' }] }), null);
  assert.equal(routeLinks(null), null);
});

test('the map\'s box: around the points with a margin, never closer than a few streets', () => {
  const r = regionOf([{ lat: 40.7, lng: -73.9 }, { lat: 40.8, lng: -73.7 }]);
  assert.deepEqual([r.latitude, r.longitude].map((x) => +x.toFixed(4)), [40.75, -73.8]);
  assert.deepEqual([+r.latitudeDelta.toFixed(3), +r.longitudeDelta.toFixed(3)], [0.16, 0.32]);
  assert.deepEqual(regionOf([{ lat: 40.7, lng: -73.9 }]), { latitude: 40.7, longitude: -73.9, latitudeDelta: 0.02, longitudeDelta: 0.02 });
  assert.equal(regionOf([]), null);
  assert.equal(milesText(12), '≈ 12 mi');
  assert.equal(milesText(null), '');
});

test('the line over a route kept from before: offline or a failure, with its time', () => {
  const now = { date: '2026-11-10', minutes: 11 * 60 + 20 };
  assert.equal(routeNoticeText('offline', Date.parse('2026-11-10T14:41:00Z'), now), 'Offline · stops and distances from 9:41 AM');
  assert.equal(routeNoticeText('failed', Date.parse('2026-11-09T14:41:00Z'), now), 'Could not update · stops and distances from Mon, Nov 9 9:41 AM');
  assert.equal(routeNoticeText('offline', null, now), 'Offline');
});

test('the map\'s markers: stops closer than 30 points at this zoom share one, each number shown', () => {
  const v = routeView(ROUTE(), { visits: VISITS });
  const size = { width: 390, height: 280 };
  // the whole day in view: Patel (3) and Chen (5) a few points apart in Bayside, Rossi (1) and
  // Kowalski (2) in Forest Hills too
  const day = regionOf(v.points);
  const groups = markerGroups(v.points, day, size);
  assert.deepEqual(groups.map((g) => g.stops.map((st) => st.n)), [[1, 2], [3, 5], [4], [6]]);
  assert.equal(groups[1].key, 's3-3+s5-5');
  assert.ok(Math.abs(groups[1].latitude - (40.7637 + 40.766) / 2) < 1e-9 && Math.abs(groups[1].longitude - (-73.771 - 73.77) / 2) < 1e-9, 'between the two');
  // zoomed in on Bayside: 3 and 5 apart
  const close = { latitude: 40.765, longitude: -73.7705, latitudeDelta: 0.004, longitudeDelta: 0.004 };
  assert.deepEqual(markerGroups(v.points, close, size).map((g) => g.stops.map((st) => st.n)), [[1], [2], [3], [4], [5], [6]]);
  // not laid out yet: each stop its own marker
  assert.equal(markerGroups(v.points, null, size).length, 6);
  assert.equal(markerGroups(v.points, day, { width: 0, height: 0 }).length, 6);
  assert.deepEqual(markerGroups([], day, size), []);
});

test('the native map: in a new build it is there, in an old one not, and a lookup that throws is a no', () => {
  const ui = (names) => ({ hasViewManagerConfig: (name) => names.includes(name) });
  assert.equal(hasNativeMap({ UIManager: ui(['AIRMap']), NativeModules: { AirMapModule: {} } }), true);
  // a build from before the map: neither the view nor the module
  assert.equal(hasNativeMap({ UIManager: ui([]), NativeModules: {} }), false);
  // the view's record decides, a module alone does not make a map
  assert.equal(hasNativeMap({ UIManager: ui([]), NativeModules: { AirMapModule: {} } }), false);
  // the phone cannot answer about the view: the module does
  const broken = { hasViewManagerConfig: () => { throw new Error('Global function is not registered'); } };
  assert.equal(hasNativeMap({ UIManager: broken, NativeModules: { AirMapModule: {} } }), true);
  assert.equal(hasNativeMap({ UIManager: broken, NativeModules: {} }), false);
  assert.equal(hasNativeMap({ UIManager: {}, NativeModules: { AirMapModule: {} } }), true);
  const throwing = { get AirMapModule() { throw new Error('no'); } };
  assert.equal(hasNativeMap({ UIManager: {}, NativeModules: throwing }), false);
  assert.equal(hasNativeMap(null), false);
  assert.equal(hasNativeMap({}), false);
});

test('the map library is loaded only by mapsModule.js, never at the app\'s start', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const { join } = await import('node:path');
  const root = new URL('../../', import.meta.url).pathname;
  // the app's code: not the tests (they never run in the app, and this one names the library)
  const code = /^(?!.*\.test\.)[^.].*\.(m?js|jsx|tsx?)$/;
  const files = (await readdir(root, { withFileTypes: true })).filter((e) => e.isFile() && code.test(e.name)).map((e) => e.name);
  assert.ok(files.includes('App.js'));
  const walk = async (dir) => {
    for (const entry of await readdir(join(root, dir), { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (code.test(entry.name)) files.push(path);
    }
  };
  await walk('src');
  await walk('config');
  // the library's name in quotes anywhere in the code, comments aside: import … from,
  // a bare import 'react-native-maps', import(), require(), export … from
  const named = /['"`]react-native-maps['"`]/;
  const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((line) => !/^\s*\/\//.test(line)).join('\n');
  for (const form of [`import 'react-native-maps';`, `import MapView from "react-native-maps";`, 'const M = require(`react-native-maps`);',
    `export { default } from 'react-native-maps';`, `const M = await import('react-native-maps');`]) {
    assert.match(withoutComments(form), named, form);
  }
  assert.doesNotMatch(withoutComments(`// import 'react-native-maps';\n/* require('react-native-maps') */`), named);
  const using = [];
  for (const file of files) {
    if (named.test(withoutComments(await readFile(join(root, file), 'utf8')))) using.push(file);
  }
  assert.deepEqual(using, ['src/myDay/mapsModule.js']);
  const loader = await readFile(join(root, 'src/myDay/mapsModule.js'), 'utf8');
  assert.doesNotMatch(loader, /^import .*react-native-maps/m);
  assert.match(loader, /hasNativeMap\(\{ UIManager, NativeModules \}\)[^\n]*return maps;\n\s*try \{\n\s*maps = require\('react-native-maps'\);/);
});
