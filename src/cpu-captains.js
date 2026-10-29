// Local sailors: 20 computer captains who sail Pune Paradise every day, 8 hours each, fishing at
// their favourite spots and selling at Paradise Station. Every captain's day is worked out from a
// fixed seed (captain, date) and the Pune clock alone, so every account, on every device, sees the
// same boat in the same place doing the same thing at the same moment, with no server involved.
// This module is the schedule (pure maths, no 3D); cpu-fleet.js draws the boats.
import { SEED } from './geo-seed.js';
import { project, clampToWorld } from './world.js';
import { STATION, BOAT_SPECS, FISH } from './station.js';

// ---------- the roster ----------
// sessions: [start, end] local times ("HH:MM"; an end past midnight is written as e.g. "27:00"), each with
// its stops: fish:<where> | sell | tour:<n> (sail through n waypoints) | lap:<n> (fast laps)
// where: near (1.5–3.5 km from home), shore (0.6–1.5 km), far (5–9 km), station (1–2.5 km from the station),
//        light (by the lighthouse / station at sunset), with:<captain> (beside that captain), rival (Vikram's spot yesterday), any
const R = (id, name, boat, colours, home, rank, style, sessions, fav, extra = {}) => ({ id, name, boat, colours, home, rank, style, sessions, fav, ...extra });
export const ROSTER = [
  R('arjun', 'Arjun Patil', 'tug', { hull: '#ffb21a' }, 'Kharadi', 'Captain', 'Methodical veteran: first boat out, same three spots, guards his best one.',
    [['05:30', '09:30', ['fish:near', 'sell']], ['15:00', '19:00', ['fish:near', 'sell']]], ['rohu', 'catla', 'mahseer'], { pal: 'omkar', rate: 4.5 }),
  R('priya', 'Priya Deshmukh', 'sail', { sail: '#ff7a5c' }, 'Viman Nagar', 'Skipper', 'Curious explorer who loves the breeze; long looping routes, fishes only when she sees birds.',
    [['12:00', '20:00', ['tour:3', 'fish:near', 'sell', 'tour:2', 'fish:light', 'sell']]], ['pomfret', 'mackerel'], { rate: 4 }),
  R('ravi', 'Ravi Kulkarni', 'yacht', { hull: '#1d2f6b', flag: '#ffc531' }, 'Koregaon Park', 'Skipper', 'Flashy and impatient: fast, short trips; likes coins more than fish in the hold.',
    [['08:00', '10:00', ['fish:near', 'sell']], ['12:00', '14:00', ['fish:near', 'sell']], ['17:00', '19:00', ['fish:near', 'sell']], ['21:00', '23:00', ['fish:near', 'sell']]], ['kingfish', 'barracuda'], { rate: 5, fast: true }),
  R('meera', 'Meera Joshi', 'dinghy', { sail: '#2cc4a8' }, 'Aundh', 'Bosun', 'Calm and patient; fishing is her meditation. Stays close to shore, anchors for long stretches.',
    [['06:00', '14:00', ['fish:shore', 'sell', 'fish:shore', 'sell', 'fish:shore', 'sell']]], ['rohu', 'tilapia'], { rate: 5.5 }),
  R('sameer', 'Sameer Shaikh', 'tug', { hull: '#e8a017', accent: '#c41e14' }, 'Yerawada', 'Captain', 'Night owl, lamp on; fishes where the day boats left. Says the Murrel bite best after dark.',
    [['19:00', '27:00', ['fish:near', 'sell', 'fish:far', 'sell']]], ['snakehead', 'catla'], { pal: 'zoya', rate: 4.5 }),
  R('ananya', 'Ananya Rao', 'sail', { sail: '#9fd3ff' }, 'Baner', 'Deckhand', 'Enthusiastic beginner: lots of small fish, keeps everything. Sails with her friend Isha.',
    [['10:00', '14:00', ['fish:near', 'sell', 'fish:near']], ['16:00', '20:00', ['fish:near', 'sell', 'tour:2']]], ['tilapia', 'mackerel', 'rohu'], { pal: 'isha', rate: 7 }),
  R('vikram', 'Vikram Singh', 'yacht', { hull: '#f6f3ee', flag: '#ee3427' }, 'Magarpatta City', 'Captain', 'Serious trophy hunter: sails far, waits long, ignores small fish. Kabir’s rival.',
    [['04:00', '08:00', ['fish:far', 'sell']], ['18:00', '22:00', ['fish:far', 'sell']]], ['barracuda', 'tuna', 'mahseer'], { rival: 'kabir', rate: 1.2 }),
  R('fatima', 'Fatima Khan', 'dinghy', { sail: '#ffc531' }, 'Hadapsar', 'Bosun', 'Friendly and sociable; joins other boats at their spots. Often the one sharing yours.',
    [['09:00', '13:00', ['fish:with:meera', 'sell', 'fish:near']], ['15:00', '19:00', ['fish:with:arjun', 'sell', 'fish:near', 'sell']]], ['catla', 'rohu'], { rate: 5.5 }),
  R('rohan', 'Rohan More', 'tug', { hull: '#ffb21a', accent: '#2e9e5b' }, 'Khadki', 'Skipper', 'The harbour regular: short runs, always at Paradise Station. Everyone knows him.',
    [['07:00', '15:00', ['fish:station', 'sell', 'fish:station', 'sell', 'fish:station', 'sell', 'fish:station', 'sell']]], ['hilsa', 'rohu'], { rate: 5 }),
  R('sneha', 'Sneha Pawar', 'sail', { sail: '#8a5bd6' }, 'Kothrud', 'Skipper', 'Works during the week, lives for weekends: short sessions on weekdays, all day on Saturday and Sunday.',
    [['06:00', '10:00', ['fish:near', 'sell']], ['18:00', '22:00', ['tour:1', 'fish:near', 'sell']]], ['mackerel', 'pomfret'],
    { weekend: [['08:00', '16:00', ['fish:far', 'sell', 'fish:far', 'sell']]], rate: 4 }),
  R('kabir', 'Kabir Mehta', 'yacht', { hull: '#1b1d22', flag: '#c9ced6' }, 'Kalyani Nagar', 'Skipper', 'Confident and bold: chases Vikram’s trophy spots and wants his name above Vikram’s. Never gives way.',
    [['05:00', '09:00', ['fish:rival', 'sell', 'tour:1']], ['19:00', '23:00', ['fish:far', 'sell']]], ['barracuda', 'tuna'], { rival: 'vikram', rate: 1.4, fast: true }),
  R('isha', 'Isha Bhosale', 'dinghy', { sail: '#ff8fb8' }, 'Wakad', 'Deckhand', 'Shy and new; sails beside her friend Ananya and copies what she does.',
    [['10:00', '14:00', ['fish:with:ananya', 'sell', 'fish:with:ananya', 'sell']], ['16:00', '20:00', ['fish:with:ananya', 'sell', 'fish:with:ananya', 'sell']]], ['tilapia', 'mackerel'], { pal: 'ananya', rate: 5 }),
  R('dev', 'Dev Gaikwad', 'tug', { hull: '#ff7414' }, 'Hinjewadi', 'Bosun', 'Busy office worker: quick, efficient trips between meetings; longer on Friday nights.',
    [['07:00', '09:00', ['fish:near', 'sell']], ['13:00', '14:00', ['fish:shore']], ['18:00', '23:00', ['fish:near', 'sell', 'fish:near', 'sell']]], ['rohu', 'catla'], { rate: 4.5 }),
  R('nisha', 'Nisha Iyer', 'sail', { sail: '#7cc8ff' }, 'Shivajinagar', 'Captain', 'The collector: obsessed with new species, sails to far, unusual spots and keeps any new find.',
    [['08:00', '16:00', ['fish:far', 'fish:any', 'sell', 'fish:any', 'sell']]], ['pomfret', 'kingfish', 'hilsa', 'mahseer', 'barracuda'], { rate: 3.5 }),
  R('aditya', 'Aditya Jadhav', 'dinghy', { sail: '#e8392f' }, 'Pimple Saudagar', 'Bosun', 'Speed freak: races buoys and landmarks; fishes only to pay for fuel.',
    [['06:00', '08:00', ['lap:4', 'fish:near', 'sell']], ['11:00', '13:00', ['lap:4', 'fish:near', 'sell']], ['16:00', '18:00', ['lap:4', 'fish:near', 'sell']], ['20:00', '22:00', ['lap:4', 'fish:near', 'sell']]], ['mackerel', 'tilapia'], { rate: 7, fast: true }),
  R('zoya', 'Zoya Sayed', 'tug', { hull: '#f2efe8', accent: '#1d2f6b' }, 'Bopodi', 'Captain', 'Calm night sailor, Sameer’s partner on the dark water; the last lamp home.',
    [['20:00', '28:00', ['fish:with:sameer', 'sell', 'fish:near', 'sell']]], ['snakehead', 'catla'], { pal: 'sameer', rate: 4.5 }),
  R('harsh', 'Harsh Chavan', 'yacht', { hull: '#2e7d4f', flag: '#ffc531' }, 'Model Colony', 'Captain', 'Generous and businesslike: fills his big hold before selling; his hauls light up the harbour.',
    [['06:00', '10:00', ['fish:near', 'sell']], ['14:00', '18:00', ['fish:near', 'sell']]], ['rohu', 'catla', 'hilsa'], { rate: 11 }),
  R('kavya', 'Kavya Nair', 'sail', { sail: '#ffc531' }, 'Keshav Nagar', 'Skipper', 'Unhurried photographer: drifts past landmarks, lingers at the lighthouse at sunset, fishes a little.',
    [['15:00', '23:00', ['tour:3', 'fish:near', 'sell', 'fish:light', 'sell']]], ['pomfret', 'hilsa'], { rate: 4, slow: true }),
  R('omkar', 'Omkar Shinde', 'tug', { hull: '#2f6fd6' }, 'Mundhwa', 'Skipper', 'Easygoing and chatty: Arjun’s fishing buddy at dawn, lazy afternoons alone.',
    [['05:30', '09:30', ['fish:with:arjun', 'sell']], ['16:00', '20:00', ['fish:near', 'sell']]], ['rohu', 'catla'], { pal: 'arjun', rate: 4.5 }),
  R('riya', 'Riya Kapoor', 'dinghy', { sail: '#ffffff' }, 'Bavdhan', 'Bosun', 'Free spirit with no routine: different hours, routes and spots every day.',
    null, ['mackerel', 'tilapia', 'rohu', 'pomfret'], { random: true, rate: 5 }),
];
export const captain = id => ROSTER.find(c => c.id === id);

