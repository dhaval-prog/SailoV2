// Dry Dock Tug: a patched-up old harbour tug (dry-dock-tug.glb): a blue-grey hull over a rust band and green
// algae, a red boot stripe, an ochre cabin under a cream wheelhouse with a searchlight, a bent funnel, a tall mast with
// washing hung out to dry, crates and tyre fenders all round, and a bronze propeller under the stern.
// The model is ~11 units long along x with its bow already at +x (like every boat here), the deck near y=1 and the
// keel at y=-3; it's scaled to ~16 m and sat in the water at its boot stripe (the green and most of the rust go under).
// Its own: the propeller spins with the speed and churns white water astern, smoke from the funnel while it runs,
// nav lights (red to port, green to starboard on the wheelhouse roof, white at the masthead), and at night warm
// windows, a lit searchlight throwing a beam ahead, and a lamp over the after deck.
// The model's own ink outlines are left out: the game's look has none (theme.js).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeStatic } from '../merge-static.js';
import tugUrl from '../assets/drydock/dry-dock-tug.glb?url';

const K = 1.45; // scale: model units to boat units (~16 m long)
const WATER = -1.0; // the model's height where the sea meets the hull (just under the red boot stripe)
const LIFT = 0.85 - WATER * K; // how far the model's origin sits above the boat's (the sea is at 0.85)
const PROP = [-5.5, -1.31, 0]; // the propeller's hub (model units)
// model (x, y, z) to boat units (bow +x: the model already points that way)
const at = (x, y, z) => [x * K, y * K + LIFT, z * K];

