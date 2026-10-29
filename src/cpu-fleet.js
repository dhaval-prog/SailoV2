// Draws the local sailors (cpu-captains.js) on the water: their boats (the game's own four models in
// each captain's colours) float and roll on the same waves, leave a wake while sailing, splash when they
// land a fish, and carry a Naked HUD name tag saying what they're doing. Only captains near you are
// drawn (the nearest few in full), so phones stay smooth. Tap a boat or its tag for the captain's card.
// Real captains online (online.js, via setLive) are drawn the same way and come first: when they're
// near, the local sailors quietly step back so the water never gets crowded.
import { ROSTER, stateAt, recentEvents } from './cpu-captains.js';

const NEAR = 2600, TAG = 1500, MAX_DRAWN = 8; // metres: drawn within NEAR, tagged within TAG; at most 8 boats at once
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
    const t = document.createElement('button'); t.type = 'button'; t.className = m.c.live ? 'cpu-tag live' : 'cpu-tag'; t.innerHTML = `<em class="cpu-say" hidden></em><b></b><small></small>`; t.querySelector('b').textContent = m.c.name.split(' ')[0]; t.dataset.id = m.c.id;
    t.addEventListener('click', e => { e.stopPropagation(); onOpen(m.c); }); ['pointerdown', 'pointerup'].forEach(ev => t.addEventListener(ev, e => e.stopPropagation()));
    tagLayer.appendChild(t); return t;
  }
  const status = (m, s) => m.c.live ? { fish: 'Fishing', anchor: 'At anchor', dock: 'At Paradise Station' }[s.kind] || (s.speed > 0.5 ? 'Sailing' : 'Drifting')
    : s.kind === 'fish' ? 'Fishing' : s.kind === 'sell' ? 'Selling at Paradise Station'
    : s.next === 'sell' ? 'Heading to Paradise Station' : s.next === 'fish' ? 'Heading out to fish' : `Heading home to ${m.c.home}`;

  // real captains online: { id, name, boat, colours, rank, catches, st } from online.js, every frame
  const live = new Map();
  function setLive(list) {
    const ids = new Set();
    list.forEach(p => { const id = 'u:' + p.id; ids.add(id); let m = live.get(id);
      if (!m || m.c.boat !== p.boat || JSON.stringify(m.c.colours) !== JSON.stringify(p.colours)) { drop(m); m = { c: null, g: null, tag: null, st: null, yaw: p.st.yaw, sayT: 0, x: p.st.x, z: p.st.z }; live.set(id, m); }
      m.c = { id, uid: p.id, live: true, name: p.name, boat: p.boat, colours: p.colours, rank: p.rank, catches: p.catches }; m.st = p.st;
      if (m.tag) m.tag.querySelector('b').textContent = p.name.split(' ')[0]; });
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
  function update(t, dt) {
    const now = Date.now(), me = playerPos();
    // where everyone is (the far ones twice a second, the near ones every frame)
    crew.forEach(m => { if (m.g?.visible || now >= m.nextCheck) { m.st = stateAt(m.c, now); m.nextCheck = now + 500; } m.d = m.st ? Math.hypot(m.st.x - me.x, m.st.z - me.z) : Infinity; });
    live.forEach(m => { const k = Math.min(1, dt * 3); m.x += (m.st.x - m.x) * k; m.z += (m.st.z - m.z) * k; // (smooth out the reports)
      if (Math.hypot(m.st.x - m.x, m.st.z - m.z) > 200) { m.x = m.st.x; m.z = m.st.z; } m.d = Math.hypot(m.x - me.x, m.z - me.z); });
    const people = [...live.values()].filter(m => m.d < NEAR).sort((a, b) => a.d - b.d).slice(0, MAX_DRAWN);
    const drawn = new Set([...people, ...crew.filter(m => m.d < NEAR).sort((a, b) => a.d - b.d).slice(0, Math.max(2, MAX_DRAWN - people.length))]);
    [...live.values(), ...crew].forEach(m => {
      const show = drawn.has(m);
      if (!show) { if (m.g) m.g.visible = false; if (m.tag) m.tag.hidden = true; if (m.ring) m.ring.visible = false; m.lastEv = now; return; }
      if (m.sayT && now > m.sayT) { m.sayT = 0; const e = m.tag.querySelector('.cpu-say'); e.classList.remove('on'); setTimeout(() => { if (!m.sayT) e.hidden = true; }, 300); }
      if (!m.g) { m.g = build(m); m.yaw = m.st.yaw ?? Math.random() * 6.28; m.tag = makeTag(m); }
      const s = m.st, g = m.g; g.visible = true;
      // heading: turn toward the course; at anchor, swing gently with the wind
      if (s.yaw != null) { let d = s.yaw - m.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); m.yaw += d * Math.min(1, dt * 1.5); }
      else m.yaw += Math.sin(t * 0.15 + m.c.name.length) * dt * 0.05;
      const fx = Math.cos(m.yaw), fz = -Math.sin(m.yaw), sx = Math.sin(m.yaw), sz = Math.cos(m.yaw), x = m.c.live ? m.x : s.x, z = m.c.live ? m.z : s.z;
      const hC = waveJS(x, z, t), hF = waveJS(x + fx * 3, z + fz * 3, t), hB = waveJS(x - fx * 3, z - fz * 3, t), hS = waveJS(x + sx * 2, z + sz * 2, t), hP = waveJS(x - sx * 2, z - sz * 2, t);
      g.position.set(x, (hC + hF + hB) / 3 * 0.85, z);
      g.rotation.set(-Math.atan((hS - hP) / 4) * 0.8, m.yaw, Math.atan((hF - hB) / 6) * 0.8 + Math.min(0.06, s.speed * 0.006));
      // wake while under way; a splash now and then while fishing, and a big one when they land a fish
      if (s.speed > 0.6 && Math.random() < dt * 14) { const side = (Math.random() - 0.5) * 2.2, bx = x - fx * 5.4 + sx * side, bz = z - fz * 5.4 + sz * side;
        emit(bx, WL + waveJS(bx, bz, t), bz, -fx * 1.5 + (Math.random() - 0.5), 1 + Math.random(), -fz * 1.5 + (Math.random() - 0.5)); }
      if (s.kind === 'fish' && Math.random() < dt * 0.25) { const px = x + sx * 4, pz = z + sz * 4; splash(px, pz, 4, 0.35); }
      if (!m.c.live) recentEvents(m.c, now, m.lastEv).forEach(e => { if (e.kind === 'catch') { const px = x + sx * 3.5, pz = z + sz * 3.5; splash(px, pz, 16, 0.7); for (let i = 0; i < 8; i++) emit(px, WL + 0.2, pz, (Math.random() - 0.5) * 1.5, 2.5 + Math.random() * 2, (Math.random() - 0.5) * 1.5); } });
      m.lastEv = now;
      ringFor(m, alerts.has(m.c.id), t);
      // name tag
      const tg = m.tag; tmp.set(x, g.position.y + 12.5, z); const [px, py, pz] = toScreen(tmp);
      const on = m.d < TAG && pz < 1 && px > -60 && px < innerWidth + 60 && py > -40 && py < innerHeight + 40;
      tg.hidden = !on; if (on) { const cx = Math.min(innerWidth - 64, Math.max(64, px)); tg.style.transform = `translate(${cx.toFixed(1)}px, ${py.toFixed(1)}px) translate(-50%, -100%)`; const st = status(m, s); if (tg.dataset.s !== st) { tg.dataset.s = st; tg.querySelector('small').textContent = st; } }
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
  const everyone = () => all().filter(m => m.st).map(m => ({ c: m.c, x: m.c.live ? m.x : m.st.x, z: m.c.live ? m.z : m.st.z, yaw: m.st.yaw ?? m.yaw, status: status(m, m.st) }));
  return { update, hit, out, near, say, setLive, everyone, setAlert };
}
