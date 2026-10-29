// Paradise Station: the harbour island from Paradise_Station_offline.html, placed out at sea.
// - The island is built in code exactly as in the source file (station-island.js): same look, crabs,
//   swaying palms, waving flags, blinking beacon, lanterns and shore foam.
// - The source scene was built for a tug at 60% scale, so the island is scaled up by 1/0.6 to fit ours.
// - Sailing near it offers "Sail into port": pick a berth, the tug moors itself, and the Fish Market
//   (sell your catch for coins) and Boathouse (buy fuel) open. "Cast off" sails back out.
// - Economy (coins, fuel, fish hold) lives here and is saved in localStorage.

import { buildIsland } from './station-island.js';
import { CHART, WORLD, project, formatOffset } from './world.js';
import { regionAt, regionName } from './regions.js';
import { MORE_FISH, buildSpecies } from './fish-species.js';
import { MORE_FISH_2, RENAMES } from './fish-species-2.js';
import './station.css';

const MILE = 1609.344;
// Where the station sits: Pune Paradise keeps its original spot (3.7 mi W, 1.1 mi S of the harbour);
// other cities put it at a real harbour / marina found for the chart (harbour.js), kept clear of the
// centre (where boats start) and of the ocean's edge.
const spot = (() => { const st = CHART.station; if (!st) return { x: -3.7 * MILE, z: 1.1 * MILE };
  let [x, z] = project(st.lat, st.lng); const d = Math.hypot(x, z), lim = WORLD.half - 1500;
  if (d < 900) { if (d < 1) { x = -900; z = 0; } else { x *= 900 / d; z *= 900 / d; } }
  return { x: Math.max(-lim, Math.min(lim, x)), z: Math.max(-lim, Math.min(lim, z)) }; })();
export const STATION = { name: 'Paradise Station', at: CHART.station?.name || '', ...spot, where: formatOffset(spot.x, spot.z) };
const K = 1 / 0.6;           // island scale (source tug was 0.6x)
const NEAR = 260;            // metres: "Sail into port" offered inside this range
const SHOW = 2200;           // metres: island drawn inside this range

// ---- fish, prices and the economy (values from the station file) ----
export const FISH = [
  { id: 'sardine', name: 'Sardine', price: 4, kg: 0.12, len: 0.55, h: 0.2, w: 0.1, back: '#245c6e', side: '#b8c9d3', belly: '#f3f6f7', fin: '#8aa4b2', pat: 'spots', odds: 24 },
  { id: 'mackerel', name: 'Mackerel', price: 9, kg: 0.45, len: 0.8, h: 0.22, w: 0.13, back: '#1c5652', side: '#a7c0c4', belly: '#f4f4ee', fin: '#55767a', pat: 'bars', odds: 20 },
  { id: 'snapper', name: 'Red Snapper', price: 16, kg: 1.6, len: 0.82, h: 0.36, w: 0.14, back: '#b02c24', side: '#e8735f', belly: '#fbd6c8', fin: '#d4473a', pat: 'none', hump: 0.18, odds: 14 },
  { id: 'puffer', name: 'Pufferfish', price: 24, kg: 0.9, len: 0.6, h: 0.5, w: 0.48, back: '#7b6a38', side: '#d8c88a', belly: '#f7f2e0', fin: '#c0a865', pat: 'dots', puffer: true, odds: 9 },
  { id: 'tuna', name: 'Yellowfin Tuna', price: 42, kg: 8.5, len: 1.25, h: 0.32, w: 0.24, back: '#142c58', side: '#9fb2c6', belly: '#eef2f4', fin: '#f0c128', pat: 'tuna', odds: 5 },
  { id: 'cod', name: 'Cod', price: 14, kg: 3.5, len: 1.0, h: 0.28, w: 0.2, back: '#6b6a3e', side: '#b8b27f', belly: '#efece0', fin: '#7d7a4c', pat: 'speckle', barbel: true, odds: 6 },
  { id: 'flounder', name: 'Flounder', price: 12, kg: 1.2, len: 0.75, h: 0.5, w: 0.07, back: '#7a5f3e', side: '#9c8058', belly: '#f2ebdf', fin: '#8a6e48', pat: 'speckle', flat: true, odds: 7 },
  { id: 'barracuda', name: 'Barracuda', price: 35, kg: 6, len: 1.45, h: 0.2, w: 0.15, back: '#3c5a6e', side: '#c3ced6', belly: '#f2f5f6', fin: '#4a6272', pat: 'barra', odds: 4 },
  { id: 'mahi', name: 'Mahi-Mahi', price: 48, kg: 9, len: 1.3, h: 0.4, w: 0.16, back: '#1d8f6a', side: '#9fd148', belly: '#ffe14a', fin: '#2a9fd8', pat: 'mahi', hump: 0.3, odds: 3 },
  { id: 'swordfish', name: 'Swordfish', price: 95, kg: 65, len: 1.7, h: 0.36, w: 0.26, back: '#2b3448', side: '#7c8696', belly: '#d7dbe2', fin: '#3a4256', pat: 'none', bill: 0.65, odds: 1 },
  { id: 'sailfish', name: 'Sailfish', price: 120, kg: 45, len: 1.65, h: 0.3, w: 0.2, back: '#142d6e', side: '#7f97c4', belly: '#e9eef6', fin: '#22418f', pat: 'sail', bill: 0.5, sail: true, odds: 0.5 },
  { id: 'permit', name: 'Permit', price: 55, kg: 8, len: 0.95, h: 0.62, w: 0.15, back: '#5f6e7a', side: '#d6dde2', belly: '#f3f2ea', fin: '#3c4652', pat: 'none', hump: 0.12, odds: 2.5 },
  { id: 'johndory', name: 'John Dory', price: 32, kg: 2.5, len: 0.8, h: 0.62, w: 0.12, back: '#8a7a4e', side: '#cbbf93', belly: '#ece4c8', fin: '#7d6c40', pat: 'dory', odds: 4 },
  // regional species: only caught in their own waters (where), so travelling fills the collection
  { id: 'pomfret', name: 'Silver Pomfret', price: 28, kg: 0.6, len: 0.6, h: 0.55, w: 0.09, back: '#8d9aa6', side: '#d9dee3', belly: '#f6f7f8', fin: '#aab4bd', pat: 'none', hump: 0.1, odds: 8, where: 'arabian' },
  { id: 'kingfish', name: 'Kingfish (Surmai)', price: 38, kg: 6, len: 1.35, h: 0.2, w: 0.14, back: '#2d4d6a', side: '#b9c7d2', belly: '#f1f4f6', fin: '#3e5a72', pat: 'spots', odds: 5, where: 'arabian' },
  { id: 'hilsa', name: 'Hilsa', price: 22, kg: 1.1, len: 0.75, h: 0.28, w: 0.12, back: '#5b6f8a', side: '#c9d2dc', belly: '#f4f5f7', fin: '#8193a8', pat: 'none', hump: 0.08, odds: 6, where: 'arabian' },
  { id: 'yellowtail', name: 'Yellowtail', price: 40, kg: 5, len: 1.1, h: 0.26, w: 0.17, back: '#3a5a7a', side: '#c4d0da', belly: '#f2f4f5', fin: '#f2c43a', pat: 'tuna', odds: 6, where: 'westpac' },
  { id: 'seabream', name: 'Red Sea Bream', price: 30, kg: 1.5, len: 0.72, h: 0.4, w: 0.13, back: '#d86a78', side: '#f2a9ad', belly: '#fde6e3', fin: '#e07f87', pat: 'mahi', hump: 0.2, odds: 8, where: 'westpac' },
  { id: 'salmon', name: 'Atlantic Salmon', price: 45, kg: 4.5, len: 1.0, h: 0.26, w: 0.17, back: '#465a6e', side: '#d8c4c2', belly: '#fbeee9', fin: '#5b6c7e', pat: 'speckle', odds: 8, where: 'north' },
  { id: 'halibut', name: 'Halibut', price: 60, kg: 20, len: 1.3, h: 0.62, w: 0.09, back: '#5b5040', side: '#7a6c56', belly: '#f2efe8', fin: '#6a5d48', pat: 'speckle', flat: true, odds: 3, where: 'north' },
  { id: 'seabass', name: 'European Sea Bass', price: 26, kg: 2, len: 0.85, h: 0.26, w: 0.15, back: '#55687a', side: '#c7d0d8', belly: '#f3f5f6', fin: '#6d7f90', pat: 'none', odds: 9, where: 'atlantic' },
  { id: 'redmullet', name: 'Red Mullet', price: 18, kg: 0.4, len: 0.55, h: 0.2, w: 0.12, back: '#c2563f', side: '#ec9a7d', belly: '#fbe2d4', fin: '#e38a6d', pat: 'none', barbel: true, odds: 10, where: 'atlantic' },
  { id: 'reddrum', name: 'Red Drum', price: 30, kg: 4, len: 1.0, h: 0.28, w: 0.17, back: '#9c6a3c', side: '#d6a873', belly: '#f6eadb', fin: '#a87a4b', pat: 'none', odds: 8, where: 'americas' },
  { id: 'stripedbass', name: 'Striped Bass', price: 34, kg: 5, len: 1.05, h: 0.28, w: 0.17, back: '#4e5e6c', side: '#cfd6dc', belly: '#f4f5f6', fin: '#62707c', pat: 'stripes', odds: 7, where: 'americas' },
  { id: 'barramundi', name: 'Barramundi', price: 50, kg: 6, len: 1.1, h: 0.32, w: 0.18, back: '#6d7a6a', side: '#d3d8cc', belly: '#f3f3ec', fin: '#7c7f6a', pat: 'none', hump: 0.12, odds: 7, where: 'southern' },
  // sharks, rays, oddballs and freshwater fish (fish-species.js)
  ...MORE_FISH,
  // Indian freshwater, deep-sea, reef and lagoon, river and lake, and odd-shaped fish (fish-species-2.js)
  ...MORE_FISH_2,
];
FISH.forEach(f => { if (RENAMES[f.id]) f.name = RENAMES[f.id]; });
/** This chart's ocean region (decides the local fish). */
export const REGION = regionAt(CHART.lat, CHART.lng);
const WARM = new Set(['puffer', 'tuna', 'barracuda', 'mahi', 'swordfish', 'sailfish', 'permit', 'snapper']), COLD = new Set(['cod', 'flounder']);
/** How likely a species is here: regional fish only in their own waters; warm-water fish are scarce
 *  in cold northern seas, where cod and flounder are commoner (and rarer in the tropics). */
