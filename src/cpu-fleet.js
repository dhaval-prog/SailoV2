// Draws the local sailors (cpu-captains.js) on the water: their boats (the game's own four models in
// each captain's colours) float and roll on the same waves, leave a wake while sailing, splash when they
// land a fish, and carry a Naked HUD name tag saying what they're doing. Only captains near you are
// drawn (the nearest few in full), so phones stay smooth. Tap a boat or its tag for the captain's card.
// Real captains online (online.js, via setLive) are drawn the same way and come first: when they're
// near, the local sailors quietly step back so the water never gets crowded.
import { ROSTER, stateAt, recentEvents, statusText } from './cpu-captains.js';
import { PORT } from './station.js';
import { follower } from './boat-motion.js';

const NEAR = 2600, TAG = 1500, MAX_DRAWN = 8; // metres: drawn within NEAR, an avatar within TAG; at most 8 boats at once
// each boat carries one small round avatar instead of a name tag: far off it fades gently in and out; close by
// (inside AV_NEAR, until it passes AV_FAR again: a gap so it doesn't flicker at the edge) it holds steady; hovering
// over the boat brings it up clearly. Opacity eases between states.
const AV_NEAR = 320, AV_FAR = 420;
// the default captain avatar (as on the account button), until a captain has a photo
const AVATAR = '<svg viewBox="0 0 32 32" aria-hidden="true"><circle cx="16" cy="16" r="16" fill="#fff7ea"/><path d="M7 14.5c0-3 4-5.5 9-5.5s9 2.5 9 5.5z" fill="#2343a0"/><rect x="6" y="14" width="20" height="2.6" rx="1.3" fill="#152042"/><circle cx="16" cy="11.6" r="1.6" fill="#ffb21a"/><path d="M9.5 18.5c1.4 4.2 3.8 6.5 6.5 6.5s5.1-2.3 6.5-6.5z" fill="#f2c9a0"/><path d="M12 22.2c1 .9 2.4 1.4 4 1.4s3-.5 4-1.4" stroke="#152042" stroke-width="1.2" fill="none" stroke-linecap="round"/></svg>';
// which materials carry a captain's colours, per boat (material names from the boat builders)
const PAINT = {
  tug: { hull: ['hull_yellow'], accent: ['paint_red'] },
  sail: { sail: ['sail_cloth'], accent: ['sail_red', 'sail_navy'] },
  yacht: { hull: ['paint_navy'], flag: ['flag_cloth', 'flag_cloth_custom'] },
  dinghy: { sail: ['mainsail_cloth', 'sail_cloth'], hull: ['hull_sage'] },
};

