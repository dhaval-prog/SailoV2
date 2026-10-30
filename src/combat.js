// Naval combat (settings: COMBAT in world-config.js; the server's side: migration …_sailov2_combat.sql).
// - A cannon (bought at the Boathouse) fires to either side of the boat, within an arc and a range. Tap the cannon at
//   the helm to aim (or F): the firing arcs show on the water and a sight follows the pointer; tap the water (or a boat)
//   to fire. Tap the cannon again (or Esc) to stop aiming.
// - The server says whether a shot may go (a cannon, a ball, reloaded, outside the safe harbour, where you are); the
//   ball's flight is worked out here, and a hit on a boat is sent to the server, which checks it against where that
//   boat really is (its captain's own reports) and takes the hull damage. Other captains see the ball fly.
// - Every captain's hull: 100 points; a hit takes 25. Smoke when damaged; at 0 the boat is wrecked (main.js tows it
//   home). Local sailors can be hit too; a sunk one is gone for a while (the same for everyone).
// - Paradise Station is a safe harbour: no firing near it, and no damage there.
import { COMBAT as C } from './world-config.js';
import { rpc, serverEconomy } from './econ.js';

const TAU = Math.PI * 2, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * @param o.getBoat () => ({ x, z, yaw, vel })
 * @param o.targets () => [{ kind: 'player' | 'npc', id, name, x, z }]   boats that can be hit (not yours)
 * @param o.canFire () => '' | reason                                    why not now (docked, fishing, …)
 * @param o.send (kind, payload)                                          tell the other captains (online.js radio)
 * @param o.seaPoint (pointer event) => Vector3 | null                    where on the water the pointer is
 * @param o.onSank (wreck id) => void                                       a boat you hit went down (salvage.js shows the wreck)
 */
