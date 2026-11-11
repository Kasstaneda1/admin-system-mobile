// The route of a day (TECH_APP_MY_DAY_SPEC.md §9, APP-2b; design A3: final-route*.png), without
// React Native (route.test.mjs). The server counts it all (GET /api/my/route?date, backend
// routes/scheduler/route.js): the stops in planned order with their points, the miles of each
// leg and of the day, and hints (flags) where two neighbouring stops in the other order would
// save a detour, with their words. The app only draws that: no number and no phrase of the
// route is counted here again.
//
// Server: { date, today, stops: [{ n, kind, visit_id, client_name, status, lat, lng, has_map_point,
//   planned_start, window: { start, end }, leg_miles }], total_miles, stops_without_point,
//   home_missing, flags: [{ between: [n, n + 1], visit_ids, saves_miles, past, text }] }
// The day starts at the technician's home (backend #157): stop 0 { kind: 'home', lat, lng },
// no customer and no address; the first visit's leg_miles is the leg from home, and the total
// has it. home_missing: no point of home (the office has not set the address): the route
// starts at the first stop, as before. A server before #157 has neither kind nor
// home_missing: every stop is a visit. Visits are numbered from 1 either way, and so are the
// hints (between [1, 2] may come now: home → 2 → 1 can be shorter).
// The list rows take the rest (city, role, the tag) from the day's own visits by id.
import { areaOf, clock, clockAmPm, dayLabel, momentWall, parseWall, shortName, stateOf, tagOf, windowText } from './model.js';

// '≈ 1.2 mi' as the server counted it (tenths)
export const milesText = (miles) => (Number.isFinite(miles) ? `≈ ${miles} mi` : '');

// A flag's key: its two visits
export const flagKey = (flag) => (Array.isArray(flag.visit_ids) ? flag.visit_ids.join('-') : (flag.between || []).join('-'));

// The hints shown: the biggest saving first, and no two that share a visit (swapping 2 and 3
// and also 3 and 4 cannot both be right; the bigger one wins). Ties by place in the day.
export function pickFlags(flags) {
  const all = (Array.isArray(flags) ? flags : [])
    .filter((f) => f && Array.isArray(f.between) && Array.isArray(f.visit_ids) && typeof f.text === 'string')
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (b.f.saves_miles || 0) - (a.f.saves_miles || 0) || a.f.between[0] - b.f.between[0] || a.i - b.i);
  const used = new Set();
  const picked = [];
  for (const { f } of all) {
    if (f.visit_ids.some((id) => used.has(id))) continue;
    f.visit_ids.forEach((id) => used.add(id));
    picked.push(f);
  }
  return picked;
}

// The words of the note to the office (Tell the office): the hint as the server wrote it, and
// the technician's own words under it when they add some. The note goes to the second visit.
export function routeNoteText(flag, own = '') {
  const extra = typeof own === 'string' ? own.trim() : '';
  return extra ? `Route: ${flag.text}\n${extra}` : `Route: ${flag.text}`;
}

// The colour family of a stop's number, as in the day's list: closed, now, helper, planned
function stopState(stop, visit) {
  const state = visit ? stateOf(visit) : stop.status === 'completed' ? 'closed' : 'sched';
  if (state === 'closed') return 'closed';
  if (state === 'onway' || state === 'onsite') return 'current';
  if (visit && visit.role === 'helper') return 'helper';
  return 'sched';
}