export function createCpuFleet({ THREE, scene, templates, waveJS, WL, toScreen, playerPos, splash, emit, onOpen, cpu = true }) {
  const crew = (cpu ? ROSTER : []).map(c => ({ c, g: null, tag: null, st: null, yaw: 0, nextCheck: 0, lastEv: Date.now(), sayT: 0 }));
  const tagLayer = document.createElement('div'); tagLayer.id = 'cpu-tags'; document.body.appendChild(tagLayer);

  // a captain's boat: a clone of the game's model with their colours on their own materials
  function build(m) {
    const src = templates[m.c.boat]; const g = src.clone(true); g.visible = true; g.rotation.order = 'YXZ';
    const want = PAINT[m.c.boat] || {}, colourOf = {}; Object.entries(want).forEach(([k, names]) => { const col = m.c.colours[k]; if (col) names.forEach(n => { colourOf[n] = col; }); });
    const made = new Map();
    g.traverse(o => { o.visible = o.visible || o === g; if (!o.isMesh || !o.material) return;
      const one = mat => { const col = colourOf[mat.name]; if (!col) return mat; if (!made.has(mat)) { const k = mat.clone(); k.onBeforeCompile = mat.onBeforeCompile; k.map = null; k.color = new THREE.Color(col); k.needsUpdate = true; made.set(mat, k); } return made.get(mat); };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material); });
    g.traverse(o => { o.userData.cpu = m.c.id; });
    scene.add(g); return g;
  }
  function makeTag(m) {
    const t = document.createElement('button'); t.type = 'button'; t.className = m.c.live ? 'cpu-tag live' : 'cpu-tag'; t.dataset.id = m.c.id; t.setAttribute('aria-label', m.c.name);
    t.innerHTML = `<em class="cpu-say" hidden></em><i class="cpu-av"></i>`; const av = t.querySelector('.cpu-av');
    av.style.setProperty('--ring', m.c.live ? '#6EE7C5' : (m.c.colours.sail || m.c.colours.hull || m.c.colours.flag || '#ffffff'));
    if (m.c.photo) { const img = new Image(); img.alt = ''; img.src = m.c.photo; img.onerror = () => { av.innerHTML = AVATAR; }; av.appendChild(img); } else av.innerHTML = AVATAR;
    t.addEventListener('pointerenter', () => { m.hoverTag = true; }); t.addEventListener('pointerleave', () => { m.hoverTag = false; });
    t.addEventListener('click', e => { e.stopPropagation(); onOpen(m.c); }); ['pointerdown', 'pointerup'].forEach(ev => t.addEventListener(ev, e => e.stopPropagation()));
    tagLayer.appendChild(t); return t;
  }
  const status = (m, s) => m.c.live ? { fish: 'Fishing', anchor: 'At anchor', dock: 'At Paradise Station' }[s.kind] || (s.speed > 0.5 ? 'Sailing' : 'Drifting')
    : m.waiting ? 'Waiting for a berth' : statusText(m.c, s);

  // berths real captains hold (berths.js): a local sailor due at one waits offshore instead
  let booked = new Map(); const setBooked = b => { booked = b; };
  // the anchor chain and the fishing line (built the first time a boat anchors)
  const chainMat = new THREE.MeshBasicMaterial({ color: '#3a3f47' }), lineMat = new THREE.LineBasicMaterial({ color: '#f4f1e8', transparent: true, opacity: 0.8 });
  const bobMat = new THREE.MeshBasicMaterial({ color: '#ff4a3a' });
  function gear(m) {
    if (m.gear) return m.gear;
    const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 5), chainMat); chain.visible = false;
    const lg = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3)), line = new THREE.Line(lg, lineMat); line.visible = false; line.frustumCulled = false;
    const bob = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bobMat); bob.visible = false;
    scene.add(chain, line, bob); m.gear = { chain, line, bob }; return m.gear;
  }
  function drawGear(m, s, x, z, fx, fz, sx, sz, gy, t) {
    const on = s && ['anchor', 'fish', 'weigh'].includes(s.kind); if (!on && !m.gear) return;
    const G = gear(m), u = s?.u ?? 0;
    // chain: from the bow down to the seabed; pays out while dropping, comes in while weighing
    const k = !on ? 0 : s.kind === 'anchor' ? u : s.kind === 'weigh' ? 1 - u : 1, len = 0.4 + k * 4.5, bx = x + fx * 4.2, bz = z + fz * 4.2;
    G.chain.visible = on && k > 0.02; if (G.chain.visible) { G.chain.scale.set(1, len, 1); G.chain.position.set(bx, gy + 1.4 - len / 2, bz); }
    if (on && s.kind === 'anchor' && u > 0.92 && !m.splashA) { m.splashA = true; splash(bx, bz, 8, 0.45); } if (s?.kind !== 'anchor') m.splashA = false;
    if (on && s.kind === 'weigh' && u > 0.85 && !m.splashW) { m.splashW = true; splash(bx, bz, 6, 0.35); } if (s?.kind !== 'weigh') m.splashW = false;
    // fishing line: from the stern quarter out to a float bobbing on the water
    const fishing = on && s.kind === 'fish'; G.line.visible = G.bob.visible = fishing;
    if (fishing) { const tx = x - fx * 2.5 + sx * 2, tz = z - fz * 2.5 + sz * 2, ox = x - fx * 3 + sx * 11, oz = z - fz * 3 + sz * 11, oy = WL + waveJS(ox, oz, t) + Math.sin(t * 3 + x) * 0.08;
      G.bob.position.set(ox, oy + 0.1, oz); const a = G.line.geometry.attributes.position; a.setXYZ(0, tx, gy + 3.2, tz); a.setXYZ(1, ox, oy + 0.15, oz); a.needsUpdate = true; }
  }

  // real captains online: { id, name, boat, colours, rank, catches, st } from online.js, every frame
  const live = new Map();
  function setLive(list) {
    const ids = new Set();
    list.forEach(p => { const id = 'u:' + p.id; ids.add(id); let m = live.get(id);
      if (!m || m.c.boat !== p.boat || JSON.stringify(m.c.colours) !== JSON.stringify(p.colours)) { drop(m); m = { c: null, g: null, tag: null, st: null, yaw: p.st.yaw, sayT: 0, mo: null }; live.set(id, m); }
      m.c = { id, uid: p.id, live: true, name: p.name, boat: p.boat, colours: p.colours, rank: p.rank, catches: p.catches }; m.st = p.st;
      if (m.tag) m.tag.setAttribute('aria-label', p.name); });
    live.forEach((m, id) => { if (!ids.has(id)) { drop(m); live.delete(id); } });
  }
  function drop(m) { if (!m) return; if (m.ring) { scene.remove(m.ring); m.ring = null; } if (m.g) { scene.remove(m.g); m.g = null; } if (m.tag) { m.tag.remove(); m.tag = null; } }

  // captains asking for help (radio-help.js): a red ring pulses round their boat
  let alerts = new Set(); const setAlert = ids => { alerts = ids; };
  const ringGeo = new THREE.RingGeometry(7, 8.2, 48), ringMat = new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
  function ringFor(m, on, t) {
    if (on && !m.ring) { m.ring = new THREE.Group(); [0, 1].forEach(i => { const r = new THREE.Mesh(ringGeo, ringMat.clone()); r.rotation.x = -Math.PI / 2; r.userData.k = i * 0.5; m.ring.add(r); }); scene.add(m.ring); }
    if (!m.ring) return; m.ring.visible = on && !!m.g?.visible; if (!m.ring.visible) return;
    m.ring.position.set(m.g.position.x, WL + 0.25, m.g.position.z);
    m.ring.children.forEach(r => { const f = (t * 0.55 + r.userData.k) % 1; r.scale.setScalar(0.6 + f * 1.6); r.material.opacity = 0.85 * (1 - f); });
  }

  const tmp = new THREE.Vector3();
  let wall = 0;
  function update(t, dt) {
    const now = Date.now(), me = playerPos();
    // boats move on real time, not the game's capped frame step, so they keep pace on a slow device
    const w = performance.now(), mdt = wall ? Math.min(1, (w - wall) / 1000) : dt; wall = w;
    // where everyone is (the far ones twice a second, the near ones every frame)
    crew.forEach(m => { if (m.g?.visible || now >= m.nextCheck) { m.st = stateAt(m.c, now); m.nextCheck = now + 500; } m.d = m.st ? Math.hypot(m.st.x - me.x, m.st.z - me.z) : Infinity; });
    live.forEach(m => { m.d = Math.hypot((m.mo ? m.x : m.st.x) - me.x, (m.mo ? m.z : m.st.z) - me.z); });
    const people = [...live.values()].filter(m => m.d < NEAR).sort((a, b) => a.d - b.d).slice(0, MAX_DRAWN);
    const drawn = new Set([...people, ...crew.filter(m => m.d < NEAR).sort((a, b) => a.d - b.d).slice(0, Math.max(2, MAX_DRAWN - people.length))]);
    [...live.values(), ...crew].forEach(m => {
      const show = drawn.has(m);
      if (!show) { if (m.g) m.g.visible = false; if (m.tag) m.tag.hidden = true; if (m.ring) m.ring.visible = false; if (m.gear) { m.gear.chain.visible = m.gear.line.visible = m.gear.bob.visible = false; } m.mo = null; m.lastEv = now; return; }
      if (m.sayT && now > m.sayT) { m.sayT = 0; const e = m.tag.querySelector('.cpu-say'); e.classList.remove('on'); setTimeout(() => { if (!m.sayT) e.hidden = true; }, 300); }
      if (!m.g) { m.g = build(m); m.tag = makeTag(m); }
      const s = m.st, g = m.g; g.visible = true;
      // motion (boat-motion.js): the boat chases where it should be, with momentum, and always bow first
      if (!m.mo) m.mo = follower(s.x, s.z, s.yaw ?? m.yaw ?? Math.random() * 6.28);
      m.waiting = !m.c.live && s.berth != null && ['dock', 'berth', 'undock'].includes(s.kind) && booked.has(s.berth);
      const wq = m.waiting ? PORT.queue[m.c.name.length % PORT.queue.length] : null;
      const pose = wq ? m.mo.update(mdt, wq[0], wq[1], 0, null) : m.mo.update(mdt, s.x, s.z, s.speed || 0, s.yaw ?? null);
      // at rest it swings a little on its anchor
      const still = Math.max(0, 1 - pose.v / 0.6); m.swing = (m.swing || 0) + mdt; m.yaw = pose.yaw + still * Math.sin(m.swing * 0.15 + m.c.name.length) * 0.12; m.x = pose.x; m.z = pose.z; m.v = pose.v;
      const fx = Math.cos(m.yaw), fz = -Math.sin(m.yaw), sx = Math.sin(m.yaw), sz = Math.cos(m.yaw), x = pose.x, z = pose.z;
      const hC = waveJS(x, z, t), hF = waveJS(x + fx * 3, z + fz * 3, t), hB = waveJS(x - fx * 3, z - fz * 3, t), hS = waveJS(x + sx * 2, z + sz * 2, t), hP = waveJS(x - sx * 2, z - sz * 2, t);
      g.position.set(x, (hC + hF + hB) / 3 * 0.85, z);
      g.rotation.set(-Math.atan((hS - hP) / 4) * 0.8, m.yaw, Math.atan((hF - hB) / 6) * 0.8 + Math.min(0.06, pose.v * 0.006));
      // wake while under way (from the boat's real speed); a splash now and then while fishing, and a big one when they land a fish
      if (pose.v > 0.6 && Math.random() < dt * 14 * Math.min(1, pose.v / 3)) { const side = (Math.random() - 0.5) * 2.2, bx = x - fx * 5.4 + sx * side, bz = z - fz * 5.4 + sz * side;
        emit(bx, WL + waveJS(bx, bz, t), bz, -fx * 1.5 + (Math.random() - 0.5), 1 + Math.random(), -fz * 1.5 + (Math.random() - 0.5)); }
      if (s.nos) for (let q = 0; q < 3; q++) { const jx = x - fx * 5.8 + sx * (Math.random() - 0.5), jz = z - fz * 5.8 + sz * (Math.random() - 0.5); emit(jx, WL + 0.25 + waveJS(jx, jz, t), jz, -fx * (5 + Math.random() * 4), 1.5 + Math.random() * 2.5, -fz * (5 + Math.random() * 4)); } // (a captain on NOS: the jet off their stern)
      if (s.kind === 'berth' && !m.waiting && Math.random() < dt * 0.35) { const sd = Math.random() < 0.5 ? -1 : 1, al = (Math.random() - 0.5) * 7; splash(x + fx * al + sx * sd * 2.4, z + fz * al + sz * sd * 2.4, 2, 0.15); } // (water lapping at a moored hull)
      if (s.kind === 'fish' && !m.waiting && Math.random() < dt * 0.25) { const px = x - fx * 3 + sx * 11, pz = z - fz * 3 + sz * 11; splash(px, pz, 3, 0.25); } // (nibbles at the float)
      if (!m.c.live) recentEvents(m.c, now, m.lastEv).forEach(e => { if (e.kind === 'catch') { const px = x - fx * 3 + sx * 11, pz = z - fz * 3 + sz * 11; splash(px, pz, 16, 0.7); for (let i = 0; i < 8; i++) emit(px, WL + 0.2, pz, (Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5); } });
      m.lastEv = now;
      ringFor(m, alerts.has(m.c.id), t);
      if (!m.c.live) drawGear(m, m.waiting ? null : s, x, z, fx, fz, sx, sz, g.position.y, t);
      // the avatar over the boat (one per boat, at its real position)
      const tg = m.tag; tmp.set(x, g.position.y + 12.5, z); const [px, py, pz] = toScreen(tmp);
      const onScreen = pz < 1 && px > -60 && px < innerWidth + 60 && py > -40 && py < innerHeight + 40;
      m.near = m.near ? m.d < AV_FAR : m.d < AV_NEAR; const hov = m.hoverTag || hoverId === m.c.id;
      const want = !onScreen || m.d > TAG ? 0 : hov ? 1 : m.near ? 0.95 : 0.75;
      m.op = (m.op ?? 0) + (want - (m.op ?? 0)) * Math.min(1, mdt * 5);
      tg.hidden = m.op < 0.02 && want === 0;
      if (!tg.hidden) { const cx = Math.min(innerWidth - 40, Math.max(40, px)); tg.style.transform = `translate(${cx.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`; tg.style.opacity = m.op.toFixed(3);
        const mode = hov ? 'hover' : m.near ? 'near' : 'far'; if (tg.dataset.m !== mode) tg.dataset.m = mode; }
    });
  }
  /** The captain whose boat the ray hits, if any. */
  const all = () => [...live.values(), ...crew];
  function hit(ray) { const gs = all().filter(m => m.g?.visible).map(m => m.g); if (!gs.length) return null; const h = ray.intersectObjects(gs, true)[0]; return h ? all().find(m => m.c.id === h.object.userData.cpu)?.c || null : null; }
  /** How many local sailors are out right now (anywhere on the ocean). */
  const out = () => crew.filter(m => m.st).length;
  /** The captains drawn near you, nearest first: [{ c, d (metres), st }]. */
  const near = () => all().filter(m => m.g?.visible).sort((a, b) => a.d - b.d).map(m => ({ c: m.c, d: m.d, st: m.st }));
  /** A speech bubble over a captain's name tag (only when their boat is drawn). */
  function say(id, text, ms = 5500) {
    const m = all().find(q => q.c.id === id); if (!m?.g?.visible || !m.tag) return false;
    const e = m.tag.querySelector('.cpu-say'); e.textContent = text; e.hidden = false; e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); m.sayT = Date.now() + ms; return true;
  }
  /** Everyone out on the water, near or far (the map): [{ c, x, z, yaw, status }]. */
  const everyone = () => all().filter(m => m.st).map(m => ({ c: m.c, x: m.mo ? m.x : m.st.x, z: m.mo ? m.z : m.st.z, yaw: m.mo ? m.yaw : m.st.yaw ?? m.yaw ?? 0, status: status(m, m.st) }));
  // the boat under the mouse (main.js), whose avatar comes up clearly
  let hoverId = null; const setHover = id => { hoverId = id; };
  return { update, hit, out, near, say, setLive, everyone, setAlert, setBooked, setHover };
}
