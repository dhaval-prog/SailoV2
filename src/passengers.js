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
 *  pinCourse(x, z), clearCourse(), celebrate(n), station (station.js: econCall, isServer, serverReady, toast, earnLocal) } */
export function createPassengers(ctx) {
  const { THREE, station } = ctx, toast = m => station.toast(m);
  let trip = null, offset = 0, busy = false, shown = null; // (offset: server clock minus ours; shown: the board's offers)
  const now = () => Date.now() + offset;
  const seatsOf = () => RIDES.seats[ctx.boatId()] || 1;
  const stationById = id => ctx.stations().find(s => s.id === id);
  const isNight = () => !!ctx.night?.();

  // ---------- who's waiting: three groups, the same for ten minutes at each station ----------
  // (signed in, the server makes them: ride_offers; on this device the same rules make them here)
  function localOffers(st) {
    const w = Math.floor(Date.now() / 600000), r = rand(hash(`${ctx.chartId}:${st.id}:${w}`)), all = ctx.stations();
    const others = all.filter(s => s.id !== st.id).map(s => ({ s, d: Math.hypot(s.x - st.x, s.z - st.z) })).filter(o => o.d > 0.3 * MILE);
    const pool = others.sort((a, b) => ((a.d > 6 * MILE) - (b.d > 6 * MILE)) || r() - 0.5).slice(0, 3);
    return { window: w, offers: pool.map((o, i) => { const k = r(); let kind = isNight() && k < 0.35 ? 'night' : k < 0.5 ? 'tourist' : k > 0.86 ? 'vip' : 'commuter', sight = null;
      if (kind === 'tourist') { const det = s => Math.hypot(s.x - st.x, s.z - st.z) + Math.hypot(o.s.x - s.x, o.s.z - s.z) - o.d;
        const best = all.filter(s => s.id !== st.id && s.id !== o.s.id && det(s) < 1.5 * MILE).sort((a, b) => det(a) - det(b))[0]; if (best) sight = best.id; else kind = 'commuter'; }
      const q = r(), seats = kind === 'vip' ? 1 : q < 0.55 ? 1 : q < 0.85 ? 2 : q < 0.95 ? 3 : 4 + Math.floor(r() * 3);
      const name = NAMES[Math.floor(r() * NAMES.length)], who = seats === 1 ? name : `${name} ${GROUP[Math.floor(r() * GROUP.length)]}`;
      return { i, to: o.s.id, kind, seats, name, who, dist: o.d, fare: fareFor(o.d, seats, kind), sight }; }) };
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
    const tripHtml = trip ? `<div class="px-trip"><div><b>${esc(trip.passenger)}</b> ${trip.seats > 1 ? 'are' : 'is'} aboard<small>to ${esc(stName(stationById(trip.to)))} · ${(trip.dist / MILE).toFixed(1)} mi · ${trip.fare}c · ${starStr(trip.stars ?? 5)}</small></div>
      <button type="button" class="px-ghost" data-act="cancel">Cancel trip</button></div>` : '';
    const rows = !shown ? '<p class="px-none">Asking who’s waiting…</p>' : shown.err ? `<p class="px-none">${esc(shown.err)}</p>` : list.map(o => { const tooBig = o.seats > cap, blocked = !!trip || tooBig, K = KIND[o.kind] || KIND.commuter;
      const note = typeof K.note === 'function' ? K.note(stName(stationById(o.sight))) : K.note;
      return `<div class="px-row${blocked ? ' off' : ''}"><span class="px-av" style="background:${shirtOf(o)}">${esc(o.name[0])}</span>
        <div class="px-main"><b>${esc(o.who)}</b><small>to ${esc(stName(stationById(o.to)))} · ${(o.dist / MILE).toFixed(1)} mi</small>
          <span class="px-kind k-${o.kind}"><em>${K.label}</em>${esc(note)}</span>
          <span class="px-seats" aria-label="${o.seats} seat${o.seats === 1 ? '' : 's'}">${'<i></i>'.repeat(Math.min(o.seats, 6))}${tooBig ? `<em>Needs ${o.seats} seats</em>` : ''}</span></div>
        <div class="px-side"><span class="px-fare">${o.fare}c</span><button type="button" class="px-gold" data-i="${o.i}" ${blocked ? 'disabled' : ''}>Take</button></div></div>`; }).join('') || '<p class="px-none">Nobody’s waiting here right now.</p>';
    board.innerHTML = `<div class="px-card"><header><div><h2>Passengers</h2><p>${esc(stName(st))} · your ${ctx.boatId() === 'sail' ? 'sail boat' : ctx.boatId()} seats ${cap}</p></div>
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
      } else setTrip({ id: 'local', from: ctx.here().id, to: o.to, passenger: o.who, seats: o.seats, boat, dist: o.dist, fare: o.fare, kind: o.kind, sight: o.sight,
        started: new Date().toISOString(), deadline: new Date(Date.now() + deadlineSecs(o.dist, boat, o.kind) * 1000).toISOString(), now: new Date().toISOString(), ...extra, server: false });
      closeBoard(); deck.board(trip.seats, trip.shirt);
      const to = stationById(o.to); if (to) ctx.pinCourse(to.x + 70, to.z + 80);
      const sight = trip.kind === 'tourist' && stationById(trip.sight);
      toast(`${o.name} ${o.seats > 1 ? `(+${o.seats - 1}) are` : 'is'} aboard. Sail to ${stName(to)}${sight ? `, past ${stName(sight)} if you can` : ''}: the course is pinned.`);
    } catch (e) { toast(niceErr(e)); if (e?.code === 'offer_gone') openBoard(); else paintBoard(); }
    finally { busy = false; }
  }
  const NICE = { not_docked: 'Moor at the pier first.', trip_active: 'You already have passengers aboard.', too_many_seats: 'Your boat hasn’t the seats for them.',
    offer_gone: 'They’ve found another boat. Here’s who’s waiting now.', no_trip: 'Those passengers have already left.' };
  const niceErr = e => NICE[e?.code] || NICE[String(e?.message)] || e?.message || 'The harbour didn’t answer. Try again?';
  async function cancelTrip() {
    if (!trip || busy) return; busy = true;
    try { if (trip.server) await rpc('ride_cancel', {}); const n = trip.passenger; setTrip(null); deck.alight(false); ctx.clearCourse?.(); toast(`${n.split(' ')[0]} waved goodbye. Trip cancelled.`); }
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
  }

  // ---------- arriving: moored at their station ----------
  async function moored(st) {
    if (!trip) return;
    if (st.id !== trip.to) { toast(`${trip.passenger.split(' ')[0]} is headed for ${stName(stationById(trip.to))}.`); return; }
    if (busy) return; busy = true;
    try {
      const stars = starsNow(trip), sight = !!trip.seen; let r;
      if (trip.server) r = await station.econCall('ride_finish', { p_chart: ctx.chartId, p_stars: stars, p_sight: sight });
      else { r = payFor(trip, now(), stars, sight); station.earnLocal(r.paid); }
      const n = trip.passenger.split(' ')[0], q = QUOTES[stars], quote = q[hash(trip.id + n) % q.length];
      setTrip(null); deck.alight(true); ctx.celebrate?.(r.paid);
      toast(`${n} paid ${r.paid}c${r.onTime && r.tip ? ` (+${r.tip}c tip)` : r.onTime ? '' : ', a little late'}${r.sight ? ` (+${r.sight}c for the view)` : ''}. ${starStr(stars)} “${quote}”`);
      try { navigator.vibrate?.([12, 40, 18]); } catch { /* not allowed */ }
    } catch (e) { toast(e?.code === 'too_fast' ? 'Hmm, that was quicker than any boat. No fare.' : niceErr(e)); }
    finally { busy = false; }
  }

  // ---------- the trip chip (top of the screen) ----------
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'px-chip'; chip.hidden = true; chip.setAttribute('aria-label', 'Passenger trip');
  document.body.appendChild(chip);
  chip.onclick = () => { if (!trip) return; const to = stationById(trip.to); if (to && !ctx.docked()) { ctx.pinCourse(to.x + 70, to.z + 80); toast(`Course pinned to ${stName(to)}.`); } };
  function paintChip() {
    chip.hidden = !trip; if (!trip) return; const to = stationById(trip.to), p = ctx.boatPos(), left = (Date.parse(trip.deadline) - now()) / 1000;
    const d = to ? Math.hypot(to.x - p.x, to.z - p.z) / MILE : trip.dist / MILE, K = KIND[trip.kind] || KIND.commuter;
    chip.classList.toggle('late', left < 0); chip.classList.toggle('soon', left >= 0 && left < 60);
    chip.innerHTML = `<span class="px-chip-av" style="background:${trip.shirt || '#3d7bd9'}">${esc(trip.passenger[0])}</span><span><b>${esc(trip.passenger.split(' ')[0])}${trip.seats > 1 ? ` +${trip.seats - 1}` : ''}</b> → ${esc(stName(to))}</span>
      ${trip.kind !== 'commuter' ? `<span class="px-chip-k k-${trip.kind}">${K.label}${trip.kind === 'tourist' && trip.seen ? ' ✓' : ''}</span>` : ''}
      <span class="px-chip-s" aria-label="${trip.stars ?? 5} stars">${starStr(trip.stars ?? 5)}</span><span class="px-chip-m">${d.toFixed(1)} mi</span><span class="px-chip-t">${left < 0 ? `late ${mmss(-left)}` : mmss(left)}</span>`;
  }
  setInterval(paintChip, 1000);

  // ---------- keeping the trip (the server's copy wins; comfort and the rest are kept here) ----------
  const save = () => { try { if (trip) localStorage.setItem(SAVE, JSON.stringify({ ...trip, chart: ctx.chartId })); else localStorage.removeItem(SAVE); } catch { /* storage blocked */ } };
  function setTrip(t) { trip = t; if (t?.now) offset = Date.parse(t.now) - Date.now(); save(); paintChip(); }
  (async () => {
    let local = null; try { local = JSON.parse(localStorage.getItem(SAVE)); } catch { /* none */ }
    const keep = l => (l && l.chart === ctx.chartId ? { shirt: l.shirt, stars: l.stars ?? 5, bumps: l.bumps ?? 0, rough: l.rough ?? 0, seen: !!l.seen } : { stars: 5, bumps: 0, rough: 0, seen: false });
    if (station.isServer() || await station.serverReady?.()) {
      try { const t = await rpc('ride_get', {}); if (t && t.chart === ctx.chartId) { setTrip({ ...t, ...keep(local?.id === t.id ? local : null), server: true }); deck.board(t.seats, trip.shirt, true); } else setTrip(null); }
      catch { if (local?.server && local.chart === ctx.chartId) { trip = local; paintChip(); deck.board(local.seats, local.shirt, true); } }
    } else if (local && !local.server && local.chart === ctx.chartId) { setTrip({ ...local, ...keep(local) }); deck.board(local.seats, local.shirt, true); }
  })();

  // ---------- the passengers on deck: little figures, standing where the deck is flat and low ----------
  const deck = (() => {
    const g = new THREE.Group(); g.name = 'passengers'; ctx.boat.add(g);
    const body = new THREE.CylinderGeometry(0.2, 0.26, 0.82, 8), head = new THREE.SphereGeometry(0.19, 10, 8), leg = new THREE.CylinderGeometry(0.09, 0.09, 0.62, 6);
    const legM = new THREE.MeshStandardMaterial({ color: '#2f3a4d', roughness: 0.9 });
    const spots = new Map(), BIG = 1.3; let people = [], leaving = null, t0 = 0; // (BIG: a little larger than life, so they read at sea)
    // stand-points for a boat: look down at it from above and keep the lowest flat hits (the deck, not the cabin roof)
    const findSpots = id => { if (spots.has(id)) return spots.get(id);
      const b = ctx.boat, pos = b.position.clone(), rot = b.rotation.clone(); b.position.set(0, 0, 0); b.rotation.set(0, 0, 0); b.updateMatrixWorld(true);
      const meshes = []; b.traverse(o => { if (o.isMesh && o.visible && o.material?.visible !== false && !o.material?.transparent && !people.some(p => p === o.parent)) meshes.push(o); });
      const box = new THREE.Box3(); meshes.forEach(m => box.expandByObject(m));
      const ray = new THREE.Raycaster(), dn = new THREE.Vector3(0, -1, 0), hits = [], L = box.max.x - box.min.x, Wd = box.max.z - box.min.z;
      for (let i = 0; i <= 14; i++) for (const zf of [-0.22, 0, 0.22]) { const x = box.min.x + L * (0.12 + 0.68 * i / 14), z = (box.min.z + box.max.z) / 2 + zf * Wd;
        ray.set(new THREE.Vector3(x, box.max.y + 2, z), dn); const h = ray.intersectObjects(meshes, false)[0];
        if (h && h.face && h.face.normal.clone().transformDirection(h.object.matrixWorld).y > 0.85) hits.push(new THREE.Vector3(x, h.point.y, z)); }
      b.position.copy(pos); b.rotation.copy(rot); b.updateMatrixWorld(true);
      let out = [];
      if (hits.length) { const low = Math.min(...hits.map(h => h.y)), deckY = hits.filter(h => h.y < low + 0.5); // (the main deck)
        const byX = deckY.sort((a, c) => a.x - c.x); for (let i = 0; i < 6; i++) out.push(byX[Math.round(i * (byX.length - 1) / 5)] || byX[0]); }
      if (!out.length) out = Array.from({ length: 6 }, (_, i) => new THREE.Vector3(-1.5 + i * 0.6, 1.8, (i % 2 ? 0.5 : -0.5)));
      // spread them out: alternate sides and order from the stern
      out = [out[0], out[5], out[2], out[3], out[1], out[4]].filter(Boolean).map((v, i) => v.clone().setZ(v.z + (i % 2 ? 0.35 : -0.35)));
      spots.set(id, out); return out; };
    const person = (shirt, i) => { const p = new THREE.Group(), r = rand(hash(shirt + i));
      const bm = new THREE.Mesh(body, new THREE.MeshStandardMaterial({ color: i === 0 ? shirt : SHIRTS[Math.floor(r() * SHIRTS.length)], roughness: 0.85 })); bm.position.y = 1.0;
      const hm = new THREE.Mesh(head, new THREE.MeshStandardMaterial({ color: SKIN[Math.floor(r() * SKIN.length)], roughness: 0.8 })); hm.position.y = 1.62;
      const l1 = new THREE.Mesh(leg, legM), l2 = new THREE.Mesh(leg, legM); l1.position.set(0, 0.31, 0.1); l2.position.set(0, 0.31, -0.1);
      [bm, hm, l1, l2].forEach(m => { m.castShadow = true; p.add(m); }); p.userData.ph = r() * 6; return p; };
    const clear = () => { people.forEach(p => g.remove(p)); people = []; };
    return {
      board(n, shirt, instant = false) { clear(); leaving = null; const sp = findSpots(ctx.boatId());
        for (let i = 0; i < Math.min(n, sp.length); i++) { const p = person(shirt || SHIRTS[0], i); p.position.copy(sp[i]); p.userData.base = sp[i].clone(); p.userData.t = instant ? -99 : i * 0.25; p.rotation.y = Math.PI / 2 + (i % 2 ? 0.5 : -0.5); g.add(p); people.push(p); }
        t0 = performance.now() / 1000; },
      alight(wave) { if (!people.length) return; leaving = { t: performance.now() / 1000, wave }; },
      reseat() { if (!people.length) return; spots.delete(ctx.boatId()); const sp = findSpots(ctx.boatId()); people.forEach((p, i) => { p.userData.base = (sp[i] || sp[0]).clone(); }); },
      tick() { if (!people.length) return; const t = performance.now() / 1000;
        people.forEach((p, i) => { const u = t - t0 - p.userData.t, b = p.userData.base;
          if (leaving) { const v = Math.min(1, (t - leaving.t - i * 0.15) / 0.5); if (v <= 0) return; p.position.set(b.x, b.y + Math.sin(v * Math.PI) * 1.2, b.z + v * 2.2 * (i % 2 ? 1 : -1)); p.scale.setScalar(Math.max(0.001, (1 - v) * BIG)); return; }
          const k = Math.min(1, Math.max(0, u / 0.45)); // (hopping aboard)
          p.scale.setScalar(Math.max(0.001, k * BIG)); p.position.set(b.x, b.y + Math.sin(k * Math.PI) * 0.8 + Math.sin(t * 2 + p.userData.ph) * 0.02, b.z);
          p.rotation.z = Math.sin(t * 1.3 + p.userData.ph) * 0.04; });
        if (leaving && t - leaving.t > 0.5 + people.length * 0.15) { clear(); leaving = null; } },
    };
  })();

  return { openBoard, moored, bump, tick: (dt = 0, speed = 0, amp = 1) => { ride(dt, speed, amp); deck.tick(); }, boatChanged: () => deck.reseat(), get trip() { return trip; } };
}
