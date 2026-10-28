// Floating place names (Pune, or the active chart's city) over the 3D sea (a DOM layer above the canvas, nothing in the
// water itself). Which names show depends on how far out the camera is zoomed:
//   level 1 (far out)  regions: the city and its neighbours (Pune: also East/West/South/North Pune)
//   level 2            major neighbourhoods
//   level 3 (default)  major + smaller localities
//   level 4 (close in) + landmarks, roads and residential societies near the boat
// Names within 1 km float on the water at their real spot; a few farther ones (at most 5) float on
// the horizon in their true direction, nearer ones lower and larger, with the distance. The compass
// strip at the top shows the rest, plus Paradise Station and your course. Tap a name and it becomes a
// boat icon: tap the boat to sail there. Labels never overlap each other, the boat or the fishing game. Also announces
// "Entering …" / "Leaving …" as the boat crosses localities.

import { regionList, placeList, poisNear, ensure, zoneAt, groupLabel } from './geo.js';

const NEAR = 1000;       // metres: closer names float on the water at their real spot
const MAX_NEAR = 12;     // floating names on screen at once
const MAX_FAR = 5;       // horizon names at once (the compass strip shows the rest)
const FADE = [2500, 3500]; // metres: horizon names fade out across this range and vanish beyond it
const RANGE = { major: 12000, minor: 4500 };
const STRIP = { major: 9000, minor: 3500, max: 16, span: 75 }; // compass strip: ranges, marker cap, half-width in degrees
const CAT = { food: '#ffb870', hotel: '#c9a7ff', mall: '#ff8fc7', fuel: '#ffd36b', health: '#ff8a8a', school: '#8fd0ff', park: '#7ff0c8', road: '#e9f1ff', society: '#bfefff' };
const CARD = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const levelFor = d => d < 35 ? 4 : d < 90 ? 3 : d < 170 ? 2 : 1;
const bearing = (dx, dz) => (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360; // degrees clockwise from north (−z)
const wrap = a => ((a + 540) % 360) - 180;
const fmtKm = m => (m >= 10000 ? Math.round(m / 1000) : (m / 1000).toFixed(1)) + ' km';

/**
 * ctx: THREE, stage, boat, WL, toScreen, avoid() -> screen rects to keep clear, onZone(zone),
 *      sailTo(x, z) -> true when a course was set, station { x, z, name }, course() -> {x, z} | null, busy() -> true while fishing
 */
export function createSeaLabels({ THREE, stage, boat, WL, toScreen, avoid, onZone, sailTo, station, course, busy, night }) {
  const layer = document.createElement('div'); layer.id = 'geo-labels'; document.body.appendChild(layer);
  const toast = document.createElement('div'); toast.id = 'geo-toast'; toast.setAttribute('role', 'status'); document.body.appendChild(toast);
  const pool = new Map(); // key -> { el, on, dist, w, h }
  const v = new THREE.Vector3(), camXZ = new THREE.Vector2(), box = new THREE.Box3(), part = new THREE.Box3(), corners = Array.from({ length: 8 }, () => new THREE.Vector3());
  let boatBoxT = 0, lastEnsure = -9, level = 3;

  // ---- a name on the sea (tap it to sail there) ----
  const node = (key, p) => {
    let n = pool.get(key); if (n) return n;
    const el = document.createElement('button'); el.type = 'button'; el.className = `gl gl-${p.kind}`; el.tabIndex = -1;
    el.innerHTML = `${p.cat ? `<i style="background:${CAT[p.cat] || '#fff'}"></i>` : ''}<b></b><small></small><span class="gl-boat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13M12 4.5c3.4 2.9 5.4 6.6 5.9 10.5H12M11 7c-2.2 2.4-3.4 5-3.8 8H11"/><path d="M3.5 17.5h17l-2 2.8a2 2 0 0 1-1.6.8H7.1a2 2 0 0 1-1.6-.8z"/></svg></span>`;
    el.querySelector('b').textContent = p.kind === 'region' || p.kind === 'major' || p.kind === 'minor' ? p.name.toUpperCase() : p.name;
    el.addEventListener('click', e => { e.stopPropagation(); pick(key, p, el); });
    layer.appendChild(el); n = { el, on: false, dist: null, w: 0, h: 0 }; pool.set(key, n); return n;
  };
  const measure = n => { n.w = n.el.offsetWidth; n.h = n.el.offsetHeight; }; // real size (spaced capitals are wider than they look)
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

  // ---- tap a name: it turns into a boat icon; tap the boat to sail there, anywhere else to cancel ----
  let armed = null; // { key, p, el }
  const disarm = () => { if (!armed) return; armed.el.classList.remove('armed'); armed.el.setAttribute('aria-label', armed.p.name); armed = null; };
  function pick(key, p, el) {
    if (armed?.key === key) { const target = armed.p; disarm(); sailTo(target.x, target.z, target.name); return; }
    disarm(); armed = { key, p, el }; el.classList.add('armed'); el.setAttribute('aria-label', `Sail to ${p.name}`);
  }
  let cancelAt = -1e9; // a tap that only cancels shouldn't also set a course on the sea
  addEventListener('pointerdown', e => { if (armed && !armed.el.contains(e.target)) { disarm(); cancelAt = performance.now(); } }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') disarm(); });

  // ---- compass strip (top centre): heading ticks, nearby places, the station and your course ----
  const strip = document.createElement('div'); strip.id = 'compass-strip'; strip.setAttribute('aria-label', 'Compass');
  strip.innerHTML = '<div class="cs-tape"></div><div class="cs-marks"></div><div class="cs-notch"></div>';
  document.body.appendChild(strip);
  const tape = strip.querySelector('.cs-tape'), marks = strip.querySelector('.cs-marks');
  tape.innerHTML = Array.from({ length: 72 }, (_, i) => { const a = i * 5; return `<i data-a="${a}" class="${a % 45 ? (a % 15 ? 't5' : 't15') : 'tc'}">${a % 45 ? '' : CARD[a / 45]}</i>`; }).join('');
  const ticks = [...tape.children].map(el => ({ el, a: +el.dataset.a }));
  const mpool = new Map();
  const mark = (key, p, cls) => { let m = mpool.get(key); if (m) return m;
    const el = document.createElement('button'); el.type = 'button'; el.className = `cs-m ${cls}`; el.innerHTML = `<i></i><b></b><span class="gl-boat"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v13M12 4.5c3.4 2.9 5.4 6.6 5.9 10.5H12M11 7c-2.2 2.4-3.4 5-3.8 8H11"/><path d="M3.5 17.5h17l-2 2.8a2 2 0 0 1-1.6.8H7.1a2 2 0 0 1-1.6-.8z"/></svg></span>`; el.querySelector('b').textContent = p.name;
    el.setAttribute('aria-label', p.name); el.addEventListener('click', e => { e.stopPropagation(); pick('m:' + key, p, el); }); marks.appendChild(el); m = { el, on: false, w: 0 }; mpool.set(key, m); return m; };
  function paintStrip(camHead) {
    const W = strip.clientWidth, ppd = W / (STRIP.span * 2), bx = boat.position.x, bz = boat.position.z;
    for (const t of ticks) { const dx = wrap(t.a - camHead); t.el.style.display = Math.abs(dx) > STRIP.span ? 'none' : ''; if (Math.abs(dx) <= STRIP.span) t.el.style.transform = `translateX(${(W / 2 + dx * ppd).toFixed(1)}px)`; }
    // markers: your course and the station first, then the nearest places
    const list = [];
    const c = course(); if (c) list.push({ key: 'course', p: { name: 'Your course', x: c.x, z: c.z }, cls: 'cs-course', pri: 0 });
    if (station) list.push({ key: 'station', p: station, cls: 'cs-station', pri: 1 });
    placeList().filter(p => Math.hypot(p.x - bx, p.z - bz) < STRIP[p.kind] && Math.hypot(p.x - bx, p.z - bz) > 150).sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz)).slice(0, STRIP.max)
      .forEach(p => list.push({ key: 'p:' + p.key, p, cls: `cs-${p.kind}`, pri: 2 }));
    const taken = [], show = new Set();
    for (const it of list) {
      const dx = wrap(bearing(it.p.x - bx, it.p.z - bz) - camHead); if (Math.abs(dx) > STRIP.span - 2) continue;
      const m = mark(it.key, it.p, it.cls), x = W / 2 + dx * ppd; show.add(it.key);
      if (!m.on) { m.on = true; m.el.classList.add('on'); m.w = 0; }
      // names only where there is room (always for the course and the station), dots otherwise
      if (!m.w) m.w = m.el.querySelector('b').offsetWidth + 10;
      const r = [x - m.w / 2, 0, x + m.w / 2, 1], named = Math.abs(dx) < (it.pri < 2 ? 14 : 7) && !overlaps(r, taken) && x - m.w / 2 > 2 && x + m.w / 2 < W - 2;
      if (named) taken.push(r); m.el.classList.toggle('named', named);
      const d = Math.hypot(it.p.x - bx, it.p.z - bz); m.el.title = `${it.p.name} · ${d < 1000 ? Math.round(d) + ' m' : fmtKm(d)}`;
      m.el.style.transform = `translateX(${x.toFixed(1)}px)`;
    }
    mpool.forEach((m, k) => { if (!show.has(k) && m.on) { m.on = false; m.el.classList.remove('on'); if (armed?.el === m.el) disarm(); } });
  }

  function update(t) {
    const cam = stage._camera, tgt = stage._controls.target, d = cam.position.distanceTo(tgt);
    level = levelFor(d);
    if (t - boatBoxT > 0.25) { boatBoxT = t; bRect = boatRect(); }
    // fetch data for what is around (localities within ~10 km, landmarks within ~600 m when close in)
    if (t - lastEnsure > 1.5) { lastEnsure = t; const bx = boat.position.x, bz = boat.position.z;
      ensure(bx - 10000, bz - 10000, bx + 10000, bz + 10000, false); if (level === 4) ensure(bx - 600, bz - 600, bx + 600, bz + 600, true); }
    camXZ.set(cam.position.x, cam.position.z);
    const camHead = bearing(tgt.x - cam.position.x, tgt.z - cam.position.z);
    paintStrip(camHead);
    layer.classList.toggle('busy', !!busy?.()); layer.classList.toggle('night', !!night?.());
    const W = innerWidth, H = innerHeight, cand = [];
    const consider = (key, p, rank) => {
      const dx = p.x - camXZ.x, dz = p.z - camXZ.y, dist = Math.hypot(p.x - tgt.x, p.z - tgt.z), far = rank === 0 || dist > NEAR;
      if (Math.abs(wrap(bearing(dx, dz) - camHead)) > 80) return; // behind or beside the camera
      // depth: nearer horizon names sit lower (projected closer), farther ones higher up
      if (far) { const k = Math.min(1, Math.max(0, (Math.min(dist, 12000) - NEAR) / 11000)), dd = 360 + k * 1340, L = Math.hypot(dx, dz) || 1; v.set(camXZ.x + dx / L * dd, WL, camXZ.y + dz / L * dd); }
      else v.set(p.x, WL + (rank >= 3 ? 1.2 : 2.5), p.z);
      const [x, y, z] = toScreen(v); if (z > 1 || x < -200 || x > W + 200 || y < 60 || y > H + 20) return;
      cand.push({ key, p, rank, far, x, y, dist });
    };
    if (level === 1) regionList().forEach(p => consider('r:' + p.name, p, 0));
    else {
      for (const p of placeList()) { if (p.kind === 'minor' && level < 3) continue; const r = Math.hypot(p.x - tgt.x, p.z - tgt.z); if (r > RANGE[p.kind]) continue; consider('p:' + p.key, p, p.kind === 'major' ? 1 : 2); }
      if (level === 4) poisNear(tgt.x, tgt.z, 430).forEach(p => consider('i:' + p.id, p, 3));
    }
    // floating names first (nearest), then at most a few horizon names (most important, then nearest)
    cand.sort((a, b) => (a.far - b.far) || (a.far ? a.rank - b.rank : 0) || a.dist - b.dist);
    const taken = [bRect, ...avoid()], show = new Set(); let nNear = 0, nFar = 0;
    for (const c of cand) {
      if (c.dist > FADE[1]) continue; // beyond 3.5 km: out of sight (the compass strip still shows it)
      if (c.far ? nFar >= MAX_FAR : nNear >= MAX_NEAR) continue;
      const n = node(c.key, c.p);
      const dtxt = c.far ? fmtKm(c.dist) : '';
      if (dtxt !== n.dist) { n.el.querySelector('small').textContent = dtxt; n.dist = dtxt; n.w = 0; }
      n.el.classList.toggle('far', c.far);
      if (!n.w) measure(n);
      const k = c.far ? Math.min(1, Math.max(0, (c.dist - NEAR) / 11000)) : 0;
      const sc = c.far ? 1 - k * 0.22 : Math.min(1.3, Math.max(0.85, 55 / Math.max(20, cam.position.distanceTo(v.set(c.p.x, WL, c.p.z)))));
      const w = n.w * sc, h = n.h * sc, r = [c.x - w / 2 - 4, c.y - h - 3, c.x + w / 2 + 4, c.y + 3];
      // names at the screen edge fade out instead of being cut in half
      const over = Math.max(0, 8 - r[0], r[2] - (W - 8)); if (over > w * 0.45) continue;
      if (overlaps(r, taken)) continue;
      taken.push(r); show.add(c.key); c.far ? nFar++ : nNear++;
      const fade = Math.min(1, Math.max(0, (FADE[1] - c.dist) / (FADE[1] - FADE[0]))); // fades out as it gets farther, back in as you near it
      const op = 0.96 * fade * (1 - over / (w * 0.45));
      n.el.style.setProperty('--o', op.toFixed(2));
      n.el.style.transform = `translate(${c.x}px, ${c.y}px) translate(-50%, -100%) scale(calc(${sc.toFixed(3)} * var(--hz)))`;
      if (!n.on) { n.on = true; n.el.classList.add('on'); n.el.tabIndex = 0; }
    }
    pool.forEach((n, k) => { if (!show.has(k) && n.on) { n.on = false; n.el.classList.remove('on'); n.el.tabIndex = -1; if (armed?.el === n.el) disarm(); } });
    zones(t);
  }

  // ---- entering / leaving localities (boundary polygons when known, else nearest locality) ----
  // A big title in the style of "Welcome to …" (waits until that welcome title has finished),
  // and the place's own name on the sea glows for a moment.
  let cur = null, pend = null, pendT = 0, lastZ = -9, queue = [], toastT = 0, arrive = null, arriveT = 0;
  let ready = false; { const w = document.getElementById('welcome'); const go = () => { ready = true; };
    if (w && getComputedStyle(w).animationName !== 'none') { w.addEventListener('animationend', go, { once: true }); setTimeout(go, 6000); } else go(); }
  const keyOf = n => n.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
  function zones(t) {
    if (t - lastZ > 0.4) { lastZ = t;
      const z = zoneAt(boat.position.x, boat.position.z), name = z?.name || null;
      if (name !== (cur?.name || null)) {
        // a little hysteresis at the edges so a boat on a border doesn't flicker
        if (pend?.name !== name) { pend = z || { name: null }; pendT = t; }
        else if (t - pendT > (z && !z.poly ? 1.2 : 0.6)) { queue = [z ? { verb: 'Entering', z, from: cur } : { verb: 'Leaving', z: cur }]; cur = z; pend = null; onZone?.(z); }
      } else pend = null;
    }
    if (ready && queue.length && t > toastT) { const { verb, z } = queue.shift(); toastT = t + 3.2;
      toast.className = verb === 'Leaving' ? 'leaving' : '';
      toast.innerHTML = `<small>${verb}</small><b></b>`; toast.querySelector('b').textContent = z.name;
      void toast.offsetWidth; toast.classList.add('show');
      if (verb === 'Entering') { arrive = 'p:' + keyOf(z.name); arriveT = t + 3.2; } }
    // the arriving place's name glows on the sea while the title shows
    pool.forEach((n, k) => n.el.classList.toggle('arrive', k === arrive && t < arriveT));
    layer.classList.toggle('quiet', t < arriveT || (t < toastT && toast.classList.contains('leaving'))); // other horizon names dim behind the title
  }

  return { update, get cancelled() { return performance.now() - cancelAt < 800; }, get level() { return level; }, get zone() { return cur; } };
}
