// Playable fishing: hold to charge a cast, read the shadows and nibbles, strike on the bite,
// fight the fish on a tension bar (each species fights its own way), then a catch card with
// weight, rarity, records and a keep-or-release choice. Also: fishing spots (birds + bubbles),
// perfect-cast combos, a fish log for the Garage collection, synthesized sounds and vibration.
// The scene objects (rod, line, bobber) belong to main.js and are passed in through ctx.

import { FISH, localOdds } from './station.js';

const LOG_KEY = 'sailo:fishlog';
const loadLog = () => { try { return JSON.parse(localStorage.getItem(LOG_KEY)) || {}; } catch { return {}; } };
export const fishLog = loadLog(); // { id: { n, best } }
const saveLog = () => { try { localStorage.setItem(LOG_KEY, JSON.stringify(fishLog)); } catch { /* storage blocked */ } };

// rarity from the catch odds: 1 (common) to 5 stars (legendary)
export const stars = f => f.odds >= 14 ? 1 : f.odds >= 6 ? 2 : f.odds >= 3 ? 3 : f.odds >= 1 ? 4 : 5;

// how each species fights: pull strength, safe-zone width, how fast and how far the zone moves,
// how often it changes direction, sprints, jumps, and how long the fight lasts
const FIGHT = {
  sardine: { pull: 0.25, zone: 0.36, speed: 0.5, turn: 1.3, fight: 4 },
  mackerel: { pull: 0.35, zone: 0.32, speed: 0.7, turn: 1.1, fight: 5 },
  snapper: { pull: 0.45, zone: 0.28, speed: 0.7, turn: 1.6, fight: 6 },
  puffer: { pull: 0.3, zone: 0.34, speed: 0.4, turn: 2, fight: 5 },
  tuna: { pull: 0.75, zone: 0.24, speed: 0.45, turn: 3.2, fight: 10, run: true },
  cod: { pull: 0.5, zone: 0.28, speed: 0.5, turn: 2.2, fight: 6.5 },
  flounder: { pull: 0.4, zone: 0.3, speed: 0.35, turn: 2.6, fight: 5.5 },
  barracuda: { pull: 0.6, zone: 0.22, speed: 0.9, turn: 1.4, fight: 7.5, sprint: true },
  mahi: { pull: 0.7, zone: 0.24, speed: 0.55, turn: 3, fight: 9, run: true },
  swordfish: { pull: 0.85, zone: 0.2, speed: 0.6, turn: 2.6, fight: 12, jump: true },
  sailfish: { pull: 0.8, zone: 0.2, speed: 0.75, turn: 2.2, fight: 12, jump: true },
  permit: { pull: 0.65, zone: 0.24, speed: 0.65, turn: 2, fight: 8.5, run: true },
  johndory: { pull: 0.45, zone: 0.28, speed: 0.45, turn: 1.8, fight: 6 },
  pomfret: { pull: 0.35, zone: 0.32, speed: 0.6, turn: 1.4, fight: 5 },
  kingfish: { pull: 0.65, zone: 0.22, speed: 0.85, turn: 1.5, fight: 8, sprint: true },
  hilsa: { pull: 0.4, zone: 0.3, speed: 0.7, turn: 1.2, fight: 5.5 },
  yellowtail: { pull: 0.7, zone: 0.24, speed: 0.6, turn: 2.6, fight: 9, run: true },
  seabream: { pull: 0.45, zone: 0.28, speed: 0.6, turn: 1.7, fight: 6 },
  salmon: { pull: 0.65, zone: 0.24, speed: 0.7, turn: 2, fight: 8.5, jump: true },
  halibut: { pull: 0.8, zone: 0.22, speed: 0.35, turn: 3, fight: 11 },
  seabass: { pull: 0.45, zone: 0.28, speed: 0.6, turn: 1.6, fight: 6 },
  redmullet: { pull: 0.3, zone: 0.34, speed: 0.5, turn: 1.4, fight: 4.5 },
  reddrum: { pull: 0.55, zone: 0.26, speed: 0.5, turn: 2.2, fight: 7, run: true },
  stripedbass: { pull: 0.6, zone: 0.25, speed: 0.6, turn: 2, fight: 7.5 },
  barramundi: { pull: 0.7, zone: 0.23, speed: 0.6, turn: 2.2, fight: 9, jump: true },
};

