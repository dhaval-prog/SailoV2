// Fewer draw calls: the parts of a model that never move are merged into one mesh per material (each mesh is a draw
// call, and a boat or the island is built from hundreds of small ones). Parts that move, show and hide, or are
// see-through (they need sorting one by one) are left as they are, with everything under them.
// The merged copies take the place of the originals: an original with nothing else under it is removed; one that still
// holds parts that stay (a moving flag on a static mast, say) is kept for them but no longer drawn.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * @param root the model (merged meshes are added to it, in its own space)
 * @param keep (object) => true for a part to leave alone, with all it holds
 * @returns the number of draw calls saved
 */
export function mergeStatic(THREE, root, keep = () => false) {
  root.updateMatrixWorld(true);
  const toRoot = root.matrixWorld.clone().invert(), groups = new Map(), order = [];
  (function walk(o) {
    if (o !== root && (keep(o) || !o.visible)) return; // (hidden parts may be shown later: left alone)
    if (o.isMesh && !o.isSkinnedMesh && !o.isInstancedMesh && o.material && !Array.isArray(o.material) && !o.material.transparent && !o.morphTargetInfluences && o.geometry.attributes.position) {
      const g = o.geometry, names = Object.keys(g.attributes).sort().join(','), key = [o.material.uuid, names, !!g.index, o.castShadow, o.receiveShadow, o.renderOrder, o.frustumCulled].join('|');
      if (!groups.has(key)) groups.set(key, { mat: o.material, list: [], o });
      groups.get(key).list.push(o); order.push(o);
    }
    o.children.forEach(walk);
  })(root);
  let saved = 0; const gone = new Set();
  groups.forEach(({ mat, list, o: first }) => {
    if (list.length < 2) return;
    const geos = list.map(o => { const g = o.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toRoot, o.matrixWorld)); g.morphAttributes = {}; g.clearGroups(); return g; });
    const geo = mergeGeometries(geos, false); geos.forEach(g => g.dispose()); if (!geo) return;
    const m = new THREE.Mesh(geo, mat); m.name = `merged_${mat.name || 'mesh'}`; Object.assign(m, { castShadow: first.castShadow, receiveShadow: first.receiveShadow, renderOrder: first.renderOrder, frustumCulled: first.frustumCulled });
    m.userData.merged = list.length; root.add(m); list.forEach(o => gone.add(o)); saved += list.length - 1;
  });
  // the originals, deepest first: removed when nothing else hangs on them, otherwise kept (for what they hold) but not drawn
  order.reverse().forEach(o => { if (!gone.has(o)) return; if (!o.children.length) o.parent.remove(o); else o.layers.disableAll(); });
  return saved;
}

/** After a merge: a model's list of ink outlines (hidden while the model is exported) loses the ones merged away and
    gains the merged outline meshes. */
export function tidyOutlines(list, root) {
  for (let i = list.length - 1; i >= 0; i--) if (!list[i].parent) list.splice(i, 1);
  root.children.forEach(m => { if (m.userData.merged && m.material.name === 'ink_outline' && !list.includes(m)) list.push(m); });
}
/** The parts a model's own animation moves, shows or hides: from its variables (groups, meshes, arrays and objects of them). */
export const moving = (...things) => { const s = new Set(); const put = v => { if (!v) return; if (v.isObject3D) s.add(v); else if (Array.isArray(v)) v.forEach(put); else if (typeof v === 'object') Object.values(v).forEach(put); }; things.forEach(put); return s; };
