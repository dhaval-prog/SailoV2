// Local sailors: 20 computer captains who sail Pune Paradise every day, 8 hours each, fishing at
// their favourite spots and selling at Paradise Station. Every captain's day is worked out from a
// fixed seed (captain, date) and the Pune clock alone, so every account, on every device, sees the
// same boat in the same place doing the same thing at the same moment, with no server involved.
// This module is the schedule (pure maths, no 3D); cpu-fleet.js draws the boats.
import { SEED } from './geo-seed.js';
import { project, clampToWorld } from './world.js';
import { STATION, BOAT_SPECS, FISH, PORT, FUEL_PRICE, burnFor } from './station.js';

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
    [['08:00', '10:00', ['fish:near', 'sell']], ['12:00', '14:00', ['fish:near', 'sell']], ['17:00', '19:00', ['fish:near', 'sell']], ['21:00', '23:00', ['fish:near', 'sell']]], ['kingfish', 'barracuda', 'tuna', 'mahi'], { rate: 5.5, fast: true }),
  R('meera', 'Meera Joshi', 'dinghy', { sail: '#2cc4a8' }, 'Aundh', 'Bosun', 'Calm and patient; fishing is her meditation. Stays close to shore, anchors for long stretches.',
    [['06:00', '14:00', ['fish:shore', 'sell', 'fish:shore', 'sell', 'fish:shore', 'sell']]], ['rohu', 'tilapia'], { rate: 5.5 }),
  R('sameer', 'Sameer Shaikh', 'tug', { hull: '#e8a017', accent: '#c41e14' }, 'Yerawada', 'Captain', 'Night owl, lamp on; fishes where the day boats left. Says the Murrel bite best after dark.',
    [['19:00', '27:00', ['fish:near', 'sell', 'fish:far', 'sell']]], ['snakehead', 'catla'], { pal: 'zoya', rate: 4.5 }),
  R('ananya', 'Ananya Rao', 'sail', { sail: '#9fd3ff' }, 'Baner', 'Deckhand', 'Enthusiastic beginner: lots of small fish, keeps everything. Sails with her friend Isha.',
    [['10:00', '14:00', ['fish:near', 'sell', 'fish:near']], ['16:00', '20:00', ['fish:near', 'sell', 'tour:2']]], ['tilapia', 'mackerel', 'rohu'], { pal: 'isha', rate: 7 }),
  R('vikram', 'Vikram Singh', 'yacht', { hull: '#f6f3ee', flag: '#ee3427' }, 'Magarpatta City', 'Captain', 'Serious trophy hunter: sails far, waits long, ignores small fish. Kabir’s rival.',
    [['04:00', '08:00', ['fish:far', 'sell']], ['18:00', '22:00', ['fish:far', 'sell']]], ['barracuda', 'tuna', 'mahseer', 'swordfish', 'sailfish'], { rival: 'kabir', rate: 2.2 }),
  R('fatima', 'Fatima Khan', 'dinghy', { sail: '#ffc531' }, 'Hadapsar', 'Bosun', 'Friendly and sociable; joins other boats at their spots. Often the one sharing yours.',
    [['09:00', '13:00', ['fish:with:meera', 'sell', 'fish:near']], ['15:00', '19:00', ['fish:with:arjun', 'sell', 'fish:near', 'sell']]], ['catla', 'rohu'], { rate: 5.5 }),
  R('rohan', 'Rohan More', 'tug', { hull: '#ffb21a', accent: '#2e9e5b' }, 'Khadki', 'Skipper', 'The harbour regular: short runs, always at Paradise Station. Everyone knows him.',
    [['07:00', '15:00', ['fish:station', 'sell', 'fish:station', 'sell', 'fish:station', 'sell', 'fish:station', 'sell']]], ['hilsa', 'rohu'], { rate: 5 }),
  R('sneha', 'Sneha Pawar', 'sail', { sail: '#8a5bd6' }, 'Kothrud', 'Skipper', 'Works during the week, lives for weekends: short sessions on weekdays, all day on Saturday and Sunday.',
    [['06:00', '10:00', ['fish:near', 'sell']], ['18:00', '22:00', ['tour:1', 'fish:near', 'sell']]], ['mackerel', 'pomfret'],
    { weekend: [['08:00', '16:00', ['fish:far', 'sell', 'fish:far', 'sell']]], rate: 4 }),
  R('kabir', 'Kabir Mehta', 'yacht', { hull: '#1b1d22', flag: '#c9ced6' }, 'Kalyani Nagar', 'Skipper', 'Confident and bold: chases Vikram’s trophy spots and wants his name above Vikram’s. Never gives way.',
    [['05:00', '09:00', ['fish:rival', 'sell', 'tour:1']], ['19:00', '23:00', ['fish:far', 'sell']]], ['barracuda', 'tuna', 'swordfish', 'mahi'], { rival: 'vikram', rate: 2.4, fast: true }),
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
  return { day: `${p.year}-${p.month}-${p.day}`, weekday: p.weekday, min: +p.hour * 60 + +p.minute + (+p.second + (ms % 1000) / 1000) / 60 }; // (to the millisecond: whole seconds made boats tick)
}
const dayBefore = day => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 1); return d.toISOString().slice(0, 10); };
const weekdayOf = day => new Date(day + 'T12:00:00Z').toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const hm = s => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };

// ---------- places ----------
const HOME = Object.fromEntries(SEED.map(([n, lat, lng]) => [n, project(lat, lng)]));
HOME['Model Colony'] = project(18.5285, 73.8362); // (not in the starter list)
const homeOf = c => HOME[c.home] || [0, 0];
const KM = 1000, clampP = (x, z) => clampToWorld(x, z, 400);
const around = ([x, z], r, a) => clampP(x + Math.cos(a) * r, z + Math.sin(a) * r);
const fishPrice = Object.fromEntries(FISH.map(f => [f.id, f.price])), fishName = Object.fromEntries(FISH.map(f => [f.id, f.name]));
const KN = 0.5144; // m/s per knot

// ---------- a captain's day: one simulation of the whole harbour ----------
// Every captain works through their planned stops with real fuel, cargo and coins, on the players' rules
// (station.js): fuel burns per metre by boat, fish sell at the market price, fuel costs FUEL_PRICE a litre.
// - Fishing: slow down, drop anchor (0.7 min), fish (catches only now, until the hold is full), raise anchor.
// - Port: Paradise Station's four berths (PORT) are shared. Visits are handled in arrival order across all
//   captains; when every berth is taken a boat waits offshore. At the berth it sells its catch and tops up.
// - Fuel: before each leg a captain checks it can get there and back to port with a 20% reserve, and heads
//   in to refuel when it can't. A careless captain (rarely) skips the check, can run dry, drifts until a
//   passing boat sells it enough fuel to reach port (at twice the price, as far as its coins go), then makes for port.
// - Selling: Paradise Station is the only market, a long way from some homes, so a captain goes in to sell only
//   once the hold is half full (or for fuel). Below THRIFTY coins a captain turns thrifty: no joyrides, fishing
//   near where the boat is kept, selling at a third of a hold, until the balance recovers.
// - Overnight: a captain goes home only with fuel to get home and back to the station with a reserve; otherwise
//   (a small tank, a home far from the only fuel) the boat stays moored off Paradise Station and sets out from there.
// Days chain: each starts with the fuel, hold and coins the last one ended with (from EPOCH), so balances
// carry over. It's all deterministic, so every account sees the same harbour.
const EPOCH = '2026-10-22', SIM_V = 7, THRIFTY = 300, RESERVE = 0.2, PORT_THR = 0.3, DOCK_MS = 2.2;
// each boat cruises at an economical throttle (the thirsty yacht slowest); speed follows the throttle
const THR_OF = { yacht: 0.3, tug: 0.45, sail: 0.5, dinghy: 0.6 }, thrOf = c => THR_OF[c.boat] ?? 0.5; // DOCK_MS: m/s along the pier
const berthCount = PORT.berths.length;
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const capOf = c => BOAT_SPECS[c.boat]?.fuel || 100, holdOf = c => BOAT_SPECS[c.boat]?.hold || 20;
const cruiseOf = c => (BOAT_SPECS[c.boat]?.kn || 10) * KN * (0.45 + 0.5 * thrOf(c)) * (c.fast ? 1.25 : c.slow ? 0.75 : 1); // m/s
const carelessOf = { riya: 0.12, aditya: 0.06 };
const startState = (c, i) => ({ fuel: capOf(c), coins: 400 + (hash(c.id) % 400) + (c.boat === 'yacht' ? 1500 : 0), hold: [], base: 'home' }); // (seasoned captains have savings)
// where a captain keeps the boat overnight: home, or moored off Paradise Station
const mooringOf = c => around(PORT.sea0, 140 + hash(c.id) % 90, Math.PI * 0.15 + (hash(c.id + 'm') % 100) / 100 * 1.1);