// Everything the Route screen draws. route: the server's answer; visits: the day's visits
// (GET /api/my/visits) to take the city, the role and the tag from; marks: { [flagKey]: 'ok' |
// 'sent' } of this phone (It's OK, Tell the office).
export function routeView(route, { visits = [], marks = {} } = {}) {
  const byId = new Map((visits || []).filter(Boolean).map((v) => [v.id, v]));
  const flags = pickFlags(route && route.flags);
  const flagged = new Set();
  for (const f of flags) f.between.forEach((n) => flagged.add(n));
  const all = Array.isArray(route && route.stops) ? route.stops.filter(Boolean) : [];
  // home: the start of the legs and a mark of its own on the map, never a visit
  const homeStop = all.find((s) => s.kind === 'home') || null;
  const home = homeStop && Number.isFinite(homeStop.lat) && Number.isFinite(homeStop.lng)
    ? { key: 'home', home: true, n: 0, state: 'home', lat: homeStop.lat, lng: homeStop.lng }
    : null;
  const list = all.filter((s) => s.kind !== 'home');

  const stops = list.map((s) => {
    const visit = byId.get(s.visit_id) || null;
    const start = parseWall(s.planned_start) || parseWall(s.window && s.window.start);
    const point = !!s.has_map_point && Number.isFinite(s.lat) && Number.isFinite(s.lng);
    return {
      key: `s${s.n}-${s.visit_id}`,
      n: s.n,
      visitId: s.visit_id,
      time: start ? clock(start.minutes) : '',
      client: shortName(s.client_name || (visit && visit.client_name)),
      line: point ? [visit ? areaOf(visit) : '', `window ${windowText(parseWall(s.window && s.window.start), parseWall(s.window && s.window.end))}`].filter(Boolean).join(' · ') : 'No map point yet',
      state: stopState(s, visit),
      flagged: flagged.has(s.n),
      hasPoint: point,
      lat: point ? s.lat : null,
      lng: point ? s.lng : null,
      leg: null,             // the line above this stop in the list, set below
      tag: point && visit ? tagOf(visit) : null,
    };
  });

  // Legs: from home (when the server gave it) and from each stop with a point to the next one
  // with a point, as the server counted them (leg_miles); bad when they run through a hint's
  // two stops (home is stop 0: home → 1 is in a hint between 1 and 2), done when driven:
  // the stop it goes to is closed, and so is the one it starts at (home always is)
  const legs = [];
  let prev = home;
  stops.forEach((s, i) => {
    const server = list[i];
    if (i > 0 || home) s.leg = s.hasPoint && Number.isFinite(server.leg_miles) ? { text: milesText(server.leg_miles), bad: false } : { text: 'distance unknown', bad: false };
    if (!s.hasPoint) return;
    if (prev) {
      const bad = flags.some((f) => {
        const [a, b] = f.between;
        return (s.n >= a && s.n <= b + 1) && (prev.n >= a - 1 && prev.n <= b);
      });
      legs.push({ key: `${prev.n}-${s.n}`, from: { latitude: prev.lat, longitude: prev.lng }, to: { latitude: s.lat, longitude: s.lng }, bad, done: s.state === 'closed' && (prev.home || prev.state === 'closed') });
      if (s.leg) s.leg.bad = bad;
    }
    prev = s;
  });

  const points = stops.filter((s) => s.hasPoint);
  // a day without a single point has no miles to tell: no «distance unknown» between each
  if (!points.length) stops.forEach((s) => { s.leg = null; });
  const n = stops.length;
  let summary;
  if (!n) summary = 'No stops';
  else if (!legs.length || !points.length) summary = n === 1 ? 'One stop' : `${n} stops`;
  else summary = `${milesText(route.total_miles)} · ${n} stop${n === 1 ? '' : 's'}`;

  const hints = flags.map((f) => ({
    key: flagKey(f),
    between: f.between,
    text: f.text,
    past: !!f.past,
    noteVisitId: f.visit_ids[1],
    mark: marks[flagKey(f)] || null,
  }));
  return {
    date: route && route.date,
    title: route && route.date ? `Route · ${dayLabel(route.date)}` : 'Route',
    summary,
    stops,
    legs,
    points,
    // home at the top of the list and on the map (null: no point of home, or the server is
    // older); the map's marks and its box: home and the stops with a point
    home,
    homeMissing: !!(route && route.home_missing === true),
    mapPoints: home && points.length ? [home, ...points] : points,
    hints,
    noPoint: stops.filter((s) => !s.hasPoint).length,
    issue: hasIssue(route, marks),
  };
}

// The amber dot on the Route button: a hint shown that is still to act on (not over and not
// answered on this phone with It's OK or Tell the office)
export function hasIssue(route, marks = {}) {
  return pickFlags(route && route.flags).some((f) => !f.past && !marks[flagKey(f)]);
}

