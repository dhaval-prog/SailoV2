// The sea's terrain, from the map under it (Mapbox vector tiles, geo.js):
// - Rocks where the buildings are: a dense block becomes a medium rock, a big complex (a mall, a campus) a huge one.
//   They're hurdles: the boat can't sail through them, so getting about takes some steering. They're spaced so a
//   channel always stays open between two (GAP metres at least), and kept clear of every Paradise Station and of
//   the harbour where voyages start.
// - Green corals where the map is green (parks, grass, woods, pitches): seen through the water, beneath the surface.
// Both are worked out per map tile, the same way on every device (the same tile, the same rocks), and drawn only
// near the boat: a mesh (and its outline) per map tile of rocks, and a handful of instanced meshes.
import { tilesIn, tileRect, mapShapes, geoCacheGet, geoCachePut, provider } from './geo.js';
import { WORLD } from './world.js';
import { TERRAIN as T } from './world-config.js';
import { rockBuilder } from './rock-shapes.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const h01 = (a, b, s = 0) => { let h = Math.imul((a * 73856093) ^ (b * 19349663) ^ (s * 83492791), 0x9E3779B1); h ^= h >>> 15; h = Math.imul(h, 0x85EBCA6B); h ^= h >>> 13; return (h >>> 0) / 4294967296; };
const area = ring => { let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]); return Math.abs(a / 2); };
const centroid = ring => { let x = 0, z = 0; ring.forEach(p => { x += p[0]; z += p[1]; }); return [x / ring.length, z / ring.length]; };
const inRing = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
const GREEN = /^(park|grass|wood|scrub|pitch|cemetery|agriculture|golf_course|garden|forest|meadow|national_park|nature_reserve|wetland)$/;

