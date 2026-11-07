// Wooden Tug: the Tugboat model from Ocean-3 (export/tugboat.glb, its textures built in): a planked orange hull over a
// slate bottom, tyre fenders, a white wheelhouse with a hipped roof and a funnel, chain railings on posts.
// The model is ~5.7 units long along its z axis, bow at -z; here it's turned bow-first along +x (like every boat) and
// scaled to the Lighthouse Tug's length (~10.7 m), the deck ~1.7 m above the boat's origin, the waterline on the slate.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import tugUrl from '../assets/tugboat2/tugboat.glb?url';

const K = 1.9, LIFT = 0.66; // scale; and how far the model's own origin sits above the boat's (its waterline at y≈0.1)

export function buildWoodTug({ THREE }) {
  const group = new THREE.Group(); group.name = 'woodtug_model';
  const holder = new THREE.Group(); holder.rotation.y = -Math.PI / 2; holder.scale.setScalar(K); holder.position.y = LIFT; group.add(holder);
  const ready = new Promise(resolve => new GLTFLoader().load(tugUrl, gltf => {
    const m = gltf.scene;
    m.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(mt => { if (mt.map) mt.map.anisotropy = 4; if (/glass/.test(mt.name)) { mt.transparent = true; mt.opacity = 0.75; } }); });
    holder.add(m); resolve(group);
  }, undefined, () => resolve(group)));

  // the hull seen from above, bow at +x: a fine bow, a full rounded stern (for the foam and ripples round it)
  function outline(s = 1, path = new THREE.Shape()) {
    const L = 4.9 * s, B = 3.0 * s;
    path.moveTo(-L + 1.2 * s, -B);
    path.lineTo(L * 0.3, -B);
    path.bezierCurveTo(L * 0.8, -B, L, -B * 0.45, L + 0.2 * s, 0);
    path.bezierCurveTo(L, B * 0.45, L * 0.8, B, L * 0.3, B);
    path.lineTo(-L + 1.2 * s, B);
    path.bezierCurveTo(-L - 0.1 * s, B, -L - 0.2 * s, B * 0.55, -L - 0.2 * s, 0);
    path.bezierCurveTo(-L - 0.2 * s, -B * 0.55, -L - 0.1 * s, -B, -L + 1.2 * s, -B);
    return path;
  }
  // where things go on deck (boat units, bow +x): the anchor at the bow, the rod over the stern quarter, the catch
  // landing on the after deck behind the wheelhouse, the boat menu above the funnel
  const fit = { anchor: { x: 3.9, z: 2.0, y0: 1.75, s: 1.3 }, hawseY: 2.45, rod: [-3.9, 2.3, -1.6], land: [-3.1, 1.9, 0], menuY: 9 };
  return { group, outline, fit, outlines: [], ready };
}
