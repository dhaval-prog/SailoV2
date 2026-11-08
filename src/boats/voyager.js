// Voyager: the Conservatory Ship from Ocean-4 (export/ship/conservatory_ship.glb, "Voyager v2"): a teal hull with gold
// trim and gold scrollwork, two lateen sails on raked masts, a glasshouse amidships, a raised stern deck, twin funnels,
// and outrigger floats that are screw propellers either side.
// The model is ~45 units long along z, bow at -z: here it's turned bow-first along +x like every boat and scaled to the
// fleet's biggest ship (~36 m), sat down in the water with its floats under the surface. Its parts that don't move are
// merged per material (a few dozen draw calls instead of hundreds); its own:
// - the screw floats spin (faster the faster it goes) and churn white water out behind
// - light smoke from both funnels while it runs
// - its sails drop to the deck when the anchor goes down and rise again when it comes up; their colour is yours (Garage)
// - nav lights (red to port, green to starboard at the bow rails, white at the masthead); at night the glasshouse glows
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import shipUrl from '../assets/ship/conservatory_ship.glb?url';

const K = 0.8, SINK = 1.4; // scale; the model's height the sea meets (its floats just under, the hull well down)
const LIFT = 0.85 - SINK * K;
const at = (x, y, z) => [-z * K, y * K + LIFT, x * K]; // model (x, y, z) to boat units (bow +x)
const GLASS = 'mat_cdeeea_t';
// the model's parts by name: the screw floats (each turns about its own axis, along z) and the two sails
const SCREWS = { L: { parts: ['part_489', 'part_490', 'part_491', 'part_492', 'part_495'], x: -9.55 }, R: { parts: ['part_518', 'part_519', 'part_520', 'part_521', 'part_524'], x: 9.5 } };
const SAILS = ['part_410', 'part_476'];
const FUNNELS = [[-0.95, 7.3, 2.2], [0.95, 7.3, 2.2]];
const SAIL_KEY = 'voyager.sail', SAIL_COLS = ['#f4efe6', '#ffffff', '#ee3427', '#ffb21a', '#2343a0', '#2cc4a8', '#3f8f4a', '#3b3134'];

