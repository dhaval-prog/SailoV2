// Voyager: the Conservatory Ship from Ocean-4 (export/ship/conservatory_ship.glb, "Voyager v2"): a teal hull with gold
// trim and gold scrollwork, two lateen sails on raked masts, a glasshouse amidships, a raised stern deck, and outrigger
// floats with screw propellers either side.
// The model is ~45 units long along z, bow at -z: here it's turned bow-first along +x like every boat and scaled to a
// ~26 m ship, the outrigger floats in the water. Its 583 parts are merged per material (a few dozen draw calls instead
// of hundreds). Its own: nav lights (red to port, green to starboard at the bow, a white light at the masthead) and, at
// night, a warm glow in the glasshouse.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import shipUrl from '../assets/ship/conservatory_ship.glb?url';

const K = 0.6, LIFT = 0.85; // scale; the model's y=0 (the floats' waterline) on the sea (0.85 above the boat's origin)
const at = (x, y, z) => [-z * K, y * K + LIFT, x * K]; // model (x, y, z) to boat units (bow +x)
const GLASS = 'mat_cdeeea_t';

export function buildVoyager({ THREE }) {
  const group = new THREE.Group(); group.name = 'voyager_model';
  const holder = new THREE.Group(); holder.rotation.y = -Math.PI / 2; holder.scale.setScalar(K); holder.position.y = LIFT; group.add(holder);
  let glass = null;
  const ready = new Promise(resolve => new GLTFLoader().load(shipUrl, gltf => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    // every part baked into the model's frame, then merged per material (only the attributes they all have)
    const byMat = new Map();
    root.traverse(o => { if (!o.isMesh) return; const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(o.matrixWorld);
      if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g); });
    byMat.forEach((list, mat) => {
      const keep = ['position', 'normal', 'uv'].filter(a => list.every(g => g.attributes[a]));
      list.forEach(g => Object.keys(g.attributes).forEach(a => { if (!keep.includes(a)) g.deleteAttribute(a); }));
      const merged = mergeGeometries(list, false); list.forEach(g => g.dispose()); if (!merged) return;
      if (mat.map) mat.map.anisotropy = 4;
      if (mat.name === GLASS) { mat.emissive = new THREE.Color('#ffc46b'); mat.emissiveIntensity = 0; glass = mat; }
      const mesh = new THREE.Mesh(merged, mat); mesh.name = 'voyager_' + mat.name; mesh.castShadow = !mat.transparent; mesh.receiveShadow = true; holder.add(mesh);
    });
    resolve(group);
  }, undefined, () => resolve(group)));

  // the hull seen from above, bow at +x (the outriggers stand clear of it): long and fine, a little behind the middle
  function outline(s = 1, path = new THREE.Shape()) {
    const L = 12.6 * s, B = 2.2 * s, o = 0.8; // (o: the hull's middle sits this far forward of the boat's origin)
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
  const fit = { anchor: { x: A[0], z: A[2], y0: A[1], s: 1.6 }, hawseY: at(0, 3.6, 0)[1], rod: at(-2.2, 4.6, 17.5), land: at(0, 5.0, 12), menuY: 19 };

  // ---------- nav lights (red to port, green to starboard at the bow rails; white at the masthead) ----------
  const nav = [['port', '#ff2a1f', at(-2.6, 4.4, -15)], ['starboard', '#1fff6a', at(2.6, 4.4, -15)], ['mast', '#fff4d6', at(0, 26.6, -11)]].map(([tag, c, p]) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), new THREE.MeshStandardMaterial({ name: 'nav_lamp_' + tag, color: c, emissive: new THREE.Color(c), emissiveIntensity: 1 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.45, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const pl = new THREE.PointLight(c, 0, 7, 2); [lamp, halo, pl].forEach(o => { o.position.set(...p); group.add(o); });
    return { lamp, halo, pl, mast: tag === 'mast' }; });
  // ---------- at night: the glasshouse glows, lit from inside ----------
  const glow = new THREE.PointLight('#ffc77a', 0, 16, 1.6); glow.position.set(...at(0, 5.2, -9)); group.add(glow);

  /** Every frame while it's the boat you sail: the lights for the hour. */
  function tick(t, dt, { night = 0 } = {}) {
    nav.forEach((n, i) => { const on = n.mast ? 1 : ((t + i * 0.6) % 1.2 < 0.8 ? 1 : 0.25);
      n.lamp.material.emissiveIntensity = (0.6 + night) * on; n.halo.material.opacity = (0.25 + 0.45 * night) * on; n.pl.intensity = (0.8 + 4 * night) * on; });
    if (glass) glass.emissiveIntensity = 0.15 + night * 1.1; glow.intensity = night * 14;
  }
  return { group, outline, fit, outlines: [], ready, tick };
}