/** A tile's rocks: [{ x, z, r, h, k (shape), a (turn) }]. */
function rocksOf(shapes, rect, clear) {
  const cells = new Map(), C = T.cell, cand = [];
  shapes.forEach(({ ring }) => { const a = area(ring); if (a < 30) return; const [cx, cz] = centroid(ring);
    if (a >= T.hugeArea) cand.push({ x: cx, z: cz, r: T.bigR, huge: true });
    const k = `${Math.floor(cx / C)},${Math.floor(cz / C)}`, c = cells.get(k) || { a: 0, x: 0, z: 0 }; c.a += a; c.x += cx * a; c.z += cz * a; cells.set(k, c); });
  cells.forEach(c => { const cov = c.a / (C * C); if (cov < T.dense) return; cand.push({ x: c.x / c.a, z: c.z / c.a, r: T.medR }); });
  cand.sort((a, b) => b.r - a.r || a.x - b.x || a.z - b.z);
  const out = [], m = T.edge;
  cand.forEach(c => {
    if (c.x < rect.x0 + m || c.x > rect.x1 - m || c.z < rect.z0 + m || c.z > rect.z1 - m) return; // (a lane along every tile edge)
    if (Math.abs(c.x) > WORLD.half - 60 || Math.abs(c.z) > WORLD.half - 60 || clear(c.x, c.z, c.r)) return;
    if (out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < o.r + c.r + T.gap)) return;
    const s = h01(Math.round(c.x), Math.round(c.z), 1), v = 0.92 + s * 0.16; // (each a little different, ±8%)
    out.push({ x: c.x, z: c.z, r: c.r * v, h: (c.huge ? T.bigH : T.medH) * (0.92 + h01(Math.round(c.x), Math.round(c.z), 3) * 0.16), k: Math.floor(h01(Math.round(c.x), Math.round(c.z), 2) * 3), a: s * Math.PI * 2 });
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
export function createTerrain({ THREE, scene, WL, stations, getBoat, onHit, onWarn, emit, amp = () => 1, light = () => 1, fade = () => {} }) {
  const on = provider === 'mapbox'; // (OpenStreetMap has no footprints at this scale: then there are none)
  const clear = (x, z, r) => Math.hypot(x, z) < T.startClear + r || stations.some(s => Math.hypot(s.x - x, s.z - z) < T.stationClear + r);
  const rocks = new Map(), corals = new Map(), loading = new Set(); // tile key → list
  const grid = new Map(); // rocks by 100 m square, for collisions
  const gkey = (x, z) => `${Math.floor(x / 100)},${Math.floor(z / 100)}`;
  async function load(kind, z, x, y) {
    const key = `${kind}:${z}/${x}/${y}`, store = kind === 'rocks' ? rocks : corals; if (store.has(key) || loading.has(key)) return; loading.add(key);
    try {
      let list = await geoCacheGet('terrain-v7:' + key);
      if (!list) {
        const shapes = await mapShapes(kind === 'rocks' ? 'building' : 'landuse', x, y, z, kind === 'rocks' ? () => true : cls => GREEN.test(cls));
        if (!shapes) return; // (offline: try again later)
        list = kind === 'rocks' ? rocksOf(shapes, tileRect(x, y, z), clear) : coralsOf(shapes, clear);
        geoCachePut('terrain-v7:' + key, list);
      }
      store.set(key, list);
      if (kind === 'rocks') list.forEach(r => { const e = r.r + T.boatPad; for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const k = gkey(r.x + i * e, r.z + j * e); if (!grid.has(k)) grid.set(k, new Set()); grid.get(k).add(r); } });
      dirty = true;
    } finally { loading.delete(key); }
  }

  // ---------- drawing: rocks (each one built from its own seed: rock-shapes.js), a tile's worth in one mesh with its
  // ink outline; a ring of foam and a glow of shallows round each; and corals (five kinds) ----------
  const RB = rockBuilder(THREE), uTime = { value: 0 }, uCam = { value: new THREE.Vector2() }, uBoat = { value: new THREE.Vector2() }, uLight = { value: 1 };
  // a rock between the camera and the boat folds away (on the GPU), so it never hides your boat; the outline is the rock
  // again, a touch bigger round each part's middle, drawn from the inside
  const rockShader = (mat, ink) => { mat.onBeforeCompile = sh => { Object.assign(sh.uniforms, { uCam, uBoat, uLight });
    sh.vertexShader = 'attribute vec3 aRock; attribute vec3 aPart; uniform vec2 uCam, uBoat;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      ${ink ? 'transformed = aPart + (transformed - aPart) * 1.045 + normalize(transformed - aPart + vec3(0.0, 0.001, 0.0)) * 0.09;' : ''}
      { vec2 ab = uBoat - uCam; float u = dot(aRock.xy - uCam, ab) / max(dot(ab, ab), 1.0); vec2 q = uCam + ab * u;
        if (u > 0.0 && u < 1.0 && distance(aRock.xy, q) < aRock.z + 3.0) transformed = vec3(aRock.x, -80.0, aRock.y); }`);
    sh.fragmentShader = 'uniform float uLight;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= uLight;\n#include <opaque_fragment>'); };
    mat.customProgramCacheKey = () => ink ? 'sea-rock-ink' : 'sea-rock'; return mat; }; // (the two differ only inside: keep their shaders apart)
  const rockMat = rockShader(new THREE.MeshBasicMaterial({ name: 'sea_rock', vertexColors: true }), false);
  const inkMat = rockShader(new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#4a1d24', side: THREE.BackSide }), true);
  fade(rockMat); fade(inkMat); // (far off they dissolve into the haze)
  const tileMeshes = new Map(), toBuild = []; // tile key → { rock, ink }
  function buildTile(key) { const list = rocks.get(key); if (!list?.length || tileMeshes.has(key)) return;
    const geos = list.map(r => RB.build({ ...r, y0: WL })), g = mergeGeometries(geos, false); geos.forEach(q => q.dispose()); if (!g) return;
    g.computeBoundingSphere(); const rock = new THREE.Mesh(g, rockMat), ink = new THREE.Mesh(g, inkMat); rock.castShadow = true; scene.add(rock, ink); tileMeshes.set(key, { rock, ink }); }
  const foamMat = new THREE.MeshBasicMaterial({ color: '#f2fbff', transparent: true, opacity: 0.55, depthWrite: false });
  // the foam breathes with the swell: each ring swells and fades on its own beat
  foamMat.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime; varying float vPulse;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      float ph = (instanceMatrix[3].x + instanceMatrix[3].z) * 0.13; vPulse = 0.55 + 0.45 * sin(uTime * 1.4 + ph); transformed.xz *= 1.0 + 0.08 * sin(uTime * 1.4 + ph - 0.6);`);
    sh.fragmentShader = 'varying float vPulse;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', 'diffuseColor.a *= vPulse;\n#include <opaque_fragment>'); };
  // shallow water round every rock: a soft turquoise glow (it also says "hurdle ahead" from a way off)
  const glowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 18, 64, 64, 64);
    g.addColorStop(0, 'rgba(120,240,220,0.95)'); g.addColorStop(0.45, 'rgba(70,215,205,0.55)'); g.addColorStop(1, 'rgba(40,190,200,0)'); x.fillStyle = g; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glowGeo = new THREE.PlaneGeometry(1, 1); glowGeo.rotateX(-Math.PI / 2);
  const foamGeo = new THREE.RingGeometry(1.02, 1.28, 32); foamGeo.rotateX(-Math.PI / 2);
  const MAXR = 2700, foamIM = new THREE.InstancedMesh(foamGeo, foamMat, MAXR),
    glowIM = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.6, depthWrite: false }), MAXR);
  glowIM.renderOrder = -2;
  // shallow water over the reefs too: a softer turquoise wash under every coral, so a coral field reads as shallows
  const reefIM = new THREE.InstancedMesh(glowGeo, new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.32, depthWrite: false, color: '#bff7ff' }), 1400);
  reefIM.renderOrder = -3; reefIM.count = 0; reefIM.frustumCulled = false; scene.add(reefIM);
  [foamIM, glowIM].forEach(m => { m.count = 0; m.frustumCulled = false; scene.add(m); });
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
  // sunlight dancing over them through the water (caustics): a shimmer of light lines drifting across each coral
  const caustic = mat => { mat.onBeforeCompile = sh => { sh.uniforms.uTime = uTime;
    sh.vertexShader = 'varying vec2 vWp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vWp = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = 'uniform float uTime; varying vec2 vWp;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', `
      float c1 = sin(vWp.x * 0.9 + uTime * 1.1) + sin(vWp.y * 0.8 - uTime * 0.9) + sin((vWp.x + vWp.y) * 0.55 + uTime * 0.7);
      float c2 = sin(vWp.x * 1.7 - uTime * 1.3 + 1.7) + sin((vWp.y - vWp.x) * 1.3 + uTime);
      float lite = pow(max(0.0, 1.0 - abs(c1) * 0.55), 6.0) * 0.8 + pow(max(0.0, 1.0 - abs(c2) * 0.6), 8.0) * 0.6;
      outgoingLight += vec3(0.75, 1.0, 0.9) * lite * 0.55;
      #include <opaque_fragment>`); }; return mat; };
  const coralIM = coralTex.map(map => { const m = new THREE.InstancedMesh(coralGeo, caustic(new THREE.MeshBasicMaterial({ map, transparent: true, opacity: 0.72, depthWrite: false, color: '#ffffff' })), MAXC);
    m.count = 0; m.frustumCulled = false; m.renderOrder = -1; scene.add(m); return m; });
  const GREENS = ['#2fbf71', '#6ad46b', '#1f9e6e', '#9be15d', '#3ccf9a', '#7fbf3f'].map(c => new THREE.Color(c));

  let dirty = false, gat = null, lastLoad = 0;
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
  let nearR = [], nearC = [];
  function gather(b) { const near = (o, d) => Math.abs(o.x - b.x) < d && Math.abs(o.z - b.z) < d; nearR = []; nearC = [];
    rocks.forEach(list => list.forEach(r => { if (near(r, T.drawRocks)) nearR.push(r); })); corals.forEach(list => list.forEach(c => { if (near(c, T.drawCorals)) nearC.push(c); }));
    const nc = [0, 0, 0, 0, 0];
    nearC.forEach(c => { const k = c.k, i = nc[k]; if (i >= MAXC) return; nc[k]++;
      Q.setFromAxisAngle(UP, c.a); V.set(c.x, WL + 0.03, c.z); Sc.set(c.s, 1, c.s); M4.compose(V, Q, Sc); coralIM[k].setMatrixAt(i, M4);
      col.copy(GREENS[Math.floor(c.g * GREENS.length)]); coralIM[k].setColorAt(i, col); });
    coralIM.forEach((m, k) => { m.count = nc[k]; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; });
    let nr = 0; nearC.forEach(c => { if (nr >= 1400) return; Q.setFromAxisAngle(UP, c.a); V.set(c.x, WL + 0.015, c.z); Sc.set(c.s * 3.2, 1, c.s * 3.2); M4.compose(V, Q, Sc); reefIM.setMatrixAt(nr++, M4); });
    reefIM.count = nr; reefIM.instanceMatrix.needsUpdate = true; }
  function paint() { // (the foam and the shallows round the rocks near the boat)
    let nf = 0;
    nearR.forEach(r => { if (nf >= MAXR) return; const fr = r.r * 0.95;
      Q.setFromAxisAngle(UP, r.a); V.set(r.x, WL + 0.02, r.z); Sc.set(r.r * 2.4, 1, r.r * 2.4); M4.compose(V, Q, Sc); glowIM.setMatrixAt(nf, M4);
      V.set(r.x, WL + 0.06, r.z); Sc.set(fr, 1, fr); M4.compose(V, Q, Sc); foamIM.setMatrixAt(nf++, M4); });
    foamIM.count = nf; foamIM.instanceMatrix.needsUpdate = true; glowIM.count = nf; glowIM.instanceMatrix.needsUpdate = true;
  }

  /** Would a boat here hit a rock? (radius: the boat's own clearance) */
  function blocked(x, z, pad = T.boatPad) {
    const s = grid.get(gkey(x, z)); if (!s) return false;
    for (const r of s) if (Math.hypot(r.x - x, r.z - z) < r.r * 1.02 + pad) return r; // (to the rock's visible edge)
    return false;
  }
  // a bump: a hollow knock, chips and spray off the rock, a shake and a buzz (harder the faster you were going)
  let hitT = 0, ac = null;
  function thunk(k) { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25); g.gain.setValueAtTime(0.5 * k, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.4); } catch { /* no audio */ } }
  let warnT = 0, sprayT = 0;
  return {
    blocked,
    /** The boat met a rock at this speed (m/s) and point. */
    hit(speed = 0, x, z) { const now = performance.now(), k = Math.min(1, Math.abs(speed) / 5); if (now - hitT < 1800 || Math.abs(speed) < 1) return; hitT = now; // (pressing on against it isn't another bump)
      thunk(0.3 + 0.7 * k); if (navigator.vibrate) navigator.vibrate(Math.round(15 + 35 * k));
      if (emit && x != null) for (let i = 0; i < 8 + 14 * k; i++) emit(x + (Math.random() - 0.5) * 2, WL + 0.6, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 6, 2 + Math.random() * 4 * k, (Math.random() - 0.5) * 6);
      onHit?.(k); },
    /** Rocks close by (for the compass): the nearest few within 60 m. */
    hazards() { const b = getBoat(); return nearR.map(r => ({ r, d: Math.hypot(r.x - b.x, r.z - b.z) - r.r })).filter(o => o.d < 60).sort((a, c) => a.d - c.d).slice(0, 3).map(o => ({ name: 'Rocks', x: o.r.x, z: o.r.z })); },
    /** Every rock known so far (the map). */
    all() { const out = []; rocks.forEach(l => l.forEach(r => out.push(r))); return out; },
    /** Every frame: load the tiles round the boat, and draw what's near. */
    update(camera, t = 0, dt = 0) {
      uTime.value = t;
      if (!on) return; const b = getBoat(), now = performance.now();
      // spray off the windward side of the rocks near the boat (more in a heavy sea)
      if (emit && (sprayT -= dt) < 0) { sprayT = 0.35 / Math.max(0.4, amp()); const near = nearR.filter(r => Math.abs(r.x - b.x) < 140 && Math.abs(r.z - b.z) < 140);
        const r = near[Math.floor(Math.random() * near.length)]; if (r) { const a = Math.PI + (Math.random() - 0.5) * 1.2, ex = r.x + Math.cos(a) * r.r * 0.95, ez = r.z + Math.sin(a) * r.r * 0.95;
          for (let i = 0; i < 5 + 4 * amp(); i++) emit(ex, WL + 0.3, ez, Math.cos(a) * (1 + Math.random() * 2), 2.5 + Math.random() * 2.5 * amp(), Math.sin(a) * (1 + Math.random() * 2) + (Math.random() - 0.5)); } }
      // rocks ahead at speed: a word of warning (and the compass shows them)
      if (b.vel > 3 && now - warnT > 7000) { const fx = Math.cos(b.yaw), fz = -Math.sin(b.yaw);
        if (nearR.some(r => { const dx = r.x - b.x, dz = r.z - b.z, d = Math.hypot(dx, dz) - r.r; return d < 35 && d > 0 && (dx * fx + dz * fz) / Math.hypot(dx, dz) > 0.9; })) { warnT = now; onWarn?.(); } }
      if (now - lastLoad > 1500) { lastLoad = now; const R = T.loadAround;
        tilesIn(b.x - R, b.z - R, b.x + R, b.z + R, 15).forEach(([x, y]) => load('rocks', 15, x, y));
        tilesIn(b.x - R, b.z - R, b.x + R, b.z + R, 14).forEach(([x, y]) => load('corals', 14, x, y)); }
      if (camera) uCam.value.set(camera.position.x, camera.position.z); uBoat.value.set(b.x, b.z); uLight.value = light();
      if (dirty || !gat || Math.hypot(b.x - gat.x, b.z - gat.z) > T.repaint) { dirty = false; gat = { x: b.x, z: b.z }; gather(b); paint();
        // the rock meshes: built for the tiles near the boat (one a frame), let go once well behind
        rocks.forEach((list, key) => { const near = list.some(r => Math.abs(r.x - b.x) < T.drawRocks + 600 && Math.abs(r.z - b.z) < T.drawRocks + 600);
          if (near && !tileMeshes.has(key) && !toBuild.includes(key)) toBuild.push(key);
          if (!near && tileMeshes.has(key)) { const m = tileMeshes.get(key); scene.remove(m.rock, m.ink); m.rock.geometry.dispose(); tileMeshes.delete(key); } }); }
      if (toBuild.length) buildTile(toBuild.shift());
    },
    /** (tests) the nearest coral to a point */
    _coralNear(x, z) { let best = null, bd = Infinity; corals.forEach(l => l.forEach(c => { const d = Math.hypot(c.x - x, c.z - z); if (d < bd) { bd = d; best = c; } })); return best; },
    get counts() { let r = 0, c = 0; rocks.forEach(l => { r += l.length; }); corals.forEach(l => { c += l.length; }); return { rocks: r, corals: c, drawn: [...tileMeshes.keys()].reduce((a, k) => a + rocks.get(k).length, 0), tiles: tileMeshes.size, coralsDrawn: coralIM.reduce((a, m) => a + m.count, 0) }; },
  };
}