// ---- the plan: sessions and their stops (pure; a friend's spots come from their plan, not the simulation) ----
const stopCache = new Map();
function stopsOf(c, day) {
  const key = c.id + '|' + day; if (stopCache.has(key)) return stopCache.get(key);
  const r = rng(key), home = homeOf(c), wk = weekdayOf(day), weekend = wk === 'Sat' || wk === 'Sun';
  let sessions = c.random ? randomSessions(r) : (weekend && c.weekend) || c.sessions;
  if (c.id === 'dev' && wk === 'Fri') sessions = sessions.map((s, i) => i === 2 ? ['18:00', '23:00', ['fish:far', 'sell', 'fish:near', 'sell']] : s);
  const cruise = cruiseOf(c), out = [];
  sessions.forEach(([s0, s1, list], si) => {
    const jit = Math.round((r() - 0.5) * 40), t0 = hm(s0) + jit, t1 = hm(s1) + jit, stops = []; let at = home;
    list.forEach((st, k) => { const [kind, where, who] = st.split(':');
      if (kind === 'sell') stops.push({ kind: 'port' });
      else if (kind === 'tour' || kind === 'lap') { const n = +where || 2; for (let i = 0; i < n; i++) stops.push({ kind: 'via', p: around(kind === 'lap' ? home : at, (kind === 'lap' ? 0.9 : 2.5) * KM * (0.6 + r() * 0.8), r() * 6.283), fast: kind === 'lap' }); }
      else stops.push({ kind: 'fish', p: spot(c, where, who, day, si, k, at, r) });
      const last = stops[stops.length - 1]; at = last.p || PORT.sea0; });
    // fishing gets the time the travel and port calls leave (estimated), shared out unevenly
    let prev = home, travel = 0; stops.forEach(s => { const p = s.p || PORT.sea0; travel += dist(prev, p) / cruise / 60; prev = p; }); travel += dist(prev, home) / cruise / 60;
    const ports = stops.filter(s => s.kind === 'port').length, fishN = stops.filter(s => s.kind === 'fish').length;
    const fishT = Math.max(12 * fishN, t1 - t0 - travel - ports * 16), wts = stops.map(s => s.kind === 'fish' ? 0.7 + r() * 0.6 : 0), wsum = wts.reduce((a, b) => a + b, 0) || 1;
    stops.forEach((s, i) => { if (s.kind === 'fish') s.dur = Math.max(10, fishT * wts[i] / wsum); });
    out.push({ si, t0, t1, stops });
  });
  stopCache.set(key, out); if (stopCache.size > 300) stopCache.delete(stopCache.keys().next().value);
  return out;
}

