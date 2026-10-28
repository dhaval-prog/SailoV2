// Floating Pune place names over the 3D sea (a DOM layer above the canvas, nothing in the
// water itself). Which names show depends on how far out the camera is zoomed:
//   level 1 (far out)  regions: Pune, Pimpri-Chinchwad, East/West/South/North Pune
//   level 2            major neighbourhoods
//   level 3 (default)  major + smaller localities
//   level 4 (close in) + landmarks, roads and residential societies near the boat
// Names within sight sit at their real spot; farther ones float on the horizon in their
// true direction, with the distance. Labels never overlap each other, the boat or the
// fishing game. Also announces "Entering …" / "Leaving …" as the boat crosses localities.

import { regionList, placeList, poisNear, ensure, zoneAt } from './geo.js';

const NEAR = 330;       // metres: beyond this a name floats on the horizon (past the fog)
const HORIZON = 1700;   // metres from the camera where horizon names are projected
const MAX = 16;         // names on screen at once
const RANGE = { major: 12000, minor: 4500 };
const CAT = { food: '#ffb870', hotel: '#c9a7ff', mall: '#ff8fc7', fuel: '#ffd36b', health: '#ff8a8a', school: '#8fd0ff', park: '#7ff0c8', road: '#e9f1ff', society: '#bfefff' };
export const levelFor = d => d < 35 ? 4 : d < 90 ? 3 : d < 170 ? 2 : 1;