// Open in Maps: the stops still ahead (not closed) with a point, in order, the phone's own
// place as the start. Apple Maps takes them all (daddr … +to: …); Google Maps a destination
// and up to 9 stops on the way, so at most the next 10. null when there is nothing ahead.
export const MAPS_STOPS_MAX = 10;
export function routeLinks(view) {
  const ahead = (view && view.stops ? view.stops : []).filter((s) => s.hasPoint && s.state !== 'closed');
  if (!ahead.length) return null;
  const at = (s) => `${s.lat},${s.lng}`;
  const google = ahead.slice(0, MAPS_STOPS_MAX);
  const last = google[google.length - 1];
  const waypoints = google.slice(0, -1).map(at).join('|');
  return {
    count: ahead.length,
    cut: ahead.length > MAPS_STOPS_MAX,
    apple: `maps://?daddr=${ahead.map(at).join('+to:')}&dirflg=d`,
    google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(at(last))}${waypoints ? `&waypoints=${encodeURIComponent(waypoints)}` : ''}&travelmode=driving`,
  };
}

// The map's box around the points: { latitude, longitude, latitudeDelta, longitudeDelta } with
// a margin, so a single stop is not zoomed to the street; null without points
export function regionOf(points, { margin = 1.6, min = 0.02 } = {}) {
  if (!points || !points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [la0, la1, lo0, lo1] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  return {
    latitude: (la0 + la1) / 2,
    longitude: (lo0 + lo1) / 2,
    latitudeDelta: Math.max((la1 - la0) * margin, min),
    longitudeDelta: Math.max((lo1 - lo0) * margin, min),
  };
}

// The line over a route the server did not answer for: 'Offline · stops and distances from
// 9:41 AM' (design final-route-offline); failed: the server answered with a failure
export function routeNoticeText(kind, savedAt, now) {
  const at = momentWall(savedAt);
  const when = at ? (at.date === now.date ? clockAmPm(at.minutes) : `${dayLabel(at.date)} ${clockAmPm(at.minutes)}`) : null;
  const head = kind === 'offline' ? 'Offline' : 'Could not update';
  return when ? `${head} · stops and distances from ${when}` : head;
}

// Stops whose numbers would overlap on the map — closer than minGap points on the screen at
// the map's zoom — share one marker that shows each number side by side, so every number
// reads (design: labels never hide one another). Zoomed in far enough, they part again.
// points: routeView().points; region: the map's { latitude, longitude, latitudeDelta,
// longitudeDelta }; size: the map's { width, height } in points. Without region or size every
// stop is its own marker. → [{ key, latitude, longitude, stops }]
export const MARKER_GAP = 30;
export function markerGroups(points, region, size, minGap = MARKER_GAP) {
  if (!points || !points.length) return [];
  const ok = !!(region && size && size.width > 0 && size.height > 0 && region.latitudeDelta > 0 && region.longitudeDelta > 0);
  const at = (p) => ({
    x: ((p.lng - region.longitude) / region.longitudeDelta) * size.width,
    y: ((region.latitude - p.lat) / region.latitudeDelta) * size.height,
  });
  const groups = [];
  for (const p of points) {
    const xy = ok ? at(p) : null;
    const near = xy && groups.find((g) => g.xy.some((q) => Math.hypot(q.x - xy.x, q.y - xy.y) < minGap));
    if (near) {
      near.stops.push(p);
      near.xy.push(xy);
    } else {
      groups.push({ stops: [p], xy: xy ? [xy] : [] });
    }
  }
  return groups.map((g) => ({
    key: g.stops.map((st) => st.key).join('+'),
    latitude: g.stops.reduce((sum, st) => sum + st.lat, 0) / g.stops.length,
    longitude: g.stops.reduce((sum, st) => sum + st.lng, 0) / g.stops.length,
    stops: g.stops,
  }));
}

// Is the native map (react-native-maps: its view AIRMap) in this build of the app? An app built
// before the map came has the new screens but no native map, and loading the library there
// breaks the app, so mapsModule.js asks this first. rn: react-native's { UIManager,
// NativeModules }. The view's own record decides; where the phone cannot answer that, the
// map's module (AirMapModule) does. A lookup that throws counts as no.
export function hasNativeMap(rn) {
  const ui = rn && rn.UIManager;
  try {
    if (ui && typeof ui.hasViewManagerConfig === 'function') return !!ui.hasViewManagerConfig('AIRMap');
  } catch {
    // the phone cannot tell about the view: ask about the module
  }
  try {
    return !!(rn && rn.NativeModules && rn.NativeModules.AirMapModule);
  } catch {
    return false;
  }
}