// ---- the simulation ----
function simulate(day, start, berthFree0) {
  const berthFree = berthFree0.slice(), queueUse = [];
  const cur = ROSTER.map((c, ci) => { const s0 = start[c.id] || startState(c, ci);
    return { c, ci, r: rng(c.id + '|' + day + '|sim'), sessions: stopsOf(c, day), si: 0, k: 0, t: null, base: s0.base || 'home', pos: homeOf(c), fuel: s0.fuel, coins: s0.coins, hold: s0.hold.slice(), segs: [], events: [], need: null, done: false }; });
  const burn = (q, m, thr = thrOf(q.c)) => burnFor(q.c.boat, m, thr);
  const seg = (q, kind, t0, t1, a, b, extra = {}) => { const s = { kind, t0, t1, a, b, s: q.si, f0: q.fuel, hold: q.hold.length, ...extra }; q.segs.push(s); return s; };
  // sail a straight leg; a captain who runs dry on the way drifts, buys emergency fuel, and heads for port
  function sail(q, to, thr = thrOf(q.c), fast = false) {
    const d = dist(q.pos, to); if (d < 1) return true;
    const v = cruiseOf(q.c) * (fast ? 1.3 : 1), need = burn(q, d, thr);
    if (need <= q.fuel + 1e-9) { const s = seg(q, 'sail', q.t, q.t + d / v / 60, q.pos, to); q.fuel -= need; s.f1 = q.fuel; q.t = s.t1; q.pos = to; return true; }
    const f = q.fuel / need, dry = [q.pos[0] + (to[0] - q.pos[0]) * f, q.pos[1] + (to[1] - q.pos[1]) * f];
    const s = seg(q, 'sail', q.t, q.t + d * f / v / 60, q.pos, dry); q.fuel = 0; s.f1 = 0; q.t = s.t1; q.pos = dry;
    q.events.push({ t: q.t, kind: 'dry', p: dry });
    const wait = 25 + q.r() * 15, drift = [dry[0] + (q.r() - 0.5) * 30, dry[1] + (q.r() - 0.5) * 30];
    const a = seg(q, 'adrift', q.t, q.t + wait, dry, drift); a.f1 = 0; q.t = a.t1; q.pos = drift;
    const litres = Math.min(capOf(q.c), Math.ceil(burn(q, dist(drift, PORT.sea0)) * 1.25 + 3)), cost = Math.min(q.coins, Math.ceil(litres * FUEL_PRICE * 2)); // twice the station price, at sea
    const rs = seg(q, 'rescue', q.t, q.t + 4, drift, drift); q.fuel = litres; q.coins -= cost; rs.f1 = q.fuel; q.t = rs.t1;
    q.events.push({ t: q.t - 1, kind: 'rescue', litres, coins: -cost, p: drift });
    return false; // (now head for port)
  }
  const p0 = s => s.p;
  const portNeedFrom = (q, p) => burn(q, dist(p, PORT.sea0)) + capOf(q.c) * RESERVE;
  // fish at a spot: anchor down, fish until the time's up or the hold is full, anchor up
  function fish(q, stop) {
    const p = stop.p, a0 = q.t, A = 0.7, holdCap = holdOf(q.c);
    seg(q, 'anchor', a0, a0 + A, p, p).f1 = q.fuel;
    const f0 = a0 + A, dur = Math.max(4, stop.dur - 2 * A), n = Math.max(1, Math.round(dur / 60 * q.c.rate * (0.7 + q.r() * 0.6)));
    let end = f0 + dur;
    for (let i = 0; i < n; i++) { if (q.hold.length >= holdCap) { end = Math.min(end, q.events[q.events.length - 1].t + 1); break; }
      const fishId = pickFish(q.c, q.r), t = f0 + dur * (i + 0.5 + (q.r() - 0.5) * 0.8) / n, kg = kgOf(fishId, q.r);
      q.events.push({ t, kind: 'catch', fish: fishId, kg, p }); q.hold.push(fishId); }
    q.segs.push({ kind: 'fish', t0: f0, t1: end, a: p, b: p, s: q.si, f0: q.fuel, f1: q.fuel, hold: q.hold.length });
    seg(q, 'weigh', end, end + A, p, p).f1 = q.fuel; q.t = end + A;
    return q.hold.length >= holdCap;
  }
  // the next thing a captain does, up to a port call (which waits for the global berth order) or the day's end
  function advance(q) {
    while (!q.done) {
      const S = q.sessions[q.si]; if (!S) { q.done = true; return; }
      if (q.t == null || q.k === 0 && q.t < S.t0) {
        // can't afford half a tank and running low: a shift at the fish market instead (a wage), until they can
        if (q.coins < capOf(q.c) * 0.5 * FUEL_PRICE && q.fuel < capOf(q.c) * 0.35) { q.events.push({ t: S.t0, kind: 'ashore', coins: 80, p: homeOf(q.c) }); q.coins += 80; q.si++; q.k = 0; q.t = null; continue; }
        q.t = S.t0; q.pos = q.base === 'station' ? mooringOf(q.c) : homeOf(q.c); q.basePos = q.pos; q.events.push({ t: q.t, kind: 'out', p: q.pos, from: q.base });
        if (q.fuel < burn(q, dist(q.pos, PORT.sea0)) + capOf(q.c) * RESERVE || q.fuel < capOf(q.c) * 0.35) { q.need = 'port'; return; } }
      const late = q.t > S.t1 + 45; let stop = S.stops[q.k];
      if (!stop || late && stop.kind !== 'port') { // the session's over: home, by way of port if the tank says so
        // home only with fuel to get there and back to the station with a reserve; else refuel first, and if even a
        // full tank won't do it, moor off Paradise Station for the night
        const home = homeOf(q.c), canHome = () => q.fuel >= burn(q, dist(q.pos, home)) + burn(q, dist(home, PORT.sea0)) + capOf(q.c) * RESERVE;
        if (!canHome() && !q.homeViaPort) { q.homeViaPort = true; q.need = 'port'; return; }
        if (canHome()) { while (!sail(q, home)); q.base = 'home'; q.events.push({ t: q.t, kind: 'home', p: q.pos }); }
        else { while (!sail(q, mooringOf(q.c))); q.base = 'station'; q.events.push({ t: q.t, kind: 'moored', p: q.pos }); }
        q.si++; q.k = 0; q.homeViaPort = false; q.t = null; continue; }
      if (stop.kind === 'port') { if (q.hold.length >= holdOf(q.c) * (q.coins < THRIFTY ? 0.33 : 0.5) || q.fuel < capOf(q.c) * 0.4) { q.need = 'port'; return; } q.k++; continue; } // (not worth the trip yet)
      // can it get there and still reach port with a reserve? (a careless captain sometimes doesn't check)
      const thrifty = q.coins < THRIFTY;
      if (thrifty && stop.kind === 'via') { q.k++; continue; } // (no joyrides when money's tight)
      if (thrifty && stop.kind === 'fish' && dist(stop.p, q.basePos) > 2600) stop = { ...stop, p: around(q.basePos, 1200 + q.r() * 1300, q.r() * 6.283) };
      const p = stop.p;
      const enough = q.fuel >= burn(q, dist(q.pos, p)) + portNeedFrom(q, p);
      if (!enough && q.justPorted) { // out of reach even on a full tank: fish the nearer waters instead (or skip it)
        const near = around(q.pos, 1500 + q.r() * 1500, q.r() * 6.283);
        if (q.fuel >= burn(q, dist(q.pos, near)) + portNeedFrom(q, near)) { stop = { ...stop, p: near }; } else { q.k++; continue; }
        if (q.fuel < burn(q, dist(q.pos, stop.p)) + portNeedFrom(q, stop.p)) { q.k++; continue; } }
      else if (!enough && q.r() >= (carelessOf[q.c.id] || 0)) { q.need = 'port'; q.portThen = true; return; }
      q.justPorted = false;
      if (!sail(q, stop.p, thrOf(q.c), stop.fast)) { q.need = 'port'; q.portThen = true; return; }
      if (stop.kind === 'fish' && fish(q, stop)) { q.k++; if (S.stops[q.k]?.kind !== 'port') { q.need = 'port'; q.portThen = true; return; } continue; }
      q.k++;
    }
  }
  // a port call: reach the harbour mouth, wait offshore if every berth is taken, moor, sell, refuel, cast off
  function port(q) {
    const toMouth = dist(q.pos, PORT.sea0), arrive = q.t + toMouth / cruiseOf(q.c) / 60;
    let b = 0; for (let i = 1; i < berthCount; i++) if (berthFree[i] < berthFree[b]) b = i;
    const startDock = Math.max(arrive, berthFree[b]);
    if (startDock > arrive + 0.2) { // every berth busy: wait offshore at a free spot
      let qi = 0; for (let n = 0; n < PORT.queue.length && queueUse.some(u => u.i === qi && u.t1 > arrive); n++) qi = (qi + 1) % PORT.queue.length;
      while (!sail(q, PORT.queue[qi])); const w = seg(q, 'queue', q.t, Math.max(q.t, startDock - 0.6), q.pos, q.pos, { berth: b }); w.f1 = q.fuel; q.t = w.t1;
      queueUse.push({ i: qi, t1: w.t1 }); q.events.push({ t: w.t0, kind: 'wait', berth: b, p: q.pos }); while (!sail(q, PORT.sea0, PORT_THR));
    } else while (!sail(q, PORT.sea0));
    if (startDock > q.t + 0.01) { const h = seg(q, 'queue', q.t, startDock, q.pos, q.pos, { berth: b }); h.f1 = q.fuel; } // (holding at the mouth)
    q.t = Math.max(q.t, startDock);
    const B = PORT.berths[b], inPath = [PORT.sea0, ...B.via, B.pos], len = inPath.slice(1).reduce((a, p, i) => a + dist(inPath[i], p), 0);
    const d = seg(q, 'dock', q.t, q.t + len / DOCK_MS / 60, PORT.sea0, B.pos, { path: inPath, berth: b }); q.fuel = Math.max(0, q.fuel - burn(q, len, PORT_THR)); d.f1 = q.fuel; q.t = d.t1; q.pos = B.pos;
    // at the berth: sell everything, then top up the tank as far as the coins allow
    const t0 = q.t, n = q.hold.length, value = q.hold.reduce((a, id) => a + (fishPrice[id] || 10), 0);
    if (n) { q.events.push({ t: t0 + 1.5, kind: 'sell', n, coins: value, berth: b }); q.coins += value; q.hold = []; }
    const want = capOf(q.c) - q.fuel, litres = Math.max(0, Math.min(want, Math.floor(q.coins / FUEL_PRICE))), cost = Math.ceil(litres * FUEL_PRICE);
    const stay = 3 + Math.max(2, litres / 12);
    if (litres >= 1) { q.events.push({ t: t0 + 3, kind: 'fuel', litres: Math.round(litres), coins: -cost, berth: b }); q.coins -= cost; }
    const fFrom = q.fuel; q.fuel = Math.round((q.fuel + (litres >= 1 ? litres : 0)) * 10) / 10;
    q.segs.push({ kind: 'berth', t0, t1: t0 + stay, a: B.pos, b: B.pos, s: q.si, f0: fFrom, f1: q.fuel, hold: 0, berth: b }); q.t = t0 + stay;
    const outPath = [B.pos, ...[...B.via].reverse(), PORT.sea0], olen = outPath.slice(1).reduce((a, p, i) => a + dist(outPath[i], p), 0);
    const u = seg(q, 'undock', q.t, q.t + olen / DOCK_MS / 60, B.pos, PORT.sea0, { path: outPath, berth: b }); q.fuel = Math.max(0, q.fuel - burn(q, olen, PORT_THR)); u.f1 = q.fuel; q.t = u.t1; q.pos = PORT.sea0;
    berthFree[b] = q.t + 0.3; // (free once it has cleared the pier)
    const S = q.sessions[q.si]; if (S && S.stops[q.k]?.kind === 'port' && !q.portThen) q.k++; q.portThen = false; q.need = null; q.justPorted = true;
  }
  cur.forEach(advance);
  for (let guard = 0; guard < ROSTER.length * 40; guard++) { const w = cur.filter(q => q.need === 'port'); if (!w.length) break;
    const q = w.reduce((a, b) => a.t + dist(a.pos, PORT.sea0) / cruiseOf(a.c) / 60 <= b.t + dist(b.pos, PORT.sea0) / cruiseOf(b.c) / 60 ? a : b);
    port(q); advance(q); }
  const plans = {}, end = {};
  cur.forEach(q => { q.events.sort((a, b) => a.t - b.t); plans[q.c.id] = { segs: q.segs, events: q.events, start: start[q.c.id] || startState(q.c, q.ci) };
    end[q.c.id] = { fuel: Math.round(q.fuel * 10) / 10, coins: Math.round(q.coins), hold: q.hold.slice(), base: q.base }; });
  return { plans, end, berthFree: berthFree.map(t => Math.max(0, t - 1440)) };
}
const daySims = new Map(), SIMKEY = 'sailo:cpu-sim';
const dayAfter = day => { const d = new Date(day + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
/** The harbour's day (simulated once, from the day before's end state). */
function simDay(day) {
  if (daySims.has(day)) return daySims.get(day);
  if (day < EPOCH) { const r = simulate(day, {}, new Array(berthCount).fill(0)); daySims.set(day, r); return r; }
  // walk forward from the newest day we already know (this session, or saved on this device)
  let from = EPOCH, start = {}, bf = new Array(berthCount).fill(0);
  try { const s = JSON.parse(localStorage.getItem(SIMKEY)); if (s?.v === SIM_V && s.day < day && s.day >= EPOCH) { from = dayAfter(s.day); start = s.end; bf = s.berthFree; } } catch { /* storage blocked */ }
  for (const [d, r] of daySims) if (d < day && d >= EPOCH && d >= from) { from = dayAfter(d); start = r.end; bf = r.berthFree; }
  let r = null;
  for (let d = from; d <= day; d = dayAfter(d)) { r = simulate(d, start, bf); daySims.set(d, r); start = r.end; bf = r.berthFree;
    if (d < day) try { localStorage.setItem(SIMKEY, JSON.stringify({ v: SIM_V, day: d, end: r.end, berthFree: r.berthFree })); } catch { /* storage blocked */ } }
  if (daySims.size > 6) daySims.delete(daySims.keys().next().value);
  return r;
}
/** A captain's day: { segs, events, start } (segments in minutes from that day's midnight; see simulate). */
export const dayPlan = (c, day) => simDay(day).plans[c.id];
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
  const home = homeOf(c), toStn = Math.atan2(STATION.z - home[1], STATION.x - home[0]), a0 = r() * 6.283;
  const a = where === 'far' || where === 'any' ? toStn + (r() - 0.5) * 2.2 : a0; // (long trips lean toward the station side, where the fuel is)
  if (where === 'with' && who) { const pal = captain(who), pp = pal && stopsOf(pal, day).flatMap(s => s.stops).filter(s => s.kind === 'fish'); // beside a friend at one of their spots
    if (pp && pp.length) { const pick = pp[Math.min(pp.length - 1, si)].p; return around(pick, 35 + r() * 30, a); } }
  if (where === 'rival') { const riv = captain(c.rival), pp = riv && stopsOf(riv, dayBefore(day)).flatMap(s => s.stops).filter(s => s.kind === 'fish'); if (pp && pp.length) return around(pp[0].p, 60 + r() * 80, a); }
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

// where along a polyline a fraction u of its length lands: [x, z, heading]
function along(path, u) {
  const lens = path.slice(1).map((p, i) => dist(path[i], p)), total = lens.reduce((a, b) => a + b, 0) || 1; let d = u * total;
  for (let i = 0; i < lens.length; i++) { if (d <= lens[i] || i === lens.length - 1) { const a = path[i], b = path[i + 1], k = lens[i] ? Math.min(1, d / lens[i]) : 0;
    return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, Math.atan2(-(b[1] - a[1]), b[0] - a[0])]; } d -= lens[i]; }
  const e = path[path.length - 1]; return [e[0], e[1], 0];
}
/** Where a captain is now: null when ashore, else { x, z, yaw, kind, speed, seg, next, berth, fuel, hold }.
 *  kind: sail | anchor | fish | weigh | queue | dock | berth | undock | adrift | rescue */
export function stateAt(c, ms = Date.now()) {
  const now = puneNow(ms);
  for (const [day, off] of [[now.day, 0], [dayBefore(now.day), 1440]]) { // (a night session can run past midnight)
    const t = now.min + off, plan = dayPlan(c, day), seg = plan.segs.find(s => t >= s.t0 && t < s.t1);
    if (!seg) continue;
    const u = seg.t1 > seg.t0 ? (t - seg.t0) / (seg.t1 - seg.t0) : 0;
    let x, z, yaw = null, speed = 0;
    if (seg.path) { const [px, pz, h] = along(seg.path, u); x = px; z = pz; yaw = h; speed = seg.path.slice(1).reduce((a, p, i) => a + dist(seg.path[i], p), 0) / ((seg.t1 - seg.t0) * 60); }
    else { const dx = seg.b[0] - seg.a[0], dz = seg.b[1] - seg.a[1]; x = seg.a[0] + dx * u; z = seg.a[1] + dz * u;
      if (seg.kind === 'sail' && Math.hypot(dx, dz) > 1) { yaw = Math.atan2(-dz, dx); speed = Math.hypot(dx, dz) / ((seg.t1 - seg.t0) * 60); }
      if (seg.kind === 'berth') yaw = PORT.berths[seg.berth].yaw; }
    const fuel = seg.f0 + ((seg.f1 ?? seg.f0) - seg.f0) * u;
    const hold = seg.kind === 'fish' ? seg.hold - plan.events.filter(e => e.kind === 'catch' && e.t > t && e.t <= seg.t1).length : seg.hold;
    return { x, z, yaw, kind: seg.kind, speed, seg, u, berth: seg.berth, fuel, hold, next: nextStop(plan, seg), toMooring: seg.kind === 'sail' && dist(seg.b, mooringOf(c)) < 1 };
  }
  return null;
}
// what the captain is heading for: 'port' | 'fish' | 'home'
const nextStop = (plan, seg) => { const i = plan.segs.indexOf(seg); for (const s of plan.segs.slice(i + 1)) { if (s.s !== seg.s) break; if (s.kind === 'anchor') return 'fish'; if (s.kind === 'queue' || s.kind === 'dock') return 'port'; } return 'home'; };

/** What a captain is doing, in a few words (name tags, cards, the radio). */
export function statusText(c, s) {
  if (!s) return 'Ashore';
  const B = s.berth != null ? PORT.berths[s.berth]?.name : '';
  switch (s.kind) {
    case 'anchor': return 'Dropping anchor';
    case 'fish': return 'Fishing';
    case 'weigh': return 'Raising anchor';
    case 'queue': return 'Waiting for a berth';
    case 'dock': return `Mooring at ${B}`;
    case 'berth': return `At ${B} · selling & refuelling`;
    case 'undock': return 'Casting off';
    case 'adrift': return 'Out of fuel · adrift';
    case 'rescue': return 'Taking on emergency fuel';
    default: return s.fuel < capOf(c) * RESERVE ? 'Low on fuel · heading in' : s.next === 'port' ? 'Heading to Paradise Station' : s.next === 'fish' ? 'Heading out to fish'
      : s.toMooring ? 'Heading to the station moorings' : `Heading home to ${c.home}`;
  }
}
/** A captain's fuel, cargo and coins right now (on the water or ashore). */
export function statusOf(c, ms = Date.now()) {
  const now = puneNow(ms), cap = capOf(c), holdCap = holdOf(c), st = stateAt(c, ms);
  // coins: the day's opening balance plus every sale, fuel purchase and rescue so far
  const coinsAt = (day, t) => { const p = dayPlan(c, day); return p.start.coins + p.events.filter(e => e.t <= t && Number.isFinite(e.coins) && e.kind !== 'catch').reduce((a, e) => a + e.coins, 0); };
  const y = dayBefore(now.day), py = dayPlan(c, y), lastY = py.segs[py.segs.length - 1];
  const inYesterday = lastY && now.min + 1440 < lastY.t1;
  const coins = inYesterday ? coinsAt(y, now.min + 1440) : coinsAt(now.day, now.min);
  if (st) return { fuel: st.fuel, cap, hold: st.hold, holdCap, coins: Math.round(coins) };
  // ashore: as the last trip left things
  const p = dayPlan(c, now.day), done = p.segs.filter(s => s.t1 <= now.min), last = done[done.length - 1];
  const fuel = last ? last.f1 ?? last.f0 : p.start.fuel, hold = last ? (last.kind === 'berth' ? 0 : last.hold) : p.start.hold.length;
  return { fuel, cap, hold, holdCap, coins: Math.round(coins) };
}

/** Today so far (Pune time): catches, coins from sales, and the best fish. */
export function today(c, ms = Date.now()) {
  const now = puneNow(ms), ev = dayPlan(c, now.day).events.filter(e => e.t <= now.min);
  const catches = ev.filter(e => e.kind === 'catch'), best = catches.slice().sort((a, b) => (fishPrice[b.fish] * b.kg) - (fishPrice[a.fish] * a.kg))[0];
  return { catches: catches.length, coins: ev.filter(e => e.kind === 'sell').reduce((a, e) => a + e.coins, 0), sales: ev.filter(e => e.kind === 'sell').length,
    fuelBought: ev.filter(e => e.kind === 'fuel').reduce((a, e) => a + e.litres, 0),
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
/** Which berths the local sailors hold right now (index -> captain), for the berth markers and booking. */
export function berthsHeld(ms = Date.now()) {
  const held = new Map(); ROSTER.forEach(c => { const s = stateAt(c, ms); if (s && (s.kind === 'dock' || s.kind === 'berth' || s.kind === 'undock') && s.berth != null) held.set(s.berth, c); }); return held;
}

// ---------- the harbour board (harbour-board.js) ----------
const PLACES = Object.entries(HOME);
/** The nearest neighbourhood to a point ("near Kharadi"). */
export const placeNear = (x, z) => { let best = null, bd = Infinity; PLACES.forEach(([n, [px, pz]]) => { const d = (px - x) ** 2 + (pz - z) ** 2; if (d < bd) { bd = d; best = n; } }); return best; };
export const fishNameOf = id => fishName[id] || id;
/** A Pune day's happenings for one captain, in minutes of that day: setting out, catches, waiting for a berth,
 *  sales, refuelling, running dry, heading home (a night session's small hours come from the day before). */
export function dayLog(c, day) {
  const one = (d, off) => dayPlan(c, d).events.map(e => ({ ...e, t: e.t - off, p: e.p || PORT.sea0 }));
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