export function createSeaLabels({ THREE, stage, boat, WL, toScreen, avoid, onZone }) {
  const layer = document.createElement('div'); layer.id = 'geo-labels'; layer.setAttribute('aria-hidden', 'true'); document.body.appendChild(layer);
  const toast = document.createElement('div'); toast.id = 'geo-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast);
  const pool = new Map(); // key -> { el, on }
  const v = new THREE.Vector3(), camXZ = new THREE.Vector2(), box = new THREE.Box3(), part = new THREE.Box3(), corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let boatBoxT = 0, lastEnsure = -9, level = 3;

  const node = (key, p) => {
    let n = pool.get(key); if (n) return n;
    const el = document.createElement('div'); el.className = `gl gl-${p.kind}`;
    el.innerHTML = `${p.cat ? `<i style="background:${CAT[p.cat] || '#fff'}"></i>` : ''}<b></b><small></small>`;
    el.querySelector('b').textContent = p.kind === 'region' || p.kind === 'major' || p.kind === 'minor' ? p.name.toUpperCase() : p.name;
    layer.appendChild(el); n = { el, on: false, dist: '' }; pool.set(key, n); return n;
  };
  const overlaps = (a, list) => list.some(b => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]);

  function boatRect() { // the boat's screen footprint, so names never sit on it
    // solid parts only: light beams and glows (transparent) reach far beyond the hull
    box.makeEmpty(); boat.updateWorldMatrix(true, true);
    boat.traverseVisible(o => { if (!o.isMesh || o.material?.transparent || o.material?.side === THREE.BackSide) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(part); });
    if (box.isEmpty()) return [0, 0, 0, 0];
    const r = [Infinity, Infinity, -Infinity, -Infinity];
    const { min, max } = box; [0, 1, 2, 3, 4, 5, 6, 7].forEach(i => corners[i].set(i & 1 ? max.x : min.x, i & 2 ? max.y : min.y, i & 4 ? max.z : min.z));
    corners.forEach(c => { const [x, y, z] = toScreen(c); if (z > 1) return; r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], y); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], y); });
    return [r[0] - 12, r[1] - 16, r[2] + 12, r[3] + 10];
  }
  let bRect = [0, 0, 0, 0];

  function update(t) {
    const cam = stage._camera, tgt = stage._controls.target, d = cam.position.distanceTo(tgt);
    level = levelFor(d);
    if (t - boatBoxT > 0.25) { boatBoxT = t; bRect = boatRect(); }
    // fetch data for what is around (localities within ~10 km, landmarks within ~600 m when close in)
    if (t - lastEnsure > 1.5) { lastEnsure = t; const bx = boat.position.x, bz = boat.position.z;
      ensure(bx - 10000, bz - 10000, bx + 10000, bz + 10000, false); if (level === 4) ensure(bx - 600, bz - 600, bx + 600, bz + 600, true); }
    camXZ.set(cam.position.x, cam.position.z);
    const W = innerWidth, H = innerHeight, cand = [];
    const consider = (key, p, rank) => {
      const dx = p.x - camXZ.x, dz = p.z - camXZ.y, dist = Math.hypot(dx, dz), far = Math.hypot(p.x - tgt.x, p.z - tgt.z) > NEAR;
      if (far) { const k = Math.min(dist, HORIZON) / dist; v.set(camXZ.x + dx * k, WL, camXZ.y + dz * k); } else v.set(p.x, WL + (rank >= 3 ? 1.2 : 2.5), p.z);
      const [x, y, z] = toScreen(v); if (z > 1 || x < -80 || x > W + 80 || y < 40 || y > H + 20) return;
      cand.push({ key, p, rank, far, x, y, dist: Math.hypot(p.x - tgt.x, p.z - tgt.z) });
    };
    if (level === 1) regionList().forEach(p => consider('r:' + p.name, p, 0));
    else {
      for (const p of placeList()) { if (p.kind === 'minor' && level < 3) continue; const r = Math.hypot(p.x - tgt.x, p.z - tgt.z); if (r > RANGE[p.kind]) continue; consider('p:' + p.key, p, p.kind === 'major' ? 1 : 2); }
      if (level === 4) poisNear(tgt.x, tgt.z, NEAR * 1.3).forEach(p => consider('i:' + p.id, p, 3));
    }
    // nearby names first (landmarks when close in), then the horizon by importance and distance
    cand.sort((a, b) => (a.far - b.far) || (a.far ? a.rank - b.rank : 0) || a.dist - b.dist);
    const taken = [bRect, ...avoid()], show = new Set();
    for (const c of cand) {
      if (show.size >= MAX) break;
      const fs = c.rank === 0 ? 17 : c.rank === 1 ? 14 : c.rank === 2 ? 12.5 : 11.5, sc = c.far ? 0.92 : Math.min(1.35, Math.max(0.85, 55 / Math.max(20, cam.position.distanceTo(v.set(c.p.x, WL, c.p.z)))));
      const label = c.rank < 3 ? c.p.name.length * 1.12 : c.p.name.length, w = (label * fs * 0.62 + (c.far ? 48 : 22)) * sc, h = fs * 2.1 * sc;
      const r = [c.x - w / 2, c.y - h, c.x + w / 2, c.y];
      if (overlaps(r, taken)) continue;
      taken.push(r); show.add(c.key);
      const n = node(c.key, c.p);
      const dtxt = c.far ? (c.dist >= 10000 ? Math.round(c.dist / 1000) : (c.dist / 1000).toFixed(1)) + ' km' : '';
      if (dtxt !== n.dist) { n.el.querySelector('small').textContent = dtxt; n.dist = dtxt; }
      n.el.classList.toggle('far', c.far);
      n.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%) scale(${sc.toFixed(3)})`;
      if (!n.on) { n.on = true; n.el.classList.add('on'); }
    }
    pool.forEach((n, k) => { if (!show.has(k) && n.on) { n.on = false; n.el.classList.remove('on'); } });
    zones(t);
  }

  // ---- entering / leaving localities (boundary polygons when known, else nearest locality) ----
  let cur = null, pend = null, pendT = 0, lastZ = -9, queue = [], toastT = 0;
  const say = (verb, z) => queue.push({ verb, z });
  function zones(t) {
    if (t - lastZ > 0.4) { lastZ = t;
      const z = zoneAt(boat.position.x, boat.position.z), name = z?.name || null;
      if (name !== (cur?.name || null)) {
        // a little hysteresis at the edges so a boat on a border doesn't flicker
        if (pend?.name !== name) { pend = z || { name: null }; pendT = t; }
        else if (t - pendT > (z && !z.poly ? 1.2 : 0.6)) { if (cur) say('Leaving', cur); if (z) say('Entering', z); cur = z; pend = null; onZone?.(z); }
      } else pend = null;
    }
    if (queue.length && t > toastT) { const { verb, z } = queue.shift(); toastT = t + 1.6;
      toast.innerHTML = `<small>${verb}</small><b></b>${z.group ? `<span>${z.group === 'Central' ? 'Central Pune' : z.group + ' Pune'}</span>` : ''}`; toast.querySelector('b').textContent = z.name;
      toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show'); }
  }

  return { update, get level() { return level; }, get zone() { return cur; } };
}
