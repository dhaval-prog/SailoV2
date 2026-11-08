// Passenger trips: moor at any Paradise Station and a few people are waiting there for a ride to another one. Take a
// group aboard (as many as your boat has seats), the course to their station is pinned, and when you moor there they
// step off and pay: the fare, plus a tip if you made it in time (less when late, never under half).
// - Kinds: commuters; tourists (they'd like to sail past another station on the way: a bonus if you do); VIPs (double
//   fare, a tight deadline, and they mind bumps twice as much); night owls (after dark only, +50%).
// - Comfort: every trip starts at five stars. Hitting rocks or the shore costs one, racing through rough seas costs
//   one for every 20 s of it. The stars scale the on-time tip; two or fewer take a little off the fare.
// Signed in, the server makes the offers and sets every fare and deadline, and pays only when you're moored at the
// destination (migrations …_sailov2_passenger_trips, …_types_comfort); signed out it all stays on this device.
import { RIDES } from './world-config.js';
import { rpc } from './econ.js';
import { placeList, poiList, zoneAt } from './geo.js';
import './passengers.css';

const MILE = 1609.344, SAVE = 'sailo:ride';
const NAMES = ['Priya', 'Arjun', 'Meera', 'Rohan', 'Ananya', 'Kabir', 'Isha', 'Vikram', 'Sana', 'Dev', 'Tara', 'Neel', 'Aisha', 'Kiran', 'Zoya', 'Aarav',
  'Riya', 'Omkar', 'Leela', 'Farhan', 'Nisha', 'Siddharth', 'Gauri', 'Yusuf', 'Pooja', 'Rahul', 'Maya', 'Imran', 'Diya', 'Aditya'];
const GROUP = ['and a friend', 'and family', 'and crew'];
const SHIRTS = ['#e8604c', '#3d7bd9', '#f2b636', '#5fb37a', '#b76bd6', '#ef8fb0', '#2fb3b0', '#f08a3c'], SKIN = ['#f1c7a5', '#d9a47c', '#b9805a', '#8d5a3b', '#f5d6bd'];
// how each kind reads on the board (the numbers are the server's ride_cfg kinds, mirrored in world-config.js RIDES.kinds)
const KIND = {
  commuter: { label: 'Commuter', note: 'Just wants to get there' },
  tourist: { label: 'Tourist', note: sight => `Would love to sail past ${sight}` },
  vip: { label: 'VIP', note: 'Double fare · tight deadline · hates bumps' },
  night: { label: 'Night owl', note: 'Out after dark · +50%' },
};
const QUOTES = { 5: ['Smoothest ride on the water!', 'Perfect. I’ll ride with you again.', 'What a captain!'], 4: ['Lovely trip, thanks!', 'Nice and easy.'],
  3: ['Got me here, that’s what counts.', 'A bit bumpy, but fine.'], 2: ['Hold on to your hats…', 'I think I’m seasick.'], 1: ['Never again!', 'My coffee is everywhere.'] };
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rand = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const stName = st => !st ? 'their station' : st.id === 'home' ? 'Paradise Station' : st.at;
// an island's name: a real place on it or right beside it (a landmark, a society, a locality), else the neighbourhood it's off
const isleName = (x, z, city) => { let best = null, bd = 320;
  for (const p of [...poiList(), ...placeList()]) { if (p.kind === 'major' || p.kind === 'region' || p.kind === 'road') continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p; } }
  if (best) return best.name; const zn = zoneAt(x, z); return `Island off ${zn ? zn.name : city}`; };
const starStr = n => '★'.repeat(n) + '☆'.repeat(5 - n);
const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
/** The fare (as the server sets it). */
export const fareFor = (metres, seats, kind = 'commuter') => Math.round(Math.max(RIDES.minFare, metres / MILE * RIDES.perMile) * (1 + RIDES.groupBonus * (seats - 1)) * RIDES.kinds[kind].fare);
const deadlineSecs = (metres, boat, kind) => metres / (RIDES.kn[boat] / 1.944) * RIDES.kinds[kind].slack + RIDES.deadlineExtra;
/** What a trip pays when you moor at its station (the server works it out the same way). */
export function payFor(trip, nowMs, stars, sight) {
  const onTime = nowMs <= Date.parse(trip.deadline); let pay, tip = 0, extra = 0;
  if (onTime) { pay = trip.fare; tip = Math.round(trip.fare * RIDES.tip * stars / 5); }
  else { const span = Math.max(1, Date.parse(trip.deadline) - Date.parse(trip.started)), late = (nowMs - Date.parse(trip.deadline)) / span; pay = Math.max(Math.round(trip.fare * RIDES.lateFloor), Math.round(trip.fare * (1 - late))); }
  if (stars <= RIDES.poorStars) pay = Math.round(pay * (1 - RIDES.poorCut));
  if (trip.kind === 'tourist' && sight) extra = Math.round(trip.fare * RIDES.kinds.tourist.sight);
  return { paid: pay + tip + extra, tip, sight: extra, onTime };
}