export function createCombat({ THREE, scene, WL, wave, getBoat, splash, emit, station, chartId, stationPos, targets, canFire, send, seaPoint, orbit, note, onWrecked, onHull, onSank, home = stationPos }) {
  const V3 = THREE.Vector3;
  let signedIn = false, hull = { hp: C.hull, max: C.hull, wrecked: false }, aiming = false, reloadUntil = 0, busy = false;
  serverEconomy().then(on => { signedIn = on; if (on) refreshHull(); });

  // ---------- the button at the helm ----------
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'cannon-btn'; btn.hidden = true; btn.setAttribute('aria-label', 'Cannon');
  btn.innerHTML = `<svg viewBox="0 0 60 60" aria-hidden="true"><circle class="cb-track" cx="30" cy="30" r="26"/><circle class="cb-load" cx="30" cy="30" r="26" pathLength="100"/>
    <g class="cb-ico"><rect x="14" y="25" width="26" height="10" rx="5" transform="rotate(-18 27 30)"/><circle cx="40" cy="26" r="3.2" class="cb-mouth"/><circle cx="24" cy="38" r="6"/><circle cx="24" cy="38" r="2.2" class="cb-hub"/></g></svg><b class="cb-n"></b>`;
  document.body.appendChild(btn);
  const load = btn.querySelector('.cb-load'), count = btn.querySelector('.cb-n');
  btn.addEventListener('click', () => setAim(!aiming));
  addEventListener('keydown', e => { if (e.target.closest?.('input, textarea')) return; if (e.key === 'f' || e.key === 'F') setAim(!aiming); if (e.key === 'Escape') setAim(false); });
  function setAim(on) {
    if (on) { const why = whyNot(); if (why) { note(why); return; } }
    if (on && !aiming) { hereEvery = 2000; here(true); } // (a shot needs a fresh position on the server)
    aiming = on; btn.classList.toggle('on', on); arcs.visible = sight.visible = on; document.body.classList.toggle('aiming', on);
    if (on) note(innerWidth > 720 ? 'Aim with the pointer, click to fire (port or starboard). F or Esc to stop.' : 'Tap the water or a boat to fire, to either side. Tap the cannon again to stop.');
  }
  function whyNot() {
    const cn = station.cannon(); if (!cn.owned) return 'This boat has no cannon: fit one at the Boathouse.';
    if (!signedIn) return 'Sign in to use the cannon.';
    if (hull.wrecked) return 'Your boat is wrecked.';
    const b = getBoat(); if (Math.hypot(b.x - stationPos.x, b.z - stationPos.z) < C.safeRadius) return 'Paradise Station is a safe harbour: no cannon fire here.';
    return canFire() || '';
  }

  // ---------- the firing arcs on the water, and the sight ----------
  const arcMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
  const arcs = new THREE.Group(); arcs.visible = false; scene.add(arcs);
  const half = C.arc / 2 * Math.PI / 180;
  [Math.PI / 2, -Math.PI / 2].forEach(beam => { const m = new THREE.Mesh(new THREE.RingGeometry(8, C.range, 40, 1, beam - half, half * 2), arcMat); m.rotation.x = -Math.PI / 2; arcs.add(m);
    const edge = new THREE.Mesh(new THREE.RingGeometry(C.range - 0.6, C.range, 40, 1, beam - half, half * 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
    edge.rotation.x = -Math.PI / 2; arcs.add(edge); });
  const sightMat = new THREE.MeshBasicMaterial({ color: '#6EE7C5', transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const sight = new THREE.Group(); sight.visible = false; scene.add(sight);
  { const ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 2.8, 32), sightMat); ring.rotation.x = -Math.PI / 2; sight.add(ring);
    [0, 1, 2, 3].forEach(i => { const t = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 2), sightMat); t.rotation.x = -Math.PI / 2; t.rotation.z = i * Math.PI / 2; t.position.set(Math.cos(i * Math.PI / 2) * 3.6, 0, Math.sin(i * Math.PI / 2) * 3.6); sight.add(t); }); }
  let aim = null, aimTarget = null;
  // where a shot at p would go: snapped onto a boat near it; valid if within range and either beam's arc
  function aimAt(p) {
    const b = getBoat(); aimTarget = null; let best = 14;
    targets().forEach(t => { const d = Math.hypot(t.x - p.x, t.z - p.z); if (d < best) { best = d; aimTarget = t; } });
    const x = aimTarget ? aimTarget.x : p.x, z = aimTarget ? aimTarget.z : p.z, dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz);
    const rel = wrap(Math.atan2(-dz, dx) - b.yaw), inArc = Math.abs(Math.abs(rel) - Math.PI / 2) <= half;
    aim = { x, z, d, rel, ok: d <= C.range && d > 8 && inArc, why: d > C.range ? 'Out of range.' : !inArc ? 'The cannon fires to either side: turn to bring it to bear.' : '' };
    sightMat.color.set(aim.ok ? (aimTarget ? '#FFC531' : '#6EE7C5') : '#FF5A4E'); return aim;
  }
  addEventListener('pointermove', e => { if (!aiming || e.pointerType !== 'mouse') return; const p = seaPoint(e); if (p) aimAt(p); }, { passive: true });
  /** A tap on the water while aiming (main.js routes it here): fire there. */
  function tap(e) { const p = seaPoint(e); if (!p) return; const a = aimAt(p); if (!a.ok) { note(a.why); return; } fire(a, aimTarget); }

  // ---------- firing ----------
  async function fire(a, target) {
    const why = whyNot(); if (why) { note(why); setAim(false); return; }
    if (busy) return; if (Date.now() < reloadUntil) { note('Reloading…'); return; }
    const cn = station.cannon(); if (cn.balls <= 0) { note('Out of cannonballs: buy more at the Boathouse.'); return; }
    const b = getBoat(); busy = true;
    let st; try { st = await rpc('combat_fire', { p_boat: station.activeBoat(), p_chart: chartId, p_x: b.x, p_z: b.z, p_aim_x: a.x, p_aim_z: a.z }); }
    catch (e) { busy = false; note(e.message); if (e.code === 'where_are_you') here(true); return; }
    busy = false; reloadUntil = Date.now() + C.reload * 1000; station.applyEcon?.(st);
    const side = Math.sign(a.rel) || 1, rx = Math.sin(b.yaw) * -side, rz = Math.cos(b.yaw) * -side; // (out over the side the target is on)
    const m = { x: b.x + Math.cos(b.yaw) * 0.5 + rx * 2.6, y: WL + 2.2, z: b.z - Math.sin(b.yaw) * 0.5 + rz * 2.6 };
    launch(m, a, st.shot, target, true); boom(1); puff(m.x, m.y, m.z, rx, rz);
    send('shot', { x: +m.x.toFixed(1), y: +m.y.toFixed(1), z: +m.z.toFixed(1), ax: +a.x.toFixed(1), az: +a.z.toFixed(1) });
    if (st.balls <= 3) note(st.balls ? `${st.balls} cannonball${st.balls === 1 ? '' : 's'} left.` : 'That was your last cannonball.');
    paint();
  }

  // ---------- cannonballs in flight (yours hit things; other captains' are only seen) ----------
  const ballGeo = new THREE.SphereGeometry(0.32, 10, 8), ballMat = new THREE.MeshStandardMaterial({ color: '#1d1f24', roughness: 0.4, metalness: 0.6 });
  const balls = [];
  function launch(from, to, shot, target, mine) {
    const d = Math.hypot(to.x - from.x, to.z - from.z), T = 0.7 + d / 110, h = 3 + d * 0.06;
    const mesh = new THREE.Mesh(ballGeo, ballMat); mesh.position.set(from.x, from.y, from.z); scene.add(mesh);
    balls.push({ mesh, from, to: { x: to.x, z: to.z }, aim: { x: to.x, z: to.z }, T, h, t: 0, t0: performance.now(), shot, target, mine });
  }
  const islandR = 32; // (the station's island: a ball that reaches it stops there)
  function stepBalls(dt, t) {
    const tgs = balls.some(B => B.mine) ? targets() : [];
    for (let i = balls.length - 1; i >= 0; i--) { const B = balls[i]; B.t = (performance.now() - B.t0) / 1000; const u = Math.min(1, B.t / B.T); // (real time: the server wants the hit soon after the shot)
      if (B.mine && B.target) { const tg = tgs.find(t => t.kind === B.target.kind && t.id === B.target.id); // (fired at a boat: the ball follows it while in the air,
        if (tg && Math.hypot(tg.x - B.aim.x, tg.z - B.aim.z) < 25) { B.to.x = tg.x; B.to.z = tg.z; } }    //  unless it gets well clear, under NOS say)
      const x = B.from.x + (B.to.x - B.from.x) * u, z = B.from.z + (B.to.z - B.from.z) * u, y = B.from.y + (WL - B.from.y) * u + B.h * 4 * u * (1 - u);
      B.mesh.position.set(x, y, z);
      let end = u >= 1 ? 'water' : null, hitT = null;
      if (B.mine && (y < WL + 4.2 || end)) tgs.forEach(tg => { if (end !== 'boat' && Math.hypot(tg.x - x, tg.z - z) < 4.6) { end = 'boat'; hitT = tg; } }); // (and where it lands, in case a slow frame skipped past)
      if (!end && y < WL + 3 && Math.hypot(x - stationPos.x, z - stationPos.z) < islandR) end = 'land';
      if (!end) { if (Math.random() < 0.5) emit(x, y, z, 0, 0.3, 0); continue; } // (a faint trail)
      scene.remove(B.mesh); balls.splice(i, 1);
      if (end === 'water') { splash(x, z, 26, 1.1); continue; }
      if (end === 'land') { splash(x, z, 8, 0.5); boom(0.4); continue; }
      wreckage(x, z); boom(0.8); if (B.mine && B.shot) resolveHit(B.shot, hitT, x, z);
    }
  }
  async function resolveHit(shot, tg, x, z) {
    try { const r = await rpc('combat_hit', { p_shot: shot, p_kind: tg.kind, p_target: tg.id, p_x: x, p_z: z });
      note(r.wrecked ? `${tg.name}${tg.kind === 'npc' ? '’s boat' : ''} is sinking!` : `Hit! ${tg.name} · hull ${Math.round(r.hp / r.hull * 100)}%`);
      if (tg.kind === 'player') send('hit', { to: tg.id, damage: r.damage, wrecked: r.wrecked });
      if (tg.kind === 'npc') npcRefresh();
      if (r.wrecked) onSank?.(r.wreck); }
    catch (e) { note(e.message); }
  }

  // ---------- effects: muzzle smoke, splinters, the boom ----------
  const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const puffs = Array.from({ length: 24 }, () => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, color: '#cfd3d8', transparent: true, opacity: 0, depthWrite: false })); s.visible = false; scene.add(s); return { s, life: 0, v: new V3() }; });
  let puffI = 0;
  function smoke(x, y, z, vx, vy, vz, size = 2.2, life = 1.6, color = '#cfd3d8') { const p = puffs[puffI++ % puffs.length]; p.s.position.set(x, y, z); p.v.set(vx, vy, vz); p.life = p.max = life; p.size = size; p.s.material.color.set(color); p.s.visible = true; }
  function puff(x, y, z, rx, rz) { for (let k = 0; k < 6; k++) smoke(x + rx * k * 0.5, y, z + rz * k * 0.5, rx * (2 + Math.random() * 2), 0.6 + Math.random(), rz * (2 + Math.random() * 2), 1.6 + k * 0.3); }
  function wreckage(x, z) { splash(x, z, 18, 0.8); for (let k = 0; k < 5; k++) smoke(x + (Math.random() - 0.5) * 3, WL + 2 + Math.random() * 2, z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2, 3, 2.4, '#5b5f66');
    for (let k = 0; k < 14; k++) emit(x, WL + 2.5, z, (Math.random() - 0.5) * 9, 3 + Math.random() * 5, (Math.random() - 0.5) * 9); }
  function stepPuffs(dt) { puffs.forEach(p => { if (!p.s.visible) return; p.life -= dt; if (p.life <= 0) { p.s.visible = false; return; } const k = 1 - p.life / p.max;
    p.s.position.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.5); p.s.scale.setScalar(p.size * (0.6 + k * 1.6)); p.s.material.opacity = 0.75 * (1 - k); }); }
  /** Smoke rising from a damaged boat (main.js: yours; others via the fleet). */
  function smokeFrom(x, z, k) { if (Math.random() < k * 0.6) smoke(x + (Math.random() - 0.5) * 2, WL + 3, z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 0.4, 1.2 + k, (Math.random() - 0.5) * 0.4, 2 + k * 2, 2.6, k > 0.6 ? '#3f4247' : '#8d9198'); }
  let ac = null; function boom(v) { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime;
    const o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(35, t + 0.4); g.gain.setValueAtTime(0.5 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.6); o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.65);
    const len = 0.5, b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.08));
    const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g2 = ac.createGain(); src.buffer = b; lp.type = 'lowpass'; lp.frequency.value = 700; g2.gain.value = 0.35 * v; src.connect(lp).connect(g2).connect(ac.destination); src.start(t); } catch { /* no audio */ } }

  // ---------- your hull, where you are (for the server), and the local sailors' hulls ----------
  async function refreshHull() { try { const h = await rpc('combat_me'); setHull(h); } catch { /* offline */ } }
  function setHull(h) { const was = hull.wrecked, hit = synced && h.hp < hull.hp && !h.wrecked; synced = true; hull = { hp: h.hp, max: h.hull, wrecked: !!h.wrecked }; onHull(hull); paint();
    if (hit && Date.now() - heardAt > 4000) note(`You've been hit! Hull ${Math.round(hull.hp / hull.max * 100)}%`); // (the radio's word on who fired may not come)
    if (hull.wrecked && !was) onWrecked(lastHitBy); }
  let hereT = 0, hereEvery = 2000; async function here(force) { if (!signedIn) return; const now = Date.now(); if (!force && now - hereT < hereEvery) return; hereT = now; const b = getBoat();
    try { setHull(await rpc('combat_here', { p_chart: chartId, p_x: +b.x.toFixed(1), p_z: +b.z.toFixed(1), p_station_x: +home.x.toFixed(1), p_station_z: +home.z.toFixed(1) })); } catch { /* offline */ } }
  let npcHulls = new Map(), npcT = 0, npcEvery = 10000, busyT = 0;
  // how often to tell the server where you are (and hear about your hull): every couple of seconds while another captain
  // is close enough to come into range, while aiming or with a ball in the air; now and then otherwise. The local
  // sailors' hulls likewise: often only while one is about.
  function pace() { const b = getBoat(), ts = targets(), near = (kind, d) => ts.some(t => t.kind === kind && Math.hypot(t.x - b.x, t.z - b.z) < d);
    hereEvery = aiming || balls.length || near('player', 450) ? 2000 : 30000; npcEvery = aiming || near('npc', 600) ? 10000 : 60000; }
  async function npcRefresh() { try { const list = await rpc('combat_npcs', { p_chart: chartId }); npcHulls = new Map((list || []).map(n => [n.npc, n])); } catch { /* offline */ } }
  let lastHitBy = '', heardAt = 0, synced = false; // (synced: the first answer is just how the hull was left)
  /** A radio message from another captain (online.js): their shot to draw, or a hit on you. */
  function heard(kind, p, d) {
    if (kind === 'shot') launch({ x: +d.x, y: +d.y, z: +d.z }, { x: +d.ax, z: +d.az }, null, null, false);
    if (kind === 'hit') { lastHitBy = p?.name || 'another captain'; heardAt = Date.now(); note(`You were hit by ${lastHitBy}!`); refreshHull(); }
  }

  // (the button is written to only when something on it changed: writes between the frame's measurements cost a layout)
  const shown = {}, put = (k, v, fn) => { if (shown[k] !== v) { shown[k] = v; fn(v); } };
  function paint() {
    const cn = station.cannon(), p = orbit.cannonAt?.(56); put('hidden', !cn.owned, v => { btn.hidden = v; });
    if (!cn.owned) { if (aiming) setAim(false); return; }
    put('n', cn.balls, v => { count.textContent = v; btn.classList.toggle('empty', v <= 0); });
    const k = Math.max(0, Math.min(1, 1 - (reloadUntil - Date.now()) / (C.reload * 1000)));
    put('load', k.toFixed(2), v => { load.style.strokeDasharray = `${(v * 100).toFixed(1)} 100`; btn.classList.toggle('loading', v < 1); });
    put('label', `Cannon · ${cn.balls} balls${k < 1 ? ' · reloading' : ''}${aiming ? ' · aiming' : ''}`, v => btn.setAttribute('aria-label', v));
    put('at', p ? `${Math.round(p[0] - 28)},${Math.round(p[1] - 28)}` : '', v => { if (!v) { btn.style.visibility = 'hidden'; return; } const [x, y] = v.split(',');
      btn.style.left = `${x}px`; btn.style.top = `${y}px`; btn.style.visibility = ''; });
  }
  addEventListener('sailo:econ', paint);

  return {
    get aiming() { return aiming; }, setAim, tap, heard, smokeFrom,
    /** Every frame. */
    update(t, dt) {
      const b = getBoat();
      if (aiming) { arcs.position.set(b.x, WL + 0.15 + wave(b.x, b.z, t), b.z); arcs.rotation.y = b.yaw;
        if (aim) { aimAt(aimTarget ? { x: aimTarget.x, z: aimTarget.z } : aim); sight.position.set(aim.x, WL + 0.3 + wave(aim.x, aim.z, t), aim.z); sight.rotation.y += dt; }
        const why = whyNot(); if (why) { setAim(false); note(why); } }
      stepBalls(dt, t); stepPuffs(dt);
      if (Date.now() - busyT > 1000) { busyT = Date.now(); pace(); }
      here(); if (Date.now() - npcT > npcEvery) { npcT = Date.now(); npcRefresh(); }
      if ((performance.now() | 0) % 4 === 0) paint();
    },
    get hull() { return hull; }, npcHull: id => npcHulls.get(id) || null, refreshHull,
    /** Tell the server where you are now (before salvaging). */
    reportNow: () => here(true),
    /** After a wreck: back to a sound hull (the server agrees). */
    respawn: () => rpc('combat_respawn').then(setHull).catch(() => {}),
    /** Hull repaired at the Boathouse. */
    repaired: h => setHull(h),
  };
}
