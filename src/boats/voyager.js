// Voyager: the Conservatory Ship from Ocean-4 (export/ship/conservatory_ship.glb, "Voyager v2"): a teal hull with gold
// trim and gold scrollwork, two lateen sails on raked masts, a glasshouse amidships with twin funnels, a raised stern
// deck, and outrigger floats driven by gold screws either side.
// The model is ~45 units long along z, bow at -z: here it's turned bow-first along +x like every boat and scaled to a
// ~35 m ship, the largest in the fleet. It sits down in the sea: the hull's lower band under water and the floats
// nearly awash. Its parts are merged per material (a few dozen draw calls instead of hundreds), except what moves:
// - the screws (three gold flights round each float) spin with the speed, churning white water behind them;
// - the two sails (cloth, yard and lines) come down onto the deck while the anchor is down, and go back up after;
// - light smoke rises from both funnels while it's under way.
// The sails take a colour (the Garage). Its own nav lights (red to port, green to starboard at the bow, a white light at
// the masthead) and, at night, a warm glow in the glasshouse.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import shipUrl from '../assets/ship/conservatory_ship.glb?url';

const K = 0.78, DRAFT = 1.0; // scale; and how deep the model's own waterline (y=0, the hull's lower edge) sits under the sea
const LIFT = 0.85 - DRAFT * K; // the model's origin above the boat's (the sea is at 0.85)
const at = (x, y, z) => [-z * K, y * K + LIFT, x * K]; // model (x, y, z) to boat units (bow +x)
const GLASS = 'mat_cdeeea_t', CLOTH = 'mat_f4efe6_t';
// the sails: cloth, yard and lines of each (model part names), and the point each comes down onto (its tack, at the deck)
const SAILS = [{ parts: ['part_407', 'part_410', 'part_411', 'part_412'], tack: [0, 4.4, -1.6] }, { parts: ['part_473', 'part_476', 'part_477', 'part_478'], tack: [0, 3.9, 13.4] }];
const SAIL_PART = new Map(SAILS.flatMap((s, i) => s.parts.map(p => [p, i])));
const SCREW_X = 9.55; // the floats' axes (model x = ±9.55, y = 0, along z)
const FUNNELS = [[-0.95, 7.3, 2.2], [0.95, 7.3, 2.2]];
// the sail colour (the Garage): 'classic' is the cloth as it comes
const SAIL_KEY = 'voyager.sail', SAIL_COLS = ['classic', '#ee3427', '#ffb21a', '#2343a0', '#2cc4a8', '#3f8f4a', '#f4a3c4', '#3b3134'];