export function createFishing(ctx) {
  const { THREE, stage, WL, waveJS, boat, ACT, F, bobber, fishLine, rodRot, rodPivot, station, CAST } = ctx;
  const V3 = THREE.Vector3;
  const restTilt = 0.95;

  // ---------- sound (Web Audio, created on the first gesture) ----------
  let ac = null, whine = null, whineGain = null;
  const audio = () => { if (ac) return ac; try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch { ac = null; } return ac; };
  const noise = (dur, freq, q, vol, type = 'bandpass') => { const a = audio(); if (!a) return; const n = Math.floor(a.sampleRate * dur), buf = a.createBuffer(1, n, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
    const src = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain(); src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q; g.gain.value = vol;
    src.connect(f).connect(g).connect(a.destination); src.start(); };
  const tone = (freq, dur, vol, type = 'sine', slide = 0) => { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), a.currentTime + dur);
    g.gain.setValueAtTime(vol, a.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + dur); o.connect(g).connect(a.destination); o.start(); o.stop(a.currentTime + dur); };
  const sfx = {
    whoosh: () => noise(0.35, 900, 0.7, 0.18, 'highpass'),
    splash: big => { noise(big ? 0.7 : 0.4, big ? 500 : 900, 0.8, big ? 0.5 : 0.3); },
    plop: () => tone(520, 0.12, 0.12, 'sine', -300),
    click: () => noise(0.03, 3000, 2, 0.12),
    bite: () => { tone(880, 0.08, 0.15, 'square'); setTimeout(() => tone(1175, 0.12, 0.15, 'square'), 90); },
    snap: () => { noise(0.12, 2500, 1.5, 0.4, 'highpass'); tone(300, 0.25, 0.15, 'sawtooth', -200); },
    fanfare: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.12, 'triangle'), i * 110)),
    record: () => [784, 988, 1175, 1568].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.1, 'triangle'), i * 80)),
  };
  const setWhine = level => { const a = audio(); if (!a) return;
    if (!whine) { whine = a.createOscillator(); whineGain = a.createGain(); whine.type = 'triangle'; whineGain.gain.value = 0; whine.connect(whineGain).connect(a.destination); whine.start(); }
    whine.frequency.setTargetAtTime(220 + level * 900, a.currentTime, 0.05); whineGain.gain.setTargetAtTime(level > 0.05 ? 0.015 + level * 0.05 : 0, a.currentTime, 0.08); };
  const buzz = ms => { try { navigator.vibrate?.(ms); } catch { /* not supported */ } };

  // ---------- DOM overlay ----------
  const ui = document.createElement('div'); ui.className = 'fg'; document.body.appendChild(ui);
  ui.innerHTML = `
    <div class="fg-strike" id="fg-strike" hidden><button type="button" id="fg-strike-btn">Strike!</button></div>
    <div class="fg-fight" id="fg-fight" hidden>
      <div class="fg-fish-row"><span id="fg-fish-name">Fish on!</span><span class="fg-dir" id="fg-dir"></span></div>
      <svg viewBox="0 0 320 140" class="fg-arc" aria-hidden="true">
        <defs><linearGradient id="fg-grad" x1="0" x2="1"><stop offset="0" stop-color="#6fb7ff"/><stop offset="0.55" stop-color="#7ff0c8"/><stop offset="0.85" stop-color="#ffd36b"/><stop offset="1" stop-color="#ee3427"/></linearGradient></defs>
        <path d="M50 125 A110 110 0 0 1 270 125" class="fg-track"/>
        <path d="M50 125 A110 110 0 0 1 270 125" class="fg-track-col"/>
        <path id="fg-zone" class="fg-zone" d=""/>
        <g id="fg-needle"><line x1="160" y1="125" x2="160" y2="30"/><circle cx="160" cy="125" r="7"/></g>
        <text x="50" y="138" class="fg-lab" text-anchor="middle">slack</text><text x="270" y="138" class="fg-lab" text-anchor="middle">snap</text>
      </svg>
      <div class="fg-prog"><i id="fg-prog"></i></div>
      <div class="fg-help" id="fg-help">Hold to reel · keep the needle in the green · swipe against the fish</div>
    </div>
    <div class="fg-tap" id="fg-tap" hidden>Tap!</div>
    <div class="fg-flash" id="fg-flash"></div>
    <div class="fg-card-wrap" id="fg-card" hidden><div class="fg-card">
      <div class="fg-badge" id="fg-badge" hidden>New record!</div>
      <img id="fg-img" alt=""><h3 id="fg-name"></h3><div class="fg-stars" id="fg-stars"></div>
      <div class="fg-stats"><div><b id="fg-kg"></b><span>Weight</span></div><div><b id="fg-val"></b><span>Market value</span></div></div>
      <p class="fg-note" id="fg-note"></p>
      <div class="fg-btns"><button type="button" class="fg-keep" id="fg-keep">Keep</button><button type="button" class="fg-rel" id="fg-rel"></button></div>
    </div></div>`;
  const $ = id => ui.querySelector('#' + id);

  // ---------- fishing spots: birds circling over bubbles; casting into one draws bigger fish ----------
  const soft = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,0.4)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const birdGeo = (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0.25, 0.9, -0.15, 0, 0.15, 0, 0, 0, -0.15, 0, -0.15, -0.5, 0.25, -0.9], 3)); g.computeVertexNormals(); return g; })();
  const birdMat = new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.DoubleSide });
  const spots = [0, 1].map(() => {
    const g = new THREE.Group(); g.visible = false; stage._scene.add(g);
    const shimmer = new THREE.Mesh(new THREE.CircleGeometry(4.2, 32), new THREE.MeshBasicMaterial({ color: '#d8fbff', map: soft, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    shimmer.rotation.x = -Math.PI / 2; shimmer.position.y = 0.07; g.add(shimmer);
    const bub = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(30 * 3), 3)), new THREE.PointsMaterial({ color: '#ffffff', size: 0.22, transparent: true, opacity: 0.9, depthWrite: false }));
    bub.frustumCulled = false; g.add(bub);
    const birds = [0, 1, 2].map(i => { const b = new THREE.Mesh(birdGeo, birdMat); b.scale.setScalar(0.9); g.add(b); return { b, ph: i * 2.1, r: 3 + i, h: 6 + i * 1.2 }; });
    const seeds = Array.from({ length: 30 }, () => [Math.random() * 6.28, Math.random() * 3.2, Math.random()]);
    return { g, shimmer, bub, birds, seeds, ttl: 0, pos: new V3() };
  });
  const placeSpot = s => { const a = Math.random() * Math.PI * 2, r = CAST.min + 4 + Math.random() * (CAST.max - CAST.min - 6);
    s.pos.set(boat.position.x + Math.cos(a) * r, WL, boat.position.z + Math.sin(a) * r); s.ttl = 30 + Math.random() * 20; s.g.visible = true; };
  const spotAt = p => spots.find(s => s.g.visible && Math.hypot(p.x - s.pos.x, p.z - s.pos.z) < 4.5);

  // ---------- fish shadow under the water ----------
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#061a33', map: soft, transparent: true, opacity: 0, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.renderOrder = 2; stage._scene.add(shadow);

  // ---------- power meter (on the water, in the aiming direction) ----------
  const ARC = 0.55;
  const powerArc = new THREE.Mesh(new THREE.RingGeometry(1, 1.5, 40, 1, -ARC / 2, ARC), new THREE.MeshBasicMaterial({ color: '#fff3a6', transparent: true, opacity: 0.55, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  const arcEdge = new THREE.LineSegments(new THREE.EdgesGeometry(powerArc.geometry), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthTest: false })); powerArc.add(arcEdge); powerArc.renderOrder = 6; arcEdge.renderOrder = 7;
  const sweet = new THREE.Mesh(new THREE.RingGeometry(1, 1.0001, 40, 1, -ARC / 2, ARC), new THREE.MeshBasicMaterial({ color: '#fff7c9', transparent: true, opacity: 0.45, depthWrite: false, depthTest: false, side: THREE.DoubleSide }));
  const powerG = new THREE.Group(); powerG.visible = false; [sweet, powerArc].forEach(m => { m.rotation.x = -Math.PI / 2; powerG.add(m); }); stage._scene.add(powerG);
  const SWEET = [0.76, 0.9];
  { const r0 = CAST.min + (CAST.max - CAST.min) * SWEET[0], r1 = CAST.min + (CAST.max - CAST.min) * SWEET[1]; sweet.geometry.dispose(); sweet.geometry = new THREE.RingGeometry(r0, r1, 40, 1, -ARC / 2, ARC); }

  // ---------- state ----------
  const G = { combo: 0, perfect: false, spot: null, charging: null, fishId: null, kg: 0, phase: '', t: 0, nibbles: 0,
    T: 0.45, prog: 0, zc: 0.5, zt: 0.5, dir: 1, turnT: 0, stam: 1, snapT: 0, slackT: 0, reel: false, jump: null, jumpT: 0, swipe: null, clickT: 0, buzzT: 0,
    hooked: new V3(), approach: new V3(), arrivedR: 0 };
  let jumpModel = null;

  const pickFish = () => {
    const night = ctx.night(), rare = f => f.odds <= 5;
    const w = FISH.map(f => { let o = localOdds(f); if (!o) return 0; // only fish that live in these waters
      if (G.spot) o *= f.price >= 30 ? 3 : f.price < 10 ? 0.5 : 1;        // fishing spot: bigger species
      if (G.perfect && rare(f)) o *= 1.6;                                    // perfect cast
      if (rare(f)) o *= 1 + 0.3 * Math.min(G.combo, 5) + (night > 0.5 ? 0.8 : 0); // combo streak, night
      return o; });
    let r = Math.random() * w.reduce((a, b) => a + b, 0); for (let i = 0; i < FISH.length; i++) { r -= w[i]; if (r <= 0) return FISH[i]; } return FISH[0];
  };
  const fishOf = () => FISH.find(f => f.id === G.fishId);
  const status = text => { ctx.setStatus(text); };

  // ---------- input ----------
  const onStrike = () => {
    if (ACT.fish === 'waiting' && G.phase !== 'gone') { // too early
      ctx.floatText(bobber.position.clone().setY(WL + 1.6), 'Too early!', '#ffb39f'); sfx.plop(); G.phase = 'gone'; G.t = 0; return; }
    if (ACT.fish === 'bite') { $('fg-strike').hidden = true; startFight(); }
  };
  $('fg-strike-btn').addEventListener('pointerdown', e => { e.stopPropagation(); e.preventDefault(); onStrike(); });
  addEventListener('keydown', e => {
    if (e.code === 'Space' && ACT.fish !== 'off') { e.preventDefault(); if (ACT.fish === 'fight') G.reel = true; else onStrike(); }
    if (ACT.fish === 'fight' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) swipeAgainst(e.key === 'ArrowLeft' ? -1 : 1);
  });
  addEventListener('keyup', e => { if (e.code === 'Space') G.reel = false; });
  // the stage. The camera can still be rotated while fishing: a drag rotates it, while
  //   aim:          press and hold still (a moment) to charge a cast, release to cast
  //   wait / bite:  a quick tap strikes
  //   fight:        hold to reel, swipe against the fish (the camera holds still)
  const HOLD = 200, SLOP = 8;
  let pend = null; // a press that may become a cast charge or a strike tap, unless it turns into a camera drag
  const startCharge = () => { const c = pend; pend = null; if (!c || ACT.fish !== 'aim') return;
    G.charging = { k: 0, p: c.p, x: c.x, y: c.y }; stage._controls.enabled = false; ctx.tiltCam(true); powerG.visible = true; };
  const stageDown = e => {
    if (e.target.closest && e.target.closest('button, .fg-card-wrap, #boatmenu, .sheet, .map-modal')) return false;
    audio();
    if (ACT.fish === 'aim') { const p = ctx.seaPoint(e); if (!p || ctx.hitsBoat(e)) return false; clearTimeout(pend?.timer); pend = { p, x: e.clientX, y: e.clientY, t: performance.now(), kind: 'cast' }; pend.timer = setTimeout(startCharge, HOLD); return false; }
    if (ACT.fish === 'waiting' || ACT.fish === 'bite') { if (ctx.hitsBoat(e)) return false; pend = { x: e.clientX, y: e.clientY, t: performance.now(), kind: 'strike' }; return false; } // the boat still opens its menu
    if (ACT.fish === 'fight') { G.reel = true; G.swipe = { x: e.clientX, t: performance.now() }; return true; }
    if (G.jump && G.jump.window) { tapJump(); return true; }
    return false;
  };
  const stageMove = e => {
    if (pend && Math.hypot(e.clientX - pend.x, e.clientY - pend.y) > SLOP) { clearTimeout(pend.timer); pend = null; } // it's a camera drag
    if (G.charging) { const p = ctx.seaPoint(e); if (p) G.charging.p = p; }
    if (ACT.fish === 'fight' && G.swipe) { const dx = e.clientX - G.swipe.x; if (Math.abs(dx) > 60) { swipeAgainst(Math.sign(dx)); G.swipe = { x: e.clientX, t: performance.now() }; } }
  };
  const stageUp = () => {
    if (pend) { clearTimeout(pend.timer); if (pend.kind === 'strike' && performance.now() - pend.t < 350) onStrike(); pend = null; }
    if (G.charging) { const c = G.charging; G.charging = null; stage._controls.enabled = true; powerG.visible = false; releaseCast(c); }
    G.reel = false; G.swipe = null;
  };
  stage.addEventListener('pointerdown', e => { if (ACT.fish !== 'off' && stageDown(e)) e.stopPropagation(); }, true);
  addEventListener('pointermove', stageMove); addEventListener('pointerup', stageUp); addEventListener('pointercancel', () => { if (pend) { clearTimeout(pend.timer); pend = null; } stageUp(); });
  $('fg-tap').addEventListener('pointerdown', e => { e.stopPropagation(); tapJump(); });

  const power = k => 0.5 - 0.5 * Math.cos(k * Math.PI * 2 / 1.5); // swings 0 -> 1 -> 0 every 1.5 s
  function releaseCast(c) {
    const pw = power(c.k), dist = CAST.min + (CAST.max - CAST.min) * pw;
    const dir = c.p.clone().sub(boat.position).setY(0); if (dir.lengthSq() < 0.01) dir.set(1, 0, 0); dir.normalize();
    const target = boat.position.clone().addScaledVector(dir, dist);
    G.perfect = pw >= SWEET[0] && pw <= SWEET[1];
    G.combo = G.perfect ? G.combo + 1 : 0;
    ctx.tiltCam(false);
    if (G.perfect) { ctx.floatText(target.clone().setY(WL + 3), G.combo > 1 ? `Perfect cast! ×${G.combo}` : 'Perfect cast!', '#ffd36b', true); sfx.fanfare(); buzz(20); }
    G.spot = spotAt(target) || null;
    if (G.spot) ctx.floatText(target.clone().setY(WL + 2), 'Fishing spot!', '#7ff0c8');
    sfx.whoosh();
    ctx.castAt(target, true);
  }

  // called by main when the bobber lands
  function landed() {
    const f = pickFish(); G.fishId = f.id; G.phase = 'approach'; G.t = 0; G.nibbles = 1 + Math.floor(Math.random() * 3);
    const big = f.len > 1.2, a = Math.random() * Math.PI * 2, d = 10 + Math.random() * 5;
    G.approach.set(bobber.position.x + Math.cos(a) * d, WL, bobber.position.z + Math.sin(a) * d);
    shadow.position.copy(G.approach).setY(WL + 0.05); shadow.scale.set(f.len * 2.6, f.h * 2.6 * (f.flat ? 2.4 : 1.4) + 0.3, 1);
    G.shadowSpeed = big ? 1.4 : f.len < 0.7 ? 4.5 : 2.6; G.dart = f.len < 0.7;
    sfx.plop(); status(G.combo > 1 ? `Waiting for a bite… · Combo ×${G.combo}` : 'Waiting for a bite…');
  }

  // ---------- the fight ----------
  function startFight() {
    const f = fishOf(), P = FIGHT[f.id] || FIGHT.mackerel;
    ACT.fish = 'fight'; G.T = 0.45; G.prog = 0; G.zc = 0.5; G.zt = 0.5; G.dir = Math.random() < 0.5 ? -1 : 1; G.turnT = P.turn; G.stam = 1; G.snapT = 0; G.slackT = 0; G.t = 0; G.jumpT = 3 + Math.random() * 2; G.jump = null;
    G.hooked.copy(bobber.position);
    $('fg-fight').hidden = false; $('fg-fish-name').textContent = 'Fish on!'; sfx.splash(true); buzz([30, 40, 30]);
    status('Reel it in!'); ctx.paintStatus();
  }
  function swipeAgainst(d) {
    if (ACT.fish !== 'fight') return;
    if (d === -G.dir) { G.stam = Math.max(0, G.stam - 0.22); G.prog = Math.min(1, G.prog + 0.04); ctx.floatText(bobber.position.clone().setY(WL + 2), 'Tiring it!', '#7ff0c8'); sfx.click(); buzz(10); }
    else { G.T = Math.min(1, G.T + 0.12); }
  }
  function tapJump() {
    if (!G.jump || G.jump.tapped) return; G.jump.tapped = true; $('fg-tap').hidden = true;
    if (G.jump.window) { G.prog = Math.min(1, G.prog + 0.14); G.stam = Math.max(0, G.stam - 0.2); ctx.floatText(G.hooked.clone().setY(WL + 5), 'Line tight!', '#7ff0c8', true); sfx.click(); buzz(15); }
  }
  const zonePath = (c, w) => { const a0 = Math.PI * (1 - Math.max(0, c - w / 2)), a1 = Math.PI * (1 - Math.min(1, c + w / 2)), R = 110, cx = 160, cy = 125;
    const p = a => `${cx + R * Math.cos(a)} ${cy - R * Math.sin(a)}`; return `M${p(a0)} A${R} ${R} 0 0 1 ${p(a1)}`; };

  function endFight(won, why) {
    $('fg-fight').hidden = true; $('fg-tap').hidden = true; setWhine(0); G.reel = false;
    if (jumpModel) { jumpModel.removeFromParent(); jumpModel = null; }
    if (won) { ACT.fish = 'landing'; F.k = 0; F.from.copy(bobber.position); sfx.splash(true); ctx.paintStatus(); return; }
    ctx.floatText(bobber.position.clone().setY(WL + 2), why, '#ffb39f', true); if (why.startsWith('Snap')) sfx.snap(); else sfx.plop();
    buzz(60); bobber.visible = false; fishLine.visible = false; ACT.fish = 'aim'; G.combo = 0; status('Hold on the sea to cast'); ctx.paintStatus();
  }

  // ---------- catch card ----------
  function showCard() {
    const f = fishOf(), kg = Math.round(f.kg * (0.75 + Math.random() * 0.6) * 100) / 100, rec = fishLog[f.id], isNew = !rec, record = !rec || kg > rec.best;
    G.kg = kg;
    fishLog[f.id] = { n: (rec?.n || 0) + 1, best: Math.max(rec?.best || 0, kg) }; saveLog();
    $('fg-img').src = station.fishImage(f.id) || ''; $('fg-name').textContent = f.name;
    $('fg-stars').innerHTML = '★'.repeat(stars(f)) + '<span>' + '★'.repeat(5 - stars(f)) + '</span>';
    $('fg-kg').textContent = kg >= 10 ? kg.toFixed(1) + ' kg' : kg.toFixed(2) + ' kg'; $('fg-val').textContent = f.price + 'c';
    $('fg-badge').hidden = !record; $('fg-badge').textContent = isNew ? 'New species!' : 'New record!';
    const full = station.holdFull(), bonus = Math.max(1, Math.round(f.price * 0.2));
    $('fg-keep').disabled = full; $('fg-keep').textContent = full ? 'Hold full' : 'Keep';
    $('fg-rel').textContent = `Release +${bonus}c`; $('fg-rel').dataset.bonus = bonus;
    const h = station.holdInfo(); $('fg-note').textContent = full ? 'Your hold is full. Release it, or sell at Paradise Station.' : `Hold ${h.n} / ${h.cap}`;
    $('fg-card').hidden = false; ACT.fish = 'card'; if (record) sfx.record(); else sfx.fanfare(); buzz([40, 30, 60]);
    status(f.name + '!'); ctx.paintStatus();
  }
  const closeCard = () => { $('fg-card').hidden = true; ACT.fish = 'aim'; status('Hold on the sea to cast'); ctx.paintStatus(); };
  $('fg-keep').addEventListener('click', () => { const f = station.addCatch(G.fishId); if (f) { ACT.catch++; ctx.floatText(ctx.landPoint().setY(ctx.landPoint().y + 1.5), `+1 ${f.name}`, '#7ff0c8'); } closeCard(); });
  $('fg-rel').addEventListener('click', () => { const b = +$('fg-rel').dataset.bonus; station.addCoins(b); ACT.catch++; ctx.splash(bobber.position.x, bobber.position.z, 12, 0.6);
    ctx.floatText(ctx.landPoint().setY(ctx.landPoint().y + 1.5), `Released · +${b}c`, '#bfefff'); closeCard(); });

  // ---------- per frame ----------
  const tipW = new V3(), tmp = new V3();
  function step(t, dt) {
    const fishing = ACT.fish !== 'off';
    // spots live while fishing
    spots.forEach((s, i) => { if (!fishing) { s.g.visible = false; return; }
      if (!s.g.visible || (s.ttl -= dt) <= 0 || Math.hypot(s.pos.x - boat.position.x, s.pos.z - boat.position.z) > CAST.max + 6) placeSpot(s);
      s.g.position.set(s.pos.x, WL + waveJS(s.pos.x, s.pos.z, t) * 0.6, s.pos.z);
      s.shimmer.material.opacity = 0.22 + 0.14 * Math.sin(t * 3 + i); s.shimmer.scale.setScalar(1 + 0.06 * Math.sin(t * 2 + i));
      const bp = s.bub.geometry.attributes.position; s.seeds.forEach(([a, r, ph], k) => { const y = ((t * 0.6 + ph) % 1) * 0.6; bp.setXYZ(k, Math.cos(a + t * 0.2) * r, 0.1 + y, Math.sin(a + t * 0.2) * r); }); bp.needsUpdate = true;
      s.birds.forEach(b => { const a = t * 0.8 + b.ph; b.b.position.set(Math.cos(a) * b.r, b.h + Math.sin(t * 1.3 + b.ph) * 0.4, Math.sin(a) * b.r); b.b.rotation.set(0, -a, 0); b.b.scale.y = 0.6 + 0.5 * Math.abs(Math.sin(t * 7 + b.ph)); }); });
    // charging a cast: the power arc swings out and back along the aim
    if (G.charging) { G.charging.k += dt; const pw = power(G.charging.k), r = CAST.min + (CAST.max - CAST.min) * pw, dir = G.charging.p.clone().sub(boat.position).setY(0);
      powerG.position.set(boat.position.x, WL + 0.4, boat.position.z); // drawn over the waves
      powerG.rotation.y = Math.atan2(-dir.z, dir.x); // points wherever the finger is, all the way round
      powerArc.geometry.dispose(); powerArc.geometry = new THREE.RingGeometry(Math.max(0.5, r - 0.6), r + 0.6, 24, 1, -ARC / 2, ARC);
      arcEdge.geometry.dispose(); arcEdge.geometry = new THREE.EdgesGeometry(powerArc.geometry);
      const inSweet = pw >= SWEET[0] && pw <= SWEET[1]; powerArc.material.color.set(inSweet ? '#ffe066' : '#fff3a6'); powerArc.material.opacity = inSweet ? 0.8 : 0.55; sweet.material.opacity = inSweet ? 0.6 : 0.3;
      status(inSweet ? 'Release now — perfect!' : 'Release to cast'); }
    rodPivot.updateWorldMatrix(true, true); ctx.rodTip.getWorldPosition(tipW);
    const wy = WL + waveJS(bobber.position.x, bobber.position.z, t);
    // the wait: a shadow swims in, nibbles, then bites
    if (ACT.fish === 'waiting') {
      G.t += dt; const f = fishOf();
      const to = tmp.copy(bobber.position).setY(WL); const d = shadow.position.distanceTo(to);
      if (G.phase === 'approach') {
        shadow.material.opacity = Math.min(0.5, shadow.material.opacity + dt * 0.4);
        const sp = G.shadowSpeed * (G.dart ? (0.5 + Math.abs(Math.sin(t * 6))) : 1); const v = to.clone().sub(shadow.position).setY(0);
        if (d > 1.6) { v.setLength(Math.min(d - 1.4, sp * dt)); shadow.position.add(v); shadow.rotation.z = Math.atan2(-v.z, v.x); }
        else { G.phase = 'circle'; G.t = 0; G.nextNib = 0.8 + Math.random(); }
        bobber.position.y = wy + 0.02 + Math.sin(t * 3) * 0.02;
      } else if (G.phase === 'circle') {
        const a = t * 1.2; shadow.position.set(to.x + Math.cos(a) * 1.4, WL + 0.05, to.z + Math.sin(a) * 1.4); shadow.rotation.z = -a - Math.PI / 2;
        G.nextNib -= dt; bobber.position.y = wy + 0.02 + Math.sin(t * 3) * 0.02;
        if (G.nextNib <= 0) {
          if (G.nibbles-- > 0) { bobber.position.y = wy - 0.12; ctx.ripple(bobber.position.x, bobber.position.z, 0.35, 1); sfx.plop(); buzz(6); G.nextNib = 0.9 + Math.random() * 1.4; }
          else { // the bite
            ACT.fish = 'bite'; G.t = 0; ctx.splash(bobber.position.x, bobber.position.z, 16, 0.8); sfx.bite(); buzz(45); ctx.shake();
            ctx.floatText(bobber.position.clone().setY(wy + 1.6), '!', '#ffd36b', true); $('fg-strike').hidden = false; status('Strike!'); ctx.paintStatus(); }
        }
      } else if (G.phase === 'gone') { // spooked: the shadow darts away; another fish comes later
        const away = shadow.position.clone().sub(to).setY(0); if (away.lengthSq() < 0.01) away.set(1, 0, 0); shadow.position.addScaledVector(away.normalize(), dt * 9);
        shadow.material.opacity = Math.max(0, shadow.material.opacity - dt * 0.8); bobber.position.y = wy + 0.02;
        if (G.t > 2.5 + Math.random()) landed();
      }
      F.rip -= dt; if (F.rip <= 0) { F.rip = 1.8; ctx.ripple(bobber.position.x, bobber.position.z, 0.25, 1.6); }
      void f;
    } else if (ACT.fish === 'bite') {
      G.t += dt; bobber.position.y = wy - 0.32 - Math.abs(Math.sin(t * 22)) * 0.12; rodRot.rotation.z = restTilt + Math.sin(t * 30) * 0.06 + 0.15;
      if (Math.random() < 0.4) ctx.emit(bobber.position.x, wy, bobber.position.z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5);
      if (G.t > 1.1) { $('fg-strike').hidden = true; ACT.fish = 'waiting'; G.phase = 'gone'; G.t = 0; ctx.floatText(bobber.position.clone().setY(wy + 1.6), 'It got away…', '#ffb39f'); status('Waiting for a bite…'); ctx.paintStatus(); }
    } else if (ACT.fish === 'fight') {
      const f = fishOf(), P = FIGHT[f.id] || FIGHT.mackerel, storm = ctx.weather() === 'storm' ? 1.5 : ctx.weather() === 'rain' ? 1.2 : 1, tired = G.stam < 0.35;
      G.t += dt;
      // the fish changes direction; runs keep going, sprinters dart
      if ((G.turnT -= dt) <= 0) { G.dir = -G.dir; G.turnT = P.turn * (0.6 + Math.random() * 0.8); G.zt = 0.2 + Math.random() * 0.6; if (P.sprint) G.zt = G.zt < 0.5 ? 0.15 : 0.85; }
      const zs = P.speed * (P.sprint && Math.random() < dt * 2 ? 8 : 1); G.zc += (G.zt - G.zc) * Math.min(1, dt * zs);
      const zoneW = P.zone * (tired ? 1.5 : 1) + (1 - G.stam) * 0.05;
      // tension: you reel it up, it eases off when you let go; the fish's surges pull it up
      const pull = P.pull * storm * (tired ? 0.5 : 1) * (P.run ? 1 + 0.4 * Math.sin(G.t * 0.7) : 1) * (0.6 + 0.4 * Math.abs(Math.sin(G.t * 2.3)));
      G.T += (G.reel ? 0.75 : -0.6) * dt + pull * 0.35 * dt; G.T = Math.min(1, Math.max(0, G.T));
      const inZone = Math.abs(G.T - G.zc) < zoneW / 2;
      G.prog = Math.min(1, Math.max(0, G.prog + (inZone ? dt / P.fight * (tired ? 1.5 : 1) * (G.reel ? 1.2 : 0.7) : -dt * 0.04)));
      G.snapT = G.T > 0.95 ? G.snapT + dt : 0; G.slackT = G.T < 0.05 && G.t > 1.5 ? G.slackT + dt : 0;
      // the hooked fish runs left and right and comes closer as you win
      const toBoat = boat.position.clone().sub(F.target).setY(0), side = new V3(-toBoat.z, 0, toBoat.x).normalize();
      const base = F.target.clone().lerp(boat.position, G.prog * 0.78);
      G.hooked.lerp(base.addScaledVector(side, G.dir * (2 + 3 * (1 - G.prog)) * (0.6 + 0.4 * Math.sin(G.t * 1.7))), Math.min(1, dt * 1.5));
      bobber.position.set(G.hooked.x, WL + waveJS(G.hooked.x, G.hooked.z, t) - 0.15, G.hooked.z);
      shadow.position.set(G.hooked.x, WL + 0.05, G.hooked.z); shadow.material.opacity = 0.45; shadow.rotation.z = Math.atan2(G.dir * side.z, -G.dir * side.x);
      if (Math.random() < dt * (4 + pull * 6)) ctx.emit(bobber.position.x, wy, bobber.position.z, (Math.random() - 0.5) * 1.5, 1 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5);
      if (Math.random() < dt * 1.5) ctx.ripple(bobber.position.x, bobber.position.z, 0.4, 1);
      // the rod bends with the tension and shakes when the fish surges
      rodRot.rotation.z = restTilt + 0.1 + G.T * 0.55 + Math.sin(t * 28) * 0.03 * pull;
      // jumpers (swordfish, sailfish) leap out: tap at the top of the jump
      if (P.jump) { G.jumpT -= dt;
        if (!G.jump && G.jumpT <= 0) { G.jump = { k: 0, tapped: false, window: false }; jumpModel = station.fishModel(f.id); jumpModel.scale.setScalar(2.4); ctx.scene.add(jumpModel); ctx.splash(G.hooked.x, G.hooked.z, 26, 1.2); sfx.splash(true); }
        if (G.jump) { const j = G.jump; j.k += dt / 1.3; const e = Math.min(1, j.k);
          jumpModel.position.set(G.hooked.x, WL + Math.sin(e * Math.PI) * 6 - 0.5, G.hooked.z); jumpModel.rotation.set(0, Math.atan2(-side.z * G.dir, side.x * G.dir), (0.5 - e) * 2.2);
          j.window = e > 0.38 && e < 0.68; const [sx, sy] = ctx.toScreen(jumpModel.position);
          $('fg-tap').hidden = !j.window || j.tapped; if (j.window) $('fg-tap').style.transform = `translate(${sx}px, ${sy - 40}px) translate(-50%, -100%)`;
          if (e >= 1) { if (!j.tapped) { G.T = Math.min(1, G.T + 0.3); ctx.floatText(G.hooked.clone().setY(WL + 3), 'Slack on the jump!', '#ffb39f'); }
            ctx.splash(G.hooked.x, G.hooked.z, 30, 1.3); sfx.splash(true); jumpModel.removeFromParent(); jumpModel = null; G.jump = null; $('fg-tap').hidden = true; G.jumpT = 3.5 + Math.random() * 2.5; } } }
      // UI
      $('fg-needle').setAttribute('transform', `rotate(${(G.T - 0.5) * 180} 160 125)`);
      $('fg-zone').setAttribute('d', zonePath(G.zc, zoneW)); $('fg-zone').classList.toggle('on', inZone);
      $('fg-prog').style.width = (G.prog * 100) + '%';
      $('fg-dir').textContent = (G.dir > 0 ? 'Fish runs right → swipe left' : '← Fish runs left · swipe right'); $('fg-fish-name').textContent = tired ? 'It’s tiring!' : G.T > 0.85 ? 'Too tight!' : G.T < 0.12 ? 'Line’s slack!' : 'Fish on!';
      $('fg-fight').classList.toggle('danger', G.T > 0.85 || G.T < 0.12);
      // sound + feel
      setWhine(G.T); if (G.reel && (G.clickT -= dt) <= 0) { G.clickT = 0.07; sfx.click(); }
      if ((G.buzzT -= dt) <= 0 && G.reel && G.T > 0.6) { G.buzzT = 0.25; buzz(8); }
      if (G.prog >= 1) endFight(true); else if (G.snapT > 0.5) endFight(false, 'Snap! The line broke'); else if (G.slackT > 1.4) endFight(false, 'It shook free…');
    } else if (ACT.fish === 'landing') {
      // slow-motion leap onto the deck with a flash
      F.k += dt / 2.0; const e = Math.min(1, F.k), land = ctx.landPoint();
      if (!jumpModel) { jumpModel = station.fishModel(G.fishId); jumpModel.scale.setScalar(2.2); ctx.scene.add(jumpModel); shadow.material.opacity = 0; $('fg-flash').classList.remove('go'); void $('fg-flash').offsetWidth; $('fg-flash').classList.add('go'); }
      const ee = 1 - Math.pow(1 - e, 2);
      jumpModel.position.lerpVectors(F.from, land, ee); jumpModel.position.y = THREE.MathUtils.lerp(F.from.y, land.y, ee) + Math.sin(e * Math.PI) * 6;
      jumpModel.rotation.set(Math.sin(t * 12) * 0.3, -ctx.yaw() + Math.PI, -e * Math.PI * 2);
      bobber.position.lerpVectors(F.from, tipW, ee); bobber.position.y += Math.sin(e * Math.PI) * 1.5;
      rodRot.rotation.z = THREE.MathUtils.lerp(restTilt + 0.15, restTilt - 0.45, Math.sin(e * Math.PI));
      if (e >= 1) { bobber.visible = false; fishLine.visible = false; ACT.fish = 'flop'; F.k = 0; for (let i = 0; i < 14; i++) ctx.emit(land.x, land.y, land.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2); }
    } else if (ACT.fish === 'flop') { // flops on deck, then the card
      F.k += dt; const land = ctx.landPoint(); jumpModel.position.copy(land).setY(land.y + Math.abs(Math.sin(F.k * 9)) * 0.4 * Math.max(0, 1 - F.k / 1.2));
      jumpModel.rotation.set(Math.PI / 2 + Math.sin(F.k * 14) * 0.5, -ctx.yaw(), 0);
      if (F.k > 1.1) { jumpModel.removeFromParent(); jumpModel = null; showCard(); }
    }
    if (!['waiting', 'bite', 'fight'].includes(ACT.fish)) shadow.material.opacity = Math.max(0, shadow.material.opacity - dt * 1.5);
    if (ACT.fish !== 'fight') setWhine(0);
    shadow.visible = shadow.material.opacity > 0.01;
  }

  function reset() { // stop fishing: clear everything this module shows
    G.charging = null; powerG.visible = false; stage._controls.enabled = true; ['fg-strike', 'fg-fight', 'fg-tap', 'fg-card'].forEach(id => { $(id).hidden = true; });
    if (jumpModel) { jumpModel.removeFromParent(); jumpModel = null; } shadow.material.opacity = 0; setWhine(0); spots.forEach(s => { s.g.visible = false; });
  }

  return { step, landed, reset, get busy() { return !!G.charging; }, get combo() { return G.combo; }, get _dbg() { return G; } };
}