/** ctx: { THREE, chartId, stations(), here() (the station you're nearest), home, boat, boatId(), boatPos(), docked(), night(),
 *  boatYaw(), scene, WL, openMap(), celebrate(n), station (station.js: econCall, isServer, serverReady, toast, earnLocal) } */
export function createPassengers(ctx) {
  const { THREE, station } = ctx, toast = m => station.toast(m);
  let trip = null, offset = 0, busy = false, shown = null; // (offset: server clock minus ours; shown: the board's offers)
  const now = () => Date.now() + offset;
  const seatsOf = () => RIDES.seats[ctx.boatId()] || 1;
  const stationById = id => ctx.stations().find(s => s.id === id);
  // where a trip or offer is headed, by name (a station, or an island out on the water)
  const destName = o => o.dest === 'isle' ? (o.toName || 'the island') : stName(stationById(o.to));
  // the islands met so far that a ride can go to: clear of the stations (those have piers)
  const isles = () => (ctx.isles?.() || []).filter(r => r.r >= 20 && ctx.stations().every(s => Math.hypot(s.x - r.x, s.z - r.z) >= 600));
  // signed in, each island met is told to the server (so it can offer rides there), a batch every 20 s
  const told = new Set();
  setInterval(() => { if (!station.isServer()) return; const list = [];
    for (const r of isles()) { const k = `${Math.round(r.x)}:${Math.round(r.z)}`; if (told.has(k)) continue; told.add(k); list.push({ x: +r.x.toFixed(1), z: +r.z.toFixed(1), r: +r.r.toFixed(1), name: isleName(r.x, r.z, ctx.city) }); if (list.length >= 60) break; }
    if (list.length) rpc('chart_isles_add', { p_chart: ctx.chartId, p_list: list }).catch(() => { list.forEach(i => told.delete(`${Math.round(i.x)}:${Math.round(i.z)}`)); }); }, 20000);
  const isNight = () => !!ctx.night?.();

  // ---------- who's waiting: three groups, the same for ten minutes at each station ----------
  // (signed in, the server makes them: ride_offers; on this device the same rules make them here)
  function localOffers(st) {
    const w = Math.floor(Date.now() / 600000), r = rand(hash(`${ctx.chartId}:${st.id}:${w}`)), all = ctx.stations();
    const others = all.filter(s => s.id !== st.id).map(s => ({ s, d: Math.hypot(s.x - st.x, s.z - st.z) })).filter(o => o.d > 0.3 * MILE);
    const near = isles().map(i => ({ i, d: Math.hypot(i.x - st.x, i.z - st.z) })).filter(o => o.d >= 0.4 * MILE && o.d <= 5 * MILE), isleSlot = near.length && r() < 0.6;
    const pool = others.sort((a, b) => ((a.d > 6 * MILE) - (b.d > 6 * MILE)) || r() - 0.5).slice(0, isleSlot ? 2 : 3);
    if (isleSlot) { const o = near[Math.floor(r() * near.length)]; pool.push({ s: { id: `i${Math.round(o.i.x)}_${Math.round(o.i.z)}`, x: o.i.x, z: o.i.z }, d: o.d, isle: o.i }); }
    return { window: w, offers: pool.map((o, i) => { const k = r(); let kind = isNight() && k < 0.35 ? 'night' : k < 0.5 ? 'tourist' : k > 0.86 ? 'vip' : 'commuter', sight = null;
      if (kind === 'tourist') { const det = s => Math.hypot(s.x - st.x, s.z - st.z) + Math.hypot(o.s.x - s.x, o.s.z - s.z) - o.d;
        const best = all.filter(s => s.id !== st.id && s.id !== o.s.id && det(s) < 1.5 * MILE).sort((a, b) => det(a) - det(b))[0]; if (best) sight = best.id; else kind = 'commuter'; }
      const q = r(), seats = kind === 'vip' ? 1 : q < 0.55 ? 1 : q < 0.85 ? 2 : q < 0.95 ? 3 : 4 + Math.floor(r() * 3);
      const name = NAMES[Math.floor(r() * NAMES.length)], who = seats === 1 ? name : `${name} ${GROUP[Math.floor(r() * GROUP.length)]}`;
      return { i, to: o.s.id, kind, seats, name, who, dist: o.d, fare: fareFor(o.d, seats, kind), sight,
        ...(o.isle ? { dest: 'isle', toName: isleName(o.isle.x, o.isle.z, ctx.city), tx: o.isle.x, tz: o.isle.z, tr: o.isle.r } : { dest: 'station' }) }; }) };
  }
  async function loadOffers(st) {
    if (station.isServer()) { const r = await rpc('ride_offers', { p_chart: ctx.chartId, p_night: isNight(), p_home_x: ctx.home.x, p_home_z: ctx.home.z }); return { window: r.window, offers: r.offers || [] }; }
    return localOffers(st);
  }
  const shirtOf = o => SHIRTS[hash(o.who + o.to) % SHIRTS.length];

  // ---------- the board (a card over the pier) ----------
  const board = document.createElement('div'); board.className = 'px-modal'; board.hidden = true; board.setAttribute('role', 'dialog'); board.setAttribute('aria-modal', 'true'); board.setAttribute('aria-label', 'Passengers');
  document.body.appendChild(board);
  board.addEventListener('click', e => { if (e.target === board) closeBoard(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !board.hidden) closeBoard(); });
  async function openBoard() { shown = null; paintBoard(); board.hidden = false; requestAnimationFrame(() => board.classList.add('open'));
    try { shown = await loadOffers(ctx.here()); } catch (e) { shown = { window: 0, offers: [], err: niceErr(e) }; } paintBoard(); }
  function closeBoard() { board.classList.remove('open'); setTimeout(() => { if (!board.classList.contains('open')) board.hidden = true; }, 220); }
  function paintBoard() {
    const st = ctx.here(), cap = seatsOf(), list = shown?.offers || [];
    const tripHtml = trip ? `<div class="px-trip"><div><b>${esc(trip.passenger)}</b> ${trip.seats > 1 ? 'are' : 'is'} aboard<small>to ${esc(destName(trip))} · ${(trip.dist / MILE).toFixed(1)} mi · ${trip.fare}c · ${starStr(trip.stars ?? 5)}</small></div>
      <button type="button" class="px-ghost" data-act="cancel">Cancel trip</button></div>` : '';
    const rows = !shown ? '<p class="px-none">Asking who’s waiting…</p>' : shown.err ? `<p class="px-none">${esc(shown.err)}</p>` : list.map(o => { const tooBig = o.seats > cap, blocked = !!trip || tooBig, K = KIND[o.kind] || KIND.commuter;
      const note = typeof K.note === 'function' ? K.note(stName(stationById(o.sight))) : K.note;
      return `<div class="px-row${blocked ? ' off' : ''}"><span class="px-av" style="background:${shirtOf(o)}">${esc(o.name[0])}</span>
        <div class="px-main"><b>${esc(o.who)}</b><small>to ${esc(destName(o))} · ${(o.dist / MILE).toFixed(1)} mi</small>
          ${o.dest === 'isle' ? '<span class="px-kind k-isle"><em>Island</em>No pier: stop beside it to let them off</span>' : ''}
          <span class="px-kind k-${o.kind}"><em>${K.label}</em>${esc(note)}</span>
          <span class="px-seats" aria-label="${o.seats} seat${o.seats === 1 ? '' : 's'}">${'<i></i>'.repeat(Math.min(o.seats, 6))}${tooBig ? `<em>Needs ${o.seats} seats</em>` : ''}</span></div>
        <div class="px-side"><span class="px-fare">${o.fare}c</span><button type="button" class="px-gold" data-i="${o.i}" ${blocked ? 'disabled' : ''}>Take</button></div></div>`; }).join('') || '<p class="px-none">Nobody’s waiting here right now.</p>';
    board.innerHTML = `<div class="px-card"><header><div><h2>Passengers</h2><p>${esc(stName(st))} · your ${({ sail: 'sail boat', woodtug: 'wooden tug', voyager: 'Voyager', drydock: 'dry dock tug', yacht: 'yacht', dinghy: 'dinghy', tug: 'tug' })[ctx.boatId()] || 'boat'} seats ${cap}</p></div>
      <button type="button" class="px-x" data-act="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></button></header>
      ${tripHtml}<div class="px-list">${rows}</div>
      <p class="px-hint">${trip ? 'Drop off your passengers first.' : 'On time and smooth: a bigger tip. Rocks and racing through rough seas cost stars.'}</p></div>`;
    board.querySelector('[data-act="close"]').onclick = closeBoard;
    board.querySelector('[data-act="cancel"]')?.addEventListener('click', cancelTrip);
    board.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => take(list.find(o => o.i === +b.dataset.i))));
  }

  // ---------- taking a group aboard ----------
  async function take(o) {
    if (busy || trip || !o) return; busy = true;
    try {
      const boat = ctx.boatId(), extra = { shirt: shirtOf(o), stars: 5, bumps: 0, rough: 0, seen: false };
      if (station.isServer()) {
        const t = await rpc('ride_board', { p_chart: ctx.chartId, p_window: shown.window, p_offer: o.i, p_boat: boat, p_night: isNight() });
        setTrip({ ...t, ...extra, server: true });
      } else setTrip({ id: 'local', from: ctx.here().id, to: o.to, dest: o.dest, toName: o.toName, tx: o.tx, tz: o.tz, tr: o.tr, passenger: o.who, seats: o.seats, boat, dist: o.dist, fare: o.fare, kind: o.kind, sight: o.sight,
        started: new Date().toISOString(), deadline: new Date(Date.now() + deadlineSecs(o.dist, boat, o.kind) * 1000).toISOString(), now: new Date().toISOString(), ...extra, server: false });
      closeBoard();
      const sight = trip.kind === 'tourist' && stationById(trip.sight);
      toast(`${o.name} ${o.seats > 1 ? `(+${o.seats - 1}) are` : 'is'} aboard. Sail to ${destName(trip)}${sight ? `, past ${stName(sight)} if you can` : ''}${trip.dest === 'isle' ? ' and stop beside it' : ' and moor there'}. Follow the gold light: it's on your map and compass too.`);
    } catch (e) { toast(niceErr(e)); if (e?.code === 'offer_gone') openBoard(); else paintBoard(); }
    finally { busy = false; }
  }
  // where the trip is going (for the map, the compass and the beam of light): you sail there yourself
  function target() { if (!trip) return null; const n = `Drop ${trip.passenger.split(' ')[0]} · ${destName(trip)}`;
    if (trip.dest === 'isle') return trip.tx == null ? null : { x: trip.tx, z: trip.tz, r: trip.tr || 30, name: n };
    const to = stationById(trip.to); return to ? { x: to.x, z: to.z, r: 34, name: n } : null; }
  const NICE = { not_docked: 'Moor at the pier first.', trip_active: 'You already have passengers aboard.', too_many_seats: 'Your boat hasn’t the seats for them.',
    offer_gone: 'They’ve found another boat. Here’s who’s waiting now.', no_trip: 'Those passengers have already left.' };
  const niceErr = e => NICE[e?.code] || NICE[String(e?.message)] || e?.message || 'The harbour didn’t answer. Try again?';
  async function cancelTrip() {
    if (!trip || busy) return; busy = true;
    try { if (trip.server) await rpc('ride_cancel', {}); const n = trip.passenger; setTrip(null); toast(`${n.split(' ')[0]} waved goodbye. Trip cancelled.`); }
    catch (e) { toast(niceErr(e)); }
    finally { busy = false; paintBoard(); }
  }

  // ---------- comfort on the way: bumps and rough sailing cost stars; a tourist's sight ----------
  let bumpT = 0, saveT = 0;
  const starsNow = t => Math.max(1, 5 - t.bumps * (t.kind === 'vip' ? 2 : 1) - Math.floor(t.rough / 20));
  const lostStar = why => { const n = trip.passenger.split(' ')[0], s = starsNow(trip); if (s >= trip.stars) return; trip.stars = s; save(); paintChip(); chip.classList.remove('hurt'); void chip.offsetWidth; chip.classList.add('hurt');
    toast(`${why(n)} ${starStr(s)}`); try { navigator.vibrate?.(30); } catch { /* not allowed */ } };
  function bump() { if (!trip || ctx.docked()) return; const t = performance.now(); if (t - bumpT < 2500) return; bumpT = t; trip.bumps++;
    lostStar(n => trip.kind === 'vip' ? `${n} is not amused by that bump.` : `Ouch! ${n} didn’t like that bump.`); }
  function ride(dt, speed, amp) {
    if (!trip || ctx.docked()) return;
    if (amp >= 1.5 && speed > 0.75) { trip.rough += dt; if (Math.floor(trip.rough / 20) > Math.floor((trip.rough - dt) / 20)) lostStar(n => `${n} is getting soaked: ease off in this swell.`); }
    if (trip.kind === 'tourist' && !trip.seen && trip.sight) { const s = stationById(trip.sight), p = ctx.boatPos();
      if (s && Math.hypot(s.x - p.x, s.z - p.z) < 350) { trip.seen = true; save(); paintChip(); toast(`${trip.passenger.split(' ')[0]} loved the view of ${stName(s)}! 📸`); } }
    if ((saveT += dt) > 5) { saveT = 0; save(); }
    if (trip.dest === 'isle') { const p = ctx.boatPos(), dd = Math.hypot(p.x - trip.tx, p.z - trip.tz), near = dd < (trip.tr || 30) + 110;
      stopT = near && speed < 0.08 ? stopT + dt : 0; if (near && !trip.toldStop && speed >= 0.08) { trip.toldStop = true; toast(`Here's ${destName(trip)}: stop beside it to let ${trip.passenger.split(' ')[0]} off.`); }
      if (stopT > 1.2 && !busy) { stopT = -999; arrive(); } }
  }
  let stopT = 0;

  // ---------- arriving: moored at their station ----------
  async function moored(st) {
    if (!trip) return;
    if (trip.dest === 'isle') { toast(`${trip.passenger.split(' ')[0]} wants dropping at ${destName(trip)}: stop beside the island.`); return; }
    if (st.id !== trip.to) { toast(`${trip.passenger.split(' ')[0]} is headed for ${destName(trip)}.`); return; }
    arrive();
  }
  async function arrive() {
    if (!trip || busy) return; busy = true;
    try {
      const stars = starsNow(trip), sight = !!trip.seen, p = ctx.boatPos(); let r;
      if (trip.server) r = trip.dest === 'isle' ? await station.econCall('ride_finish_isle', { p_chart: ctx.chartId, p_x: p.x, p_z: p.z, p_stars: stars, p_sight: sight })
        : await station.econCall('ride_finish', { p_chart: ctx.chartId, p_stars: stars, p_sight: sight });
      else { r = payFor(trip, now(), stars, sight); station.earnLocal(r.paid); }
      const n = trip.passenger.split(' ')[0], q = QUOTES[stars], quote = q[hash(trip.id + n) % q.length];
      setTrip(null); ctx.celebrate?.(r.paid);
      toast(`${n} paid ${r.paid}c${r.onTime && r.tip ? ` (+${r.tip}c tip)` : r.onTime ? '' : ', a little late'}${r.sight ? ` (+${r.sight}c for the view)` : ''}. ${starStr(stars)} “${quote}”`);
      try { navigator.vibrate?.([12, 40, 18]); } catch { /* not allowed */ }
    } catch (e) { toast(e?.code === 'too_fast' ? 'Hmm, that was quicker than any boat. No fare.' : e?.code === 'not_there' ? `A little closer to ${destName(trip)}…` : niceErr(e)); stopT = 0; }
    finally { busy = false; }
  }

  // ---------- the trip chip (top of the screen) ----------
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'px-chip'; chip.hidden = true; chip.setAttribute('aria-label', 'Passenger trip');
  document.body.appendChild(chip);
  chip.onclick = () => { if (trip) ctx.openMap?.(); }; // (the map shows where they're going)
  function paintChip() {
    chip.hidden = !trip; if (!trip) return; const to = trip.dest === 'isle' ? { x: trip.tx, z: trip.tz } : stationById(trip.to), p = ctx.boatPos(), left = (Date.parse(trip.deadline) - now()) / 1000;
    const d = to && to.x != null ? Math.hypot(to.x - p.x, to.z - p.z) / MILE : trip.dist / MILE, K = KIND[trip.kind] || KIND.commuter;
    chip.classList.toggle('late', left < 0); chip.classList.toggle('soon', left >= 0 && left < 60);
    const tg = target(), yaw = ctx.boatYaw?.() ?? 0, turn = tg ? Math.atan2(-(tg.z - p.z), tg.x - p.x) - yaw : 0; // (0: dead ahead; positive: to port)
    chip.innerHTML = `<span class="px-chip-av" style="background:${trip.shirt || '#3d7bd9'}">${esc(trip.passenger[0])}</span><span><b>${esc(trip.passenger.split(' ')[0])}${trip.seats > 1 ? ` +${trip.seats - 1}` : ''}</b> → ${esc(destName(trip))}</span>
      ${trip.kind !== 'commuter' ? `<span class="px-chip-k k-${trip.kind}">${K.label}${trip.kind === 'tourist' && trip.seen ? ' ✓' : ''}</span>` : ''}
      <span class="px-chip-s" aria-label="${trip.stars ?? 5} stars">${starStr(trip.stars ?? 5)}</span><span class="px-chip-dir" aria-hidden="true" style="transform:rotate(${(-turn * 180 / Math.PI).toFixed(0)}deg)">↑</span><span class="px-chip-m">${d.toFixed(1)} mi</span><span class="px-chip-t">${left < 0 ? `late ${mmss(-left)}` : mmss(left)}</span>`;
  }
  setInterval(paintChip, 300); // (the arrow follows your turns)

  // ---------- keeping the trip (the server's copy wins; comfort and the rest are kept here) ----------
  const save = () => { try { if (trip) localStorage.setItem(SAVE, JSON.stringify({ ...trip, chart: ctx.chartId })); else localStorage.removeItem(SAVE); } catch { /* storage blocked */ } };
  function setTrip(t) { trip = t; if (t?.now) offset = Date.parse(t.now) - Date.now(); save(); paintChip(); }
  (async () => {
    let local = null; try { local = JSON.parse(localStorage.getItem(SAVE)); } catch { /* none */ }
    const keep = l => (l && l.chart === ctx.chartId ? { shirt: l.shirt, stars: l.stars ?? 5, bumps: l.bumps ?? 0, rough: l.rough ?? 0, seen: !!l.seen } : { stars: 5, bumps: 0, rough: 0, seen: false });
    if (station.isServer() || await station.serverReady?.()) {
      try { const t = await rpc('ride_get', {}); if (t && t.chart === ctx.chartId) { setTrip({ ...t, ...keep(local?.id === t.id ? local : null), server: true }); } else setTrip(null); }
      catch { if (local?.server && local.chart === ctx.chartId) { trip = local; paintChip(); } }
    } else if (local && !local.server && local.chart === ctx.chartId) { setTrip({ ...local, ...keep(local) }); }
  })();

  // ---------- the destination, out on the water: a tall gold beam of light (seen from far off) and a ring on the sea ----------
  const beacon = (() => {
    const g = new THREE.Group(); g.name = 'trip_beacon'; g.visible = false; ctx.scene.add(g);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 3.4, 90, 20, 1, true), new THREE.MeshBasicMaterial({ color: '#ffc93c', transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.y = 45; beam.renderOrder = 5; g.add(beam);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 48), new THREE.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.8, depthWrite: false, fog: false }));
    ring.rotation.x = -Math.PI / 2; g.add(ring);
    return { tick(t) { const tg = target(); g.visible = !!tg; if (!tg) return; g.position.set(tg.x, ctx.WL + 0.1, tg.z); g.updateMatrixWorld(true);
      const r = tg.r || 30, k = (t * 0.5) % 1; ring.scale.setScalar(r * (1 + k * 0.6)); ring.material.opacity = 0.8 * (1 - k); beam.material.opacity = 0.22 + 0.1 * Math.sin(t * 2); } };
  })();

  return { openBoard, moored, bump, target, tick: (dt = 0, speed = 0, amp = 1, t = 0) => { ride(dt, speed, amp); beacon.tick(t); }, boatChanged: () => {}, get trip() { return trip; } };
}
