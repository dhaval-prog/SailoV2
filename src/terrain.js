// The sea's terrain, from the map under it (Mapbox vector tiles, geo.js):
// - Rocks where the buildings are: a dense block becomes a medium rock, a big complex (a mall, a campus) a huge one.
//   They're hurdles: the boat can't sail through them, so getting about takes some steering. They're spaced so a
//   channel always stays open between two (GAP metres at least), and kept clear of every Paradise Station and of
//   the harbour where voyages start.
// - Green corals where the map is green (parks, grass, woods, pitches): seen through the water, beneath the surface.
// Both are worked out per map tile, the same way on every device (the same tile, the same rocks), and drawn only
// near the boat, a handful of instanced meshes in all.
import { tilesIn, tileRect, mapShapes, geoCacheGet, geoCachePut, provider } from './geo.js';
import { WORLD } from './world.js';
import { TERRAIN as T } from './world-config.js';

const h01 = (a, b, s = 0) => { let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (s * 83492791), 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const area = ring => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(a / 2); };
const centroid = ring => { let x = 0, z = 0; ring.forEach(p => { x += p[0]; z += p[1]; }); return [x / ring.length, z / ring.length]; };
const inRing = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const GREEN = /^(park|grass|wood|scrub|pitch|cemetery|agriculture|golf_course|garden|forest|meadow|national_park|nature_reserve|wetland)$/;

/** A tile's rocks: [{ x, z, r, h, k (shape), a (turn) }]. */
function rocksOf(shapes, rect, clear) {
  const cells = new Map(), C = T.cell, cand = [];
  shapes.forEach(({ ring }) => { const a = area(ring); if (a < 30) return; const [cx, cz] = centroid(ring);
    if (a >= T.hugeArea) cand.push({ x: cx, z: cz, r: Math.min(T.hugeMax, Math.max(T.hugeMin, Math.sqrt(a) * 0.42)), huge: true });
    const k = `${Math.floor(cx / C)},${Math.floor(cz / C)}`, c = cells.get(k) || { a: 0, x: 0, z: 0 }; c.a += a; c.x += cx * a; c.z += cz * a; cells.set(k, c); });
  cells.forEach(c => { const cov = c.a / (C * C); if (cov < T.dense) return; cand.push({ x: c.x / c.a, z: c.z / c.a, r: T.medMin + (T.medMax - T.medMin) * Math.min(1, (cov - T.dense) / 0.5) }); });
  cand.sort((a, b) => b.r - a.r || a.x - b.x || a.z - b.z);
  const out = [], m = T.edge;
  cand.forEach(c => {
    if (c.x < rect.x0 + m || c.x > rect.x1 - m || c.z < rect.z0 + m || c.z > rect.z1 - m) return; // (a lane along every tile edge)
    if (Math.abs(c.x) > WORLD.half - 60 || Math.abs(c.z) > WORLD.half - 60 || clear(c.x, c.z, c.r)) return;
    if (out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < o.r + c.r + T.gap)) return;
    const s = h01(Math.round(c.x), Math.round(c.z), 1);
    out.push({ x: c.x, z: c.z, r: c.r, h: c.huge ? 5 + s * 4 : 2.5 + s * 3, k: Math.floor(h01(Math.round(c.x), Math.round(c.z), 2) * 3), a: s * Math.PI * 2 });
  });
  return out;
}
/** A tile's corals: [{ x, z, s (size), k (kind), a (turn), g (shade) }]. */
function coralsOf(shapes, clear) {
  const out = [], S = T.coralStep;
  shapes.forEach(({ ring }) => {
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; ring.forEach(([x, z]) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); });
    let n = 0;
    for (let gx = Math.ceil(x0 / S); gx * S <= x1 && n < T.coralsPerArea; gx++) for (let gz = Math.ceil(z0 / S); gz * S <= z1 && n < T.coralsPerArea; gz++) {
      const j = h01(gx, gz, 3), x = (gx + (j - 0.5) * 0.8) * S, z = (gz + (h01(gx, gz, 4) - 0.5) * 0.8) * S;
      if (!inRing(ring, x, z) || clear(x, z, 0) || h01(gx, gz, 5) > T.coralFill) continue;
      out.push({ x, z, s: T.coralMin + (T.coralMax - T.coralMin) * h01(gx, gz, 6), k: Math.floor(h01(gx, gz, 7) * 5), a: h01(gx, gz, 8) * Math.PI * 2, g: h01(gx, gz, 9) }); n++;
    }
  });
  return out;
}

