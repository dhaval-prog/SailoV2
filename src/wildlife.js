// The living ocean: dolphins, seagulls, whales, and fish jumping at fishing spots. Settings in world-config.js.
// - Dolphins, passing gull flocks and whales come from a shared schedule (the chart and the clock, hashed), so every
//   captain on the chart sees the same pod or whale at the same place and time, and a place never repeats. What a pod
//   does near your boat (riding your bow wave, then leaving) plays out on your screen.
// - Each animal runs a small state machine (swimming, following, jumping, diving, despawning, ...), stepped every frame
//   only while it's near; meshes come from small pools, and nothing is drawn while it's under the water.
// - Jumping fish are only a sight: they never add a fish, change the odds or pay anything.
import { WILDLIFE as CFG } from './world-config.js';

const TAU = Math.PI * 2;
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
// shared randomness: the same numbers for the same chart, place and time on every device
const strHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const rng = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/**
 * @param o.getBoat () => ({ x, z, vel, yaw })   your boat (vel in m/s along its heading, yaw: heading as in main.js)
 * @param o.spots () => [{ x, z }]                your active fishing spots (fishing.js)
 * @param o.captains () => [{ id, x, z }]          local sailors fishing nearby (or null off Pune)
 * @param o.species [{ f, w }]                     the fish that live here, with their odds
 * @param o.minutes () => minutes since local midnight (time of day)
 */