export function buildVoyager({ THREE, scene, emit }) {
  const group = new THREE.Group(); group.name = 'voyager_model';
  const holder = new THREE.Group(); holder.rotation.y = -Math.PI / 2; holder.scale.setScalar(K); holder.position.y = LIFT; group.add(holder);
  // the copy other captains' boats are made from (cpu-fleet.js): the model as it comes, sails up, never recoloured
  const template = new THREE.Group(); template.name = 'voyager_template';
  const holderT = new THREE.Group(); holderT.rotation.y = -Math.PI / 2; holderT.scale.setScalar(K); holderT.position.y = LIFT; template.add(holderT);
  let glass = null, cloth = null, clothColor = null; const screws = [], sails = [];
  let sailCol = 'classic'; try { sailCol = JSON.parse(localStorage.getItem(SAIL_KEY))?.c || 'classic'; } catch { /* none */ }
  const applySail = () => { if (cloth) cloth.color.copy(sailCol === 'classic' ? clothColor : new THREE.Color(sailCol)); };

  const ready = new Promise(resolve => new GLTFLoader().load(shipUrl, gltf => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    // the screws: in each float's group, the long gold parts (its three flights and the nose), not the hoops or the float
    const screwOf = new Map(), box = new THREE.Box3();
    root.traverse(o => { if (o.isMesh || !o.children.length || !o.parent || o.parent.name !== 'ConservatoryShip') return;
      box.setFromObject(o); const cx = (box.min.x + box.max.x) / 2; if (Math.abs(Math.abs(cx) - SCREW_X) > 0.8) return;
      const side = Math.sign(cx);
      o.children.forEach(m => { if (!m.isMesh) return; box.setFromObject(m); if (m.material.name === 'mat_e0a93c' && box.max.z - box.min.z > 1) screwOf.set(m, side); }); });
    // every part baked into the model's frame, then merged per material (only the attributes they all have);
    // the sails and the screws are merged per piece of their own instead, so they can move
    const buckets = new Map(), bucket = (key, mat, build) => { if (!buckets.has(key)) buckets.set(key, { mat, list: [], build }); return buckets.get(key).list; };
    root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      const si = SAIL_PART.get(o.name), sw = screwOf.get(o);
      if (si !== undefined) bucket(`sail${si}|${o.material.uuid}`, o.material, { sail: si }).push(g);
      else if (sw !== undefined) bucket(`screw${sw}|${o.material.uuid}`, o.material, { screw: sw }).push(g);
      else bucket(o.material.uuid, o.material, {}).push(g); });
    const sailG = SAILS.map(s => { const g = new THREE.Group(); g.position.set(...s.tack); holder.add(g); return g; });
    const screwG = new Map([-1, 1].map(side => { const g = new THREE.Group(); g.position.set(side * SCREW_X, 0, 0); holder.add(g); return [side, g]; }));
    buckets.forEach(({ mat, list, build }) => {
      const keep = ['position', 'normal', 'uv'].filter(a => list.every(g => g.attributes[a]));
      list.forEach(g => Object.keys(g.attributes).forEach(a => { if (!keep.includes(a)) g.deleteAttribute(a); }));
      const merged = mergeGeometries(list, false); list.forEach(g => g.dispose()); if (!merged) return;
      if (mat.map) mat.map.anisotropy = 4;
      if (mat.name === GLASS && !glass) { mat.emissive = new THREE.Color('#ffc46b'); mat.emissiveIntensity = 0; glass = mat; }
      holderT.add(new THREE.Mesh(merged, mat)); // (the template: everything in place, shared materials)
      let m2 = mat; if (mat.name === CLOTH) { if (!cloth) { cloth = mat.clone(); clothColor = mat.color.clone(); } m2 = cloth; } // (the player's own sail cloth)
      const mesh = new THREE.Mesh(merged, m2); mesh.name = 'voyager_' + mat.name; mesh.castShadow = !mat.transparent; mesh.receiveShadow = true;
      if (build.sail !== undefined) { mesh.position.set(...SAILS[build.sail].tack.map(v => -v)); sailG[build.sail].add(mesh); }
      else if (build.screw !== undefined) { mesh.position.set(-build.screw * SCREW_X, 0, 0); screwG.get(build.screw).add(mesh); }
      else holder.add(mesh);
    });
    sails.push(...sailG); screws.push(...screwG.values());
    applySail(); resolve(group);
  }, undefined, () => resolve(group)));

  // the hull seen from above, bow at +x (the outriggers stand clear of it): long and fine, a little behind the middle
  function outline(s = 1, path = new THREE.Shape()) {
    const k = K / 0.6, L = 12.6 * k * s, B = 2.2 * k * s, o = 0.8 * k; // (o: the hull's middle sits this far forward of the boat's origin)
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
  const fit = { anchor: { x: A[0], z: A[2], y0: A[1], s: 1.6 * K / 0.6 }, hawseY: at(0, 3.6, 0)[1], rod: at(-2.2, 4.6, 17.5), land: at(0, 5.0, 12), menuY: at(0, 30, 0)[1] };

  // ---------- nav lights (red to port, green to starboard at the bow rails; white at the masthead) ----------
  const nav = [['port', '#ff2a1f', at(-2.6, 4.4, -15)], ['starboard', '#1fff6a', at(2.6, 4.4, -15)], ['mast', '#fff4d6', at(0, 26.6, -11)]].map(([tag, c, p]) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ name: 'nav_lamp_' + tag, color: c, emissive: new THREE.Color(c), emissiveIntensity: 1 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const pl = new THREE.PointLight(c, 0, 7, 2); [lamp, halo, pl].forEach(o => { o.position.set(...p); group.add(o); });
    return { lamp, halo, pl, mast: tag === 'mast' }; });
  // ---------- at night: the glasshouse glows, lit from inside ----------
  const glow = new THREE.PointLight('#ffc77a', 0, 20, 1.6); glow.position.set(...at(0, 5.2, -9)); group.add(glow);

  // ---------- funnel smoke: light, pale puffs from both funnels while under way, left behind as the ship goes ----------
  const smokeG = new THREE.Group(); smokeG.name = 'voyager_smoke'; scene?.add(smokeG);
  const funnels = FUNNELS.map(f => new THREE.Vector3(...at(...f)));
  const puffGeo = new THREE.IcosahedronGeometry(0.85, 1), puffs = Array.from({ length: 44 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#f1f1ef', roughness: 1, transparent: true, opacity: 0, depthWrite: false, flatShading: true }));
    m.visible = false; m.userData = { life: 0, max: 1, v: new THREE.Vector3(), s0: 1 }; smokeG.add(m); return m; });
  let puffI = 0, puffAcc = 0, funnelI = 0; const wp = new THREE.Vector3(), back = new THREE.Vector3(), q = new THREE.Quaternion();
  function puff(speed) {
    const m = puffs[puffI++ % puffs.length], u = m.userData; group.localToWorld(wp.copy(funnels[funnelI++ % funnels.length])); m.position.copy(wp);
    u.life = 0; u.max = 2.4 + Math.random() * 1.2; u.s0 = 0.5 + Math.random() * 0.3;
    u.v.set(back.x * (0.5 + speed * 0.45) + (Math.random() - 0.5) * 0.35, 1.3 + Math.random() * 0.6, back.z * (0.5 + speed * 0.45) + (Math.random() - 0.5) * 0.35);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0); m.visible = true;
  }
  function smokeTick(dt, night = 0) {
    puffs.forEach(m => { const u = m.userData; if (!m.visible) return; u.life += dt; const a = u.life / u.max; if (a >= 1) { m.visible = false; return; }
      m.position.addScaledVector(u.v, dt); u.v.y *= 1 - dt * 0.35; m.scale.setScalar(u.s0 * (1 + a * 2.4)); m.rotation.y += dt * 0.4;
      m.material.opacity = 0.4 * Math.min(1, a * 6) * (1 - a); m.material.color.setScalar(0.94 - 0.4 * night); });
  }

  // ---------- the screws' white water: foam kicked up behind each float, more the faster they turn ----------
  const churn = [-1, 1].map(side => [new THREE.Vector3(...at(side * SCREW_X, 0.2, 12.8)), new THREE.Vector3(...at(side * SCREW_X, 0.2, 4))]);
  let churnAcc = 0;

  let sailF = 0, spin = 0;
  /** Every frame while it's the boat you sail: the screws, sails, smoke and white water for the speed and the anchor;
   *  the lights for the hour. */
  function tick(t, dt, { vel = 0, maxV = 8, anchor = 'up', night = 0 } = {}) {
    const k = Math.min(1, Math.abs(vel) / maxV), dir = Math.sign(vel) || 1;
    nav.forEach((n, i) => { const on = n.mast ? 1 : ((t + i * 0.6) % 1.2 < 0.8 ? 1 : 0.25);
      n.lamp.material.emissiveIntensity = (0.6 + night) * on; n.halo.material.opacity = (0.25 + 0.45 * night) * on; n.pl.intensity = (0.8 + 4 * night) * on; });
    if (glass) glass.emissiveIntensity = 0.15 + night * 1.1; glow.intensity = night * 18;
    // screws: a slow turn at idle, fast at full ahead (opposite hands, so they look like a pair); backwards astern
    spin += dt * (0.8 + k * 26) * dir; screws.forEach((s, i) => { s.rotation.z = i ? -spin : spin; });
    group.getWorldQuaternion(q); back.set(-1, 0, 0).applyQuaternion(q).setY(0).normalize();
    if (emit && k > 0.04) { churnAcc += dt * (8 + 40 * k); while (churnAcc > 1) { churnAcc -= 1;
      const pair = churn[Math.random() < 0.5 ? 0 : 1], p = pair[Math.random() < 0.7 ? 0 : 1]; group.localToWorld(wp.copy(p));
      const sp = 1 + Math.random() * 1.5 * k, side = (Math.random() - 0.5) * 1.6;
      emit(wp.x + back.z * side, wp.y, wp.z - back.x * side, back.x * sp * dir + back.z * side, 0.8 + Math.random() * 2.2 * k, back.z * sp * dir - back.x * side); } }
    // sails: down onto the deck while the anchor drops and holds; back up when it's raised
    const want = anchor === 'dropping' || anchor === 'down' ? 1 : 0;
    sailF = want ? Math.min(1, sailF + dt / 1.6) : Math.max(0, sailF - dt / 2); const e = sailF * sailF * (3 - 2 * sailF);
    const flutter = Math.sin(t * 22) * 0.03 * Math.sin(Math.PI * sailF);
    sails.forEach(g => g.scale.set(1 + flutter, Math.max(0.06, 1 - e * 0.94), 1 - e * 0.08));
    // smoke: only under way, light at slow ahead, a little more at full
    if (k > 0.05) { puffAcc += dt * (1.5 + 6 * k); while (puffAcc > 1) { puffAcc -= 1; puff(k * maxV * 0.25); } }
    smokeTick(dt, night);
  }
  return { group, template, outline, fit, outlines: [], ready, tick, smokeTick,
    /** The Garage: the sail colour ('classic' or a colour), its swatches, and a change to it. */
    sail: () => ({ sail: { c: sailCol }, colours: SAIL_COLS, set(next) { if (next.c) sailCol = next.c; try { localStorage.setItem(SAIL_KEY, JSON.stringify({ c: sailCol })); } catch { /* storage blocked */ } applySail(); } }) };
}