// ---------- seeded randomness ----------
const hash = s => { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; };
const rng = seed => { let a = hash(seed); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// ---------- the Pune clock ----------
const TZ = 'Asia/Kolkata';
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short' });
/** The Pune date ("2026-10-29"), weekday and minutes since midnight for a moment (ms). */
export function puneNow(ms = Date.now()) {
  const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, min: +p.hour * 60 + +p.minute + +p.second / 60 };
}
const dayBefore = day => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const weekdayOf = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// ---------- places ----------
const HOME = Object.fromEntries(SEED.map(([n, lat, lng]) => [n, project(lat, lng)]));
HOME['Model Colony'] = project(18.5285, 73.8362); // (not in the starter list)
const homeOf = c => HOME[c.home] || [0, 0];
const APPROACH = [STATION.x + 70, STATION.z + 80]; // the station's open-water side (as "Show me" uses)
const KM = 1000, clampP = (x, z) => clampToWorld(x, z, 400);
const around = ([x, z], r, a) => clampP(x + Math.cos(a) * r, z + Math.sin(a) * r);
const fishPrice = Object.fromEntries(FISH.map(f => [f.id, f.price])), fishName = Object.fromEntries(FISH.map(f => [f.id, f.name]));
const KN = 0.5144; // m/s per knot