/**
 * @param o.stations [{ x, z }]   every Paradise Station (kept clear)
 * @param o.getBoat () => ({ x, z })
 */
export function createTerrain({ THREE, scene, WL, stations, getBoat, onHit }) {
  const on = provider === 'mapbox'; // (OpenStreetMap has no footprints at this scale: then there are none)
  const clear = (x, z, r) => Math.hypot(x, z) < T.startClear + r || stations.some(s => Math.hypot(s.x - x, s.z - z) < T.stationClear + r);
  const rocks = new Map(), corals = new Map(), loading = new Set(); // tile key → list
  const grid = new Map(); // rocks by 100 m square, for collisions
  const gkey = (x, z) => `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
  async function load(kind, z, x, y) {
    const key = `${kind}:${z}/${x}/${y}`, store = kind === 'rocks' ? rocks : corals; if (store.has(key) || loading.has(key)) return; loading.add(key);
    try {
      let list = await geoCacheGet('terrain-v4:' + key);
      if (!list) {
        const shapes = await mapShapes(kind === 'rocks' ? 'building' : 'landuse', x, y, z, kind === 'rocks' ? () => true : cls => GREEN.test(cls));
        if (!shapes) return; // (offline: try again later)
        list = kind === 'rocks' ? rocksOf(shapes, tileRect(x, y, z), clear) : coralsOf(shapes, clear);
        geoCachePut('terrain-v4:' + key, list);
      }
      store.set(key, list);
      if (kind === 'rocks') list.forEach(r => { const e = r.r + T.boatPad; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const k = gkey(r.x + i * e, r.z + j * e); if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(r); } });
      dirty = true;
    } finally { loading.delete(key); }
  }

  // ---------- drawing: rocks (three shapes, each with its ink outline and a ring of foam) and corals (five kinds) ----------
  const rockGeos = [0, 1, 2].map(k => { const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.22 * Math.sin(v.x * (3 + k) + k) * Math.cos(v.z * (2.6 + k)) + 0.12 * Math.sin(v.y * 5.3 + k * 2); v.multiplyScalar(n); if (v.y < -0.2) v.y = -0.2 - (v.y + 0.2) * 0.3; p.setXYZ(i, v.x, v.y, v.z); }
    g.computeVertexNormals(); return g; });
  const rockMat = new THREE.MeshStandardMaterial({ name: 'sea_rock', color: '#8a8276', roughness: 0.95, flatShading: true });
  const inkMat = new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#152042', side: THREE.BackSide });
  const foamMat = new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0.4, depthWrite: false });
  const foamGeo = new THREE.RingGeometry(1.02, 1.28, 32); foamGeo.rotateX(-Math.PI / 2);
  const MAXR = 900, VIS = 0.86, rockIM = rockGeos.map(g => new THREE.InstancedMesh(g, rockMat, MAXR)), inkIM = rockGeos.map(g => new THREE.InstancedMesh(g, inkMat, MAXR)), foamIM = new THREE.InstancedMesh(foamGeo, foamMat, MAXR * 3);
  [...rockIM, ...inkIM, foamIM].forEach(m => { m.count = 0; m.frustumCulled = false; scene.add(m); }); rockIM.forEach(m => { m.castShadow = m.receiveShadow = true; });
  // corals: drawn on canvases (branching staghorn, a brain coral, a fan, tubes, kelp), in greens, seen through the water
  const coralTex = [0, 1, 2, 3, 4].map(k => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.translate(64, 64); x.lineCap = 'round';
    const rnd = (n => () => (n = (n * 16807) % 2147483647) / 2147483647)(k * 977 + 5);
    if (k === 0) { const br = (len, w, a, d) => { if (d > 4 || len < 4) return; const ex = Math.cos(a) * len, ey = Math.sin(a) * len; x.lineWidth = w; x.strokeStyle = '#fff'; x.beginPath(); x.moveTo(0, 0); x.lineTo(ex, ey); x.stroke(); x.save(); x.translate(ex, ey); br(len * 0.72, w * 0.7, a - 0.5 - rnd() * 0.3, d + 1); br(len * 0.7, w * 0.7, a + 0.45 + rnd() * 0.3, d + 1); x.restore(); };
      for (let i = 0; i < 6; i++) br(22 + rnd() * 8, 7, i / 6 * Math.PI * 2 + rnd() * 0.4, 0); }
    else if (k === 1) { x.fillStyle = '#fff'; x.beginPath(); x.arc(0, 0, 46, 0, Math.PI * 2); x.fill(); x.strokeStyle = 'rgba(0,0,0,0.55)'; x.lineWidth = 3; x.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) { x.beginPath(); for (let t = -44; t <= 44; t += 4) { const y = (i - 4) * 10 + Math.sin(t * 0.18 + i) * 4; t === -44 ? x.moveTo(t, y) : x.lineTo(t, y); } x.stroke(); } }
    else if (k === 2) { x.strokeStyle = '#fff'; for (let i = 0; i < 26; i++) { const a = -Math.PI * 0.95 + i / 25 * Math.PI * 0.9; x.lineWidth = 2.2; x.beginPath(); x.moveTo(0, 40); x.quadraticCurveTo(Math.cos(a) * 30, 40 + Math.sin(a) * 30, Math.cos(a) * 56, 40 + Math.sin(a) * 70); x.stroke(); } }
    else if (k === 3) { x.fillStyle = '#fff'; for (let i = 0; i < 14; i++) { const a = rnd() * Math.PI * 2, d = rnd() * 34, r = 6 + rnd() * 7; x.beginPath(); x.arc(Math.cos(a) * d, Math.sin(a) * d, r, 0, Math.PI * 2); x.fill(); } x.globalCompositeOperation = 'destination-out'; for (let i = 0; i < 14; i++) { x.beginPath(); x.arc((rnd() - 0.5) * 60, (rnd() - 0.5) * 60, 2.5, 0, Math.PI * 2); x.fill(); } }
    else { x.strokeStyle = '#fff'; for (let i = 0; i < 9; i++) { x.lineWidth = 5; x.beginPath(); const sx = (i - 4) * 11; x.moveTo(sx, 58); for (let t = 0; t <= 1; t += 0.1) x.lineTo(sx + Math.sin(t * 6 + i) * 9, 58 - t * 112); x.stroke(); } }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; });
  const MAXC = 1400, coralGeo = new THREE.PlaneGeometry(1, 1); coralGeo.rotateX(-Math.PI / 2);
  const coralIM = coralTex.map(map => { const m = new THREE.InstancedMesh(coralGeo, new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.72, depthWrite: false, color: '#ffffff' }), MAXC);
    m.count = 0; m.frustumCulled = false; m.renderOrder = -1; scene.add(m); return m; });
  const GREENS = ['#2fbf71', '#6ad46b', '#1f9e6e', '#9be15d', '#3ccf9a', '#7fbf3f'].map(c => new THREE.Color(c));

  let dirty = false, at = { x: 0, z: 0 }, gat = null, lastLoad = 0;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  // a rock between the camera and the boat isn't drawn, so it never hides your boat
  let cam = null; const hides = r => { if (!cam) return false; const ax = cam.x, az = cam.z, bx = at.x - ax, bz = at.z - az, L2 = bx * bx + bz * bz; if (!L2) return false;
    const u = ((r.x - ax) * bx + (r.z - az) * bz) / L2; if (u <= 0 || u >= 1) return false; return Math.hypot(r.x - (ax + bx * u), r.z - (az + bz * u)) < r.r + 3; };
  let nearR = [], nearC = [];
  function gather(b) { const near = (o, d) => Math.abs(o.x - b.x) < d && Math.abs(o.z - b.z) < d; nearR = []; nearC = [];
    rocks.forEach(list => list.forEach(r => { if (near(r, T.drawRocks)) nearR.push(r); })); corals.forEach(list => list.forEach(c => { if (near(c, T.drawCorals)) nearC.push(c); }));
    const nc = [0, 0, 0, 0, 0];
    nearC.forEach(c => { const k = c.k, i = nc[k]; if (i >= MAXC) return; nc[k]++;
      Q.setFromAxisAngle(UP, c.a); V.set(c.x, WL + 0.03, c.z); Sc.set(c.s, 1, c.s); M4.compose(V, Q, Sc); coralIM[k].setMatrixAt(i, M4);
      col.copy(GREENS[Math.floor(c.g * GREENS.length)]); coralIM[k].setColorAt(i, col); });
    coralIM.forEach((m, k) => { m.count = nc[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }); }
  function paint() { // (the rocks near the boat, every time the camera moves: one between it and the boat isn't drawn)
    const nr = [0, 0, 0]; let nf = 0;
    nearR.forEach(r => { const k = r.k, i = nr[k]; if (i >= MAXR) return;
      V.set(r.x, WL + 0.06, r.z); Sc.set(r.r * VIS * 1.02, 1, r.r * VIS * 1.02); Q.setFromAxisAngle(UP, r.a); M4.compose(V, Q, Sc); foamIM.setMatrixAt(nf++, M4);
      if (hides(r)) return; nr[k]++;
      V.set(r.x, WL - r.h * 0.18, r.z); Sc.set(r.r * VIS, r.h, r.r * VIS); M4.compose(V, Q, Sc); rockIM[k].setMatrixAt(i, M4);
      Sc.multiplyScalar(1.05); M4.compose(V, Q, Sc); inkIM[k].setMatrixAt(i, M4); });
    rockIM.forEach((m, k) => { m.count = nr[k]; m.instanceMatrix.needsUpdate = true; inkIM[k].count = nr[k]; inkIM[k].instanceMatrix.needsUpdate = true; });
    foamIM.count = nf; foamIM.instanceMatrix.needsUpdate = true;
  }

  /** Would a boat here hit a rock? (radius: the boat's own clearance) */
  function blocked(x, z, pad = T.boatPad) {
    const s = grid.get(gkey(x, z)); if (!s) return false;
    for (const r of s) if (Math.hypot(r.x - x, r.z - z) < r.r * 1.02 + pad) return r; // (to the rock's visible edge)
    return false;
  }
  let hitT = 0;
  return {
    blocked,
    /** A bump: the note, at most every few seconds. */
    hit() { const now = performance.now(); if (now - hitT > 3000) { hitT = now; onHit?.(); } },
    /** Every frame: load the tiles round the boat, and draw what's near. */
    update(camera) {
      if (!on) return; const b = getBoat(), now = performance.now();
      if (now - lastLoad > 1500) { lastLoad = now; const R = T.loadAround;
        tilesIn(b.x - R, b.z - R, b.x + R, b.z + R, 15).forEach(([x, y]) => load('rocks', 15, x, y));
        tilesIn(b.x - R, b.z - R, b.x + R, b.z + R, 14).forEach(([x, y]) => load('corals', 14, x, y)); }
      const moved = camera && (!cam || Math.hypot(camera.position.x - cam.x, camera.position.z - cam.z) > 2);
      if (dirty || !gat || Math.hypot(b.x - gat.x, b.z - gat.z) > T.repaint) { dirty = false; gat = { x: b.x, z: b.z }; gather(b); paint(); }
      else if (moved || Math.hypot(b.x - at.x, b.z - at.z) > 2) paint();
      at = { x: b.x, z: b.z }; if (camera) cam = { x: camera.position.x, z: camera.position.z };
    },
    /** (tests) the nearest coral to a point */
    _coralNear(x, z) { let best = null, bd = Infinity; corals.forEach(l => l.forEach(c => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } })); return best; },
    get counts() { let r = 0, c = 0; rocks.forEach(l => { r += l.length; }); corals.forEach(l => { c += l.length; }); return { rocks: r, corals: c, drawn: rockIM.reduce((a, m) => a + m.count, 0), coralsDrawn: coralIM.reduce((a, m) => a + m.count, 0) }; },
  };
}