export function buildVoyager({ THREE, scene, emit }) {
  const group = new THREE.Group(); group.name = 'voyager_model';
  const mkHolder = () => { const h = new THREE.Group(); h.rotation.y = -Math.PI / 2; h.scale.setScalar(K); h.position.y = LIFT; return h; };
  const holder = mkHolder(); group.add(holder);
  // the copy other captains' ships are made from (cpu-fleet.js): never recoloured, sails always up
  const template = new THREE.Group(); template.name = 'voyager_template';
  let glass = null; const screws = {}, sails = [];
  let sailState = { c: SAIL_COLS[0] }; try { Object.assign(sailState, JSON.parse(localStorage.getItem(SAIL_KEY)) || {}); } catch { /* none */ }
  let sailMat = null;
  const ready = new Promise(resolve => new GLTFLoader().load(shipUrl, gltf => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const screwOf = {}; Object.entries(SCREWS).forEach(([side, s]) => s.parts.forEach(n => { screwOf[n] = side; }));
    const byMat = new Map(), spin = { L: [], R: [] }, sailGeos = [];
    root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      if (screwOf[o.name]) { spin[screwOf[o.name]].push([g, o.material]); return; }
      if (SAILS.includes(o.name)) { sailGeos.push([g, o.material]); return; }
      if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g); });
    // what doesn't move: merged per material (only the attributes they all have)
    byMat.forEach((list, mat) => {
      const keep = ['position', 'normal', 'uv'].filter(a => list.every(g => g.attributes[a]));
      list.forEach(g => Object.keys(g.attributes).forEach(a => { if (!keep.includes(a)) g.deleteAttribute(a); }));
      const merged = mergeGeometries(list, false); list.forEach(g => g.dispose()); if (!merged) return;
      if (mat.map) mat.map.anisotropy = 4;
      if (mat.name === GLASS) { mat.emissive = new THREE.Color('#ffc46b'); mat.emissiveIntensity = 0; glass = mat; }
      const mesh = new THREE.Mesh(merged, mat); mesh.name = 'voyager_' + mat.name; mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; holder.add(mesh);
    });
    // the screw floats: each in its own pivot on its axis
    Object.entries(spin).forEach(([side, list]) => { const s = SCREWS[side], pivot = new THREE.Group(); pivot.name = 'voyager_screw_' + side; pivot.position.set(s.x, 0, 0); holder.add(pivot);
      list.forEach(([g, mat]) => { g.translate(-s.x, 0, 0); const m = new THREE.Mesh(g, mat); m.castShadow = true; pivot.add(m); }); screws[side] = pivot; });
    // the sails: each pivots at its foot, so it can come down to the deck
    sailGeos.forEach(([g, mat]) => { g.computeBoundingBox(); const foot = g.boundingBox.min.y; g.translate(0, -foot, 0);
      if (!mat.userData.sail) { mat.name = 'voyager_sail'; mat.userData.sail = true; }
      const pivot = new THREE.Group(); pivot.position.y = foot; const m = new THREE.Mesh(g, mat); m.castShadow = true; pivot.add(m); holder.add(pivot); sails.push({ pivot, mesh: m }); });
    template.add(holder.clone(true)); // (before the player's sails get their own colour)
    if (sails.length) { sailMat = sails[0].mesh.material.clone(); sails.forEach(s => { s.mesh.material = sailMat; }); paintSail(); }
    resolve(group);
  }, undefined, () => resolve(group)));
  function paintSail() { if (sailMat) sailMat.color.set(sailState.c || SAIL_COLS[0]); }

  // the hull seen from above, bow at +x (the outriggers stand clear of it): long and fine, a little behind the middle
  function outline(s = 1, path = new THREE.Shape()) {
    s *= K / 0.6; const L = 12.6 * s, B = 2.2 * s, o = 0.8 * s; // (o: the hull's middle sits this far forward of the boat's origin)
    path.moveTo(o - L + 1.5 * s, -B);
    path.lineTo(o + L * 0.35, -B);
    path.bezierCurveTo(o + L * 0.8, -B, o + L, -B * 0.4, o + L + 0.4 * s, 0);
    path.bezierCurveTo(o + L, B * 0.4, o + L * 0.8, B, o + L * 0.35, B);
    path.lineTo(o - L + 1.5 * s, B);
    path.bezierCurveTo(o - L, B, o - L - 0.3 * s, B * 0.5, o - L - 0.3 * s, 0);
    path.bezierCurveTo(o - L - 0.3 * s, -B * 0.5, o - L, -B, o - L + 1.5 * s, -B);
    return path;
  }
  // where things go (boat units): the anchor at the bow, the rod off the stern deck, the catch landing on the raised
  // stern deck, the boat menu above the masts
  const A = at(1.9, 2.6, -19);
  const fit = { anchor: { x: A[0], z: A[2], y0: A[1], s: 1.6 * K / 0.6 }, hawseY: at(0, 3.6, 0)[1], rod: at(-2.2, 4.6, 17.5), land: at(0, 5.0, 12), menuY: 26 };

  // ---------- nav lights (red to port, green to starboard at the bow rails; white at the masthead) ----------
  const nav = [['port', '#ff2a1f', at(-2.6, 4.4, -15)], ['starboard', '#1fff6a', at(2.6, 4.4, -15)], ['mast', '#fff4d6', at(0, 26.6, -11)]].map(([tag, c, p]) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10), new THREE.MeshStandardMaterial({ name: 'nav_lamp_' + tag, color: c, emissive: new THREE.Color(c), emissiveIntensity: 1 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const pl = new THREE.PointLight(c, 0, 8, 2); [lamp, halo, pl].forEach(o => { o.position.set(...p); group.add(o); });
    return { lamp, halo, pl, mast: tag === 'mast' }; });
  // ---------- at night: the glasshouse glows, lit from inside ----------
  const glow = new THREE.PointLight('#ffc77a', 0, 20, 1.6); glow.position.set(...at(0, 5.2, -9)); group.add(glow);

  // ---------- light smoke from both funnels while it runs ----------
  const smokeG = new THREE.Group(); smokeG.name = 'voyager_smoke'; scene?.add(smokeG);
  const tops = FUNNELS.map(f => new THREE.Vector3(...at(...f)));
  const puffGeo = new THREE.IcosahedronGeometry(0.6, 1), puffs = Array.from({ length: 36 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#e6e6e6', roughness: 1, transparent: true, opacity: 0, depthWrite: false, flatShading: true }));
    m.visible = false; m.userData = { life: 0, max: 1, v: new THREE.Vector3(), s0: 1 }; smokeG.add(m); return m; });
  let puffI = 0, puffAcc = 0; const wp = new THREE.Vector3(), back = new THREE.Vector3(), side = new THREE.Vector3(), q = new THREE.Quaternion();
  function puff(top, speed) { const m = puffs[puffI++ % puffs.length], u = m.userData; group.localToWorld(wp.copy(top)); m.position.copy(wp);
    u.life = 0; u.max = 2.4 + Math.random(); u.s0 = 0.6 + Math.random() * 0.3;
    u.v.set(back.x * (0.5 + speed) + (Math.random() - 0.5) * 0.4, 1.4 + Math.random() * 0.6, back.z * (0.5 + speed) + (Math.random() - 0.5) * 0.4); m.visible = true; }
  function smokeTick(dt, night = 0) {
    puffs.forEach(m => { const u = m.userData; if (!m.visible) return; u.life += dt; const a = u.life / u.max; if (a >= 1) { m.visible = false; return; }
      m.position.addScaledVector(u.v, dt); u.v.y *= 1 - dt * 0.35; m.scale.setScalar(u.s0 * (1 + a * 2.4)); m.rotation.y += dt * 0.4;
      m.material.opacity = 0.3 * Math.min(1, a * 6) * (1 - a); m.material.color.setScalar(0.9 - 0.35 * night); });
  }

  // ---------- every frame while it's the boat you sail ----------
  let sailK = 1, washAcc = 0; const WASH = { L: new THREE.Vector3(...at(-9.55, SINK - 0.1, 13)), R: new THREE.Vector3(...at(9.5, SINK - 0.1, 13)) };
  function tick(t, dt, { night = 0, vel = 0, maxV = 6, anchor = 'up' } = {}) {
    const k = Math.min(1, Math.abs(vel) / maxV), dir = Math.sign(vel || 1);
    nav.forEach((n, i) => { const on = n.mast ? 1 : ((t + i * 0.6) % 1.2 < 0.8 ? 1 : 0.25);
      n.lamp.material.emissiveIntensity = (0.6 + night) * on; n.halo.material.opacity = (0.25 + 0.45 * night) * on; n.pl.intensity = (0.8 + 4 * night) * on; });
    if (glass) glass.emissiveIntensity = 0.15 + night * 1.1; glow.intensity = night * 16;
    // the screws: a slow turn at rest, fast at speed (one each way)
    const w = (0.6 + 22 * k) * dir * dt; if (screws.L) screws.L.rotation.z += w; if (screws.R) screws.R.rotation.z -= w;
    group.getWorldQuaternion(q); back.set(-1, 0, 0).applyQuaternion(q).setY(0).normalize(); side.set(-back.z, 0, back.x);
    // and the white water they throw out behind
    if (emit && k > 0.08) { washAcc += dt * 40 * k; while (washAcc > 1) { washAcc -= 1; for (const s of ['L', 'R']) { group.localToWorld(wp.copy(WASH[s]));
      const sp = 2 + Math.random() * 3 * k, sd = (Math.random() - 0.5) * 2;
      emit(wp.x + side.x * sd, wp.y, wp.z + side.z * sd, back.x * sp * dir + side.x * sd * 1.2, 0.8 + Math.random() * 2.2 * k, back.z * sp * dir + side.z * sd * 1.2); } } }
    // sails: down at anchor, up under way
    sailK += ((anchor === 'up' ? 1 : 0) - sailK) * Math.min(1, dt * 1.6);
    sails.forEach(s => { s.pivot.scale.set(1, 0.05 + 0.95 * sailK, 1); s.mesh.visible = sailK > 0.02; });
    // light smoke: a wisp at rest, more under way
    puffAcc += dt * (0.8 + 5 * k); while (puffAcc > 1) { puffAcc -= 1; puff(tops[puffI % 2], k * maxV * 0.2); }
    smokeTick(dt, night);
  }
  return { group, template, outline, fit, outlines: [], ready, tick, smokeTick,
    /** The Garage: the sail colour, its swatches, and a change to it. */
    sail: () => ({ sail: sailState, colours: SAIL_COLS, set(next) { Object.assign(sailState, next); try { localStorage.setItem(SAIL_KEY, JSON.stringify(sailState)); } catch { /* storage blocked */ } paintSail(); } }) };
}
