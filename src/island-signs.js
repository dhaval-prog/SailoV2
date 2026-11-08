// Signboards on the islands near the boat: a painted wooden board on two posts at the island's shore, its name on both
// faces (island-names.js), turned to face the water the boat came from. Only the nearest few islands have one at a time;
// a board appears as an island comes near and goes as it falls behind, and its name updates when the map's labels load.
import { nameIslands } from './island-names.js';
import { ensure } from './geo.js';

const RANGE = 420, MAX = 12; // metres; boards at once

export function createIslandSigns(THREE, { scene, WL }) {
  const root = new THREE.Group(); root.name = 'island_signs'; scene.add(root);
  const wood = new THREE.MeshStandardMaterial({ name: 'sign_wood', color: '#7a5233', roughness: 0.85 });
  const postGeo = new THREE.CylinderGeometry(0.16, 0.2, 1, 8).translate(0, 0.5, 0);
  const signs = new Map(); // island key → { g, board, name }
  const key = it => `${Math.round(it.x)},${Math.round(it.z)}`;

  function texture(name) {
    const c = document.createElement('canvas'), g = c.getContext('2d'), fs = 74;
    g.font = `800 ${fs}px "Baloo 2", "Nunito", system-ui, sans-serif`; const w = Math.min(1500, Math.ceil(g.measureText(name).width) + 110), h = 150;
    c.width = w; c.height = h; g.font = `800 ${fs}px "Baloo 2", "Nunito", system-ui, sans-serif`;
    // planks with a darker rim and grain
    g.fillStyle = '#c98d55'; g.fillRect(0, 0, w, h); g.fillStyle = '#b97b46'; g.fillRect(0, h / 2 - 3, w, 6);
    g.strokeStyle = 'rgba(90,52,25,.28)'; g.lineWidth = 2; for (let i = 0; i < 7; i++) { g.beginPath(); const y = 16 + i * 19 + (i % 2) * 4; g.moveTo(10, y); g.bezierCurveTo(w * 0.3, y - 5, w * 0.7, y + 5, w - 10, y); g.stroke(); }
    g.strokeStyle = '#5a3a1f'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = '#fff7ea'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = 'rgba(40,20,5,.55)'; g.shadowOffsetY = 4; g.shadowBlur = 2;
    g.fillText(name, w / 2, h / 2 + 4);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return { t, aspect: w / h };
  }
  function build(it, name, from) {
    const g = new THREE.Group(); g.name = 'island_sign'; g.userData.name = name;
    const { t, aspect } = texture(name), H = 2.2, W = H * aspect, s = Math.max(1, Math.min(2.2, it.r / 22));
    const face = new THREE.MeshStandardMaterial({ map: t, roughness: 0.8, side: THREE.DoubleSide });
    const board = new THREE.Mesh(new THREE.BoxGeometry(W, H, 0.22), [wood, wood, wood, wood, face, face]); board.position.y = 3.6 + H / 2; board.castShadow = true;
    // (the back face shows the name mirrored on a box: flip its UVs so it reads right from behind too)
    const uv = board.geometry.attributes.uv; for (let i = 20; i < 24; i++) uv.setX(i, 1 - uv.getX(i)); uv.needsUpdate = true;
    [-1, 1].map(k => { const p = new THREE.Mesh(postGeo, wood); p.scale.set(1, 3.6 + H * 0.8, 1); p.position.x = k * Math.min(W / 2 - 0.4, 2.4); p.castShadow = true; g.add(p); });
    g.add(board); g.scale.setScalar(s);
    // at the shore on the side the boat came from, facing out to sea
    const a = Math.atan2(from.z - it.z, from.x - it.x), rr = it.r * 0.62;
    g.position.set(it.x + Math.cos(a) * rr, WL + 0.6, it.z + Math.sin(a) * rr); g.rotation.y = Math.PI / 2 - a;
    root.add(g); return { g, name, t, board };
  }
  const drop = (k, s) => { root.remove(s.g); s.t.dispose(); s.board.geometry.dispose(); s.board.material[4].dispose(); signs.delete(k); };

  /** The islands near the boat (terrain.js, about once a second): boards on the nearest few, named from the map.
   *  `all`: every island known, so each label goes to its truly nearest island (the same names as the map screen). */
  function update(islands, boat, all = islands) {
    ensure(boat.x - 700, boat.z - 700, boat.x + 700, boat.z + 700, true); // (the map's landmarks round the boat, to name the islands by)
    const near = islands.map(it => ({ it, d: Math.hypot(it.x - boat.x, it.z - boat.z) - it.r })).filter(o => o.d < RANGE).sort((a, b) => a.d - b.d).slice(0, MAX);
    const want = new Map(near.map(({ it }) => [key(it), it]));
    signs.forEach((s, k) => { if (!want.has(k)) drop(k, s); });
    const names = nameIslands([...want.values()], all);
    want.forEach((it, k) => { const n = names.get(it)?.name; if (!n) return; const s = signs.get(k);
      if (s && s.name === n) return; const from = s ? { x: s.g.position.x, z: s.g.position.z } : boat; if (s) drop(k, s);
      signs.set(k, build(it, n, s ? { x: it.x + (from.x - it.x) * 10, z: it.z + (from.z - it.z) * 10 } : from)); });
  }
  return { update, count: () => signs.size };
}