// ---------- a captain's day ----------
const cache = new Map();
/** The day's timeline: segments { kind: 'sail' | 'fish' | 'sell', t0, t1 (minutes from that day's midnight), a, b (points) }
 *  plus events { t, kind: 'catch' | 'sell', fish, n, coins }. */
export function dayPlan(c, day) {
  const key = c.id + '|' + day; if (cache.has(key)) return cache.get(key);
  const r = rng(key), home = homeOf(c), wk = weekdayOf(day), weekend = wk === 'Sat' || wk === 'Sun';
  let sessions = c.random ? randomSessions(r) : (weekend && c.weekend) || c.sessions;
  if (c.id === 'dev' && wk === 'Fri') sessions = sessions.map((s, i) => i === 2 ? ['18:00', '23:00', ['fish:far', 'sell', 'fish:near', 'sell']] : s);
  const kn = BOAT_SPECS[c.boat]?.kn || 10, cruise = kn * KN * (c.fast ? 0.95 : c.slow ? 0.55 : 0.75); // m/s
  const segs = [], events = [];
  sessions.forEach(([s0, s1, stops], si) => {
    const jit = Math.round((r() - 0.5) * 40); let t0 = hm(s0) + jit; const t1 = hm(s1) + jit;
    // the points the session visits
    const pts = []; let at = home;
    stops.forEach((st, k) => { const [kind, where, who] = st.split(':');
      if (kind === 'sell') pts.push({ kind: 'sell', p: around(APPROACH, 30 + (hash(c.id) % 60), (hash(c.id) % 628) / 100) });
      else if (kind === 'tour' || kind === 'lap') { const n = +where || 2; for (let i = 0; i < n; i++) pts.push({ kind: 'via', p: around(kind === 'lap' ? home : at, (kind === 'lap' ? 0.9 : 2.5) * KM * (0.6 + r() * 0.8), r() * 6.283), fast: kind === 'lap' }); }
      else pts.push({ kind: 'fish', p: spot(c, where, who, day, si, k, at, r) });
      at = pts[pts.length - 1].p; });
    pts.push({ kind: 'home', p: home });
    // time: sailing legs at cruise speed (faster if the session is too short), selling 12 min, the rest fishing
    let prev = home; const legs = pts.map(q => { const d = Math.hypot(q.p[0] - prev[0], q.p[1] - prev[1]), out = { ...q, from: prev, d }; prev = q.p; return out; });
    const span = t1 - t0, sellN = legs.filter(l => l.kind === 'sell').length, fishN = legs.filter(l => l.kind === 'fish').length;
    let travel = legs.reduce((a, l) => a + l.d / (cruise * (l.fast ? 1.3 : 1)) / 60, 0); const fixed = sellN * 12;
    const speedUp = travel + fixed > span * 0.8 ? (travel + fixed) / (span * 0.8) : 1; travel /= speedUp;
    const fishT = Math.max(10, span - travel - fixed), weights = legs.filter(l => l.kind === 'fish').map(() => 0.7 + r() * 0.6), wsum = weights.reduce((a, b) => a + b, 0) || 1;
    let fi = 0, hold = 0;
    legs.forEach(l => { const dt = l.d / (cruise * (l.fast ? 1.3 : 1) * speedUp) / 60;
      segs.push({ kind: 'sail', t0, t1: t0 + dt, a: l.from, b: l.p, s: si }); t0 += dt;
      if (l.kind === 'fish') { const f = fishN ? fishT * weights[fi++] / wsum : 0; segs.push({ kind: 'fish', t0, t1: t0 + f, a: l.p, b: l.p, s: si });
        const n = Math.max(1, Math.round(f / 60 * c.rate * (0.7 + r() * 0.6))); // catches, spread over the stay
        for (let i = 0; i < n; i++) { const fish = pickFish(c, r); events.push({ t: t0 + f * (i + 0.5 + (r() - 0.5) * 0.8) / n, kind: 'catch', fish, kg: kgOf(fish, r), p: l.p }); hold++; }
        t0 += f; }
      else if (l.kind === 'sell') { segs.push({ kind: 'sell', t0, t1: t0 + 12, a: l.p, b: l.p, s: si });
        const sold = events.filter(e => e.kind === 'catch' && !e.sold); sold.forEach(e => { e.sold = true; });
        if (sold.length) events.push({ t: t0 + 6, kind: 'sell', n: sold.length, coins: sold.reduce((a, e) => a + (fishPrice[e.fish] || 10), 0) });
        hold = 0; t0 += 12; } });
  });
  const plan = { segs, events: events.sort((a, b) => a.t - b.t) };
  cache.set(key, plan); if (cache.size > 400) cache.delete(cache.keys().next().value);
  return plan;
}
// Riya: 2–4 sessions a day, 8 hours in all, at random times
function randomSessions(r) {
  const n = 2 + Math.floor(r() * 3), lens = Array.from({ length: n }, () => 0.6 + r()), sum = lens.reduce((a, b) => a + b, 0), out = [];
  let t = 4 * 60 + r() * 120;
  lens.forEach(l => { const len = 480 * l / sum, gap = 30 + r() * 150; const s = t, e = t + len; t = e + gap;
    const f = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.floor(m % 60)).padStart(2, '0')}`;
    out.push([f(s), f(e), r() < 0.5 ? ['fish:any', 'sell'] : ['tour:1', 'fish:near', 'sell']]); });
  return out;
}
function spot(c, where, who, day, si, k, at, r) {
  const home = homeOf(c), a = r() * 6.283;
  if (where === 'with' && who) { const pal = captain(who), pp = pal && dayPlan(pal, day).segs.filter(s => s.kind === 'fish'); // beside a friend at one of their spots
    if (pp && pp.length) { const pick = pp[Math.min(pp.length - 1, si)].a; return around(pick, 35 + r() * 30, a); } }
  if (where === 'rival') { const riv = captain(c.rival), pp = riv && dayPlan(riv, dayBefore(day)).segs.filter(s => s.kind === 'fish'); if (pp && pp.length) return around(pp[0].a, 60 + r() * 80, a); }
  if (where === 'shore') return around(home, (0.6 + r() * 0.9) * KM, a);
  if (where === 'far') return around(home, (5 + r() * 4) * KM, a);
  if (where === 'station') return around([STATION.x, STATION.z], (1 + r() * 1.5) * KM, a);
  if (where === 'light') return around([STATION.x, STATION.z], (0.6 + r() * 0.4) * KM, a);
  if (where === 'any') return around(at, (1 + r() * 7) * KM, a);
  return around(home, (1.5 + r() * 2) * KM, a); // near
}
const LOCAL = ['rohu', 'catla', 'mrigal', 'tilapia', 'hilsa', 'pomfret', 'mackerel', 'sardine', 'kingfish', 'snakehead'].filter(id => fishPrice[id]);
const pickFish = (c, r) => { const pool = r() < 0.75 ? c.fav.filter(id => fishPrice[id]) : LOCAL; return pool[Math.floor(r() * pool.length)] || 'rohu'; };
const kgOf = (id, r) => { const f = FISH.find(q => q.id === id); return f ? Math.round(f.kg * (0.75 + r() * 0.6) * 100) / 100 : 1; };

/** Where a captain is now: null when not sailing, else { x, z, yaw, kind ('sail' | 'fish' | 'sell'), speed, seg } */
export function stateAt(c, ms = Date.now()) {
  const now = puneNow(ms);
  for (const [day, off] of [[now.day, 0], [dayBefore(now.day), 1440]]) { // (a night session can run past midnight)
    const t = now.min + off, seg = dayPlan(c, day).segs.find(s => t >= s.t0 && t < s.t1);
    if (!seg) continue;
    const u = seg.t1 > seg.t0 ? (t - seg.t0) / (seg.t1 - seg.t0) : 0, dx = seg.b[0] - seg.a[0], dz = seg.b[1] - seg.a[1];
    const x = seg.a[0] + dx * u, z = seg.a[1] + dz * u, moving = seg.kind === 'sail' && Math.hypot(dx, dz) > 1;
    const speed = moving ? Math.hypot(dx, dz) / ((seg.t1 - seg.t0) * 60) : 0;
    return { x, z, yaw: moving ? Math.atan2(-dz, dx) : null, kind: seg.kind, speed, seg, next: nextStop(c, day, seg) };
  }
  return null;
}
const nextStop = (c, day, seg) => { const segs = dayPlan(c, day).segs, i = segs.indexOf(seg); return segs.slice(i + 1).find(s => s.kind !== 'sail' && s.s === seg.s)?.kind || 'home'; };

/** Today so far (Pune time): catches, coins from sales, and the best fish. */
export function today(c, ms = Date.now()) {
  const now = puneNow(ms), ev = dayPlan(c, now.day).events.filter(e => e.t <= now.min);
  const catches = ev.filter(e => e.kind === 'catch'), best = catches.slice().sort((a, b) => (fishPrice[b.fish] * b.kg) - (fishPrice[a.fish] * a.kg))[0];
  return { catches: catches.length, coins: ev.filter(e => e.kind === 'sell').reduce((a, e) => a + e.coins, 0), sales: ev.filter(e => e.kind === 'sell').length,
    best: best ? { name: fishName[best.fish], kg: best.kg } : null, recent: catches.slice(-3).reverse().map(e => fishName[e.fish]) };
}
/** "05:30–09:30 · 15:00–19:00" (their usual hours). */
export const hoursOf = c => c.random ? 'Different hours every day' : (c.sessions.map(([a, b]) => `${a}–${hm(b) >= 1440 ? String(Math.floor(hm(b) / 60) - 24).padStart(2, '0') + b.slice(2) : b}`).join(' · ') + (c.weekend ? ' (weekends 08:00–16:00)' : ''));
/** Catch events in the last `since` minutes, for boats that are near (a leap and a splash). */
export function recentEvents(c, ms, sinceMs) {
  const now = puneNow(ms), from = puneNow(sinceMs);
  if (now.day !== from.day) return [];
  return dayPlan(c, now.day).events.filter(e => e.t > from.min && e.t <= now.min);
}

// ---------- the harbour board (harbour-board.js) ----------
const PLACES = Object.entries(HOME);
/** The nearest neighbourhood to a point ("near Kharadi"). */
export const placeNear = (x, z) => { let best = null, bd = Infinity; PLACES.forEach(([n, [px, pz]]) => { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = n; } }); return best; };
export const fishNameOf = id => fishName[id] || id;
/** A Pune day's happenings for one captain, in minutes of that day: setting out, catches, sales, heading home
 *  (a night session's small hours come from the day before). */
export function dayLog(c, day) {
  const one = (d, off) => { const { segs, events } = dayPlan(c, d), out = [];
    const bySession = new Map(); segs.forEach(s => { const b = bySession.get(s.s) || []; b.push(s); bySession.set(s.s, b); });
    bySession.forEach(b => { out.push({ t: b[0].t0 - off, kind: 'out', p: b[0].a }); out.push({ t: b[b.length - 1].t1 - off, kind: 'home', p: b[b.length - 1].b }); });
    events.forEach(e => out.push({ ...e, t: e.t - off, p: e.p || APPROACH }));
    return out; };
  return [...one(dayBefore(day), 1440), ...one(day, 0)].filter(e => e.t >= 0 && e.t < 1440).sort((a, b) => a.t - b.t);
}
/** Everything that has happened at the harbour today (Pune time), newest first: { ms, c, kind, ... }. */
export function harbourFeed(ms = Date.now(), limit = 60) {
  const now = puneNow(ms), out = [];
  ROSTER.forEach(c => dayLog(c, now.day).forEach(e => { if (e.t <= now.min) out.push({ ...e, c, ms: ms - (now.min - e.t) * 60000 }); }));
  return out.sort((a, b) => b.ms - a.ms).slice(0, limit);
}
/** Records over the last `days` Pune days (today so far included): biggest fish (one per captain), most fish, most coins. */
export function harbourRecords(ms = Date.now(), days = 7) {
  const now = puneNow(ms), tally = new Map(), big = [];
  let day = now.day;
  for (let i = 0; i < days; i++, day = dayBefore(day)) ROSTER.forEach(c => { const t = tally.get(c) || { c, n: 0, coins: 0 }; tally.set(c, t);
    dayLog(c, day).forEach(e => { if (i === 0 && e.t > now.min) return;
      if (e.kind === 'catch') { t.n++; big.push({ c, fish: e.fish, kg: e.kg, day }); } else if (e.kind === 'sell') t.coins += e.coins; }); });
  const all = [...tally.values()];
  return { biggest: big.sort((a, b) => b.kg - a.kg).filter((r, i, a) => a.findIndex(q => q.c === r.c) === i).slice(0, 3), most: all.sort((a, b) => b.n - a.n).slice(0, 3), richest: all.slice().sort((a, b) => b.coins - a.coins).slice(0, 3) };
}