export function createWildlife({ THREE, scene, WL, wave, getBoat, splash, station, edge, chartId, spots, captains, species, minutes }) {
  const V3 = THREE.Vector3, seed0 = strHash('sailo:' + chartId);
  const hash = (...n) => { let h = seed0; for (const v of n) { h = Math.imul(h ^ (v | 0), 16777619); h ^= h >>> 13; } return rng(h)(); };
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05, ...extra });
  const nearStation = (x, z, d) => Math.hypot(x - station.x, z - station.z) < d;
  let now = 0; // seconds (wall clock), the shared timeline

  // ================================================== dolphins ==================================================
  const D = CFG.dolphin;
  const dolphinMat = std('#6f8ea8'), bellyMat = std('#dde6ec');
  function dolphinMesh() {
    const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
    const torso = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), dolphinMat); torso.scale.set(1.15, 0.3, 0.32); body.add(torso);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), bellyMat); belly.scale.set(1.0, 0.22, 0.27); belly.position.set(0.05, -0.08, 0); body.add(belly);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 10), dolphinMat); beak.rotation.z = -Math.PI / 2; beak.position.set(1.28, -0.05, 0); body.add(beak);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 4), dolphinMat); fin.scale.set(1, 1, 0.25); fin.rotation.z = 0.5; fin.position.set(-0.1, 0.36, 0); body.add(fin);
    const tail = new THREE.Group(); tail.position.set(-1.1, 0, 0); body.add(tail);
    const stock = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.5, 8), dolphinMat); stock.rotation.z = Math.PI / 2; stock.position.x = -0.2; tail.add(stock);
    const fluke = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.3, 3), dolphinMat); fluke.scale.set(1, 1, 0.12); fluke.rotation.set(Math.PI / 2, 0, Math.PI / 2); fluke.position.x = -0.5; tail.add(fluke);
    g.scale.setScalar(1.2); g.userData = { body, tail }; g.visible = false; scene.add(g); return g; // (about 3 m long)
  }
  const dolphinPool = Array.from({ length: D.pod[1] * 2 }, dolphinMesh), freeDolphins = [...dolphinPool];
  const pods = new Map(), podsGone = new Set();
  let lastYaw = null, yawRate = 0;

  function scanPods(b) {
    const s = Math.floor(now / D.slot), cx = Math.floor(b.x / D.cell), cz = Math.floor(b.z / D.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const X = cx + i, Z = cz + j, key = `${X},${Z},${s}`;
      if (pods.has(key) || podsGone.has(key) || hash(11, X, Z, s) > D.chance) continue;
      const r = rng(hash(12, X, Z, s) * 4294967296 >>> 0), x0 = (X + 0.15 + r() * 0.7) * D.cell, z0 = (Z + 0.15 + r() * 0.7) * D.cell, head = r() * TAU, n = D.pod[0] + Math.floor(r() * (D.pod[1] - D.pod[0] + 1));
      const el = now - s * D.slot, x = x0 + Math.cos(head) * D.speed * el, z = z0 - Math.sin(head) * D.speed * el;
      if (Math.hypot(x - b.x, z - b.z) > D.seen || nearStation(x, z, D.awayFromStation) || edge(x, z) < 150 || freeDolphins.length < n) continue;
      const members = Array.from({ length: n }, (_, k) => ({ mesh: freeDolphins.pop(), along: (r() - 0.5) * 9, side: (k % 2 ? 1 : -1) * (D.keepOff + 0.5 + r() * 3), ph: r(), mode: 'under', mt: 0, dur: 0.5 + r() * 3, y: WL - 2.2, x, z, hop: 1 }));
      pods.set(key, { key, x, z, head, v: D.speed, state: 'swimming', end: (s + 1) * D.slot, fastT: now, slowT: now, turnT: now, until: 0, members, done: false });
    }
  }
  function memberCycle(m, dt, following, spd) {
    m.mt += dt; const u = m.mt / m.dur;
    if (m.mode === 'under') { m.y = WL - 2.2; m.pitch = 0;
      if (u >= 1) { const leap = Math.random() < (following ? 0.35 : 0.12); m.mode = leap ? 'leap' : 'arc'; m.mt = 0; m.dur = leap ? 1.4 + Math.random() * 0.3 : 1.15; m.hop = leap ? 1.4 + Math.random() * 1.1 : 1; m.splashed = 0; } }
    else if (m.mode === 'arc') { const k = Math.sin(Math.PI * Math.min(u, 1)); m.y = WL - 0.95 + 1.2 * k; m.pitch = -Math.cos(Math.PI * Math.min(u, 1)) * 0.55;
      if (u >= 1) { m.mode = 'under'; m.mt = 0; m.dur = Math.random() < 0.15 ? 6 + Math.random() * 4 : following ? 1 + Math.random() * 2 : 2 + Math.random() * 3; } } // (now and then a long dive)
    else { const H = m.hop + 0.8, uu = Math.min(u, 1); m.y = WL - 0.8 + H * 4 * uu * (1 - uu); m.pitch = Math.atan2(H * 4 * (1 - 2 * uu) / m.dur, Math.max(spd, 3));
      if (m.splashed === 0 && m.y > WL) { m.splashed = 1; splash(m.x, m.z, 10, 0.55); }
      if (m.splashed === 1 && uu > 0.6 && m.y < WL + 0.1) { m.splashed = 2; splash(m.x, m.z, 16, 0.8); }
      if (u >= 1) { m.mode = 'under'; m.mt = 0; m.dur = following ? 1.2 + Math.random() * 2.5 : 2 + Math.random() * 3; } }
  }
  function stepPods(b, dt, t) {
    const fwdX = Math.cos(b.yaw), fwdZ = -Math.sin(b.yaw), boatSpd = b.vel;
    pods.forEach(p => {
      const dB = Math.hypot(p.x - b.x, p.z - b.z);
      // ---- the pod's state ----
      if (p.state !== 'despawning' && now > p.end && p.state !== 'following') p.state = 'despawning';
      if (p.state === 'swimming' && !p.done) {
        // (these timers run on the clock, so they behave the same at any frame rate)
        if (!(dB < D.followRange && boatSpd >= D.followMin)) p.fastT = now; if (now - p.fastT > 2) { p.state = 'following'; p.until = now + D.followFor[0] + Math.random() * (D.followFor[1] - D.followFor[0]); p.slowT = p.turnT = now; }
      } else if (p.state === 'following') {
        if (!(boatSpd < D.followMin * 0.7)) p.slowT = now; if (!(Math.abs(yawRate) > 0.35)) p.turnT = now;
        if (now - p.slowT > 3 || now - p.turnT > 1.5 || now > p.until || dB > D.followRange * 1.6) { // slowed, turned hard, or had enough: they peel away
          const side = Math.sign((p.x - b.x) * -fwdZ + (p.z - b.z) * fwdX) || 1; p.state = 'leaving'; p.done = true; p.leaveAt = now + 8; p.leaveHead = b.yaw + side * 0.9; }
      } else if (p.state === 'leaving' && now > p.leaveAt) p.state = now > p.end ? 'despawning' : 'swimming';
      // ---- where it's heading, eased (no jumps) ----
      let wantHead = p.head, wantV = D.speed;
      if (p.state === 'swimming') wantHead = p.head + Math.sin(t * 0.07 + p.members[0].ph * 9) * 0.25;
      else if (p.state === 'following') { wantHead = b.yaw; const ahead = (p.x - b.x) * fwdX + (p.z - b.z) * fwdZ; wantV = clamp(boatSpd + clamp(-ahead * 0.25, -2, 3), 0, D.maxSpeed); }
      else if (p.state === 'leaving') { wantHead = p.leaveHead; wantV = 6; }
      const rate = p.state === 'following' ? 1.6 : 0.6;
      p.head += clamp(wrap(wantHead - p.head), -rate * dt, rate * dt); p.v += clamp(wantV - p.v, -3 * dt, 2.5 * dt);
      if (p.state !== 'following') { p.x += Math.cos(p.head) * p.v * dt; p.z -= Math.sin(p.head) * p.v * dt; }
      if (p.state === 'following') { const k = Math.min(1, dt * 2.5); p.x += (b.x + fwdX * 3 - p.x) * k; p.z += (b.z + fwdZ * 3 - p.z) * k; } // (the pod keeps level with the bow; its dolphins ride either side)
      // ---- each dolphin: in formation round the pod, surfacing and leaping ----
      const ch = Math.cos(p.head), sh = Math.sin(p.head), following = p.state === 'following';
      let alive = 0;
      p.members.forEach(m => {
        const side = following ? m.side : m.side * 0.6, tx = p.x + ch * m.along + sh * side, tz = p.z - sh * m.along + ch * side; // (side: to the right of the heading)
        m.x = lerp(m.x, tx, Math.min(1, dt * 2)); m.z = lerp(m.z, tz, Math.min(1, dt * 2));
        if (following) { const lat = (m.x - b.x) * -fwdZ + (m.z - b.z) * fwdX, al = (m.x - b.x) * fwdX + (m.z - b.z) * fwdZ; // never over the hull
          if (Math.abs(al) < 8 && Math.abs(lat) < D.keepOff) { const push = (Math.sign(lat) || 1) * D.keepOff - lat; m.x += -fwdZ * push; m.z += fwdX * push; } }
        if (p.state === 'despawning') { if (m.mode !== 'under') memberCycle(m, dt, false, p.v); else { m.y = WL - 2.2; m.mt = 0; } }
        else memberCycle(m, dt, following, p.v);
        if (m.mode !== 'under') alive++;
        const g = m.mesh, show = m.y > WL - 0.85 && dB < D.seen;
        g.visible = show; if (!show) return;
        g.position.set(m.x, m.y + wave(m.x, m.z, t), m.z); g.rotation.set(0, p.head, m.pitch, 'YXZ');
        g.userData.tail.rotation.z = Math.sin(t * 9 + m.ph * 6) * 0.35;
      });
      if ((p.state === 'despawning' && !alive) || dB > D.seen + 300) { p.members.forEach(m => { m.mesh.visible = false; freeDolphins.push(m.mesh); }); pods.delete(p.key); podsGone.add(p.key); }
    });
  }

  // ================================================== seagulls ==================================================
  const G = CFG.gull;
  const gullWhite = std('#f6f7f8', { roughness: 0.8 }), gullGrey = std('#bfc6cf', { roughness: 0.8, side: THREE.DoubleSide }), gullTip = std('#2b2f36', { side: THREE.DoubleSide }), beakMat = std('#f2b632');
  const wingGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0.12, 0, 0, -0.18, 0, 0, -0.05, 0, 0.62, 0.12, 0, 0, -0.05, 0, 0.62, 0.16, 0, 0.5], 3)); g.computeVertexNormals(); return g; })();
  const tipGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.05, 0, 0.62, 0.16, 0, 0.5, 0.0, 0, 0.82], 3)); g.computeVertexNormals(); return g; })();
  function gullMesh() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), gullWhite); body.scale.set(0.26, 0.09, 0.09); g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), gullWhite); head.position.set(0.24, 0.05, 0); g.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.09, 6), beakMat); beak.rotation.z = -Math.PI / 2; beak.position.set(0.33, 0.04, 0); g.add(beak);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.16, 4), gullWhite); tail.scale.set(1, 1, 0.3); tail.rotation.z = Math.PI / 2; tail.position.set(-0.3, 0, 0); g.add(tail);
    const wing = s => { const w = new THREE.Group(); w.add(new THREE.Mesh(wingGeo, gullGrey), new THREE.Mesh(tipGeo, gullTip)); w.scale.z = s; w.position.y = 0.04; g.add(w); return w; };
    const L = wing(1), R = wing(-1); g.scale.setScalar(1.3); g.visible = false; scene.add(g);
    g.userData = { L, R }; return g;
  }
  const gulls = Array.from({ length: G.max }, () => ({ mesh: gullMesh(), on: false, pos: new V3(), vel: new V3(), role: '', key: '', t: 0, life: 0, ph: Math.random() * TAU, bank: 0, yaw: 0 }));
  const gullByKey = new Map();
  let followGullT = 20;
  const takeGull = (key, role, from) => { if (gullByKey.has(key)) return gullByKey.get(key); const g = gulls.find(q => !q.on); if (!g) return null;
    Object.assign(g, { on: true, role, key, t: 0, life: 0, landed: false, dive: 0 }); g.pos.copy(from); g.vel.set(0, 0, 0); g.mesh.visible = true; gullByKey.set(key, g); return g; };
  const releaseGull = g => { if (g.role !== 'leave') { g.role = 'leave'; g.t = 0; g.awayX = Math.cos(g.ph * 9) ; g.awayZ = Math.sin(g.ph * 9); } };
  const dropGull = g => { g.on = false; g.mesh.visible = false; gullByKey.delete(g.key); };
  const spawnAround = (b, r, h) => { const a = Math.random() * TAU; return new V3(b.x + Math.cos(a) * r, WL + h, b.z + Math.sin(a) * r); };
  let harbourSpots = null;

  function scanGulls(b) {
    const want = new Set();
    // over fishing spots: yours, and the local sailors' when they're fishing nearby
    spotList.forEach(s => { for (let k = 0; k < G.atSpot; k++) { const key = `spot:${s.id}:${k}`; want.add(key); const g = takeGull(key, 'spot', spawnAround(s, 60, 18)); if (g) { g.cx = s.x; g.cz = s.z; g.r = 5 + k * 2.5; g.alt = 6 + k * 1.5; } } });
    // the harbour: gulls over the docks and the market, some sitting on the water by the piers
    if (nearStation(b.x, b.z, 520)) {
      harbourSpots ||= station.points();
      for (let k = 0; k < G.atStation; k++) { const key = `harbour:${k}`, at = harbourSpots[k % harbourSpots.length]; want.add(key);
        const g = takeGull(key, 'harbour', spawnAround(at, 40, 16)); if (g) { g.cx = at.x; g.cz = at.z; g.r = 6 + (k % 3) * 3; g.alt = 7 + (k % 4) * 2; g.sitter = k % 3 === 2; } }
    }
    // a passing flock now and then (the same for everyone on the chart)
    const s = Math.floor(now / G.flockSlot), cx = Math.floor(b.x / G.flockCell), cz = Math.floor(b.z / G.flockCell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const X = cx + i, Z = cz + j; if (hash(21, X, Z, s) > G.flockChance) continue;
      const r = rng(hash(22, X, Z, s) * 4294967296 >>> 0), x0 = (X + r()) * G.flockCell, z0 = (Z + r()) * G.flockCell, head = r() * TAU, n = 2 + Math.floor(r() * 3), el = now - s * G.flockSlot, alt = 12 + r() * 8;
      for (let k = 0; k < n; k++) { const key = `flock:${X},${Z},${s}:${k}`, ox = (r() - 0.5) * 14, oz = (r() - 0.5) * 14, sp = 7.5;
        const x = x0 + ox + Math.cos(head) * sp * (el - 90), z = z0 + oz - Math.sin(head) * sp * (el - 90);
        if (Math.hypot(x - b.x, z - b.z) > G.seen && !gullByKey.has(key)) continue; want.add(key);
        const g = takeGull(key, 'flock', new V3(x, WL + alt, z)); if (g) Object.assign(g, { fx0: x0 + ox, fz0: z0 + oz, fhead: head, fsp: sp, falt: alt + k * 0.7, fs: s * G.flockSlot }); }
    }
    // a gull or two tags along behind a moving boat for a while
    followGullT -= 1;
    if (followGullT <= 0) { followGullT = G.followEvery[0] + Math.random() * (G.followEvery[1] - G.followEvery[0]);
      if (b.vel > 1.5) for (let k = 0; k < 1 + Math.floor(Math.random() * 2); k++) { const g = takeGull('follow:' + now + ':' + k, 'follow', spawnAround(b, 70, 14)); if (g) { g.life = G.followFor[0] + Math.random() * (G.followFor[1] - G.followFor[0]); g.side = k ? -1 : 1; } } }
    gulls.forEach(g => { if (g.on && (g.role === 'spot' || g.role === 'harbour' || g.role === 'flock') && !want.has(g.key)) releaseGull(g); });
  }
  const tgt = new V3(), des = new V3();
  function stepGulls(b, dt, t) {
    const fwdX = Math.cos(b.yaw), fwdZ = -Math.sin(b.yaw);
    gulls.forEach(g => { if (!g.on) return; g.t += dt;
      const d = Math.hypot(g.pos.x - b.x, g.pos.z - b.z);
      if (d > G.seen + 150 || (g.role === 'leave' && (g.t > 14 || d > G.seen))) { dropGull(g); return; }
      if (d > 200 && Math.random() < 0.5) return; // (far gulls: about every other frame)
      let speed = 7.5, flap = false;
      if (g.role === 'flock') { const el = now - g.fs - 90; g.pos.set(g.fx0 + Math.cos(g.fhead) * g.fsp * el, WL + g.falt + Math.sin(t * 0.5 + g.ph) * 0.6, g.fz0 - Math.sin(g.fhead) * g.fsp * el); g.yaw = g.fhead + Math.sin(t * 0.4 + g.ph) * 0.15; g.bank = 0; }
      else {
        if (g.role === 'follow') { if (g.t > g.life) { releaseGull(g); return; } // trailing over the wake, weaving
          tgt.set(b.x - fwdX * 9 + -fwdZ * g.side * (2 + Math.sin(t * 0.6 + g.ph) * 2.5), WL + 6 + Math.sin(t * 0.8 + g.ph) * 1.2, b.z - fwdZ * 9 + fwdX * g.side * (2 + Math.sin(t * 0.6 + g.ph) * 2.5));
          speed = Math.max(4, b.vel + 2); }
        else if (g.role === 'leave') { tgt.set(g.pos.x + g.awayX * 50, WL + 25, g.pos.z + g.awayZ * 50); flap = true; }
        else { // circling a spot or the harbour; now and then a dive to the surface (or, by the docks, a rest on the water)
          if (g.landed) { g.pos.y = WL + wave(g.pos.x, g.pos.z, t) + 0.08; g.vel.multiplyScalar(0.9); g.mesh.position.copy(g.pos); g.mesh.rotation.set(0, g.yaw, 0, 'YXZ');
            g.mesh.userData.L.rotation.x = g.mesh.userData.R.rotation.x = 0.1; g.mesh.userData.L.scale.x = g.mesh.userData.R.scale.x = 0.45; if (g.t > g.restUntil) { g.landed = false; g.t = 0; } return; }
          g.mesh.userData.L.scale.x = g.mesh.userData.R.scale.x = 1;
          const a = t * (0.35 + g.ph * 0.05) + g.ph * 6;
          if (g.dive > 0) { g.dive -= dt; tgt.set(g.cx + Math.cos(a) * g.r * 0.6, WL + (g.dive > 0.9 ? 0.4 : g.alt), g.cz + Math.sin(a) * g.r * 0.6);
            if (g.dive < 0.9 && !g.splashed) { g.splashed = true; splash(g.pos.x, g.pos.z, 5, 0.3); if (g.sitter && g.role === 'harbour') { g.landed = true; g.t = 0; g.restUntil = 15 + Math.random() * 25; } } }
          else { tgt.set(g.cx + Math.cos(a) * g.r, WL + g.alt + Math.sin(t * 0.7 + g.ph) * 1.2, g.cz + Math.sin(a) * g.r);
            if (Math.random() < dt / 14) { g.dive = 2.2; g.splashed = false; } }
          speed = 6;
        }
        des.subVectors(tgt, g.pos); const dist = des.length(); des.multiplyScalar(Math.min(speed, dist * 1.2) / Math.max(dist, 0.001));
        g.vel.lerp(des, Math.min(1, dt * 1.6)); g.pos.addScaledVector(g.vel, dt);
        const hv = Math.hypot(g.vel.x, g.vel.z); if (hv > 0.3) { const yw = Math.atan2(-g.vel.z, g.vel.x), turn = wrap(yw - g.yaw); g.bank = lerp(g.bank, clamp(turn * 2.2, -0.7, 0.7), Math.min(1, dt * 3)); g.yaw = yw; }
        flap = flap || g.vel.y > 0.6 || hv < 3;
      }
      const m = g.mesh; m.position.copy(g.pos); m.rotation.set(-g.bank, g.yaw, clamp(g.vel.y * 0.08, -0.5, 0.4), 'YXZ');
      const w = flap || Math.sin(t * 0.9 + g.ph * 5) > 0.55 ? Math.sin(t * 11 + g.ph * 7) * 0.65 : 0.12 + Math.sin(t * 2 + g.ph) * 0.05; // flapping, or gliding with a slight flex
      m.userData.L.rotation.x = w; m.userData.R.rotation.x = -w;
    });
  }

  // ================================================== whales ==================================================
  const W = CFG.whale;
  const whaleMat = std('#2e3a47', { roughness: 0.7 }), whaleBelly = std('#8a96a3', { roughness: 0.8 });
  const whale = (() => {
    const g = new THREE.Group(); g.visible = false; scene.add(g);
    const far = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), whaleMat); far.scale.set(7, 1.45, 1.7); g.add(far);
    const near = new THREE.Group(); g.add(near);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 18), whaleMat); body.scale.set(7, 1.45, 1.7); near.add(body);
    const belly = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), whaleBelly); belly.scale.set(6.2, 1.0, 1.4); belly.position.y = -0.55; near.add(belly);
    const hump = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.7, 6), whaleMat); hump.scale.z = 0.4; hump.position.set(-3.2, 1.35, 0); near.add(hump);
    [-1, 1].forEach(s => { const fin = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 6), whaleMat); fin.scale.set(1.5, 0.12, 0.45); fin.position.set(2.2, -0.7, s * 1.7); fin.rotation.set(s * 0.5, s * 0.6, 0); near.add(fin); });
    const tail = new THREE.Group(); tail.position.set(-6.4, 0.1, 0); near.add(tail);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.6, 3), whaleMat); fl.scale.set(1, 1, 0.14); fl.rotation.set(Math.PI / 2, 0, Math.PI / 2); fl.position.x = -0.9; tail.add(fl);
    // the blow: a spray column, seen from far off (it ignores the haze)
    const N = 70, pos = new Float32Array(N * 3), seeds = Array.from({ length: N }, () => [Math.random() * TAU, Math.random(), 4.5 + Math.random() * 3]);
    const blow = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(pos, 3)), new THREE.PointsMaterial({ color: '#cfdbe4', size: 1.6, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    blow.frustumCulled = false; scene.add(blow);
    return { g, far, near, tail, blow, seeds, ev: null };
  })();
  const whalesGone = new Set();
  function scanWhale(b) {
    if (whale.ev) return;
    const s = Math.floor(now / W.slot), cx = Math.floor(b.x / W.cell), cz = Math.floor(b.z / W.cell);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const X = cx + i, Z = cz + j, key = `${X},${Z},${s}`; if (whalesGone.has(key) || hash(31, X, Z, s) > W.chance) continue;
      const r = rng(hash(32, X, Z, s) * 4294967296 >>> 0), x = (X + 0.2 + r() * 0.6) * W.cell, z = (Z + 0.2 + r() * 0.6) * W.cell, t0 = s * W.slot + r() * (W.slot - 120), head = r() * TAU;
      if (now < t0 || now > t0 + 60) continue; // (it surfaces at its time; you see it if you're near)
      const d = Math.hypot(x - b.x, z - b.z); if (d > 900 || nearStation(x, z, W.awayFromStation) || edge(x, z) < W.awayFromEdge) continue;
      startWhale(key, x, z, head, t0); return;
    }
  }
  function startWhale(key, x, z, head, t0) { whalesGone.add(key); whale.ev = { key, x, z, head, t0, blowAt: -99, dive: false, diveAt: 0 }; }
  // its time line (seconds from the start): a blow from just under, three breaths, then a fluke-up dive
  const BREATHS = [[4, 14], [14, 24], [24, 34]], DIVE_AT = 34, END = 46;
  function stepWhale(b, dt, t) {
    const e = whale.ev; if (!e) return; const te = now - e.t0;
    if (!e.dive && Math.hypot(e.x - b.x, e.z - b.z) < W.clearOfBoat) { e.dive = true; e.diveAt = te; } // a boat too close: it goes down at once
    const diveStart = e.dive ? e.diveAt : DIVE_AT;
    if (te > Math.max(END, diveStart + 12)) { whale.ev = null; whale.g.visible = false; whale.blow.material.opacity = 0; return; }
    e.x += Math.cos(e.head) * 1.4 * dt; e.z -= Math.sin(e.head) * 1.4 * dt;
    let y = WL - 4, pitch = 0, tailUp = 0;
    if (te < 4) { y = WL - 1.6; if (e.blowAt < 0) e.blowAt = te; }
    else if (te < diveStart) { const br = BREATHS.find(([a, z]) => te >= a && te < z); if (br) { const u = (te - br[0]) / (br[1] - br[0]);
      y = WL - 0.75 - Math.max(0, u - 0.45) * 3.4 + Math.min(1, u / 0.2) * 0.2; pitch = u > 0.45 ? -(u - 0.45) * 0.5 : 0.06;
      if (u > 0.08 && te - e.blowAt > 6) e.blowAt = te; } }
    else { const u = Math.min(1, (te - diveStart) / 10); y = WL - 0.8 - u * 4.8; pitch = -Math.min(0.95, u * 1.6); tailUp = Math.sin(Math.min(1, u * 1.3) * Math.PI) * 0.7; }
    const d = Math.hypot(e.x - b.x, e.z - b.z), g = whale.g;
    g.visible = d < W.seen && y > WL - 3.4; whale.near.visible = d < W.detailAt; whale.far.visible = !whale.near.visible;
    g.position.set(e.x, y + wave(e.x, e.z, t), e.z); g.rotation.set(0, e.head, pitch, 'YXZ'); whale.tail.rotation.z = tailUp + Math.sin(t * 1.2) * 0.08;
    // the blow
    const tb = te - e.blowAt, bp = whale.blow.geometry.attributes.position, hx = e.x + Math.cos(e.head) * 4.2, hz = e.z - Math.sin(e.head) * 4.2;
    whale.blow.material.opacity = tb >= 0 && tb < 2.6 ? 0.85 * (1 - tb / 2.6) : 0;
    if (whale.blow.material.opacity > 0) { whale.seeds.forEach(([a, r, v], k) => { const s = Math.min(tb, 1.6); bp.setXYZ(k, hx + Math.cos(a) * r * (0.3 + s * 0.9), WL + 0.6 + wave(hx, hz, t) + v * s - 2.2 * s * s * 0.5 + r * 0.6, hz + Math.sin(a) * r * (0.3 + s * 0.9)); }); bp.needsUpdate = true; }
  }

  // ================================================== jumping fish ==================================================
  const J = CFG.jumpers;
  const fishCache = new Map();
  function fishMesh(f) {
    if (fishCache.has(f.id)) return fishCache.get(f.id);
    const g = new THREE.Group(), L = Math.min(f.len || 0.8, 1.7), H = (f.h || 0.25) * L, Wd = Math.max(0.05, (f.w || 0.14) * L);
    const flat = f.kind === 'ray';
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), std(f.side || '#9fb2c6', { metalness: 0.3, roughness: 0.35 })); body.scale.set(L / 2, flat ? 0.08 : H / 2, flat ? L / 2 : Wd / 2); g.add(body);
    const back = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 8), std(f.back || '#245c6e', { metalness: 0.2 })); back.scale.set(L * 0.46, flat ? 0.05 : H * 0.28, flat ? L * 0.46 : Wd * 0.4); back.position.y = flat ? 0.03 : H * 0.2; g.add(back);
    if (!flat) { const tail = new THREE.Mesh(new THREE.ConeGeometry(H * 0.55, L * 0.32, 3), std(f.fin || f.back || '#55767a', { side: THREE.DoubleSide })); tail.scale.z = 0.15; tail.rotation.set(Math.PI / 2, 0, Math.PI / 2); tail.position.x = -L * 0.6; g.add(tail); }
    g.visible = false; scene.add(g); g.userData.style = flat ? 'flap' : f.fight?.jump ? 'leap' : f.fight?.sprint ? 'skip' : (f.kg || 1) >= 20 ? 'breach' : 'flip'; g.userData.L = L;
    fishCache.set(f.id, g); return g;
  }
  const jumps = [];
  const pickSpecies = () => { const tot = species.reduce((a, s) => a + s.w, 0); let r = Math.random() * tot; for (const s of species) { if ((r -= s.w) <= 0) return s.f; } return species[0]?.f; };
  const timeFactor = () => { const h = (minutes?.() ?? 720) / 60; return (h >= 5 && h < 8) || (h >= 17 && h < 20) ? J.dawnDusk : h >= 20 || h < 5 ? J.night : 1; };
  function jumpAt(s, f = pickSpecies()) {
    if (!f || jumps.length >= J.max) return; const g = fishMesh(f); if (jumps.some(j => j.g === g)) return;
    const a = Math.random() * TAU, r = 2 + Math.random() * 5, head = Math.random() * TAU, style = g.userData.style;
    jumps.push({ g, style, x: s.x + Math.cos(a) * r, z: s.z + Math.sin(a) * r, head, t: 0, dur: { leap: 1.15, skip: 1.2, flap: 0.95, breach: 1.3, flip: 0.8 }[style],
      h: { leap: 1.4, skip: 0.45, flap: 1.0, breach: 1.1, flip: 0.75 }[style] * (0.8 + Math.random() * 0.4), sp: style === 'skip' ? 4.5 : 2 });
  }
  function stepJumps(b, dt, t) {
    if (species?.length && jumps.length < J.max) {
      spotList.forEach(s => { if (Math.hypot(s.x - b.x, s.z - b.z) > 300 || Math.random() > J.perMinute / 60 * timeFactor() * dt) return; jumpAt(s); });
    }
    for (let i = jumps.length - 1; i >= 0; i--) { const j = jumps[i], g = j.g; j.t += dt; const u = Math.min(1, j.t / j.dur);
      let y, pitch, roll = 0;
      if (j.style === 'skip') { const k = Math.min(2, Math.floor(u * 3)), uu = u * 3 - k; y = WL + j.h * (1 - k * 0.25) * 4 * uu * (1 - uu); pitch = (0.5 - uu) * 0.6; if (uu < 0.08 && j.lastHop !== k) { j.lastHop = k; splash(j.x, j.z, 4, 0.25); } }
      else { y = WL - 0.2 + (j.h + 0.2) * 4 * u * (1 - u); pitch = j.style === 'flip' ? -u * TAU * 0.5 + 0.6 : (0.5 - u) * 1.6; roll = j.style === 'leap' ? u * TAU : 0; }
      if (j.t < dt * 1.5 && j.style !== 'skip') splash(j.x, j.z, j.style === 'breach' ? 14 : 6, j.style === 'breach' ? 0.7 : 0.35);
      j.x += Math.cos(j.head) * j.sp * dt; j.z -= Math.sin(j.head) * j.sp * dt;
      g.visible = y > WL - 0.15; g.position.set(j.x, y + wave(j.x, j.z, t), j.z); g.rotation.set(roll, j.head, pitch, 'YXZ');
      if (j.style === 'flap') g.scale.set(1, 1, 1 + Math.sin(j.t * 18) * 0.15);
      if (u >= 1) { if (j.style !== 'skip') splash(j.x, j.z, j.style === 'breach' ? 18 : 7, j.style === 'breach' ? 0.85 : 0.4); g.visible = false; jumps.splice(i, 1); }
    }
  }

  // ================================================== every frame ==================================================
  let scanT = 0, scanSlowT = 0, spotList = []; // (the fishing spots near you: yours and the local sailors', read once a second)
  function update(t, dt) {
    now = Date.now() / 1000; dt = Math.min(dt, 0.1);
    const b = getBoat();
    if (lastYaw != null && dt > 0) yawRate = lerp(yawRate, wrap(b.yaw - lastYaw) / dt, Math.min(1, dt * 4)); lastYaw = b.yaw;
    if ((scanT -= dt) <= 0) { scanT = 1;
      spotList = [...(spots?.() || []).map((s, i) => ({ id: 'mine' + i, x: s.x, z: s.z })), ...(captains?.() || []).filter(c => Math.hypot(c.x - b.x, c.z - b.z) < G.seen).slice(0, 2).map(c => ({ id: 'cap' + c.id, x: c.x, z: c.z }))];
      scanPods(b); scanGulls(b); }
    if ((scanSlowT -= dt) <= 0) { scanSlowT = 2; scanWhale(b); }
    stepPods(b, dt, t); stepGulls(b, dt, t); stepWhale(b, dt, t); stepJumps(b, dt, t);
  }
  /** Testing: a dolphin pod, a whale, or a fish jumping at a spot, right now near your boat (the shared schedule is untouched). */
  function force(kind, id) { const b = getBoat(), fx = Math.cos(b.yaw), fz = -Math.sin(b.yaw);
    if (kind === 'jump') { jumpAt(spotList[0] || { x: b.x + fx * 25, z: b.z + fz * 25 }, id ? species.find(s => s.f.id === id)?.f : undefined); return; }
    if (kind === 'whale') { startWhale('test:' + now, b.x + fx * 120 - fz * 40, b.z + fz * 120 + fx * 40, b.yaw + 1.6, now); return; }
    if (kind === 'dolphins' && freeDolphins.length >= 3) { const x = b.x + fx * 40 - fz * 20, z = b.z + fz * 40 + fx * 20, key = 'test:' + now;
      pods.set(key, { key, x, z, head: b.yaw, v: D.speed, state: 'swimming', end: now + D.slot, fastT: now, slowT: now, turnT: now, until: 0, done: false,
        members: [0, 1, 2].map(k => ({ mesh: freeDolphins.pop(), along: (k - 1) * 3, side: (k % 2 ? 1 : -1) * (D.keepOff + 1 + k), ph: Math.random(), mode: 'under', mt: 0, dur: 0.3 + k * 0.4, y: WL - 2.2, x, z, hop: 1 })) }); } }
  return { update, force, get counts() { return { pods: pods.size, dolphinsUp: dolphinPool.filter(m => m.visible).length, gulls: gulls.filter(g => g.on).length, whale: !!whale.ev, jumps: jumps.length, podStates: [...pods.values()].map(p => p.state) }; } };
}
