// The city on land for the Drive mode: the real streets (with kerbs and centre lines on the bigger roads), the
// buildings as blocks, parks and water, built per map tile round the car from the same map the sea uses (geo.js:
// Mapbox tiles, or OpenStreetMap). Also answers where the car is: on which road, and whether a building or water
// is in the way.
import { cityTile, tilesIn, tileRect, geoCacheGet, geoCachePut } from '../geo.js';
import { WORLD } from '../world.js';

const Z = 14;               // map tile zoom (~2.4 km a side here)
const NEAR = 1400;          // metres: tiles loaded and drawn within this of the car
const DROP = 2600;          // metres: tiles farther than this are dropped from the scene
// road widths (metres) by class, and which ones get a dashed centre line
export const WIDTH = { motorway: 16, trunk: 14, primary: 12, secondary: 10, tertiary: 8.5, street: 6.5, service: 4.5 };
const DASHED = new Set(['motorway', 'trunk', 'primary', 'secondary', 'tertiary']);
const CELL = 60;            // metres: the grid the road and building lookups use
const PALETTE = ['#f3e6d0', '#efd9c3', '#e8dccb', '#f1e3c9', '#e3d6e6', '#d9e4ec', '#f0d7cf', '#e6e8d6', '#f5eedd', '#dfe7dc'];
const h01 = (a, b) => { let h = Math.imul((Math.round(a) * 73856093) ^ (Math.round(b) * 19349663), 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const inRing = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const boxOf = ring => { let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity; ring.forEach(([x, z]) => { a = Math.min(a, x); b = Math.min(b, z); c = Math.max(c, x); d = Math.max(d, z); }); return [a, b, c, d]; };

export function createCity({ THREE, scene, fade = () => {} }) {
  const V3 = THREE.Vector3;
  // ---------- materials ----------
  const dashTex = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 8; const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, 36, 8);
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const MAT = {
    kerb: new THREE.MeshLambertMaterial({ color: '#cfd3d6', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    road: new THREE.MeshLambertMaterial({ color: '#5b6068', polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    major: new THREE.MeshLambertMaterial({ color: '#4d525a', polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }),
    dash: new THREE.MeshBasicMaterial({ color: '#fff4cf', map: dashTex, alphaTest: 0.5, transparent: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    building: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }), // (walls: either winding)
    water: new THREE.MeshLambertMaterial({ color: '#5fb8de', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    green: new THREE.MeshLambertMaterial({ color: '#a9d68b', polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };
  Object.values(MAT).forEach(m => fade(m));
  // the ground: one big plane that follows the car
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000), new THREE.MeshLambertMaterial({ color: '#e9e3d2' })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; fade(ground.material); scene.add(ground);

  // ---------- geometry builders ----------
  // a triangle of a flat surface, wound to face up (lit from above, never shown from below)
  const upTri = (P, I, a, b, c) => { const ax = P[a * 3], az = P[a * 3 + 2], cy = (P[b * 3 + 2] - az) * (P[c * 3] - ax) - (P[b * 3] - ax) * (P[c * 3 + 2] - az); if (cy >= 0) I.push(a, b, c); else I.push(a, c, b); };
  // a ribbon along a polyline (width w, at height y); u runs along it in metres / period
  function ribbon(pts, w, y, period, P, N, U, I) {
    const n = pts.length; if (n < 2) return; const base = P.length / 3; let len = 0;
    for (let i = 0; i < n; i++) {
      const [x, z] = pts[i], [ax, az] = pts[Math.max(0, i - 1)], [bx, bz] = pts[Math.min(n - 1, i + 1)];
      let dx = bx - ax, dz = bz - az; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      // miter: the average of the two segments' normals, stretched (but not too far at sharp corners)
      let nx = -dz, nz = dx, k = 1;
      if (i > 0 && i < n - 1) { const [px, pz] = pts[i - 1], l1 = Math.hypot(x - px, z - pz) || 1, l2 = Math.hypot(bx - x, bz - z) || 1, n1x = -(z - pz) / l1, n1z = (x - px) / l1, n2x = -(bz - z) / l2, n2z = (bx - x) / l2;
        nx = n1x + n2x; nz = n1z + n2z; const m = Math.hypot(nx, nz) || 1; nx /= m; nz /= m; k = Math.min(2.2, 1 / Math.max(0.3, nx * n1x + nz * n1z)); }
      if (i > 0) len += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
      const hw = w / 2 * k;
      P.push(x + nx * hw, y, z + nz * hw, x - nx * hw, y, z - nz * hw); N.push(0, 1, 0, 0, 1, 0); U.push(len / period, 0, len / period, 1);
      if (i) { const a = base + (i - 1) * 2; upTri(P, I, a, a + 1, a + 2); upTri(P, I, a + 1, a + 3, a + 2); }
    }
    // round-ish ends: a small square cap (so joins at junctions close up)
  }
  const meshOf = (P, N, U, I, mat, name) => { if (!I.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    if (U) g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.name = name; m.receiveShadow = true; return m; };
  // flat polygons (water, parks) at a height
  function flats(rings, y, mat, name) {
    const P = [], N = [], I = [];
    rings.forEach(r => { const pts = r.map(([x, z]) => new THREE.Vector2(x, z)); if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse(); let tri; try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch { return; }
      const b = P.length / 3; pts.forEach(p => { P.push(p.x, y, p.y); N.push(0, 1, 0); }); tri.forEach(([a, c, d]) => upTri(P, I, b + a, b + c, b + d)); });
    return meshOf(P, N, null, I, mat, name);
  }
  // buildings: walls and a flat roof, a soft colour each, merged into one mesh per tile
  function blocks(list) {
    const P = [], N = [], C = [], I = [], col = new THREE.Color();
    list.forEach(({ ring, h }) => {
      const pts = ring.map(([x, z]) => new THREE.Vector2(x, z)); if (pts.length > 2 && pts[0].equals(pts[pts.length - 1])) pts.pop(); if (pts.length < 3) return;
      if (THREE.ShapeUtils.isClockWise(pts)) pts.reverse();
      const [cx, cz] = [pts[0].x, pts[0].y], H = h || 6 + Math.floor(h01(cx, cz) * 4) * 3.2; col.set(PALETTE[Math.floor(h01(cz, cx) * PALETTE.length)]);
      for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], dx = b.x - a.x, dz = b.y - a.y, l = Math.hypot(dx, dz) || 1, nx = dz / l, nz = -dx / l, s = 0.82 + 0.1 * Math.abs(nx);
        const v = P.length / 3; P.push(a.x, 0, a.y, b.x, 0, b.y, b.x, H, b.y, a.x, H, a.y); for (let k = 0; k < 4; k++) { N.push(nx, 0, nz); C.push(col.r * s, col.g * s, col.b * s); } I.push(v, v + 1, v + 2, v, v + 2, v + 3); }
      let tri; try { tri = THREE.ShapeUtils.triangulateShape(pts, []); } catch { return; }
      const r0 = P.length / 3; pts.forEach(p => { P.push(p.x, H, p.y); N.push(0, 1, 0); C.push(col.r * 1.04, col.g * 1.04, col.b * 1.04); }); tri.forEach(([a, c, d]) => upTri(P, I, r0 + a, r0 + c, r0 + d));
    });
    if (!I.length) return null; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); g.setIndex(I); g.computeBoundingSphere();
    const m = new THREE.Mesh(g, MAT.building); m.castShadow = true; m.receiveShadow = true; m.name = 'buildings'; return m;
  }

  // ---------- tiles ----------
  const tiles = new Map(); // key -> { group, rect, data }
  const roadGrid = new Map(), solidGrid = new Map(); // cell -> [segments] / [{ ring, box, kind }]
  const gk = (x, z) => `${Math.floor(x / CELL)},${Math.floor(z / CELL)}`;
  const cellsOf = (x0, z0, x1, z1, f) => { for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) f(`${i},${j}`); };
  function index(key, d) {
    d.roads.forEach(r => { const w = WIDTH[r.cls] || 6; for (let i = 1; i < r.pts.length; i++) { const [ax, az] = r.pts[i - 1], [bx, bz] = r.pts[i], s = { ax, az, bx, bz, w, road: r, key };
      cellsOf(Math.min(ax, bx) - w, Math.min(az, bz) - w, Math.max(ax, bx) + w, Math.max(az, bz) + w, k => (roadGrid.get(k) || roadGrid.set(k, []).get(k)).push(s)); } });
    const solid = (ring, kind) => { const box = boxOf(ring), o = { ring, box, kind, key }; cellsOf(box[0], box[1], box[2], box[3], k => (solidGrid.get(k) || solidGrid.set(k, []).get(k)).push(o)); };
    d.buildings.forEach(b => solid(b.ring, 'building')); d.water.forEach(r => solid(r, 'water'));
  }
  function build(key, d) {
    const g = new THREE.Group(); g.name = 'city_' + key;
    const L = { kerb: [[], [], [], []], road: [[], [], [], []], major: [[], [], [], []], dash: [[], [], [], []] };
    d.roads.forEach(r => { const w = WIDTH[r.cls] || 6, big = DASHED.has(r.cls);
      ribbon(r.pts, w + 2.6, 0.04, 1, ...L.kerb); ribbon(r.pts, w, 0.07, 1, ...(big ? L.major : L.road));
      if (big) ribbon(r.pts, 0.3, 0.09, 6, ...L.dash); });
    Object.entries(L).forEach(([k, a]) => { const m = meshOf(...a, MAT[k], 'road_' + k); if (m) g.add(m); });
    const w = flats(d.water, 0.03, MAT.water, 'water'); if (w) g.add(w);
    const gr = flats(d.green, 0.02, MAT.green, 'green'); if (gr) g.add(gr);
    const b = blocks(d.buildings); if (b) g.add(b);
    scene.add(g); return g;
  }
  async function loadTile(x, y) {
    const key = `${Z}/${x}/${y}`; if (tiles.has(key)) return; const t = { group: null, rect: tileRect(x, y, Z), loading: true }; tiles.set(key, t);
    let d = await geoCacheGet('city:' + key);
    if (!d) { d = await cityTile(x, y, Z).catch(() => null); if (!d) { tiles.delete(key); return; } geoCachePut('city:' + key, d); }
    t.data = d; t.loading = false; index(key, d); t.group = build(key, d); t.on = true; changed = true;
  }
  function dropTile(key) { const t = tiles.get(key); if (!t?.group) return; t.group.removeFromParent(); t.group.traverse(o => o.geometry?.dispose()); t.group = null; t.on = false; }
  function showTile(key) { const t = tiles.get(key); if (!t?.data || t.group) return; t.group = build(key, t.data); t.on = true; }
  let askT = 0, changed = false;
  /** Every frame: tiles round the car loaded and drawn, far ones dropped (their lookups stay). */
  function update(dt, cx, cz) {
    ground.position.set(cx, 0, cz);
    if ((askT -= dt) > 0) return; askT = 1;
    const H = WORLD.half, want = tilesIn(Math.max(-H, cx - NEAR), Math.max(-H, cz - NEAR), Math.min(H, cx + NEAR), Math.min(H, cz + NEAR), Z)
      .map(([x, y]) => ({ x, y, r: tileRect(x, y, Z) })).sort((a, b) => Math.hypot((a.r.x0 + a.r.x1) / 2 - cx, (a.r.z0 + a.r.z1) / 2 - cz) - Math.hypot((b.r.x0 + b.r.x1) / 2 - cx, (b.r.z0 + b.r.z1) / 2 - cz));
    want.forEach(({ x, y }) => { const k = `${Z}/${x}/${y}`; if (!tiles.has(k)) loadTile(x, y); else showTile(k); });
    tiles.forEach((t, k) => { const mx = (t.rect.x0 + t.rect.x1) / 2, mz = (t.rect.z0 + t.rect.z1) / 2; if (Math.hypot(mx - cx, mz - cz) > DROP) dropTile(k); });
  }

  // ---------- lookups ----------
  /** The nearest road to a point within `r` metres: { road, d (to its middle line), w, x, z (closest point), dir: [dx, dz] } or null. */
  function nearestRoad(x, z, r = 40) {
    let best = null, bd = r;
    cellsOf(x - r, z - r, x + r, z + r, k => { for (const s of roadGrid.get(k) || []) {
      const vx = s.bx - s.ax, vz = s.bz - s.az, L2 = vx * vx + vz * vz || 1, u = Math.max(0, Math.min(1, ((x - s.ax) * vx + (z - s.az) * vz) / L2)), px = s.ax + vx * u, pz = s.az + vz * u, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; const l = Math.sqrt(L2); best = { road: s.road, d, w: s.w, x: px, z: pz, dir: [vx / l, vz / l] }; } } });
    return best;
  }
  /** Is the point on a road's surface? */
  const onRoad = (x, z) => { const n = nearestRoad(x, z, 12); return !!n && n.d <= n.w / 2 + 0.8; };
  /** A building or water at this point (its kind), else null. */
  function solidAt(x, z) { for (const o of solidGrid.get(gk(x, z)) || []) { const b = o.box; if (x < b[0] || x > b[2] || z < b[1] || z > b[3]) continue; if (inRing(o.ring, x, z)) return o.kind; } return null; }
  return { update, nearestRoad, onRoad, solidAt, get loaded() { let n = 0; tiles.forEach(t => { if (t.data) n++; }); return n; }, get changed() { const c = changed; changed = false; return c; } };
}
