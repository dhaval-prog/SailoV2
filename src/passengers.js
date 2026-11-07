// Passenger trips: moor at any Paradise Station and a few people are waiting there for a ride to another one. Take a
// group aboard (as many as your boat has seats), the course to their station is pinned, and when you moor there they
// step off and pay: the fare, plus a tip if you made it in time (less when late, never under half).
// Signed in, the server sets every fare and deadline and pays only when you're moored at the destination
// (migration …_sailov2_passenger_trips: ride_board / ride_finish); signed out it all stays on this device.
import { RIDES } from './world-config.js';
import { rpc } from './econ.js';
import './passengers.css';

const MILE = 1609.344, SAVE = 'sailo:ride';
const NAMES = ['Priya', 'Arjun', 'Meera', 'Rohan', 'Ananya', 'Kabir', 'Isha', 'Vikram', 'Sana', 'Dev', 'Tara', 'Neel', 'Aisha', 'Kiran', 'Zoya', 'Aarav',
  'Riya', 'Omkar', 'Leela', 'Farhan', 'Nisha', 'Siddharth', 'Gauri', 'Yusuf', 'Pooja', 'Rahul', 'Maya', 'Imran', 'Diya', 'Aditya'];
const GROUP = ['and a friend', 'and family', 'and crew'];
const SHIRTS = ['#e8604c', '#3d7bd9', '#f2b636', '#5fb37a', '#b76bd6', '#ef8fb0', '#2fb3b0', '#f08a3c'], SKIN = ['#f1c7a5', '#d9a47c', '#b9805a', '#8d5a3b', '#f5d6bd'];
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rand = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const stName = st => st.id === 'home' ? 'Paradise Station' : st.at;
/** The fare the server will set (shown on the board). */
export const fareFor = (metres, seats) => Math.round(Math.max(RIDES.minFare, metres / MILE * RIDES.perMile) * (1 + RIDES.groupBonus * (seats - 1)));
const deadlineSecs = (metres, boat) => metres / (RIDES.kn[boat] / 1.944) * RIDES.deadlineSlack + RIDES.deadlineExtra;
const mmss = s => { s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** ctx: { THREE, chartId, stations(), here() (the station you're nearest), home, boat, boatId(), seats?, docked(), pinCourse(x, z),
 *  station (station.js: econCall, isServer, toast, earnLocal) } */
export function createPassengers(ctx) {
  const { THREE, station } = ctx, toast = m => station.toast(m);
  let trip = null, offset = 0, busy = false; // (offset: server clock minus ours)
  const now = () => Date.now() + offset;
  const seatsOf = () => RIDES.seats[ctx.boatId()] || 1;
  const stationById = id => ctx.stations().find(s => s.id === id);

  // ---------- who's waiting: a few groups, the same while you're moored (they change every ten minutes) ----------
  function offers(st) {
    const r = rand(hash(`${ctx.chartId}:${st.id}:${Math.floor(Date.now() / 600000)}`));
    const others = ctx.stations().filter(s => s.id !== st.id).map(s => ({ s, d: Math.hypot(s.x - st.x, s.z - st.z) })).filter(o => o.d > 0.3 * MILE);
    const near = others.filter(o => o.d < 6 * MILE), pool = (near.length >= 3 ? near : others).sort(() => r() - 0.5);
    return pool.slice(0, 3).map((o, i) => { const k = r(), seats = k < 0.55 ? 1 : k < 0.85 ? 2 : k < 0.95 ? 3 : 4 + Math.floor(r() * 3);
      const name = NAMES[Math.floor(r() * NAMES.length)], who = seats === 1 ? name : `${name} ${GROUP[Math.floor(r() * GROUP.length)]}`;
      return { key: `${st.id}:${o.s.id}:${i}`, from: st, to: o.s, dist: o.d, seats, name, who, fare: fareFor(o.d, seats), shirt: SHIRTS[Math.floor(r() * SHIRTS.length)] }; });
  }

  // ---------- the board (a card over the pier) ----------
  const board = document.createElement('div'); board.className = 'px-modal'; board.hidden = true; board.setAttribute('role', 'dialog'); board.setAttribute('aria-modal', 'true'); board.setAttribute('aria-label', 'Passengers');
  document.body.appendChild(board);
  board.addEventListener('click', e => { if (e.target === board) closeBoard(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !board.hidden) closeBoard(); });
  function openBoard() { paintBoard(); board.hidden = false; requestAnimationFrame(() => board.classList.add('open')); }
  function closeBoard() { board.classList.remove('open'); setTimeout(() => { if (!board.classList.contains('open')) board.hidden = true; }, 220); }
  function paintBoard() {
    const st = ctx.here(), cap = seatsOf(), list = offers(st);
    const tripHtml = trip ? `<div class="px-trip"><div><b>${esc(trip.who || trip.passenger)}</b> is aboard<small>to ${esc(stName(stationById(trip.to) || { at: trip.to }))} · ${(trip.dist / MILE).toFixed(1)} mi · ${trip.fare}c</small></div>
      <button type="button" class="px-ghost" data-act="cancel">Cancel trip</button></div>` : '';
    const rows = list.map((o, i) => { const tooBig = o.seats > cap, blocked = !!trip || tooBig;
      return `<div class="px-row${blocked ? ' off' : ''}"><span class="px-av" style="background:${o.shirt}">${esc(o.name[0])}</span>
        <div class="px-main"><b>${esc(o.who)}</b><small>to ${esc(stName(o.to))} · ${(o.dist / MILE).toFixed(1)} mi</small>
          <span class="px-seats" aria-label="${o.seats} seat${o.seats === 1 ? '' : 's'}">${'<i></i>'.repeat(Math.min(o.seats, 6))}${tooBig ? `<em>Needs ${o.seats} seats</em>` : ''}</span></div>
        <div class="px-side"><span class="px-fare">${o.fare}c</span><button type="button" class="px-gold" data-i="${i}" ${blocked ? 'disabled' : ''}>Take</button></div></div>`; }).join('');
    board.innerHTML = `<div class="px-card"><header><div><h2>Passengers</h2><p>${esc(stName(st))} · your ${ctx.boatId() === 'sail' ? 'sail boat' : ctx.boatId()} seats ${cap}</p></div>
      <button type="button" class="px-x" data-act="close" aria-label="Close"><svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7 7 17"/></svg></button></header>
      ${tripHtml}<div class="px-list">${rows || '<p class="px-none">Nobody’s waiting here right now.</p>'}</div>
      <p class="px-hint">${trip ? 'Drop off your passengers first.' : 'Sail them to their station before the time runs out for a tip.'}</p></div>`;
    board.querySelector('[data-act="close"]').onclick = closeBoard;
    board.querySelector('[data-act="cancel"]')?.addEventListener('click', cancelTrip);
    board.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => take(list[+b.dataset.i])));
  }

  // ---------- taking a group aboard ----------
  async function take(o) {
    if (busy || trip) return; busy = true;
    try {
      const boat = ctx.boatId(), home = ctx.home;
      if (station.isServer()) {
        const t = await rpc('ride_board', { p_chart: ctx.chartId, p_to: o.to.id, p_passenger: o.who, p_seats: o.seats, p_boat: boat, p_home_x: home.x, p_home_z: home.z });
        setTrip({ ...t, who: o.who, shirt: o.shirt, server: true });
      } else setTrip({ id: 'local', from: o.from.id, to: o.to.id, passenger: o.who, who: o.who, shirt: o.shirt, seats: o.seats, boat, dist: o.dist, fare: o.fare,
        started: new Date().toISOString(), deadline: new Date(Date.now() + deadlineSecs(o.dist, boat) * 1000).toISOString(), now: new Date().toISOString(), server: false });
      closeBoard(); deck.board(trip.seats, trip.shirt);
      const to = o.to; ctx.pinCourse(to.x + 70, to.z + 80);
      toast(`${o.name} ${o.seats > 1 ? `(+${o.seats - 1}) are` : 'is'} aboard. Sail to ${stName(to)}: the course is pinned.`);
    } catch (e) { toast(niceErr(e)); paintBoard(); }
    finally { busy = false; }
  }
  const NICE = { not_docked: 'Moor at the pier first.', trip_active: 'You already have passengers aboard.', too_many_seats: 'Your boat hasn’t the seats for them.',
    same_station: 'They’re already here!', no_such_station: 'That station isn’t on the chart yet. Try another.', too_close: 'That’s too close to ferry.' };
  const niceErr = e => NICE[e?.code] || NICE[String(e?.message)] || e?.message || 'The harbour didn’t answer. Try again?';
  async function cancelTrip() {
    if (!trip || busy) return; busy = true;
    try { if (trip.server) await rpc('ride_cancel', {}); const n = trip.passenger; setTrip(null); deck.alight(false); ctx.clearCourse?.(); toast(`${n.split(' ')[0]} waved goodbye. Trip cancelled.`); }
    catch (e) { toast(niceErr(e)); }
    finally { busy = false; paintBoard(); }
  }

  // ---------- arriving: moored at their station ----------
  async function moored(st) {
    if (!trip) return;
    if (st.id !== trip.to) { toast(`${trip.passenger.split(' ')[0]} is headed for ${stName(stationById(trip.to) || { at: trip.to })}.`); return; }
    if (busy) return; busy = true;
    try {
      let paid, tip, onTime;
      if (trip.server) { const r = await station.econCall('ride_finish', { p_chart: ctx.chartId }); paid = r.paid; tip = r.tip; onTime = r.onTime; }
      else { onTime = now() <= Date.parse(trip.deadline); if (onTime) { tip = Math.round(trip.fare * RIDES.tip); paid = trip.fare + tip; }
        else { const span = Math.max(1, Date.parse(trip.deadline) - Date.parse(trip.started)), late = (now() - Date.parse(trip.deadline)) / span; tip = 0; paid = Math.max(Math.round(trip.fare * RIDES.lateFloor), Math.round(trip.fare * (1 - late))); }
        station.earnLocal(paid); }
      const n = trip.passenger.split(' ')[0]; setTrip(null); deck.alight(true);
      ctx.celebrate?.(paid);
      toast(onTime ? `${n} paid ${paid}c (${tip}c tip for arriving on time). ★★★★★` : `${n} paid ${paid}c. A little late, but they made it.`);
      try { navigator.vibrate?.([12, 40, 18]); } catch { /* not allowed */ }
    } catch (e) { toast(e?.code === 'too_fast' ? 'Hmm, that was quicker than any boat. No fare.' : niceErr(e)); }
    finally { busy = false; }
  }

  // ---------- the trip chip (top of the screen) ----------
  const chip = document.createElement('button'); chip.type = 'button'; chip.className = 'px-chip'; chip.hidden = true; chip.setAttribute('aria-label', 'Passenger trip');
  document.body.appendChild(chip);
  chip.onclick = () => { if (!trip) return; const to = stationById(trip.to); if (to && !ctx.docked()) { ctx.pinCourse(to.x + 70, to.z + 80); toast(`Course pinned to ${stName(to)}.`); } };
  const paintChip = () => {
    chip.hidden = !trip; if (!trip) return; const to = stationById(trip.to), p = ctx.boatPos(), left = (Date.parse(trip.deadline) - now()) / 1000;
    const d = to ? Math.hypot(to.x - p.x, to.z - p.z) / MILE : trip.dist / MILE;
    chip.classList.toggle('late', left < 0); chip.classList.toggle('soon', left >= 0 && left < 60);
    chip.innerHTML = `<span class="px-chip-av" style="background:${trip.shirt || '#3d7bd9'}">${esc(trip.passenger[0])}</span><span><b>${esc(trip.passenger.split(' ')[0])}${trip.seats > 1 ? ` +${trip.seats - 1}` : ''}</b> → ${esc(to ? stName(to) : trip.to)}</span>
      <span class="px-chip-m">${d.toFixed(1)} mi</span><span class="px-chip-t">${left < 0 ? `late ${mmss(-left)}` : mmss(left)}</span>`;
  };
  setInterval(paintChip, 1000);

  // ---------- keeping the trip (the server's copy wins; guests keep it here) ----------
  function setTrip(t) {
    trip = t; if (t?.now) offset = Date.parse(t.now) - Date.now();
    try { if (t) localStorage.setItem(SAVE, JSON.stringify({ ...t, chart: ctx.chartId })); else localStorage.removeItem(SAVE); } catch { /* storage blocked */ }
    paintChip();
  }
  (async () => {
    let local = null; try { local = JSON.parse(localStorage.getItem(SAVE)); } catch { /* none */ }
    if (station.isServer() || await station.serverReady?.()) {
      try { const t = await rpc('ride_get', {}); if (t && t.chart === ctx.chartId) { setTrip({ ...t, who: local?.who, shirt: local?.shirt, server: true }); deck.board(t.seats, trip.shirt, true); } else setTrip(null); }
      catch { if (local?.server && local.chart === ctx.chartId) { trip = local; paintChip(); deck.board(local.seats, local.shirt, true); } }
    } else if (local && !local.server && local.chart === ctx.chartId) { setTrip(local); deck.board(local.seats, local.shirt, true); }
  })();

  // ---------- the passengers on deck: little figures, standing where the deck is flat and low ----------
  const deck = (() => {
    const g = new THREE.Group(); g.name = 'passengers'; ctx.boat.add(g);
    const body = new THREE.CylinderGeometry(0.2, 0.26, 0.82, 8), head = new THREE.SphereGeometry(0.19, 10, 8), leg = new THREE.CylinderGeometry(0.09, 0.09, 0.62, 6);
    const legM = new THREE.MeshStandardMaterial({ color: '#2f3a4d', roughness: 0.9 });
    const spots = new Map(); let people = [], leaving = null, t0 = 0;
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
          if (leaving) { const v = Math.min(1, (t - leaving.t - i * 0.15) / 0.5); if (v <= 0) return; p.position.set(b.x, b.y + Math.sin(v * Math.PI) * 1.2, b.z + v * 2.2 * (i % 2 ? 1 : -1)); p.scale.setScalar(Math.max(0.001, 1 - v)); return; }
          const k = Math.min(1, Math.max(0, u / 0.45)); // (hopping aboard)
          p.scale.setScalar(Math.max(0.001, k)); p.position.set(b.x, b.y + Math.sin(k * Math.PI) * 0.8 + Math.sin(t * 2 + p.userData.ph) * 0.02, b.z);
          p.rotation.z = Math.sin(t * 1.3 + p.userData.ph) * 0.04; });
        if (leaving && t - leaving.t > 0.5 + people.length * 0.15) { clear(); leaving = null; } },
    };
  })();

  return { openBoard, moored, tick: () => deck.tick(), boatChanged: () => deck.reseat(), get trip() { return trip; } };
}
