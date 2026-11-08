// Fisher's Shacks: at every petrol pump and hospital on the map (geo.js turns those into shacks) a little stilt shack
// stands in the water (fishers-shack.glb): a plank deck on piles, a red-and-cream hut with a tiled roof and a chimney,
// a fish counter under a teal awning, a crane, and a landing out front with mooring posts and an old petrol pump.
// Tie up at its landing (station.js) and it's a small port: fuel at the pump, a fish market at the counter and
// passengers waiting on the landing (the server knows it as a stop: chart_shack_here).
// - The map's own spot is often in the middle of a rock (they're where the buildings are), so each shack is set in the
//   nearest open water beside it, its landing turned to face the open sea.
// - Only the few nearest the boat are drawn (copies of one model); the sea haze hides the rest.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeStatic } from './merge-static.js';
import { shackList, ensure } from './geo.js';
import shackUrl from './assets/shack/fishers-shack.glb?url';

const S = 2.2;              // model units to metres (the model is ~14 × 8 units: a ~31 m wide shack)
const WATER_Y = 0.2;        // the model's height where the sea meets its piles
const SHOW = 750;           // metres: shacks drawn inside this range
const SLOTS = 4;            // at most this many drawn at once
const NEAR = 75;            // metres: "Tie up" is offered inside this range (from the landing)
const FOOT = { x0: -8.4, x1: 5.9, z0: -2.8, z1: 5.35 }; // the shack's footprint (model units), rocks and landing included
const CLEAR = 24;           // metres of open water a shack needs round its middle (plus its landing and berth)
// where a boat lies alongside the landing (model units: in front of it, parallel to it) and the shops on the landing
const BERTH = { x: -0.6, z: FOOT.z1 }, OUT = 4.8; // (OUT: metres from the landing's edge to the boat's middle)
const SPOTS = { market: [4.4, 5.6, 0.6], boathouse: [1.6, 4.0, 3.3], passengers: [-3.3, 0.9, 4.2] }; // (the fish counter under the awning, the pump, the landing)
const CHIMNEY = [0.62, 7.7, -0.85];
const h01 = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };

/**
 * ctx: THREE, scene, WL, terrain() (rocks: blocked(x, z, pad)), stations() ([{ x, z }]: no shack near a Paradise
 * Station), fade(material) (the far-off haze), boatPos()
 */