export const localOdds = f => { const r = REGION.id; if (f.where) return f.where === r ? f.odds : 0;
  if (f.warm) return f.odds * (r === 'north' ? 0.15 : 1); // reef and lagoon fish: scarce in cold seas
  if (f.cold) return f.odds * (r === 'arabian' || r === 'westpac' ? 0.4 : r === 'north' ? 2 : 1);
  if (WARM.has(f.id)) return f.odds * (r === 'north' ? 0.15 : 1);
  if (COLD.has(f.id)) return f.odds * (r === 'north' ? 3 : r === 'arabian' || r === 'westpac' ? 0.5 : 1);
  return f.odds; };
/** Where a species can be caught, for the collection. */
export const fishWhere = f => f.where ? regionName(f.where) : 'All seas';
const SAVE = 'sailo:economy', FUEL_PRICE = 2;
// each boat has its own tank, hold and top speed; burn = engine use per metre relative to the tug
export const BOAT_SPECS = {
  tug: { fuel: 120, hold: 30, kn: 12, burn: 1 },
  sail: { fuel: 60, hold: 16, kn: 15, burn: 0.45 },
  yacht: { fuel: 240, hold: 45, kn: 22, burn: 1.9 },
  dinghy: { fuel: 20, hold: 8, kn: 9, burn: 0.25 },
};
const load = () => { try { return JSON.parse(localStorage.getItem(SAVE)) || {}; } catch { return {}; } };
const saved = load();
// coins are shared; fuel and the fish hold belong to each boat (older saves move onto the tug)
export const S = { coins: saved.coins ?? 60, active: saved.active || 'tug', boats: saved.boats || { tug: { fuel: saved.fuel ?? 120, hold: saved.hold || {} } } };
Object.keys(BOAT_SPECS).forEach(id => { S.boats[id] = Object.assign({ fuel: BOAT_SPECS[id].fuel, hold: {} }, S.boats[id]); S.boats[id].fuel = Math.min(BOAT_SPECS[id].fuel, S.boats[id].fuel); });
if (!BOAT_SPECS[S.active]) S.active = 'tug';
// S.fuel, S.cap and S.hold always mean the active boat's
Object.defineProperties(S, {
  fuel: { get: () => S.boats[S.active].fuel, set: v => { S.boats[S.active].fuel = v; }, enumerable: false },
  cap: { get: () => BOAT_SPECS[S.active].fuel, enumerable: false },
  hold: { get: () => S.boats[S.active].hold, enumerable: false },
  holdCap: { get: () => BOAT_SPECS[S.active].hold, enumerable: false },
});
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify({ coins: S.coins, active: S.active, boats: S.boats })); } catch { /* storage blocked */ } };
const holdCount = () => FISH.reduce((a, f) => a + (S.hold[f.id] || 0), 0);
/** Fuel and hold for any boat, for the Garage. */
export const boatStatus = id => { const b = S.boats[id], sp = BOAT_SPECS[id]; return { fuel: b.fuel, cap: sp.fuel, fish: FISH.reduce((a, f) => a + (b.hold[f.id] || 0), 0), holdCap: sp.hold, kn: sp.kn }; };