export function buildDryDock({ THREE, scene, emit }) {
  const group = new THREE.Group(); group.name = 'drydock_model';
  const holder = new THREE.Group(); holder.scale.setScalar(K); holder.position.y = LIFT; group.add(holder);
  // the copy other captains' boats are made from (cpu-fleet.js)
  const template = new THREE.Group(); template.name = 'drydock_template';
  const holderT = holder.clone(false); template.add(holderT);
  const windows = []; let lens = null, prop = null;
  const ready = new Promise(resolve => new GLTFLoader().load(tugUrl, gltf => {
    const m = gltf.scene;
    // no ink: the outline shells (no material of their own, so they'd draw white) and the edge lines
    const ink = []; m.traverse(o => { if (/^ink_(outline|edges)/.test(o.name) || o.isLineSegments || o.isLine) ink.push(o); });
    ink.forEach(o => o.removeFromParent());
    m.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      const mt = o.material; if (mt.name === 'window_glass' && !windows.includes(mt)) { mt.emissive = new THREE.Color('#ffc46b'); mt.emissiveIntensity = 0; windows.push(mt); }
      if (mt.name === 'lamp_lens') lens = mt; });
    // the propeller turns about its shaft: hung from a pivot at the hub
    const p = m.getObjectByName('propeller');
    if (p) { const pivot = new THREE.Group(); pivot.name = 'drydock_prop'; pivot.position.set(...PROP); m.add(pivot); m.updateMatrixWorld(true); pivot.attach(p); prop = pivot; }
    mergeStatic(THREE, m, o => o === prop); // (hundreds of small parts: one draw call per material)
    holderT.add(m.clone(true));
    holder.add(m); resolve(group);
  }, undefined, () => resolve(group)));

  // the hull seen from above, bow at +x: a round-shouldered bow, full sides, a square transom (for the foam round it)
  function outline(s = 1, path = new THREE.Shape()) {
    s *= K; const L = 5.1 * s, B = 2.15 * s, T = 1.6 * s, Ls = -5.05 * s;
    path.moveTo(Ls, -T);
    path.bezierCurveTo(Ls + 0.8 * s, -B, -L * 0.6, -B, 0, -B);
    path.lineTo(L * 0.35, -B);
    path.bezierCurveTo(L * 0.85, -B, L + 0.1 * s, -B * 0.55, L + 0.15 * s, 0);
    path.bezierCurveTo(L + 0.1 * s, B * 0.55, L * 0.85, B, L * 0.35, B);
    path.lineTo(0, B);
    path.bezierCurveTo(-L * 0.6, B, Ls + 0.8 * s, B, Ls, T);
    path.lineTo(Ls, -T);
    return path;
  }
  // where things go (boat units): the anchor off the starboard bow, the rod over the port quarter, the catch landing
  // on the after deck by the mast, the boat menu above the wheelhouse
  const A = at(4.45, 0.95, 1.45);
  const fit = { anchor: { x: A[0], z: A[2], y0: A[1], s: 1.9 }, hawseY: at(0, 1.25, 0)[1], rod: at(-4.4, 1.25, -1.55), land: at(-2.5, 0.75, -0.9), menuY: 10 };

  // ---------- nav lights: red to port, green to starboard on the wheelhouse roof's front corners, white at the masthead ----------
  const nav = [['port', '#ff2a1f', at(3.7, 4.15, -1.3)], ['starboard', '#1fff6a', at(3.7, 4.15, 1.3)], ['mast', '#fff4d6', at(-1.4, 10.55, 0)]].map(([tag, c, p]) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), new THREE.MeshStandardMaterial({ name: 'nav_lamp_' + tag, color: c, emissive: new THREE.Color(c), emissiveIntensity: 1 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const pl = new THREE.PointLight(c, 0, 6, 2); [lamp, halo, pl].forEach(o => { o.position.set(...p); group.add(o); });
    return { lamp, halo, pl, mast: tag === 'mast' }; });
  // ---------- at night: the searchlight's beam ahead, and a warm lamp over the after deck ----------
  const LAMP = new THREE.Vector3(...at(3.2, 4.55, 0.5));
  const spot = new THREE.SpotLight('#fff1c8', 0, 60, 0.28, 0.5, 1.2); spot.position.copy(LAMP); spot.target.position.set(LAMP.x + 30, 0.85, LAMP.z); group.add(spot, spot.target);
  const beamGeo = new THREE.ConeGeometry(2.6, 18, 24, 1, true); beamGeo.translate(0, -9, 0); beamGeo.rotateZ(Math.PI / 2 + 0.06); // (tip at the lamp, opening ahead and a touch down)
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: '#fff4cf', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.position.copy(LAMP); beam.visible = false; group.add(beam);
  const deckLamp = new THREE.PointLight('#ffc77a', 0, 12, 1.6); deckLamp.position.set(...at(-2.6, 3.4, 0)); group.add(deckLamp);

  // ---------- funnel smoke: soft grey puffs out of the bent funnel, left behind as the boat goes ----------
  const FUNNEL = new THREE.Vector3(...at(0.0, 4.85, -0.55)), smokeG = new THREE.Group(); smokeG.name = 'drydock_smoke'; scene?.add(smokeG);
  const puffGeo = new THREE.IcosahedronGeometry(0.55, 1), puffs = Array.from({ length: 30 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#d6d6d6', roughness: 1, transparent: true, opacity: 0, depthWrite: false, flatShading: true }));
    m.visible = false; m.userData = { life: 0, max: 1, v: new THREE.Vector3(), s0: 1 }; smokeG.add(m); return m; });
  let puffI = 0, puffAcc = 0, washAcc = 0, spin = 0; const wp = new THREE.Vector3(), back = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Quaternion();
  function puff(speed) {
    const m = puffs[puffI++ % puffs.length], u = m.userData; group.localToWorld(wp.copy(FUNNEL)); m.position.copy(wp);
    u.life = 0; u.max = 2.6 + Math.random() * 1.2; u.s0 = 0.5 + Math.random() * 0.35;
    u.v.set(back.x * (0.6 + speed * 0.5) + (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.7, back.z * (0.6 + speed * 0.5) + (Math.random() - 0.5) * 0.4);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0); m.visible = true;
  }
  // the screw's white water: spray kicked up astern of the propeller, wider and stronger the faster it turns
  const WASH = new THREE.Vector3(...at(-6.0, 0, 0)).setY(0.9);
  function wash(k, dir) {
    group.localToWorld(wp.copy(WASH)); const s = (Math.random() - 0.5) * 1.6;
    emit(wp.x + side.x * s, wp.y, wp.z + side.z * s, back.x * (1 + 4 * k) * dir + side.x * s * 1.5, 1.2 + Math.random() * 2.5 * k, back.z * (1 + 4 * k) * dir + side.z * s * 1.5);
  }
  /** Every frame while it's the boat you sail: the propeller, wash and smoke for the speed; the lights for the hour. */
  function tick(t, dt, { vel = 0, maxV = 6, night = 0 } = {}) {
    const k = Math.min(1, Math.abs(vel) / maxV), dir = Math.sign(vel) || 1;
    nav.forEach((n, i) => { const on = n.mast ? 1 : ((t + i * 0.6) % 1.2 < 0.8 ? 1 : 0.25);
      n.lamp.material.emissiveIntensity = (0.6 + night) * on; n.halo.material.opacity = (0.25 + 0.45 * night) * on; n.pl.intensity = (0.6 + 3 * night) * on; });
    windows.forEach(mt => { mt.emissiveIntensity = night * 0.9; });
    if (lens) { lens.emissiveIntensity = 0.2 + night * 2.2; }
    spot.intensity = night * 260; beam.visible = night > 0.05; beam.material.opacity = night * 0.11; deckLamp.intensity = night * 7;
    // the propeller: a lazy turn at idle, a blur at full ahead, backwards astern
    spin += dt * (1 + k * 30) * dir; if (prop) prop.rotation.x = spin;
    group.getWorldQuaternion(q); back.set(-1, 0, 0).applyQuaternion(q).setY(0).normalize(); side.set(-back.z, 0, back.x);
    if (k > 0.04) { washAcc += dt * (12 + 60 * k); while (washAcc > 1) { washAcc -= 1; wash(k, dir); } }
    // smoke: a trickle at idle, a trail at full ahead; it drifts aft of the boat
    puffAcc += dt * (1.4 + 6 * k); while (puffAcc > 1) { puffAcc -= 1; puff(k * maxV * 0.25); }
    smokeTick(dt, night);
  }
  function smokeTick(dt, night = 0) {
    puffs.forEach(m => { const u = m.userData; if (!m.visible) return; u.life += dt; const a = u.life / u.max; if (a >= 1) { m.visible = false; return; }
      m.position.addScaledVector(u.v, dt); u.v.y *= 1 - dt * 0.35; m.scale.setScalar(u.s0 * (1 + a * 2.6)); m.rotation.y += dt * 0.4;
      m.material.opacity = 0.42 * Math.min(1, a * 6) * (1 - a); m.material.color.setScalar(0.84 - 0.35 * night); });
  }
  return { group, template, outline, fit, outlines: [], ready, tick, smokeTick };
}