export function createShacks({ THREE, scene, WL, terrain, stations, fade }) {
  const V3 = THREE.Vector3;
  let proto = null, loading = false; const glow = []; // (glow: the lamp, lantern and windows, lit at night)
  function load() {
    if (proto || loading) return; loading = true;
    new GLTFLoader().load(shackUrl, gltf => {
      const m = gltf.scene, ink = [];
      m.traverse(o => { if (/^ink/.test(o.name) || o.isLine || o.isLineSegments || (o.isMesh && !o.material?.name)) ink.push(o); }); // (no outlines: the game's look has none)
      ink.forEach(o => o.removeFromParent());
      m.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true; const mt = o.material;
        if (/^(lantern_glow|window_glass)$/.test(mt.name) && !glow.some(g => g.mt === mt)) { mt.emissive = new THREE.Color(mt.name === 'window_glass' ? '#ffc46b' : '#ffd99a'); mt.emissiveIntensity = 0; glow.push({ mt, k: mt.name === 'window_glass' ? 0.9 : 2.2 }); }
        fade?.(mt); });
      mergeStatic(THREE, m); // (hundreds of planks and fish: one draw call per material)
      m.scale.setScalar(S); m.position.y = WL - WATER_Y * S; proto = m;
    }, undefined, () => { loading = false; });
  }
  // the drawn copies, each sat at a shack
  const slots = Array.from({ length: SLOTS }, () => ({ g: null, sh: null }));
  const root = new THREE.Group(); root.name = 'fishers_shacks'; scene.add(root);
  const lamp = new THREE.PointLight('#ffc77a', 0, 26, 1.6); root.add(lamp); // (at night, over the nearest one's landing)

  // ---------- where each one stands: beside its map spot, in open water, landing to the open sea ----------
  const local = (sh, x, z) => { const c = Math.cos(sh.yaw), s = Math.sin(sh.yaw); return [sh.x + (x * c + z * s) * S, sh.z + (-x * s + z * c) * S]; }; // model (x, z) to world (as rotation.y = yaw)
  const toLocal = (sh, x, z) => { const dx = (x - sh.x) / S, dz = (z - sh.z) / S, c = Math.cos(sh.yaw), s = Math.sin(sh.yaw); return [dx * c - dz * s, dx * s + dz * c]; };
  const berthOf = sh => local(sh, BERTH.x, BERTH.z + OUT / S);
  function place(sh) {
    const T = terrain(); if (!T) return false;
    if (stations().some(s => Math.hypot(s.x - sh.x0, s.z - sh.z0) < 360)) { sh.off = true; return false; } // (a Paradise Station is there already)
    const free = (x, z, pad) => !T.blocked(x, z, pad);
    for (let r = 0; r <= 240; r += 20) {
      const n = r ? Math.max(8, Math.round(r / 10)) : 1, a0 = h01(sh.id) * Math.PI * 2;
      for (let i = 0; i < n; i++) { const a = a0 + i / n * Math.PI * 2, x = sh.x0 + Math.cos(a) * r, z = sh.z0 + Math.sin(a) * r;
        if (!free(x, z, CLEAR)) continue;
        // the landing to whichever side has the most open water in front (its berth and the way in)
        for (let k = 0; k < 8; k++) { const yaw = a0 + k * Math.PI / 4, t = { x, z, yaw }, [bx, bz] = local(t, BERTH.x, BERTH.z + OUT / S + 6 / S), [ox, oz] = local(t, BERTH.x, BERTH.z + 40 / S);
          if (free(bx, bz, 9) && free(ox, oz, 12)) { Object.assign(sh, { x, z, yaw, placed: true }); return true; } } }
    }
    return false; // (no room yet: tried again later, as more of the sea's rocks are known)
  }

  // ---------- per frame: the nearest few drawn, the rest hidden; shacks found near the boat as you go ----------
  let pickT = 0, askT = 0, near = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.6, 1), puffs = Array.from({ length: 16 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#e2e2e2', roughness: 1, transparent: true, opacity: 0, depthWrite: false, flatShading: true }));
    m.visible = false; m.userData = { life: 0, max: 1, v: new V3() }; root.add(m); return m; });
  let puffI = 0, puffAcc = 0;
  function tick(t, dt, bp, night = 0) {
    // the shacks round the boat (their map spots load with the landmarks: a few km round the boat)
    if ((askT -= dt) < 0) { askT = 4; ensure(bp.x - 1600, bp.z - 1600, bp.x + 1600, bp.z + 1600, true); }
    if ((pickT -= dt) < 0) { pickT = 0.5;
      const all = shackList().filter(sh => !sh.off && Math.hypot(sh.x - bp.x, sh.z - bp.z) < 2200);
      if (all.length) load();
      all.forEach(sh => { if (sh.x0 == null) { sh.x0 = sh.x; sh.z0 = sh.z; } if (!sh.placed && Math.hypot(sh.x0 - bp.x, sh.z0 - bp.z) < 1400) place(sh); });
      near = all.filter(sh => sh.placed && Math.hypot(sh.x - bp.x, sh.z - bp.z) < SHOW).sort((a, b) => Math.hypot(a.x - bp.x, a.z - bp.z) - Math.hypot(b.x - bp.x, b.z - bp.z)).slice(0, SLOTS);
      if (proto) {
        slots.forEach(s => { if (s.sh && !near.includes(s.sh)) { s.sh = null; if (s.g) s.g.visible = false; } });
        near.forEach(sh => { if (slots.some(s => s.sh === sh)) return; const s = slots.find(q => !q.sh); if (!s) return;
          if (!s.g) { s.g = proto.clone(true); root.add(s.g); } s.sh = sh; s.g.visible = true; s.g.position.set(sh.x, s.g.position.y, sh.z); s.g.rotation.y = sh.yaw; s.g.updateMatrixWorld(true); });
      }
    }
    // night: windows and lanterns lit, a lamp over the nearest landing; a wisp of smoke from its chimney
    glow.forEach(g => { g.mt.emissiveIntensity = night * g.k; });
    const first = near[0];
    if (first) { const [lx, lz] = local(first, -0.6, 4.2); lamp.position.set(lx, WL + 5, lz); lamp.intensity = night * 9;
      puffAcc += dt * 1.2; while (puffAcc > 1) { puffAcc -= 1; const m = puffs[puffI++ % puffs.length], u = m.userData, [cx, cz] = local(first, CHIMNEY[0], CHIMNEY[2]);
        m.position.set(cx, WL + (CHIMNEY[1] - WATER_Y) * S, cz); u.life = 0; u.max = 3 + Math.random() * 1.5; u.v.set((Math.random() - 0.5) * 0.5, 1.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.5); m.visible = true; } }
    else lamp.intensity = 0;
    puffs.forEach(m => { const u = m.userData; if (!m.visible) return; u.life += dt; const a = u.life / u.max; if (a >= 1) { m.visible = false; return; }
      m.position.addScaledVector(u.v, dt); m.scale.setScalar(0.6 * (1 + a * 2.4)); m.material.opacity = 0.32 * Math.min(1, a * 5) * (1 - a); m.material.color.setScalar(0.88 - 0.4 * night); });
  }

  /** Would a boat here hit a shack (its piles, rocks or landing)? */
  function blocked(x, z) {
    for (const sh of near) { if (Math.abs(x - sh.x) > 45 || Math.abs(z - sh.z) > 45) continue; const [lx, lz] = toLocal(sh, x, z), p = 3.5 / S;
      if (lx > FOOT.x0 - p && lx < FOOT.x1 + p && lz > FOOT.z0 - p && lz < FOOT.z1 + p) return true; }
    return false;
  }
  /** The shack whose landing is within reach of the boat (and drawn), or null. */
  function nearest(bp) {
    let best = null, bd = NEAR; for (const sh of near) { const [bx, bz] = berthOf(sh), d = Math.hypot(bx - bp.x, bz - bp.z); if (d < bd) { bd = d; best = sh; } } return best;
  }
  /** Tying up at a shack: its berth (world x, z and the boat's heading), the way in from the boat, the way out, and
   *  where its shops are (world points, for their markers). */
  function port(sh) {
    const P = (x, z) => { const [wx, wz] = local(sh, x, z); return new V3(wx, WL, wz); }, bz = BERTH.z + OUT / S;
    return {
      berth: { pos: P(BERTH.x, bz), yaw: sh.yaw },
      inPath: from => [new V3(from.x, WL, from.z), P(BERTH.x + 9 / S * 2, bz + 26 / S), P(BERTH.x + 6 / S, bz + 9 / S), P(BERTH.x, bz)],
      outPath: () => [P(BERTH.x, bz), P(BERTH.x + 10 / S, bz + 8 / S), P(BERTH.x + 22 / S, bz + 30 / S)],
      spots: Object.fromEntries(Object.entries(SPOTS).map(([k, [x, y, z]]) => { const [wx, wz] = local(sh, x, z); return [k, new V3(wx, WL + (y - WATER_Y) * S, wz)]; })),
      look: P(1, 2), // (where the camera looks while you're tied up)
    };
  }
  return { tick, blocked, nearest, port, list: shackList, drawn: () => near };
}