// the source island outline (same seed, same maths) for collisions
const islandOutline = () => {
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const IC = { x: -6, z: -3 }, pts = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = 15 * (1 + 0.1 * Math.sin(3 * a + 0.7) + 0.07 * Math.sin(5 * a + 2) + (rnd() - 0.5) * 0.07); pts.push([IC.x + Math.cos(a) * r * 1.15, IC.z + Math.sin(a) * r]); }
  return { IC, pts };
};
const inPoly = (pts, x, z) => { let c = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const [xi, zi] = pts[i], [xj, zj] = pts[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };

export function initStation(ctx) {
  const { THREE, stage, M, WL, waveJS, toScreen } = ctx;
  const V3 = THREE.Vector3;
  const O = new V3(STATION.x, WL, STATION.z);
  const toW = (x, z) => new V3(O.x + x * K, 0, O.z + z * K);             // station-local -> world (xz)
  const toL = (x, z) => [(x - O.x) / K, (z - O.z) / K];                  // world -> station-local

  // ---------- collisions (station-local units) ----------
  const { IC, pts: isl } = islandOutline();
  const PZ = 1, W = 3.4, hw = W / 2, BZ = PZ + 13;
  let edgeX = IC.x; while (inPoly(isl, edgeX + 0.1, PZ)) edgeX += 0.1;
  const xa0 = edgeX - 3, xa1 = edgeX + 14, hx0 = edgeX - 2.4, hx1 = edgeX + 2.4, hzN = PZ - 5.4;
  const grow = (p, d) => { const dx = p[0] - IC.x, dz = p[1] - IC.z, l = Math.hypot(dx, dz); return [p[0] + dx / l * d, p[1] + dz / l * d]; };
  const BOAT_R = 4.2 / K; // boat half-length-ish clearance, in local units
  const shore = isl.map(p => grow(p, 2.6 + BOAT_R));
  const rects = [[xa0, PZ - hw - 0.4, xa1 + 0.4, PZ + hw + 0.4], [xa1 - W - 0.4, PZ, xa1 + 0.4, BZ + 0.4], [hx0, hzN, hx1, PZ]];
  const stacks = [[-27, 9, 3.4], [16, -17, 3.4]];
  const blockedL = (x, z) => inPoly(shore, x, z)
    || rects.some(([a, b, c, d]) => x > a - BOAT_R && x < c + BOAT_R && z > b - BOAT_R && z < d + BOAT_R)
    || stacks.some(([sx, sz, r]) => Math.hypot(x - sx, z - sz) < r + BOAT_R);
  /** Would a boat at this world position hit the island, pier or rocks? */
  const blocked = (x, z) => { if (Math.abs(x - O.x) > 140 || Math.abs(z - O.z) > 140) return false; const [lx, lz] = toL(x, z); return blockedL(lx, lz); };

  // ---------- berths (from the station file, in local units) ----------
  const SEA0 = [edgeX + 30, PZ + 30];
  const BERTHS = [
    { name: 'Berth 1', pos: [edgeX + 3.9, PZ + 3.6], yaw: Math.PI, side: 1, via: [[edgeX + 17, PZ + 21], [edgeX + 5.5, PZ + 14], [edgeX + 3.6, PZ + 8]] },
    { name: 'Berth 2', pos: [xa1 + 1.95, PZ + 2.2], yaw: Math.PI / 2, side: -1, via: [[edgeX + 24, PZ + 20], [xa1 + 3, PZ + 12], [xa1 + 2.2, PZ + 7]] },
    { name: 'Berth 3', pos: [xa1 + 1.95, PZ + 9.4], yaw: Math.PI / 2, side: -1, via: [[edgeX + 24, PZ + 22], [xa1 + 2.6, PZ + 15]] },
    { name: 'Berth 4', pos: [xa1 - hw, BZ + 1.95], yaw: Math.PI, side: 1, via: [[edgeX + 26, PZ + 21], [xa1 + 5, BZ + 2.4]] },
  ];

  // ---------- island model ----------
  const root = new THREE.Group(); root.name = 'paradise_station'; root.position.copy(O); root.scale.setScalar(K); root.visible = false; stage._scene.add(root);
  // built the first time the boat heads towards the station
  let island = null, ready = false;
  const build = () => { island = buildIsland({ THREE, M, scale: K, waveAt: (x, z, t) => waveJS(O.x + x * K, O.z + z * K, t) / K }); root.add(island.root); ready = true; };


  // ---------- DOM: wallet, dock bar, markers, toast, shop modal ----------
  const ui = document.createElement('div'); ui.className = 'stn'; document.body.appendChild(ui);
  ui.innerHTML = `
    <div class="stn-wallet" id="stn-wallet"><span class="pill" id="coins"><span class="coin"></span><span id="coinN">0</span></span><span class="pill" id="fuelPill"><span class="fuelbar"><i id="fuelFill"></i></span><span id="fuelN">0 L</span></span></div>
    <div class="hud bc stn-bar" id="stn-bar" hidden><div><div class="dc-title">Paradise Station</div><div class="dc-sub" id="dockSub"></div></div><button class="btn" id="sailBtn"></button></div>
    <button class="marker locked" id="mk-market" hidden><span class="mk"><span class="mk-name">Fish Market</span><span class="mk-sub">Sell your catch</span></span></button>
    <button class="marker locked" id="mk-boathouse" hidden><span class="mk"><span class="mk-name">Boathouse</span><span class="mk-sub">Refuel · boat inventory</span></span></button>
    <div id="toast"></div>
    <div class="modal" id="stn-modal" hidden><div class="card" id="card"></div></div>`;
  const $ = id => ui.querySelector('#' + id) || document.getElementById(id); // (the wallet lives in the HUD's top-left block)
  BERTHS.forEach((b, i) => { b.el = document.createElement('button'); b.el.className = 'marker berth'; b.el.hidden = true;
    b.el.innerHTML = `<span class="mk"><span class="mk-name">${b.name}</span><span class="mk-sub">Moor here</span></span>`; b.el.onclick = () => startDocking(i); ui.appendChild(b.el); });
  let toastT; const toast = msg => { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2800); };
  const bump = id => { const el = $(id); el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); };
  const renderWallet = () => { const f = S.fuel / S.cap; $('coinN').textContent = S.coins; $('fuelN').textContent = `${Math.round(S.fuel)} L`; $('fuelPill').title = `Fuel ${Math.round(S.fuel)} of ${S.cap} L`;
    $('fuelFill').style.width = (f * 100) + '%'; $('fuelFill').classList.toggle('mid', f < 0.35 && f >= 0.15); $('fuelFill').classList.toggle('low', f < 0.15); };

  // ---------- camera framing from the sea side, so the island never sits between camera and boat ----------
  const ICw = () => toW(IC.x, IC.z);
  const seaSide = (p, dist, up) => { const c = ICw(), d = new V3(p.x - c.x, 0, p.z - c.z); if (d.lengthSq() < 1) d.set(1, 0, 1); d.normalize(); return d.multiplyScalar(dist).setY(up); };
  const frame = (focus, dist, up, dur = 1.4) => ctx.camTo?.(focus, seaSide(focus, dist, up), dur);
  // ---------- docking ----------
  let mode = 'sea', berth = BERTHS[0], route = null, prog = 0, dur = 1, near = false, lastWarn = 0;
  const shops = [{ id: 'market', at: [-2, 3.5 + 1.57, -10] }, { id: 'boathouse', at: [(hx0 + hx1) / 2, 1.85 + 4.4, (PZ - 1.5 + hzN + 0.25) / 2] }];
  const worldAt = ([x, y, z]) => new V3(O.x + x * K, WL + y * K, O.z + z * K);
  const ropes = [0, 1].map(() => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), M('rope', '#e6cf9a')); m.visible = false; stage._scene.add(m); return m; });
  const renderBar = () => {
    const bar = $('stn-bar'), b = $('sailBtn'), sub = $('dockSub'), show = mode !== 'sea' || near;
    bar.hidden = !show; document.body.classList.toggle('stn-docked', mode !== 'sea' && mode !== 'picking');
    if (mode === 'sea') { b.textContent = 'Sail into port'; b.disabled = false; sub.textContent = 'Moor at the pier to open the shops'; }
    else if (mode === 'picking') { b.textContent = 'Cancel'; b.disabled = false; sub.textContent = 'Pick a berth along the pier'; }
    else if (mode === 'docking') { b.textContent = 'Mooring…'; b.disabled = true; sub.textContent = `Approaching ${berth.name}`; }
    else if (mode === 'docked') { b.textContent = 'Cast off'; b.disabled = false; sub.textContent = `Moored at ${berth.name} · shops open`; }
    else { b.textContent = 'Heading out…'; b.disabled = true; sub.textContent = 'Leaving the harbour'; }
    BERTHS.forEach(x => { x.el.hidden = mode !== 'picking'; });
    ['market', 'boathouse'].forEach(id => { $('mk-' + id).hidden = mode !== 'docked'; $('mk-' + id).classList.toggle('locked', mode !== 'docked'); });
  };
  // a path from where the boat is to a berth, swinging round the island if the island is in the way
  const routeTo = (bi, from) => {
    const b = BERTHS[bi], [fx, fz] = toL(from.x, from.z), pts = [[fx, fz]];
    const R = 32, ang = (x, z) => Math.atan2(z - IC.z, x - IC.x);
    const crosses = (a, c) => { for (let k = 1; k < 12; k++) { const u = k / 12; if (inPoly(isl.map(p => grow(p, 3)), a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u)) return true; } return false; };
    if (crosses(pts[0], SEA0)) { let a0 = ang(fx, fz); const a1 = ang(SEA0[0], SEA0[1]), d = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), n = Math.ceil(Math.abs(d) / 0.5);
      for (let k = 1; k < n; k++) { const a = a0 + d * k / n; pts.push([IC.x + Math.cos(a) * R * 1.15, IC.z + Math.sin(a) * R]); } }
    pts.push(SEA0, ...b.via, b.pos);
    return new THREE.CatmullRomCurve3(pts.map(([x, z]) => toW(x, z)));
  };
  function startDocking(i) {
    if (mode !== 'picking') return;
    berth = BERTHS[i]; route = routeTo(i, ctx.boatPos()); dur = THREE.MathUtils.clamp(route.getLength() / 5, 6, 30); prog = 0; mode = 'docking';
    ctx.onDockStart?.(); renderBar(); frame(ctx.boatPos().clone(), 40, 22, 1.6);
  }
  const castOff = () => { closePanel(); frame(ctx.boatPos().clone(), 40, 22, 1.4); const pts = [...berth.via].reverse(); route = new THREE.CatmullRomCurve3([berth.pos, ...pts, SEA0].map(([x, z]) => toW(x, z))); dur = THREE.MathUtils.clamp(route.getLength() / 5, 5, 20); prog = 0; mode = 'leaving'; renderBar(); };
  $('sailBtn').onclick = () => {
    if (mode === 'sea') { if (!ctx.canDock || ctx.canDock()) { mode = 'picking'; renderBar(); const pier = toW(xa1 - 4, PZ + 6); frame(new V3(pier.x, WL + 2, pier.z), 75, 55); } }
    else if (mode === 'picking') { mode = 'sea'; renderBar(); ctx.onDockEnd?.(); }
    else if (mode === 'docked') castOff();
  };
  ['market', 'boathouse'].forEach(id => { $('mk-' + id).onclick = () => openPanel(id); });

  // ---------- fish models + mini renderer for the shop windows (ported) ----------
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let seed2 = 7; const rnd2 = () => (seed2 = (seed2 * 16807) % 2147483647) / 2147483647;
  const UP = new V3(0, 1, 0);
  const fishShape = pts => { const s = new THREE.Shape(); pts.forEach(([x, y, cx, cy], i) => i ? (cx !== undefined ? s.quadraticCurveTo(cx, cy, x, y) : s.lineTo(x, y)) : s.moveTo(x, y)); s.closePath(); return new THREE.ShapeGeometry(s, 10); };
  function makeFish(f) {
    if (f.kind) return buildSpecies(THREE, f, { fishShape, ss, rnd2 }); // the newer species have their own body plans
    const g = new THREE.Group(), L = f.len, H = f.h, Wd = f.w;
    const geo = new THREE.SphereGeometry(1, 56, 28), p = geo.attributes.position, col = [], c = new THREE.Color();
    const cB = new THREE.Color(f.back), cS = new THREE.Color(f.side), cL = new THREE.Color(f.belly), dk = new THREE.Color('#0c2224'), gold = new THREE.Color('#e9c34a'), brown = new THREE.Color('#3a2c16');
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), u = (x + 1) / 2;
      const taper = f.puffer ? 1 : 0.3 + 0.7 * ss(0, 0.5, u), hump = y > 0 ? 1 + (f.hump || 0) * Math.sin(u * Math.PI) : 1;
      p.setXYZ(i, x * L / 2, y * taper * hump * H / 2, z * taper * Wd / 2);
      if (y > 0.15) c.lerpColors(cS, cB, ss(0.15, 0.75, y)); else c.lerpColors(cL, cS, ss(-0.6, 0.15, y));
      if (f.pat === 'bars' && y > 0.2 && Math.sin(x * 26 + Math.sin(y * 5 + z * 3) * 2.2) > 0.25) c.lerp(dk, 0.7);
      if (f.pat === 'spots' && y > 0.05 && y < 0.35 && x > -0.1 && Math.sin(x * 38) > 0.82) c.lerp(dk, 0.55);
      if (f.pat === 'tuna' && y > 0.1 && y < 0.28) c.lerp(gold, 0.55);
      if (f.pat === 'stripes' && y > -0.45 && Math.sin(y * 34) > 0.55) c.lerp(dk, 0.55); // striped bass: lines along the body
      if (f.pat === 'dots' && y > -0.15 && Math.sin(x * 22) * Math.sin(z * 22 + x * 5) > 0.55) c.lerp(brown, 0.7);
      if (f.pat === 'speckle' && y > -0.1 && Math.sin(x * 47 + z * 13) * Math.sin(y * 39 - z * 21) > 0.62) c.lerp(brown, 0.45); // cod, flounder
      if (f.pat === 'barra' && y > 0.05 && y < 0.6 && Math.sin(x * 19) > 0.55) c.lerp(dk, 0.55); // barracuda bars
      if (f.pat === 'barra' && y < 0.05 && y > -0.35 && Math.sin(x * 31 + y * 9) > 0.86) c.lerp(dk, 0.6); // and spots low on the flank
      if (f.pat === 'mahi' && y > -0.2 && Math.sin(x * 33 + z * 17) * Math.sin(y * 29) > 0.7) c.lerp(new THREE.Color('#2a6fd8'), 0.6); // blue flecks
      if (f.pat === 'sail' && y > -0.1 && y < 0.5 && Math.sin(x * 24) > 0.7) c.lerp(new THREE.Color('#5fb0ff'), 0.5); // sailfish blue bars
      if (f.pat === 'dory' && Math.hypot(x - 0.02, y) < 0.2 && Math.abs(z) > 0.3) c.copy(dk).lerp(c, 0.25); // John Dory's dark 'thumbprint' with a pale ring
      else if (f.pat === 'dory' && Math.hypot(x - 0.02, y) < 0.28 && Math.abs(z) > 0.3) c.lerp(new THREE.Color('#fff6d8'), 0.6);
      if (Math.abs(u - 0.78) < 0.012 && !f.puffer) c.multiplyScalar(0.6);
      if (u > 0.8) c.multiplyScalar(0.92);
      col.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); geo.computeVertexNormals();
    const bodyM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.28, metalness: 0.22 });
    const finM = new THREE.MeshStandardMaterial({ color: f.fin, roughness: 0.5, side: THREE.DoubleSide, transparent: true, opacity: 0.88 });
    g.add(new THREE.Mesh(geo, bodyM));
    const T = H * (f.id === 'tuna' ? 1.05 : 0.75), Lt = L * (f.puffer ? 0.16 : 0.22), fork = f.puffer ? -Lt * 1.35 : f.id === 'snapper' ? -Lt * 0.8 : -Lt * 0.45;
    const tail = new THREE.Mesh(fishShape([[L * 0.03, -0.06 * T], [-Lt, -T * 0.55], [-Lt, T * 0.55, fork, 0], [L * 0.03, 0.06 * T]]), finM); tail.name = 'tail'; tail.position.x = -L / 2 + L * 0.04; g.add(tail);
    if (!f.puffer) {
      const Hd = H * (f.id === 'snapper' ? 0.42 : f.id === 'johndory' ? 0.55 : f.id === 'mahi' ? 0.36 : f.flat ? 0.12 : 0.3);
      const dors = new THREE.Mesh(fishShape([[0.17 * L, 0], [0.07 * L, Hd], [-0.17 * L, 0.02, -0.04 * L, Hd * 0.55]]), finM); dors.position.y = H / 2 * 0.88 * (1 + (f.hump || 0)); g.add(dors);
      const anal = new THREE.Mesh(fishShape([[-0.05 * L, 0], [-0.14 * L, -Hd * 0.6], [-0.3 * L, -0.01, -0.22 * L, -Hd * 0.35]]), finM); anal.position.y = -H / 2 * 0.75; g.add(anal);
      [-1, 1].forEach(s => { const pec = new THREE.Mesh(fishShape([[0, 0], [-0.17 * L, -0.06 * H, -0.12 * L, 0.06 * H], [-0.02 * L, -0.05 * H]]), finM); pec.position.set(0.24 * L, -0.1 * H, s * Wd / 2 * 0.82); pec.rotation.y = s * 0.45; g.add(pec); });
      if (f.sail) { const sail = new THREE.Mesh(fishShape([[0.3 * L, 0], [0.22 * L, H * 1.5], [-0.05 * L, H * 1.25, 0.1 * L, H * 1.6], [-0.28 * L, 0.02]]), finM); sail.position.y = H / 2 * 0.85; g.add(sail); }
      if (f.flat) { const fr = new THREE.Mesh(fishShape([[0.32 * L, 0], [0, H * 0.18, 0.2 * L, H * 0.2], [-0.36 * L, 0, -0.2 * L, H * 0.16]]), finM); fr.position.y = H / 2 * 0.92; g.add(fr); } // flounder's fringe fins
      if (f.bill) { const bill = new THREE.Mesh(new THREE.ConeGeometry(H * 0.08, L * f.bill, 10), new THREE.MeshStandardMaterial({ color: f.back, roughness: 0.35, metalness: 0.2 })); bill.rotation.z = -Math.PI / 2; bill.position.set(L / 2 + L * f.bill / 2 - L * 0.04, H * 0.04, 0); g.add(bill); }
      if (f.barbel) { const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.002, H * 0.22, 5), finM); bb.position.set(L * 0.46, -H * 0.36, 0); g.add(bb); }
      if (f.id === 'tuna') for (let k = 0; k < 6; k++) [-1, 1].forEach(s => { const fl = new THREE.Mesh(fishShape([[0, 0], [-0.02 * L, s * 0.06 * H], [-0.04 * L, 0]]), finM); fl.position.set(-0.27 * L - k * 0.033 * L, s * H / 2 * (0.42 - k * 0.05), 0); g.add(fl); });
    } else {
      const spM = new THREE.MeshStandardMaterial({ color: '#efe3b8', roughness: 0.6 }), sp = new THREE.ConeGeometry(0.012, 0.06, 5);
      for (let k = 0; k < 90; k++) { const n = new V3(rnd2() * 2 - 1, rnd2() * 2 - 1, rnd2() * 2 - 1).normalize(); if (n.x < -0.8) continue; const m = new THREE.Mesh(sp, spM); m.position.set(n.x * L / 2, n.y * H / 2, n.z * Wd / 2); m.quaternion.setFromUnitVectors(UP, new V3(n.x / L, n.y / H, n.z / Wd).normalize()); g.add(m); }
    }
    const eR = H * (f.puffer ? 0.09 : 0.075), eyeX = L / 2 * 0.7, eyeZ = Wd / 2 * Math.sqrt(1 - 0.49) * (f.puffer ? 1 : 0.95);
    const iris = new THREE.MeshStandardMaterial({ color: f.puffer ? '#2f8a4a' : '#d9c98e', metalness: 0.5, roughness: 0.25 }), pupil = new THREE.MeshStandardMaterial({ color: '#050505', roughness: 0.05 });
    [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(eR, 16, 12), iris); e.position.set(eyeX, H * 0.08, s * eyeZ); g.add(e); const pp = new THREE.Mesh(new THREE.SphereGeometry(eR * 0.62, 14, 10), pupil); pp.position.set(eyeX + eR * 0.1, H * 0.08, s * (eyeZ + eR * 0.5)); g.add(pp); });
    return g;
  }
  function woodCanvas(w, h, base, planks, dark) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'), ph = h / planks;
    for (let p = 0; p < planks; p++) { const y0 = p * ph, tn = (rnd2() - 0.5) * 22;
      x.fillStyle = `rgb(${base.map(v => Math.max(0, Math.min(255, v + tn))).join(',')})`; x.fillRect(0, y0, w, ph);
      for (let k = 0; k < 30; k++) { const yy = y0 + rnd2() * ph, amp = 0.6 + rnd2() * 2.6, fr = 0.004 + rnd2() * 0.012, off = rnd2() * 100;
        x.strokeStyle = `rgba(${dark},${0.08 + rnd2() * 0.2})`; x.lineWidth = 0.5 + rnd2() * 1.5; x.beginPath();
        for (let xx = 0; xx <= w; xx += 6) { const yv = yy + Math.sin(xx * fr + off) * amp + Math.sin(xx * fr * 3.3 + off) * amp * 0.4; xx ? x.lineTo(xx, yv) : x.moveTo(xx, yv); } x.stroke(); }
      if (rnd2() < 0.55) { const kx = rnd2() * w, ky = y0 + ph * (0.3 + rnd2() * 0.4), gr = x.createRadialGradient(kx, ky, 0, kx, ky, ph * 0.28); gr.addColorStop(0, `rgba(${dark},.75)`); gr.addColorStop(1, `rgba(${dark},0)`); x.fillStyle = gr; x.beginPath(); x.ellipse(kx, ky, ph * 0.5, ph * 0.22, 0, 0, 6.3); x.fill(); }
      x.fillStyle = 'rgba(0,0,0,.5)'; x.fillRect(0, y0 + ph - 2, w, 2); x.fillStyle = 'rgba(255,255,255,.1)'; x.fillRect(0, y0, w, 1);
      const jx = rnd2() * w; x.fillStyle = 'rgba(0,0,0,.4)'; x.fillRect(jx, y0, 2, ph); x.fillStyle = 'rgba(30,20,10,.8)'; [jx - 10, jx + 12].forEach(nx => { x.beginPath(); x.arc(nx, y0 + ph * 0.3, 2.2, 0, 6.3); x.arc(nx, y0 + ph * 0.7, 2.2, 0, 6.3); x.fill(); });
    }
    return c;
  }
  // built lazily, the first time a shop opens
  let shopKit = null;
  const box3 = new THREE.Box3(), size3 = new V3(), mid3 = new V3();
  /** A fish's catalogue picture (a data URL), rendered the first time it's asked for and kept. */
  function picture(f) {
    if (f.img) return f.img;
    const k = kit(), T = k.thumb; if (!T.r) { T.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true }); T.r.setPixelRatio(1); T.r.setSize(240, 140, false); }
    const m = k.fishModels[f.id].clone();
    if (f.kind) { // the newer species: fit whatever shape they are (sharks, rays, seahorses) into the frame
      const holder = new THREE.Group(); if (f.kind === 'ray') m.rotation.set(1.05, Math.PI / 2 + 0.35, 0); /* seen from above, wings across */ else m.rotation.set(0.1, -0.2, -0.05); holder.add(m); const tl = f.kind === 'ray' && m.getObjectByName('tail'); if (tl) m.remove(tl); /* rays: frame the disc, not the long tail */
      holder.updateMatrixWorld(true); box3.setFromObject(holder).getSize(size3); box3.getCenter(mid3); if (tl) m.add(tl);
      const s2 = Math.min(3.1 / size3.x, 1.7 / size3.y); m.position.sub(mid3); holder.scale.setScalar(s2); T.sc.add(holder); T.r.render(T.sc, T.cam); f.img = T.r.domElement.toDataURL(); T.sc.remove(holder); return f.img; }
    m.scale.setScalar((f.puffer ? 1.35 : 1.85) / (f.len * (1 + 0.55 * (f.bill || 0)))); if (f.bill) m.position.x = -f.bill * 0.3; /* keep the bill in frame */ m.rotation.set(0.1, -0.2, -0.05);
    T.sc.add(m); T.r.render(T.sc, T.cam); f.img = T.r.domElement.toDataURL(); T.sc.remove(m); return f.img;
  }
  // pictures for long lists (the Garage collection): a few each frame, so the page never stalls
  const later = []; let laterOn = false;
  const pump = () => { const t0 = performance.now(); while (later.length && performance.now() - t0 < 12) { const [f, cb] = later.shift(); cb(picture(f)); } if (later.length) requestAnimationFrame(pump); else laterOn = false; };
  const kit = () => {
    if (shopKit) return shopKit;
    // fish models are built the first time each one is needed (there are 171 species: building them all at once froze the page)
    const fishModels = new Proxy({}, { get: (o, id) => o[id] || (o[id] = makeFish(FISH.find(f => f.id === id))) });
    const woodLightC = woodCanvas(512, 256, [168, 116, 70], 4, '70,40,18'), woodDarkC = woodCanvas(512, 256, [104, 68, 40], 5, '30,16,6');
    ui.style.setProperty('--wood-light', `url(${woodLightC.toDataURL()})`); ui.style.setProperty('--wood-dark', `url(${woodDarkC.toDataURL()})`);
    const mini = new THREE.WebGLRenderer({ antialias: true, alpha: true }); mini.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none';
    const studio = sc => { sc.add(new THREE.HemisphereLight('#ffffff', '#6b7b90', 1.25)); const d = new THREE.DirectionalLight('#fff2dc', 2.8); d.position.set(2, 5, 3); sc.add(d); const f2 = new THREE.DirectionalLight('#9fd8ff', 1.1); f2.position.set(-3, 2, -2); sc.add(f2); return sc; };
    mini.setPixelRatio(Math.min(2, devicePixelRatio));
    // catalogue pictures (240×140) come from a small renderer of their own, one fish at a time, on demand (picture())
    const thumb = { r: null, sc: studio(new THREE.Scene()), cam: new THREE.PerspectiveCamera(28, 240 / 140, 0.1, 50) }; thumb.cam.position.set(0, 0.3, 4.2); thumb.cam.lookAt(0, 0, 0);
    // crate on ice
    const crateSc = studio(new THREE.Scene()), crateCam = new THREE.PerspectiveCamera(34, 1.6, 0.1, 50); crateCam.position.set(0, 3.0, 2.5); crateCam.lookAt(0, 0.05, 0.1);
    const tex = cv => { const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const wm = new THREE.MeshStandardMaterial({ map: tex(woodLightC), roughness: 0.85 }), dm = new THREE.MeshStandardMaterial({ map: tex(woodDarkC), roughness: 0.9 });
    const B = (w, h, d, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); crateSc.add(b); return b; };
    B(7, 0.1, 4, dm, 0, -0.08, 0); B(2.5, 0.06, 1.6, wm, 0, 0, 0);
    [0.1, 0.3].forEach(y => { [-0.8, 0.8].forEach(z => B(2.6, 0.15, 0.07, wm, 0, y, z)); [-1.27, 1.27].forEach(x => B(0.07, 0.15, 1.6, wm, x, y, 0)); });
    [[-1.27, -0.8], [1.27, -0.8], [-1.27, 0.8], [1.27, 0.8]].forEach(([x, z]) => B(0.1, 0.42, 0.1, dm, x, 0.18, z));
    const ice = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: '#eaf7ff', roughness: 0.1, transparent: true, opacity: 0.92 }), 260), o = new THREE.Object3D();
    for (let i = 0; i < 260; i++) { o.position.set((rnd2() - 0.5) * 2.35, 0.06 + rnd2() * 0.09, (rnd2() - 0.5) * 1.45); o.rotation.set(rnd2() * 3, rnd2() * 3, rnd2() * 3); o.scale.setScalar(0.6 + rnd2() * 0.8); o.updateMatrix(); ice.setMatrixAt(i, o.matrix); }
    crateSc.add(ice);
    // tug preview for the boathouse: a copy of the player's boat
    const tugSc = studio(new THREE.Scene()), tugCam = new THREE.PerspectiveCamera(30, 1.6, 0.1, 100); tugCam.position.set(0, 9, 26); tugCam.lookAt(0, 3.5, 0);
    const tugView = new THREE.Group(); const cl = ctx.boat.clone(true); cl.position.set(0, 0, 0); cl.rotation.set(0, 0, 0); cl.traverse(x => { if (x.isLight || x.isLine || (x.material && x.material.blending === THREE.AdditiveBlending)) x.visible = false; }); tugView.add(cl); tugSc.add(tugView);
    const water = new THREE.Mesh(new THREE.CircleGeometry(13, 64), new THREE.MeshStandardMaterial({ color: '#2a86c2', roughness: 0.2, metalness: 0.1, transparent: true, opacity: 0.88 })); water.rotation.x = -Math.PI / 2; water.position.y = 0.85; tugSc.add(water);
    shopKit = { fishModels, mini, thumb, crateSc, crateCam, tugSc, tugCam, tugView }; return shopKit;
  };
  const bounce = p => { const n = 7.5625, d = 2.75; if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75; if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375; return n * (p -= 2.625 / d) * p + 0.984375; };
  let panel = null, crate = {}, crateFish = [], miniT = 0, miniHost = null, miniScene = null, miniCam = null, viewYaw = 0.6, drag = null;
  const attachMini = (host, sc, cam) => { const k = kit(); miniHost = host; miniScene = sc; miniCam = cam; host.prepend(k.mini.domElement); resizeMini(); };
  const resizeMini = () => { if (!miniHost) return; const w = miniHost.clientWidth, h = miniHost.clientHeight; if (!w || !h) return; shopKit.mini.setSize(w, h, false); miniCam.aspect = w / h; miniCam.updateProjectionMatrix(); };
  addEventListener('resize', resizeMini);
  function crateAdd(id, delay = 0) { const k = kit(), f = FISH.find(q => q.id === id), m = k.fishModels[id].clone(), sc = 1.4 * (f.kind ? Math.min(1, 1.0 / Math.max(f.len, f.kind === 'ray' ? f.w * 0.8 : 0)) : 1); // big newcomers shrink to fit the crate m.scale.setScalar(sc); m.rotation.order = 'YXZ';
    const half = Math.max(0.05, 1.1 - f.len * sc / 2), x = (rnd2() * 2 - 1) * half, z = (rnd2() - 0.5) * 0.8, yaw = (rnd2() - 0.5) * 0.6 + (rnd2() < 0.5 ? Math.PI : 0);
    const rest = 0.15 + f.w * sc * 0.5 + Math.min(crateFish.length, 14) * 0.03; k.crateSc.add(m);
    crateFish.push({ m, id, x, z, yaw, rest, t0: miniT + delay, ph: rnd2() * 6.28, tail: m.getObjectByName('tail') }); }
  const crateRemove = id => { for (let i = crateFish.length - 1; i >= 0; i--) if (crateFish[i].id === id && !crateFish[i].out) { crateFish[i].out = miniT; return; } };
  function crateTick(t, dt) {
    crateFish.forEach(c => { const a = t - c.t0;
      if (c.out) { const o = t - c.out; c.m.position.y += dt * (2 + o * 8); c.m.scale.multiplyScalar(Math.max(0, 1 - dt * 3.5)); if (o > 0.7) c.dead = true; return; }
      c.m.visible = a >= 0; if (a < 0) return;
      const p = Math.min(1, a / 0.75), flop = Math.pow(Math.max(0, Math.sin(t * 0.9 + c.ph)), 14) + (p < 1 ? 0.6 : 0);
      c.m.position.set(c.x, c.rest + (1 - bounce(p)) * 1.8 + flop * 0.05, c.z);
      c.m.rotation.set(-Math.PI / 2 + Math.sin(t * 16 + c.ph) * 0.16 * flop, c.yaw + Math.sin(t * 9 + c.ph) * 0.08 * flop, 0);
      if (c.tail) c.tail.rotation.y = Math.sin(t * 22 + c.ph) * 0.6 * flop; });
    crateFish = crateFish.filter(c => { if (c.dead) shopKit.crateSc.remove(c.m); return !c.dead; });
  }
  const mray = new THREE.Raycaster(), mndc = new THREE.Vector2();
  function crateHit(e) { const r = shopKit.mini.domElement.getBoundingClientRect(); mndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); mray.setFromCamera(mndc, shopKit.crateCam);
    const liveF = crateFish.filter(c => !c.out && c.m.visible), hit = mray.intersectObjects(liveF.map(c => c.m), true)[0]; if (!hit) return null;
    return liveF.find(c => { let o = hit.object; while (o) { if (o === c.m) return true; o = o.parent; } return false; }); }
  const wireMini = () => { const el = shopKit.mini.domElement; if (el.dataset.wired) return; el.dataset.wired = '1';
    el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, yaw: viewYaw }; el.setPointerCapture(e.pointerId); });
    el.addEventListener('pointermove', e => { if (drag && panel === 'boathouse') { viewYaw = drag.yaw + (e.clientX - drag.x) * 0.012; return; } if (panel === 'market' && !drag) el.style.cursor = crateHit(e) ? 'pointer' : ''; });
    el.addEventListener('pointerup', e => { if (drag && panel === 'market' && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) { const c = crateHit(e); if (c) { crate[c.id] = Math.max(0, (crate[c.id] || 0) - 1); crateRemove(c.id); updateMarket(); } } drag = null; }); };

  // ---------- shop windows (ported markup) ----------
  const dialTicks = (a0, a1, n, every, r, labels) => { let h = ''; for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; h += `<i class="tk${i % every ? '' : ' mj'}" style="transform:rotate(${a}deg)"></i>`; }
    labels.forEach(([a, t]) => { const rad = (a - 90) * Math.PI / 180; h += `<b class="tlab" style="left:${50 + Math.cos(rad) * r}%;top:${50 + Math.sin(rad) * r}%">${t}</b>`; }); return h; };
  const marketShell = () => `<div class="awning"><div class="stripes"></div><div class="valance"></div></div>
    <div class="sign"><span>Fish Market</span></div><button class="rx" data-act="close" aria-label="Close">✕</button>
    <div class="rp-body"><section><div class="rp-h"><h3>Today’s catch</h3><button class="tagbtn" data-act="addall">Add all</button></div><div class="ice" id="catchList"></div></section>
    <section><div class="rp-h"><h3>Selling crate</h3><span class="rp-note">Tap a fish in the crate to put it back</span></div>
    <div class="view crate" id="crateView"><div class="scale"><div class="face">${dialTicks(-135, 135, 20, 5, 31, [[-135, 0], [-67.5, 5], [0, 10], [67.5, 15], [135, 20]])}<div class="needle" id="needle"></div><div class="hub"></div><div class="kg" id="kgRead">0.0 kg</div></div></div></div>
    <div class="cchips" id="crateItems"></div>
    <div class="till"><span>TOTAL</span><b id="tillN">0c</b></div>
    <button class="sell" id="sellBtn" data-act="sell" disabled>Crate is empty</button></section></div>`;
  let countRAF = 0;
  const countTo = (el, to, suf = '') => { const from = +(el.dataset.v || 0); el.dataset.v = to; const t0 = performance.now(); cancelAnimationFrame(countRAF); const step = now => { const p = Math.min(1, (now - t0) / 450), v = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); el.textContent = v + suf; if (p < 1) countRAF = requestAnimationFrame(step); }; countRAF = requestAnimationFrame(step); };
  function updateMarket() {
    const inHold = FISH.filter(f => (S.hold[f.id] || 0) > 0), inCrate = FISH.filter(f => crate[f.id] > 0);
    const n = inCrate.reduce((a, f) => a + crate[f.id], 0), total = inCrate.reduce((a, f) => a + crate[f.id] * f.price, 0), kg = inCrate.reduce((a, f) => a + crate[f.id] * f.kg, 0);
    $('catchList').innerHTML = inHold.length ? inHold.map((f, i) => { const left = S.hold[f.id] - (crate[f.id] || 0);
      return `<div class="fishrow ${left ? '' : 'out'}"><img src="${picture(f)}" alt="${f.name}" style="animation-delay:${-i * 0.7}s"><div class="fr-main"><div class="fr-name">${f.name}</div><div class="fr-sub">${left} in hold · ~${f.kg} kg</div></div><span class="ptag">${f.price}c</span><button class="addb" data-act="add" data-id="${f.id}" ${left ? '' : 'disabled'} aria-label="Add ${f.name} to the crate">+</button></div>`; }).join('')
      : '<div class="rp-empty">Your hold is empty. Go fishing out at sea, then come back to sell.</div>';
    $('crateItems').innerHTML = inCrate.map(f => `<button class="cchip" data-act="dec" data-id="${f.id}" title="Put one back"><img src="${picture(f)}" alt=""><span>${f.name} ×${crate[f.id]}</span><b>−</b></button>`).join('');
    const range = kg > 20 ? 200 : 20; // big fish (swordfish, sailfish) switch the scale to 0-200 kg
    $('needle').style.transform = `rotate(${-135 + 270 * Math.min(1, kg / range)}deg)`;
    ui.querySelectorAll('#crateView .tlab').forEach((l, i) => { l.textContent = range / 4 * i; }); $('kgRead').textContent = kg.toFixed(1) + ' kg';
    countTo($('tillN'), total, 'c');
    const b = $('sellBtn'); b.disabled = !n; b.textContent = n ? `Sell ${n} fish for ${total}c` : 'Crate is empty';
  }
  const boathouseShell = () => `<div class="roof"></div><div class="sign teal"><span>Boathouse</span><small>${berth.name}</small></div><button class="rx" data-act="close" aria-label="Close">✕</button>
    <div class="rp-body"><section class="pump"><div class="pump-top"><span>HARBOUR FUEL</span><span class="pump-price">${FUEL_PRICE}c / L</span></div>
    <div class="pump-face"><div class="fdial"><div class="zone"></div>${dialTicks(-120, 120, 16, 4, 30, [[-120, 'E'], [0, '½'], [120, 'F']])}<div class="needle f" id="fNeedle"></div><div class="hub"></div><div class="kg">FUEL</div></div>
    <div class="sight" id="sight"><div class="liquid" id="liquid"><div class="wave"></div></div><div class="marks"></div></div></div>
    <div class="counters"><div class="ctr"><label>Litres</label><output id="ctrL">000.0</output></div><div class="ctr"><label>Coins</label><output id="ctrC">000</output></div></div>
    <div class="pump-ctrl"><button class="nozzle" id="nozzle">Hold to pump</button><div class="quick"><button class="qb" data-act="q10">+10 L</button><button class="qb" data-act="qfull">Fill up</button></div></div>
    <div class="pump-note" id="pumpNote"></div></section>
    <section><div class="rp-h"><h3>On board</h3><span class="rp-note" id="holdTxt"></span></div><div class="holdbar"><i id="holdFill"></i></div><div class="view" id="tugViewHost" style="height:150px;margin-bottom:10px"></div><div class="slots" id="slots"></div></section></div>`;
  let pumping = false, pumpTarget = 0, sessL = 0, showL = 0, bubbleT = 0;
  function updatePumpUI() {
    if (panel !== 'boathouse') return; const r = S.fuel / S.cap;
    $('fNeedle').style.transform = `rotate(${-120 + 240 * r}deg)`; $('liquid').style.height = (r * 100) + '%';
    $('ctrL').textContent = showL.toFixed(1).padStart(5, '0'); $('ctrC').textContent = String(Math.round(showL * FUEL_PRICE)).padStart(3, '0');
    $('pumpNote').textContent = `Tank ${S.fuel.toFixed(1)} / ${S.cap} L · you have ${S.coins - Math.round(sessL * FUEL_PRICE)}c`;
    $('nozzle').classList.toggle('on', pumping || pumpTarget > 0); $('nozzle').textContent = pumping || pumpTarget > 0 ? 'Pumping…' : 'Hold to pump';
    renderWallet();
  }
  function updateBoathouse() {
    const n = holdCount(); $('holdTxt').textContent = `Hold ${n} / ${S.holdCap}`; $('holdFill').style.width = (n / S.holdCap * 100) + '%';
    // only what's on board (there are too many species to list them all)
    const held = FISH.filter(f => S.hold[f.id]);
    $('slots').innerHTML = held.length ? held.map(f => `<div class="slot"><span class="cnt">×${S.hold[f.id] || 0}</span><img src="${picture(f)}" alt=""><span>${f.name}</span></div>`).join('') : '<div class="slot zero"><span>The hold is empty</span></div>';
    updatePumpUI();
  }
  function pumpTick(dt) {
    if (!pumping && pumpTarget <= 0) return;
    let step = Math.min(9 * dt, S.cap - S.fuel, S.coins / FUEL_PRICE - sessL); if (pumpTarget > 0) step = Math.min(step, pumpTarget);
    if (step <= 0.0001) { stopPump(S.cap - S.fuel < 0.05 ? 'tank full' : 'out of coins'); return; }
    S.fuel += step; sessL += step; showL = sessL; if (pumpTarget > 0) { pumpTarget -= step; if (pumpTarget <= 0.0001) { updatePumpUI(); stopPump(); return; } }
    bubbleT -= dt; if (bubbleT <= 0) { bubbleT = 0.06; const b = document.createElement('span'); b.className = 'bub'; b.style.left = (10 + Math.random() * 75) + '%'; b.style.setProperty('--s', (3 + Math.random() * 5) + 'px'); $('sight').appendChild(b); setTimeout(() => b.remove(), 1100); }
    updatePumpUI();
  }
  function startPump(target = 0) { if (S.cap - S.fuel < 0.05) return toast('The tank is already full.'); if (S.coins < FUEL_PRICE) return toast('Not enough coins for fuel. Sell some fish first.'); sessL = 0; showL = 0; pumping = !target; pumpTarget = target; updatePumpUI(); }
  function stopPump(reason) { if (!pumping && pumpTarget <= 0) return;
    pumping = false; pumpTarget = 0;
    if (sessL > 0) { const cost = Math.round(sessL * FUEL_PRICE); S.coins -= cost; S.fuel = Math.min(S.cap, Math.round(S.fuel * 10) / 10); save(); toast(`Pumped ${sessL.toFixed(1)} L for ${cost}c${reason ? ' · ' + reason : ''}`); bump('coins'); }
    sessL = 0; renderWallet(); updatePumpUI(); }
  addEventListener('pointerup', () => { if (pumping) stopPump(); }); addEventListener('pointercancel', () => { if (pumping) stopPump(); });
  function fly(img, toEl) { const a = img.getBoundingClientRect(), b = toEl.getBoundingClientRect(), c = img.cloneNode(); c.className = 'flyer'; c.style.animation = 'none';
    Object.assign(c.style, { left: a.left + 'px', top: a.top + 'px', width: a.width + 'px', height: a.height + 'px' }); ui.appendChild(c);
    const dx = b.left + b.width / 2 - a.left - a.width / 2, dy = b.top + b.height * 0.55 - a.top - a.height / 2;
    c.animate([{ transform: 'translate(0,0) rotate(0)' }, { transform: `translate(${dx * 0.5}px,${dy * 0.5 - 90}px) rotate(-28deg) scale(1.1)`, offset: 0.5 }, { transform: `translate(${dx}px,${dy}px) rotate(12deg) scale(.7)`, opacity: 0.3 }], { duration: 480, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = () => c.remove(); }
  function coinBurst(from, n, total) { const a = from.getBoundingClientRect(), b = $('coins').getBoundingClientRect(), start = S.coins - total;
    for (let i = 0; i < n; i++) { const c = document.createElement('span'); c.className = 'coin flycoin'; c.style.left = (a.left + a.width / 2 + (Math.random() - 0.5) * 60) + 'px'; c.style.top = (a.top + a.height / 2) + 'px'; ui.appendChild(c);
      const dx = b.left + 16 - parseFloat(c.style.left), dy = b.top + 14 - parseFloat(c.style.top);
      c.animate([{ transform: 'translate(0,0) scale(.6)' }, { transform: `translate(${dx * 0.3 + (Math.random() - 0.5) * 120}px,${-60 - Math.random() * 80}px) scale(1.2)`, offset: 0.35 }, { transform: `translate(${dx}px,${dy}px) scale(.8)` }], { duration: 750, delay: i * 45, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'backwards' })
        .onfinish = () => { c.remove(); $('coinN').textContent = Math.round(start + total * (i + 1) / n); if (i === n - 1) { renderWallet(); bump('coins'); } }; } }
  function openPanel(id) {
    if (mode !== 'docked') return;
    const k = kit(); wireMini(); panel = id; crate = {}; const card = $('card'); card.className = 'rp ' + id; card.innerHTML = id === 'market' ? marketShell() : boathouseShell(); $('stn-modal').hidden = false; stage._controls.enabled = false;
    if (id === 'market') { crateFish.forEach(c => k.crateSc.remove(c.m)); crateFish = []; attachMini($('crateView'), k.crateSc, k.crateCam); updateMarket(); }
    else { // show the boat you're sailing now
      k.tugView.clear(); const cl = ctx.boat.clone(true); cl.position.set(0, 0, 0); cl.rotation.set(0, 0, 0); cl.traverse(x => { if (x.isLight || x.isLine || (x.material && x.material.blending === THREE.AdditiveBlending)) x.visible = false; }); k.tugView.add(cl);
      attachMini($('tugViewHost'), k.tugSc, k.tugCam); showL = 0; updateBoathouse(); $('nozzle').addEventListener('pointerdown', e => { e.preventDefault(); startPump(); }); }
  }
  function closePanel() { stopPump(); panel = null; miniHost = null; $('stn-modal').hidden = true; stage._controls.enabled = true; }
  $('card').addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b || b.disabled) return; const a = b.dataset.act, id = b.dataset.id;
    if (a === 'close') return closePanel();
    if (a === 'q10') return startPump(Math.min(10, S.cap - S.fuel));
    if (a === 'qfull') return startPump(S.cap - S.fuel);
    if (a === 'add') { const img = b.closest('.fishrow')?.querySelector('img'); crate[id] = Math.min(S.hold[id], (crate[id] || 0) + 1); if (img) fly(img, $('crateView')); crateAdd(id, 0.38); }
    if (a === 'dec') { crate[id] = Math.max(0, (crate[id] || 0) - 1); crateRemove(id); }
    if (a === 'addall') { let k = 0; FISH.forEach(f => { const more = (S.hold[f.id] || 0) - (crate[f.id] || 0); for (let j = 0; j < more; j++) crateAdd(f.id, 0.1 * k++); crate[f.id] = S.hold[f.id] || 0; }); }
    if (a === 'sell') { let n = 0, tot = 0; FISH.forEach(f => { const q = crate[f.id] || 0; n += q; tot += q * f.price; S.hold[f.id] = (S.hold[f.id] || 0) - q; });
      S.coins += tot; crate = {}; save(); crateFish.forEach((c, i) => { c.out = miniT + i * 0.04; }); toast(`Sold ${n} fish for ${tot} coins`); coinBurst(b, Math.min(16, 4 + n), tot); $('tillN').dataset.v = tot;
      if (n) dispatchEvent(new CustomEvent('sailo:sold', { detail: { n, coins: tot } })); } // (the first voyage listens for this)
    if (panel === 'market') updateMarket(); });
  $('stn-modal').addEventListener('click', e => { if (e.target.id === 'stn-modal') closePanel(); });
  addEventListener('keydown', e => { if (e.key === 'Escape') { if (panel) closePanel(); else if (mode === 'picking') { mode = 'sea'; renderBar(); ctx.onDockEnd?.(); } } });

  // ---------- per frame ----------
  const pv = new V3();
  const place = (el, at) => { const cam = stage._camera, r = stage.getBoundingClientRect(); pv.copy(at).project(cam); const vis = pv.z < 1 && Math.abs(pv.x) < 1.05 && Math.abs(pv.y) < 1.05; el.style.display = vis ? '' : 'none';
    if (vis) el.style.transform = `translate(${(pv.x + 1) / 2 * r.width + r.left}px, ${(1 - pv.y) / 2 * r.height + r.top}px) translate(-50%, -100%)`; };
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  function tick(t, dt) {
    const bp = ctx.boatPos(), dist = Math.hypot(bp.x - O.x, bp.z - O.z);
    if (!island && dist < 3500) build();
    root.visible = ready && dist < SHOW;
    const wasNear = near; near = dist < NEAR; if (near !== wasNear && mode === 'sea') renderBar();
    if (root.visible) {
      island.tick(t, dt, ctx.night ? ctx.night() : 0, stage._camera);
    }
    // moor / leave: the station drives the boat along the route
    if (mode === 'docking' || mode === 'leaving') {
      prog = Math.min(1, prog + dt / dur); const e = prog < 0.5 ? 2 * prog * prog : 1 - Math.pow(-2 * prog + 2, 2) / 2;
      const u = Math.min(0.999, Math.max(0.001, e)), P = route.getPointAt(u), tan = route.getTangentAt(u), yawT = Math.atan2(-tan.z, tan.x);
      const targetYaw = mode === 'docking' ? yawT + wrapA(berth.yaw - yawT) * ss(0.6, 0.97, e) : yawT;
      ctx.moveBoat(P.x, P.z, ctx.boatYaw() + wrapA(targetYaw - ctx.boatYaw()) * Math.min(1, dt * 4), Math.sin(prog * Math.PI));
      if (prog >= 1) {
        if (mode === 'docking') { mode = 'docked'; const end = toW(...berth.pos); ctx.moveBoat(end.x, end.z, berth.yaw, 0); toast(`Moored at ${berth.name}. The Fish Market and Boathouse are open.`);
          const mid = toW(xa0 + 4, PZ - 4); frame(new V3((end.x + mid.x) / 2, WL + 2, (end.z + mid.z) / 2), 62, 40, 1.6);
          const b = ctx.boat; b.updateMatrixWorld(true);
          berth.tie = [new V3(3.7, 2.25, 2.1 * berth.side), new V3(-3.9, 2.4, 2.1 * berth.side)].map(local => { const w = b.localToWorld(local.clone()); let best = null, bd = 1e9;
            (island ? island.posts : []).forEach(p => { const pw = new V3(O.x + p.x * K, WL + (p.top - 0.25) * K, O.z + p.z * K), d = pw.distanceTo(w); if (d < bd) { bd = d; best = pw; } }); return { local, post: best }; });
        } else { mode = 'sea'; ctx.onDockEnd?.(); }
        renderBar();
      }
    }
    // mooring lines while docked
    const tied = mode === 'docked' && berth.tie && berth.tie.every(x => x.post);
    ropes.forEach((m, i) => { m.visible = tied; if (!tied) return; const a = ctx.boat.localToWorld(berth.tie[i].local.clone()), b = berth.tie[i].post, d = b.clone().sub(a);
      m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, d.length(), 1); m.quaternion.setFromUnitVectors(UP, d.normalize()); });
    // markers over the shops / berths
    if (mode === 'docked') shops.forEach(s => place($('mk-' + s.id), worldAt(s.at)));
    if (mode === 'picking') BERTHS.forEach(b => { const w = toW(...b.pos); place(b.el, new V3(w.x, WL + 3, w.z)); });
    // shop window renderer
    if (panel === 'boathouse') pumpTick(dt);
    if (panel && miniHost && shopKit) { miniT = t;
      if (panel === 'market') crateTick(t, dt);
      else { if (!drag) viewYaw += dt * 0.25; shopKit.tugView.rotation.y = viewYaw; shopKit.tugView.position.y = Math.sin(t * 1.3) * 0.06; }
      if (shopKit.mini.domElement.width !== Math.round(miniHost.clientWidth * shopKit.mini.getPixelRatio())) resizeMini();
      shopKit.mini.render(miniScene, miniCam); }
    void waveJS; void toScreen;
  }

  renderWallet(); renderBar();
  return {
    tick, blocked,
    get mode() { return mode; },
    /** Burn fuel for metres travelled at a given throttle (0..1). Returns the speed factor (reserve when empty). */
    burn(metres, thr) { if (metres <= 0) return S.fuel > 0 ? 1 : 0.3; const before = S.fuel; S.fuel = Math.max(0, S.fuel - metres * (0.35 + 0.65 * thr) / 150 * BOAT_SPECS[S.active].burn);
      if (Math.floor(before) !== Math.floor(S.fuel)) { renderWallet(); if (S.fuel <= 0 && before > 0) toast('Out of fuel: running on the reserve. Switch boats in the Garage, or refuel at Paradise Station.'); else if (S.fuel < S.cap * 0.2 && before >= S.cap * 0.2) toast(`Fuel is low. Refuel at Paradise Station (${STATION.where}).`); }
      if (Math.floor(before / 5) !== Math.floor(S.fuel / 5)) save();
      return S.fuel > 0 ? 1 : 0.3; },
    /** A fish was landed: pick a species by its odds and put it in the hold. Returns the fish, or null if the hold is full. */
    /** Is there room in the active boat's hold? */
    holdFull: () => holdCount() >= S.holdCap,
    holdInfo: () => ({ n: holdCount(), cap: S.holdCap }),
    /** Put a fish in the hold: a given species (from the fishing game) or one picked by the odds. Returns the fish, or null if the hold is full. */
    addCatch(id) { if (holdCount() >= S.holdCap) { toast(`Hold full (${S.holdCap} fish). Sell your catch at Paradise Station, or switch boats.`); return null; }
      let f = FISH.find(x => x.id === id);
      if (!f) { let r = Math.random() * FISH.reduce((a, x) => a + localOdds(x), 0); f = FISH[0]; for (const x of FISH) { r -= localOdds(x); if (r <= 0) { f = x; break; } } }
      S.hold[f.id] = (S.hold[f.id] || 0) + 1; save(); return f; },
    /** Coins for releasing a fish. */
    addCoins(n) { S.coins += n; save(); renderWallet(); },
    /** Pay for something (a sea-plane fare): false when there aren't enough coins. */
    spend(n) { if (S.coins < n) return false; S.coins -= n; save(); renderWallet(); return true; },
    coins: () => S.coins,
    /** The detailed fish model (a copy) and its picture, shared with the Fish Market. */
    fishModel: id => kit().fishModels[id].clone(),
    fishImage: id => { const f = FISH.find(q => q.id === id); return f ? picture(f) : ''; },
    /** A picture if it's ready, else null; with cb, it's rendered soon (a few per frame) and handed to cb. */
    fishImageSoon: (id, cb) => { const f = FISH.find(q => q.id === id); if (!f) return null; if (f.img) return f.img; if (cb) { later.push([f, cb]); if (!laterOn) { laterOn = true; requestAnimationFrame(pump); } } return null; },
    /** Make another boat the active one (its own tank and hold). */
    setActive(id) { if (!BOAT_SPECS[id]) return; S.active = id; save(); renderWallet(); },
    shoreWarn() { const now = performance.now(); if (now - lastWarn > 3000) { lastWarn = now; toast('Too shallow! Steer around the island.'); } },
  };
}
