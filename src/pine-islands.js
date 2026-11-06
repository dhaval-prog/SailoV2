// Pine islands: the medium rocks on the map (where a dense block of buildings stands) become small low-poly
// islands from the Pine Island model (sand, grass, pines, palms, ferns, stumps and rocks). The model is loaded once
// and merged into one geometry per material; every island near the boat is an instance of each, so a sea of them
// costs only a handful of draw calls. Each island is turned and scaled to its rock's spot and size.
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import islandUrl from './assets/pine-island.glb?url';

const MAX = 600;     // islands drawn at once
const HALF = 23.6;   // the model's half width (its long side), in its own units

export function createPineIslands(THREE, { scene, WL }) {
  const meshes = []; let ready = false;
  new GLTFLoader().load(islandUrl, gltf => {
    const root = gltf.scene; root.updateMatrixWorld(true);
    const byMat = new Map();
    root.traverse(o => { if (!o.isMesh) return; const m = o.material, g = o.geometry.clone().applyMatrix4(o.matrixWorld);
      Object.keys(g.attributes).forEach(k => { if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); }); if (!g.attributes.normal) g.computeVertexNormals();
      const ng = g.index ? g.toNonIndexed() : g; (byMat.get(m.name) || byMat.set(m.name, { m, list: [] }).get(m.name)).list.push(ng); });
    byMat.forEach(({ m, list }, name) => { const g = mergeGeometries(list, false); if (!g) return;
      const mat = new THREE.MeshStandardMaterial({ name: 'pine_' + name, color: m.color, roughness: 0.9, metalness: 0, flatShading: true });
      const im = new THREE.InstancedMesh(g, mat, MAX); im.count = 0; im.castShadow = im.receiveShadow = true; im.frustumCulled = false; scene.add(im); meshes.push(im); });
    ready = true; place(last);
  });
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let last = [];
  /** Draw these islands: [{ x, z, r (radius), a (turn) }]. */
  function place(list) {
    last = list; if (!ready) return; const n = Math.min(MAX, list.length);
    for (let i = 0; i < n; i++) { const it = list[i], s = it.r * 1.08 / HALF; Q.setFromAxisAngle(UP, it.a); V.set(it.x, WL - 0.15 * s, it.z); S.set(s, s, s); M4.compose(V, Q, S);
      meshes.forEach(m => m.setMatrixAt(i, M4)); }
    meshes.forEach(m => { m.count = n; m.instanceMatrix.needsUpdate = true; });
  }
  return { place, get ready() { return ready; } };
}
