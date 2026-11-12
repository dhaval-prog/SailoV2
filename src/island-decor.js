// What stands on an island, by its kind (island-kinds.js), in the game's low-poly look: built from a handful of shared
// shapes and materials, so a dozen decorated islands cost little. Each sits on the beach beside the signboard; the
// restaurant's jetty runs out over the water. The lights (lanterns, string lights, windows, lamps) glow after dark while
// the place is open, and go dark when it's closed; homes light their windows every evening.
import { KIND_IDS } from './island-kinds.js';

export function createDecor(THREE) {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
  const mat = { wood: M('#8a5a35'), plank: M('#b07a48'), white: M('#f3eee2'), cream: M('#efe2c4'), red: M('#d6453d'), yellow: M('#f2c14e'),
    teal: M('#2cc4a8'), blue: M('#3d7bd6'), stone: M('#bdb5a6'), roof: M('#b5523b'), roof2: M('#5f6f8a'), green: M('#4f8a4a'), gold: M('#d9a62e', { metalness: 0.4, roughness: 0.4 }),
    saffron: M('#ff8c1a'), pink: M('#f4a3c4'), purple: M('#9a6ad6'), dark: M('#3a3330') };
  // the lights, one material per kind (every place of a kind keeps the same hours, so they glow or go dark together)
  const lamp = Object.fromEntries(KIND_IDS.map(k => [k, new THREE.MeshStandardMaterial({ color: '#4a3a22', emissive: new THREE.Color(k === 'homes' || k === 'campus' ? '#ffd890' : '#ffc46b'), emissiveIntensity: 0, roughness: 0.6 })]));
  const G = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10), cone: new THREE.ConeGeometry(0.5, 1, 10), pyr: new THREE.ConeGeometry(0.72, 1, 4),
    ball: new THREE.SphereGeometry(0.5, 10, 8), dome: new THREE.SphereGeometry(0.5, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), flag: (() => { const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1, -0.3); s.lineTo(0, -0.6); return new THREE.ShapeGeometry(s); })() };
  const put = (g, geo, m, x, y, z, sx = 1, sy = 1, sz = 1, ry = 0) => { const o = new THREE.Mesh(G[geo] || geo, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.y = ry; o.castShadow = true; g.add(o); return o; };
  const lantern = (g, k, x, z, h = 2.6) => { put(g, 'cyl', mat.dark, x, h / 2, z, 0.12, h, 0.12); put(g, 'ball', lamp[k], x, h + 0.2, z, 0.5, 0.5, 0.5); };

  const BUILD = {
    // a jetty out over the water with tables and umbrellas, lantern posts and string lights between them
    restaurant(g, k) {
      put(g, 'box', mat.plank, 0, 0.15, 7, 4.2, 0.3, 14); [-1.9, 1.9].forEach(x => [1, 7, 13].forEach(z => put(g, 'cyl', mat.wood, x, -0.6, z, 0.3, 1.8, 0.3)));
      [[-1, 4, mat.red], [1, 9.5, mat.teal]].forEach(([x, z, m]) => { put(g, 'cyl', mat.wood, x, 0.8, z, 0.12, 1.3, 0.12); put(g, 'cyl', mat.white, x, 1.45, z, 1.6, 0.1, 1.6); put(g, 'cyl', mat.wood, x, 2.1, z, 0.08, 1.4, 0.08); put(g, 'cone', m, x, 3.0, z, 3, 0.9, 3);
        [-1, 1].forEach(d => put(g, 'box', mat.wood, x + d * 1.15, 0.75, z, 0.5, 0.9, 0.5)); });
      const posts = [[-1.9, 1], [1.9, 1], [-1.9, 13], [1.9, 13]]; posts.forEach(([x, z]) => lantern(g, k, x, z, 3));
      [[posts[0], posts[2]], [posts[1], posts[3]]].forEach(([a, b]) => { for (let i = 1; i < 9; i++) { const f = i / 9, sag = Math.sin(f * Math.PI) * 0.7; put(g, 'ball', lamp[k], a[0], 3.1 - sag, a[1] + (b[1] - a[1]) * f, 0.22, 0.22, 0.22); } });
    },
    // three stalls under striped awnings, with crates of goods
    market(g, k) {
      [[-4.5, mat.red, mat.white], [0, mat.blue, mat.white], [4.5, mat.yellow, mat.white]].forEach(([x, a, b], i) => {
        put(g, 'box', mat.plank, x, 0.55, 0, 3.2, 1.1, 2); [-1.5, 1.5].forEach(dx => [-0.9, 0.9].forEach(dz => put(g, 'cyl', mat.wood, x + dx, 1.4, dz, 0.1, 2.8, 0.1)));
        for (let s = 0; s < 4; s++) { const aw = put(g, 'box', s % 2 ? b : a, x - 1.35 + s * 0.9, 2.9 - 0.15, 0, 0.9, 0.12, 2.6); aw.rotation.x = -0.25; }
        put(g, 'box', i % 2 ? mat.green : mat.saffron, x - 0.7, 1.25, 0.2, 0.7, 0.4, 0.6); put(g, 'box', mat.pink, x + 0.6, 1.25, -0.2, 0.7, 0.4, 0.6);
        put(g, 'ball', lamp[k], x, 2.4, 0.9, 0.35, 0.35, 0.35); });
    },
    // a hall with a bell tower and lit windows (while classes run)
    campus(g, k) {
      put(g, 'box', mat.cream, 0, 2.5, 0, 11, 5, 6); put(g, 'box', mat.roof2, 0, 5.2, 0, 11.6, 0.4, 6.6);
      for (let i = 0; i < 4; i++) { put(g, 'box', lamp[k], -4 + i * 2.7, 3.2, 3.02, 1.3, 1.2, 0.05); put(g, 'box', lamp[k], -4 + i * 2.7, 1.3, 3.02, 1.3, 1.2, 0.05); }
      put(g, 'box', mat.cream, 7.5, 5, 0, 2.6, 10, 2.6); put(g, 'pyr', mat.roof, 7.5, 11, 0, 3, 2.6, 3, Math.PI / 4); put(g, 'cone', mat.gold, 7.5, 8.9, 0, 1, 1, 1);
      put(g, 'box', mat.dark, 7.5, 1.2, 1.31, 1.2, 2.4, 0.05);
    },
    // flower beds, benches and two garden lamps
    garden(g, k) {
      const cols = [mat.red, mat.yellow, mat.pink, mat.purple, mat.white];
      for (let b = 0; b < 3; b++) { const bx = -5 + b * 5; put(g, 'box', mat.green, bx, 0.25, 0, 3.4, 0.5, 2.2); for (let f = 0; f < 9; f++) put(g, 'ball', cols[(f + b) % 5], bx - 1.2 + (f % 3) * 1.2, 0.75, -0.7 + Math.floor(f / 3) * 0.7, 0.55, 0.55, 0.55); }
      [[-2.5, 2.6], [2.5, 2.6]].forEach(([x, z]) => { put(g, 'box', mat.wood, x, 0.55, z, 2.4, 0.15, 0.7); put(g, 'box', mat.wood, x, 1.0, z + 0.32, 2.4, 0.7, 0.12); [-1, 1].forEach(d => put(g, 'box', mat.dark, x + d * 1.05, 0.28, z, 0.12, 0.55, 0.6)); });
      lantern(g, k, -7.5, 1.8, 2.8); lantern(g, k, 7.5, 1.8, 2.8);
    },
    // a small white shrine on steps, a saffron flag, a bell and lamps (diyas) by the door
    shrine(g, k) {
      put(g, 'box', mat.stone, 0, 0.3, 0, 7, 0.6, 7); put(g, 'box', mat.stone, 0, 0.8, 0, 5.4, 0.5, 5.4); put(g, 'box', mat.white, 0, 2.7, 0, 3.6, 3.4, 3.6);
      put(g, 'pyr', mat.saffron, 0, 5.6, 0, 4, 2.8, 4, Math.PI / 4); put(g, 'ball', mat.gold, 0, 7.15, 0, 0.5, 0.5, 0.5); put(g, 'box', mat.dark, 0, 2.1, 1.81, 1.3, 2.2, 0.05);
      put(g, 'cyl', mat.wood, 2.9, 4, 2.9, 0.1, 8, 0.1); const f = put(g, G.flag, mat.saffron, 2.95, 7.9, 2.9, 1.6, 1.6, 1); f.material = mat.saffron; f.material.side = THREE.DoubleSide;
      put(g, 'box', mat.wood, -3, 2.2, 2.6, 0.15, 2.4, 0.15); put(g, 'box', mat.wood, -3, 3.4, 2.6, 1.6, 0.15, 0.15); put(g, 'cone', mat.gold, -3, 2.9, 2.6, 0.7, 0.8, 0.7);
      [-1.4, 1.4].forEach(x => put(g, 'ball', lamp[k], x, 1.25, 2.9, 0.35, 0.35, 0.35));
    },
    // a few low houses, windows lit in the evening
    homes(g, k) {
      [[-5, 0, mat.cream, mat.roof], [0, 1.2, mat.white, mat.roof2], [5, -0.4, M('#f0c9a0'), mat.roof]].forEach(([x, z, w, r], i) => {
        const h = 2.6 + (i % 2) * 0.8; put(g, 'box', w, x, h / 2, z, 3.6, h, 3.4); put(g, 'pyr', r, x, h + 0.9, z, 3.6, 1.8, 3.4, Math.PI / 4);
        put(g, 'box', lamp[k], x - 0.8, h * 0.55, z + 1.71, 0.8, 0.7, 0.05); put(g, 'box', lamp[k], x + 0.8, h * 0.55, z + 1.71, 0.8, 0.7, 0.05); put(g, 'box', mat.dark, x, 0.75, z + 1.71, 0.7, 1.5, 0.05); });
    },
  };
  return {
    /** The things on an island of this kind: a group, its own front (+z) facing the open water. */
    build(kind) { const g = new THREE.Group(); g.name = 'island_decor_' + kind; (BUILD[kind] || BUILD.homes)(g, kind); return g; },
    /** Every frame or so: night (0…1), and which kinds are open now. */
    lights(night, openKind) { KIND_IDS.forEach(k => { const on = night > 0.05 && openKind(k); lamp[k].emissiveIntensity = on ? 0.35 + 1.6 * night : 0; lamp[k].color.set(on ? '#7a6030' : '#4a3a22'); }); },
  };
}
