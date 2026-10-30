// Salvage (settings: SALVAGE in world-config.js; the server's side: migration …_sailov2_salvage.sql).
// - Wooden planks float here and there at sea, from a shared schedule (the chart, a square of sea and a time slot,
//   hashed the same way as the server's plank_at()), so every captain sees the same planks. Sail over one to pick it up:
//   the server checks it's real, you're there, and nobody has it yet.
// - A boat sunk in a fight leaves a wreck: floating timber and, while there's loot left, a crate. Come alongside and
//   "Salvage" lists what's in it (coins, planks, fish); each line goes to whoever takes it first. Its own captain can't.
//   Wrecks come from the server (salvage_wrecks), so everyone sees the same ones, emptied as they're taken.
import { SALVAGE as C } from './world-config.js';
import { h32 } from './market.js';
import { rpc, serverEconomy } from './econ.js';

const P = C.plank;

/**
 * @param o.getBoat () => ({ x, z, yaw })
 * @param o.canSalvage () => '' | reason      why not now (wrecked, moored, …)
 * @param o.report () => Promise               tell the server where you are now (combat.js), before a pick-up
 * @param o.applyEcon (economy) => void        the server's answer (station.js)
 * @param o.fishName (id) => name
 * @param o.send (kind, payload)               tell the other captains (online.js radio)
 */
export function createSalvage({ THREE, scene, WL, wave, splash, chartId, station, edge, getBoat, canSalvage, report, applyEcon, fishName, send, note }) {
  let signedIn = false; serverEconomy().then(on => { signedIn = on; if (on) { refreshTaken(); refresh(); } });
  const wood = new THREE.MeshStandardMaterial({ color: '#b07a45', roughness: 0.85 }), woodDark = new THREE.MeshStandardMaterial({ color: '#6e4526', roughness: 0.9 });
  const halo = new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });

  // ---------- planks floating at sea ----------
  const plankGeo = new THREE.BoxGeometry(3.6, 0.16, 0.42), ropeGeo = new THREE.BoxGeometry(0.1, 0.22, 1.5), haloGeo = new THREE.RingGeometry(2.6, 3.0, 40);
  const rope = new THREE.MeshStandardMaterial({ color: '#d9c49a', roughness: 1 });
  const makePlank = () => { const g = new THREE.Group(); // (a few planks lashed together: timber, not a fish or a crate)
    [-0.44, 0, 0.44].forEach((z, n) => { const p = new THREE.Mesh(plankGeo, n === 1 ? woodDark : wood); p.position.set((n - 1) * 0.18, n === 1 ? 0.02 : 0, z); g.add(p); });
    [-1.1, 1.1].forEach(x => { const r = new THREE.Mesh(ropeGeo, rope); r.position.x = x; g.add(r); });
    const r = new THREE.Mesh(haloGeo, halo); r.rotation.x = -Math.PI / 2; r.position.y = -0.06; g.add(r); g.userData.halo = r; g.visible = false; scene.add(g); return g; };
  const pool = Array.from({ length: 10 }, makePlank);
  const key = (i, j, k) => `${chartId}:${i}:${j}:${k}`, u32 = s => h32(s) / 4294967296;
  /** The plank in square i, j during slot k, if there is one (the same rule as the server's plank_at). */
  function plankAt(i, j, k) {
    const s = key(i, j, k); if (u32('plk:' + s) >= P.chance) return null;
    const x = (i + 0.15 + 0.7 * u32('plkx:' + s)) * P.cell, z = (j + 0.15 + 0.7 * u32('plkz:' + s)) * P.cell;
    if (Math.hypot(x - station.x, z - station.z) < P.awayFromStation || edge(x, z) < 150) return null;
    return { i, j, k, x, z, id: `${i}:${j}:${k}`, spin: u32('plkr:' + s) * Math.PI * 2 };
  }
  const taken = new Set(); let near = [], scanT = 0, picking = null, signNote = 0;
  async function refreshTaken() { try { (await rpc('planks_taken', { p_chart: chartId }) || []).forEach(k => taken.add(k)); } catch { /* offline */ } }
  function scan() {
    const b = getBoat(), k = Math.floor(Date.now() / 1000 / P.slot), i0 = Math.floor((b.x - P.seen) / P.cell), i1 = Math.floor((b.x + P.seen) / P.cell),
      j0 = Math.floor((b.z - P.seen) / P.cell), j1 = Math.floor((b.z + P.seen) / P.cell); near = [];
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const p = plankAt(i, j, k); if (p && !taken.has(p.id) && Math.hypot(p.x - b.x, p.z - b.z) < P.seen) near.push(p); }
    near = near.slice(0, pool.length);
  }
  async function pick(p) {
    if (picking) return; if (!signedIn) { if (Date.now() - signNote > 30000) { signNote = Date.now(); note('Sign in to collect wooden planks.'); } return; }
    const why = canSalvage(); if (why) return;
    picking = p;
    try { await report(); const st = await rpc('plank_pick', { p_chart: chartId, p_i: p.i, p_j: p.j, p_k: p.k }); taken.add(p.id); applyEcon(st); note('+1 Wooden Plank'); splash(p.x, p.z, 6, 0.3); }
    catch (e) { if (['plank_taken', 'plank_gone', 'no_such_plank'].includes(e.code)) { taken.add(p.id); note(e.message); } }
    finally { setTimeout(() => { picking = null; }, 600); }
  }

  // ---------- wrecks ----------
  let wrecks = new Map(), wreckT = 0, takenT = 0; // id → { w (from the server), g (debris), crate }
  const crateGeo = new THREE.BoxGeometry(1.1, 0.8, 0.8), crateMat = new THREE.MeshStandardMaterial({ color: '#8a5a2b', roughness: 0.8 }), bandMat = new THREE.MeshStandardMaterial({ color: '#3d3f44', roughness: 0.5, metalness: 0.6 });
  const slick = new THREE.MeshBasicMaterial({ color: '#1b2a33', transparent: true, opacity: 0.22, depthWrite: false });
  function debris(w) {
    const g = new THREE.Group(), rnd = (n => () => (n = (n * 16807) % 2147483647) / 2147483647)(w.id * 7919 + 13); g.position.set(w.x, WL, w.z);
    const patch = new THREE.Mesh(new THREE.CircleGeometry(9, 28), slick); patch.rotation.x = -Math.PI / 2; patch.position.y = 0.05; g.add(patch);
    const bits = [];
    for (let n = 0; n < 7; n++) { const m = new THREE.Mesh(new THREE.BoxGeometry(1.2 + rnd() * 1.8, 0.12, 0.28), n % 3 ? wood : woodDark);
      m.position.set((rnd() - 0.5) * 12, 0, (rnd() - 0.5) * 12); m.rotation.y = rnd() * Math.PI; g.add(m); bits.push({ m, ph: rnd() * 6 }); }
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 4.2, 8), woodDark); mast.rotation.z = Math.PI / 2 - 0.15; mast.position.set(rnd() * 4 - 2, 0, rnd() * 4 - 2); g.add(mast); bits.push({ m: mast, ph: 1 });
    const crate = new THREE.Group(); crate.add(new THREE.Mesh(crateGeo, crateMat)); [-0.35, 0.35].forEach(x => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.82, 0.82), bandMat); b.position.x = x; crate.add(b); });
    const r = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.8, 32), halo); r.rotation.x = -Math.PI / 2; r.position.y = -0.3; crate.add(r); crate.userData.halo = r;
    g.add(crate); scene.add(g); return { g, bits, crate, born: performance.now() };
  }
  const hasLoot = w => w.coins > 0 || w.planks > 0 || Object.values(w.fish || {}).some(n => n > 0);
  async function refresh() {
    if (!signedIn) return;
    let list; try { list = await rpc('salvage_wrecks', { p_chart: chartId }); } catch { return; }
    const seen = new Set();
    (list || []).forEach(w => { seen.add(w.id); const o = wrecks.get(w.id); if (o) o.w = w; else { wrecks.set(w.id, { w, ...debris(w) }); if (w.left > C.wreckLasts - 20) splash(w.x, w.z, 30, 1.2); } });
    wrecks.forEach((o, id) => { if (!seen.has(id)) { scene.remove(o.g); wrecks.delete(id); } });
    paintPanel();
  }

  // ---------- the salvage prompt and panel ----------
  const ui = document.createElement('div'); ui.id = 'salvage'; ui.innerHTML = `<button type="button" class="sv-go" hidden>Salvage the wreck</button>
    <div class="sv-card" role="dialog" aria-label="Salvage" hidden><div class="sv-h"><b class="sv-t"></b><button type="button" class="sv-x" aria-label="Close">✕</button></div><div class="sv-list"></div><button type="button" class="sv-all">Take everything</button></div>`;
  document.body.appendChild(ui);
  const go = ui.querySelector('.sv-go'), card = ui.querySelector('.sv-card'), list = ui.querySelector('.sv-list');
  let at = null, open = false, busy = false, shown = ''; // (the wreck you're alongside; the list as drawn)
  go.onclick = () => { open = true; paintPanel(); }; ui.querySelector('.sv-x').onclick = () => { open = false; paintPanel(); };
  ui.querySelector('.sv-all').onclick = () => take('all');
  list.addEventListener('click', e => { const b = e.target.closest('[data-take]'); if (b && !b.disabled) take(b.dataset.take); });
  function paintPanel() {
    const w = at && wrecks.get(at)?.w, can = w && hasLoot(w) && !w.mine;
    go.hidden = !can || open; card.hidden = !can || !open; document.body.classList.toggle('salvaging', !!(can && open));
    if (!can) { if (w?.mine && open) open = false; return; }
    go.textContent = `Salvage ${w.npc ? 'the wreck' : `${w.name}’s wreck`}`;
    ui.querySelector('.sv-t').textContent = w.name ? `${w.name}’s wreck` : 'A local sailor’s wreck';
    const row = (label, sub, item) => `<div class="sv-row"><div><b>${label}</b><small>${sub}</small></div><button type="button" class="qb" data-take="${item}" ${busy ? 'disabled' : ''}>Take</button></div>`;
    const html = (w.coins > 0 ? row(`${w.coins} coins`, 'from their purse', 'coins') : '')
      + (w.planks > 0 ? row(`${w.planks} wooden plank${w.planks === 1 ? '' : 's'}`, `${C.plankPrice}c each at the Fish Market`, 'planks') : '')
      + Object.entries(w.fish || {}).filter(([, n]) => n > 0).map(([id, n]) => row(`${n} × ${fishName(id)}`, 'into your hold, room permitting', 'fish:' + id)).join('');
    if (shown !== html) list.innerHTML = shown = html; // (only when it changed: a redraw under a finger loses the tap)
    ui.querySelector('.sv-all').disabled = busy;
  }
  async function take(item) {
    const w = at && wrecks.get(at)?.w; if (!w || busy) return; const why = canSalvage(); if (why) { note(why); return; }
    busy = true; paintPanel();
    try { const b = getBoat(); await report();
      const st = await rpc('salvage_take', { p_wreck: w.id, p_item: item, p_x: +b.x.toFixed(1), p_z: +b.z.toFixed(1) }); applyEcon(st);
      Object.assign(w, st.wreck); const g = st.got, fishN = Object.values(g.fish || {}).reduce((a, n) => a + n, 0);
      note('+' + [g.coins && `${g.coins} coins`, g.planks && `${g.planks} Wooden Plank${g.planks === 1 ? '' : 's'}`, fishN && `${fishN} fish`].filter(Boolean).join(' · '));
      if (!hasLoot(w)) open = false; send?.('salvage', { id: w.id }); }
    catch (e) { note(e.message); if (e.code === 'wreck_gone' || e.code === 'nothing_left') refresh(); }
    busy = false; paintPanel();
  }

  return {
    refresh, refreshTaken,
    /** Every frame. */
    update(t, dt) {
      const b = getBoat(), now = performance.now();
      if (now - scanT > 500) { scanT = now; scan(); }
      pool.forEach((m, n) => { const p = near[n]; if (!p) { m.visible = false; return; } m.visible = true;
        m.position.set(p.x, WL + wave(p.x, p.z, t) + 0.04, p.z); m.rotation.set(Math.sin(t * 0.9 + p.spin) * 0.06, p.spin + t * 0.03, Math.sin(t * 0.7 + p.spin) * 0.05);
        m.userData.halo.scale.setScalar(1 + 0.15 * Math.sin(t * 2 + p.spin)); });
      const close = near.find(p => Math.hypot(p.x - b.x, p.z - b.z) < P.pickUp); if (close) pick(close);
      // wrecks: the timber rides the waves; the crate goes once it's empty; the slick fades
      let best = null, bestD = canSalvage() ? -1 : C.reach; // (wrecked or moored: no salvaging)
      wrecks.forEach((o, id) => { const w = o.w, age = (now - o.born) / 1000; o.g.position.y = WL + wave(w.x, w.z, t);
        o.bits.forEach(({ m, ph }) => { m.position.y = 0.05 + Math.sin(t * 1.3 + ph) * 0.06; m.rotation.x = Math.sin(t + ph) * 0.05; });
        const loot = hasLoot(w); o.crate.visible = loot; if (loot) { o.crate.position.y = 0.25 + Math.sin(t * 1.1) * 0.08; o.crate.rotation.y = t * 0.1; o.crate.userData.halo.scale.setScalar(1 + 0.12 * Math.sin(t * 2)); }
        if (age < 25 && Math.random() < 0.3) splash(w.x + (Math.random() - 0.5) * 6, w.z + (Math.random() - 0.5) * 6, 3, 0.2); // (bubbles as she goes down)
        const d = Math.hypot(w.x - b.x, w.z - b.z); if (loot && !w.mine && d < bestD) { bestD = d; best = id; } });
      if (best !== at) { at = best; if (!at) open = false; paintPanel(); }
      // wrecks: checked often only while one is about (a new one is announced on the radio); planks others took, now and then
      const wreckNear = [...wrecks.values()].some(o => Math.hypot(o.w.x - b.x, o.w.z - b.z) < 600);
      if (now - wreckT > (wreckNear ? 8000 : 45000)) { wreckT = now; refresh(); }
      if (near.length && now - takenT > 90000) { takenT = now; refreshTaken(); }
    },
    /** A radio message from another captain (online.js): a wreck appeared or was emptied. */
    heard() { refresh(); },
    get planksNear() { return near.length; },
  };
}
