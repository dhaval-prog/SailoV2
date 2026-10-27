// Paradise Station island, built in code exactly as in Paradise_Station_offline.html (same geometry,
// palette, seeds and animation), so it keeps the source's toon shading, rim light, ink outlines,
// sand shader, shore foam, swaying palms, scuttling crabs, waving flags, blinking beacon and lanterns.
// Coordinates are the source's: the caller places and scales `root` in the world.
// Static parts are merged per material after building, so ~1,300 meshes draw in a few dozen calls.

import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export function buildIsland(ctx) {
  const { THREE, M } = ctx;
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0);
  // ---------------- source: materials + helpers ----------------
  const mat = {
    sand: M('sand', '#e9a23a'),
    rock: M('rock', '#a7a198', { flatShading: true }),
    grass: M('grass', '#7cc94e'),
    leaf: M('palm_leaf', '#3fae4a', { flatShading: true }),
    bush: M('bush', '#4cb94e', { flatShading: true }),
    wood: M('wood', '#b5733a'),
    woodLight: M('wood_light', '#d49a55'),
    woodDark: M('wood_dark', '#6e4426'),
    rope: M('rope', '#e6cf9a'),
    roof: M('roof_teal', '#2cc4a8'),
    roofDark: M('roof_trim', '#1f9a86'),
    red: M('paint_red', '#ee3427'),
    white: M('paint_white', '#fff7ea'),
    navy: M('paint_navy', '#2343a0'),
    yellow: M('paint_yellow', '#ffb21a'),
    orange: M('paint_orange', '#ff7414'),
    metal: M('metal', '#a9b4c2'),
    rubber: M('rubber', '#3b3134'),
    glass: M('lantern_glass', '#ffe08a', { emissive: new THREE.Color('#ffe08a'), emissiveIntensity: 0.6 }),
    navRed: M('nav_red', '#ff2a1f', { emissive: new THREE.Color('#ff2a1f'), emissiveIntensity: 1 }),
    crab: M('crab_shell', '#f0532b'),
    crabDark: M('crab_claw', '#c63a1f'),
    shell: M('shell_pink', '#ffc9b8'),
    starfish: M('starfish', '#ff7a3d', { flatShading: true }),
  };
  let stallG, hutG;
  const flagCols = ['#ee3427', '#ffb21a', '#2343a0', '#fff7ea', '#2cc4a8'].map((c, i) => M('pennant_' + i, c, { side: THREE.DoubleSide }));
  const root = new THREE.Group(); root.name = 'harbor_island';
  function add(name, geo, m, x = 0, y = 0, z = 0, parent = root) {
    const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.position.set(x, y, z); parent.add(mesh); return mesh;
  }
  function rod(name, a, b, r, m, parent = root, seg = 8) {
    const d = new V3().subVectors(b, a), len = d.length();
    const mesh = add(name, new THREE.CylinderGeometry(r, r, len, seg), m, 0, 0, 0, parent);
    mesh.position.copy(a).addScaledVector(d, 0.5); mesh.quaternion.setFromUnitVectors(UP, d.normalize()); return mesh;
  }
  const extr = (name, shape, y0, depth, m, bt = 0, bs = 0, parent = root) => {
    const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bt > 0, bevelThickness: bt, bevelSize: bs, bevelSegments: 1, curveSegments: 8 });
    g.rotateX(-Math.PI / 2); return add(name, g, m, 0, y0, 0, parent);
  };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const WL = 0, SY = 1.57, DY = 1.85;


  // ---------------- source: island, palms, beach life, sign, stall, pier, lamps, hut, rowboats ----------------
  // ===== island =====
  const IC = { x: -6, z: -3 };
  const isl = [];
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = 15 * (1 + 0.1 * Math.sin(3 * a + 0.7) + 0.07 * Math.sin(5 * a + 2) + (rnd() - 0.5) * 0.07); isl.push([IC.x + Math.cos(a) * r * 1.15, IC.z + Math.sin(a) * r]); }
  const inIsland = (x, z) => { let c = false; for (let i = 0, j = isl.length - 1; i < isl.length; j = i++) { const [xi, zi] = isl[i], [xj, zj] = isl[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
  const off = (p, d) => { const dx = p[0] - IC.x, dz = p[1] - IC.z, l = Math.hypot(dx, dz); return [p[0] + dx / l * d, p[1] + dz / l * d]; };
  const shapeOf = (pts, d = 0, jit = 0, path = new THREE.Shape()) => { pts.forEach((p, i) => { const q = off(p, d + (jit ? (rnd() - 0.5) * jit : 0)); i ? path.lineTo(q[0], -q[1]) : path.moveTo(q[0], -q[1]); }); path.closePath(); return path; };
  extr('cliff', shapeOf(isl), -2, 2.8, mat.rock, 0.5, 0.9);
  extr('sand_top', shapeOf(isl, -0.35), 1.0, 0.45, mat.sand, 0.12, 0.2);
  const PZ = 1; let edgeX = IC.x; while (inIsland(edgeX + 0.1, PZ)) edgeX += 0.1;
  const nearPier = (x, z) => x > edgeX - 6 && z > PZ - 7.5 && z < PZ + 3.5;
  let bi = 0;
  isl.forEach((p, i) => { const n = isl[(i + 1) % isl.length];
    [0, 0.5].forEach(t => { const pt = [p[0] + (n[0] - p[0]) * t, p[1] + (n[1] - p[1]) * t]; if (nearPier(pt[0], pt[1])) return;
      const q = off(pt, 0.3 + rnd() * 0.7), r = 1.1 + rnd() * 1.0;
      const b = add('boulder_' + bi++, new THREE.DodecahedronGeometry(r, 0), mat.rock, q[0], 0.1 + rnd() * 0.7, q[1]);
      b.scale.set(1 + rnd() * 0.3, 0.7 + rnd() * 0.3, 1 + rnd() * 0.3); b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
      if (q[0] + r > edgeX - 1 && q[0] - r < edgeX + 8 && q[1] + r > PZ + 1.8 && q[1] - r < PZ + 5.6) root.remove(b); }); });
  const inside = (x, z) => { let k = 0; while (!inIsland(x, z) && k++ < 20) { x += (IC.x - x) * 0.1; z += (IC.z - z) * 0.1; } return [x, z]; };
  [[-9, -9, 0.9], [-15, 1, 0.7], [0, -6, 0.6], [-3, 4, 0.5]].forEach(([x, z, r], i) => { const b = add('sand_rock_' + i, new THREE.DodecahedronGeometry(r, 0), mat.rock, x, SY + r * 0.25, z); b.scale.y = 0.6; b.rotation.set(rnd() * 3, rnd() * 3, 0); });
  // grass patches
  [[-13, -3, 4.2], [-6, -14, 3.2], [2, -10, 2.4]].forEach(([cx, cz, R], i) => { const pts = []; for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, r = R * (0.75 + rnd() * 0.4); pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r * 0.8]); }
    const s = new THREE.Shape(); pts.forEach((p, k) => k ? s.lineTo(p[0], -p[1]) : s.moveTo(p[0], -p[1])); s.closePath(); extr('grass_patch_' + i, s, SY, 0.06, mat.grass); });
  // bushes
  const bushSpots = []; function bush(name, x, z, s) { bushSpots.push([x, z, s]); for (let k = 0; k < 4; k++) { const a = rnd() * 6.28, d = k ? 0.6 * s : 0; const b = add(`${name}_${k}`, new THREE.IcosahedronGeometry((0.65 + rnd() * 0.4) * s, 0), mat.bush, x + Math.cos(a) * d, SY + (k ? 0.35 : 0.6) * s, z + Math.sin(a) * d); b.rotation.set(rnd() * 3, rnd() * 3, 0); } }
  [[-14, -1, 1.3], [-11, -5, 1], [-7, -15, 1.2], [3, -9, 0.9], [-18, -9, 1.1], [-1, 6, 0.8]].forEach(([x, z, s], i) => { const [px, pz] = inside(x, z); bush('bush_' + i, px, pz, s); });
  // palms
  const fronds = [];
  const leafA = (len, w) => { const s = new THREE.Shape(); s.moveTo(0, -0.12); s.lineTo(len, -w / 2); s.lineTo(len, w / 2); s.lineTo(0, 0.12); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; };
  const leafB = (len, w) => { const s = new THREE.Shape(); s.moveTo(0, -w / 2); s.quadraticCurveTo(len * 0.5, -w * 0.55, len, 0); s.quadraticCurveTo(len * 0.5, w * 0.55, 0, w / 2); s.closePath(); const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false, curveSegments: 6 }); g.rotateX(-Math.PI / 2); return g; };
  const palms = [];
  function palm(name, bx, bz, h, ang, lean) {
    const g = new THREE.Group(); g.name = name; g.position.set(bx, SY - 0.1, bz); root.add(g);
    const top = new V3(Math.cos(ang) * lean, h + 0.1, Math.sin(ang) * lean), ctrl = new V3(Math.cos(ang) * lean * 0.1, h * 0.6 + 0.1, Math.sin(ang) * lean * 0.1);
    const curve = new THREE.QuadraticBezierCurve3(new V3(), ctrl, top), S = 8, joints = [];
    let parent = g, prevQ = new THREE.Quaternion(), prevLen = 0;
    for (let i = 0; i < S; i++) { const a = curve.getPoint(i / S), b = curve.getPoint((i + 1) / S), r = 0.34 - 0.13 * i / S, d = new V3().subVectors(b, a), len = d.length();
      const wq = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), j = new THREE.Group();
      if (i === 0) j.position.copy(a); else j.position.set(0, prevLen, 0);
      j.quaternion.copy(prevQ.clone().invert().multiply(wq)); parent.add(j);
      add(`${name}_trunk_${i}`, new THREE.CylinderGeometry(r * 1.1, r * 0.85, len * 1.04, 10), i % 2 ? mat.wood : mat.woodLight, 0, len / 2, 0, j);
      joints.push({ j, q0: j.quaternion.clone(), k: (i + 1) / S }); parent = j; prevQ = wq; prevLen = len; }
    const crown = new THREE.Group(); crown.position.set(0, prevLen, 0); crown.quaternion.copy(prevQ.clone().invert()); parent.add(crown);
    palms.push({ joints, crown, ph: bx * 0.37 + bz * 0.11 });
    for (let k = 0; k < 8; k++) { const fr = new THREE.Group(); fr.rotation.y = k / 8 * Math.PI * 2 + rnd() * 0.3; crown.add(fr);
      const inner = new THREE.Group(); const base0 = 0.2 + rnd() * 0.2; inner.rotation.z = base0; fr.add(inner);
      add(`${name}_frond_${k}_a`, leafA(1.8, 0.75), mat.leaf, 0, 0, 0, inner);
      const outer = new THREE.Group(); outer.position.x = 1.78; outer.rotation.z = -0.8 - rnd() * 0.3; inner.add(outer);
      add(`${name}_frond_${k}_b`, leafB(2.3, 0.78), mat.leaf, 0, 0, 0, outer);
      fronds.push({ fr, inner, outer, base0, ob: outer.rotation.z, ph: rnd() * 6.28 }); }
    for (let k = 0; k < 3; k++) { const a = k / 3 * 6.28; add(`${name}_coconut_${k}`, new THREE.SphereGeometry(0.2, 12, 8), mat.woodDark, Math.cos(a) * 0.25, -0.25, Math.sin(a) * 0.25, crown); }
  }
  [[2, -13, 6.2, -0.6, 2.2], [-17, -7, 5.4, 3.3, 1.8], [3, 6, 5.8, 0.9, 2.4], [-12, -12, 4.8, 4, 1.4]].forEach(([x, z, h, a, l], i) => { const [px, pz] = inside(x, z); palm('palm_' + i, px, pz, h, a, l); });
  // beach life: crabs, starfish, shells (own RNG so the rest of the island stays put)
  let seed2 = 7; const rnd2 = () => (seed2 = (seed2 * 16807) % 2147483647) / 2147483647;
  const beachOK = (x, z) => { const a = off([x, z], 0.9), b = off([x, z], 3.4); return inIsland(a[0], a[1]) && !inIsland(b[0], b[1]) && !nearPier(x, z); };
  const beachSpot = () => { for (let k = 0; k < 200; k++) { const q = off(isl[Math.floor(rnd2() * isl.length)], -(1.3 + rnd2() * 1.8)); if (beachOK(q[0], q[1])) return q; } return [IC.x, IC.z]; };
  const crabs = [];
  const crabMats = (() => { const S = (name, o) => new THREE.MeshStandardMaterial(Object.assign({ name, roughness: 0.5, metalness: 0.04 }, o));
    return { shell: S('crab_carapace', { vertexColors: true, roughness: 0.38 }), leg: S('crab_leg', { color: '#a8401f' }), joint: S('crab_leg_joint', { color: '#d77a43' }), tip: S('crab_claw_tip', { color: '#22130d', roughness: 0.3 }), eye: S('crab_eye', { color: '#070707', roughness: 0.08 }) }; })();
  const carapaceGeo = (() => {
    const g = new THREE.SphereGeometry(1, 40, 20), p = g.attributes.position, col = [], c = new THREE.Color();
    const dark = new THREE.Color('#5c1d10'), mid = new THREE.Color('#9a3a1c'), edge = new THREE.Color('#cf6a33'), under = new THREE.Color('#ead0a4');
    for (let i = 0; i < p.count; i++) {
      let x = p.getX(i), y = p.getY(i), z = p.getZ(i); const a = Math.atan2(z, x), eq = 1 - Math.abs(y);
      const r = 1 + (z > -0.25 ? 0.08 * Math.pow(Math.max(0, Math.sin(a * 9)), 3) * Math.pow(eq, 7) : 0);
      x *= 0.2 * r; z *= (z > 0 ? 0.145 : 0.125) * r; y *= y > 0 ? 0.072 : 0.032;
      if (y > 0) y += 0.006 * Math.sin(x * 70) * Math.sin(z * 55) - Math.max(0, z - 0.1) * 0.25;
      p.setXYZ(i, x, y, z);
      const m = 0.5 + 0.5 * Math.sin(x * 95 + Math.sin(z * 70) * 2.5) * Math.sin(z * 85 + x * 20);
      if (y > 0) c.copy(mid).lerp(dark, 0.25 + 0.55 * m).lerp(edge, Math.pow(eq, 12) * 0.7); else c.copy(under).lerp(edge, Math.pow(eq, 5) * 0.55);
      col.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); return g;
  })();
  const seg = (name, a, b, r0, r1, m, parent) => { const d = new V3().subVectors(b, a), len = d.length(); const s = add(name, new THREE.CylinderGeometry(r1, r0, len, 7), m, 0, 0, 0, parent); s.position.copy(a).addScaledVector(d, 0.5); s.quaternion.setFromUnitVectors(UP, d.normalize()); return s; };
  function crab(name, x, z) {
    const g = new THREE.Group(); g.name = name; g.position.set(x, SY, z); g.rotation.y = rnd2() * 6.28; root.add(g);
    const body = new THREE.Group(); body.position.y = 0.13; g.add(body);
    add(name + '_carapace', carapaceGeo, crabMats.shell, 0, 0, 0, body);
    const eyes = [-1, 1].map((s, i) => { const e = new THREE.Group(); e.position.set(s * 0.035, 0.03, 0.128); body.add(e);
      seg(`${name}_eyestalk_${i}`, new V3(0, 0, 0), new V3(s * 0.008, 0.042, 0.01), 0.008, 0.006, crabMats.joint, e);
      add(`${name}_eye_${i}`, new THREE.SphereGeometry(0.012, 10, 8), crabMats.eye, s * 0.008, 0.048, 0.012, e); return e; });
    const claws = [-1, 1].map((s, i) => { const arm = new THREE.Group(); arm.position.set(s * 0.1, -0.012, 0.095); arm.rotation.y = -s * 0.3; body.add(arm);
      seg(`${name}_merus_${i}`, new V3(0, 0, 0), new V3(s * 0.07, 0.022, 0.065), 0.017, 0.021, crabMats.leg, arm);
      seg(`${name}_carpus_${i}`, new V3(s * 0.07, 0.022, 0.065), new V3(s * 0.058, 0.03, 0.125), 0.021, 0.024, crabMats.joint, arm);
      const hand = new THREE.Group(); hand.position.set(s * 0.058, 0.03, 0.125); hand.rotation.y = s * 0.55; hand.scale.setScalar(i ? 1.1 : 0.85); arm.add(hand);
      add(`${name}_propodus_${i}`, new THREE.SphereGeometry(1, 16, 10), crabMats.leg, 0, 0, 0.045, hand).scale.set(0.034, 0.028, 0.058);
      seg(`${name}_finger_${i}`, new V3(-s * 0.012, -0.004, 0.09), new V3(-s * 0.004, -0.006, 0.148), 0.013, 0.003, crabMats.tip, hand);
      const dact = new THREE.Group(); dact.position.set(s * 0.013, 0.008, 0.088); hand.add(dact);
      seg(`${name}_dactyl_${i}`, new V3(0, 0, 0), new V3(-s * 0.012, 0, 0.064), 0.012, 0.003, crabMats.tip, dact);
      return { arm, dact }; });
    const legs = [];
    [-1, 1].forEach((s, i) => [0, 1, 2, 3].forEach(k => {
      const lg = new THREE.Group(), ry = s > 0 ? -(1.5 - k) * 0.36 : Math.PI + (1.5 - k) * 0.36;
      lg.position.set(s * 0.15, -0.006, 0.055 - k * 0.052); lg.rotation.y = ry; if (k === 3) lg.scale.setScalar(0.88); body.add(lg);
      seg(`${name}_leg_${i}_${k}_a`, new V3(0, 0, 0), new V3(0.11, 0.05, 0), 0.014, 0.012, crabMats.leg, lg);
      seg(`${name}_leg_${i}_${k}_b`, new V3(0.11, 0.05, 0), new V3(0.18, 0.035, 0), 0.012, 0.01, crabMats.joint, lg);
      seg(`${name}_leg_${i}_${k}_c`, new V3(0.18, 0.035, 0), new V3(0.24, -0.04, 0), 0.01, 0.008, crabMats.leg, lg);
      seg(`${name}_leg_${i}_${k}_d`, new V3(0.24, -0.04, 0), new V3(0.268, -0.124, 0), 0.008, 0.0015, crabMats.tip, lg);
      legs.push({ lg, ry, ph: (k % 2) === (s > 0 ? 0 : 1) ? 0 : Math.PI });
    }));
    const c = { g, body, eyes, claws, legs, bodyY: 0.13, tx: x, tz: z, wait: rnd2() * 2, speed: 1.5, ph: rnd2() * 6.28, gait: 0 }; crabs.push(c); return c;
  }
  for (let n = 0; n < 7; n++) { const [x, z] = beachSpot(); crab('crab_' + n, x, z); }

  const starGeoS = new THREE.Shape(); for (let k = 0; k < 10; k++) { const a = k / 10 * Math.PI * 2 + Math.PI / 2, r = k % 2 ? 0.1 : 0.27; k ? starGeoS.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starGeoS.moveTo(Math.cos(a) * r, Math.sin(a) * r); } starGeoS.closePath();
  const starfishGeo = new THREE.ExtrudeGeometry(starGeoS, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1 }); starfishGeo.rotateX(-Math.PI / 2);
  for (let k = 0; k < 3; k++) { const [x, z] = beachSpot(); add('starfish_' + k, starfishGeo, mat.starfish, x, SY + 0.01, z).rotation.y = rnd2() * 6; }
  for (let k = 0; k < 5; k++) { const [x, z] = beachSpot(); const s = add('shell_' + k, new THREE.SphereGeometry(0.12, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), k % 2 ? mat.shell : mat.white, x, SY, z); s.scale.set(1, 0.55, 1.3); s.rotation.y = rnd2() * 6; }
  // "Paradise Station" signboard at the head of the pier
  { const g = new THREE.Group(); g.name = 'station_sign'; g.position.set(edgeX - 4.2, SY, PZ + 2.6); g.rotation.y = 0.65; root.add(g);
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 384; const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
    const draw = () => { const x = cv.getContext('2d'); x.fillStyle = '#d49a55'; x.fillRect(0, 0, 1024, 384);
      for (let p = 0; p < 3; p++) { x.fillStyle = p % 2 ? 'rgba(110,68,38,.12)' : 'rgba(255,255,255,.06)'; x.fillRect(0, p * 128, 1024, 128); x.fillStyle = 'rgba(110,68,38,.55)'; x.fillRect(0, p * 128 + 125, 1024, 3); }
      for (let k = 0; k < 60; k++) { x.strokeStyle = 'rgba(110,68,38,.13)'; x.lineWidth = 2; x.beginPath(); const y = Math.random() * 384; x.moveTo(0, y); x.bezierCurveTo(300, y + 6, 700, y - 6, 1024, y + 3); x.stroke(); }
      x.strokeStyle = '#152042'; x.lineWidth = 14; x.strokeRect(22, 22, 980, 340);
      x.fillStyle = '#152042'; [[46, 46], [978, 46], [46, 338], [978, 338]].forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 9, 0, 7); x.fill(); });
      x.textAlign = 'center'; x.font = '150px "Alfa Slab One", Georgia, serif'; x.lineWidth = 16; x.strokeStyle = '#152042'; x.fillStyle = '#fff7ea';
      x.strokeText('PARADISE', 512, 205); x.fillText('PARADISE', 512, 205);
      x.font = '700 62px "Baloo 2", sans-serif'; x.fillStyle = '#152042'; x.fillText('\u2014  S T A T I O N  \u2014', 512, 300); tex.needsUpdate = true; };
    draw(); document.fonts.load('150px "Alfa Slab One"').then(() => document.fonts.load('700 62px "Baloo 2"')).then(draw);
    const face = M('sign_face', '#ffffff', { map: tex });
    [-1.25, 1.25].forEach((x, i) => add('sign_post_' + i, new THREE.BoxGeometry(0.2, 2.9, 0.2), mat.woodDark, x, 1.45, 0, g));
    add('sign_board', new THREE.BoxGeometry(3.2, 1.2, 0.14), [mat.wood, mat.wood, mat.wood, mat.wood, face, mat.wood], 0, 2.15, 0.12, g);
    add('sign_roof', new THREE.BoxGeometry(3.5, 0.1, 0.5), mat.roof, 0, 2.85, 0.1, g);
    [-0.8, 0.8].forEach((x, i) => { add('sign_flower_' + i, new THREE.IcosahedronGeometry(0.28, 0), mat.bush, x, 0.25, 0.3, g); });
  }
  // stepping-stone path from the stall to the dock
  for (let i = 0; i < 9; i++) { const u = i / 8, x = -2 + (edgeX - 3.5 + 2) * u, z = -7.4 + (PZ - 0.5 + 7.4) * u + Math.sin(u * 5) * 0.6; add('path_stone_' + i, new THREE.CylinderGeometry(0.42 + rnd() * 0.12, 0.48, 0.1, 7), mat.rock, x, SY + 0.04, z).rotation.y = rnd() * 3; }
  // market stall
  { const sx = -2, sz = -10, g = new THREE.Group(); g.name = 'stall'; stallG = g; g.position.set(sx, SY, sz); root.add(g);
    [[-1.4, -0.8], [1.4, -0.8], [-1.4, 0.8], [1.4, 0.8]].forEach(([x, z], i) => add('stall_post_' + i, new THREE.CylinderGeometry(0.07, 0.08, z < 0 ? 2.7 : 2.3, 8), mat.woodDark, x, z < 0 ? 1.35 : 1.15, z, g));
    add('stall_table', new THREE.BoxGeometry(2.8, 0.85, 1.3), mat.wood, 0, 0.43, 0.1, g);
    add('stall_table_top', new THREE.BoxGeometry(3.0, 0.1, 1.5), mat.woodLight, 0, 0.9, 0.1, g);
    for (let i = 0; i < 7; i++) { const s = add('stall_awning_' + i, new THREE.BoxGeometry(0.46, 0.07, 2.2), i % 2 ? mat.white : mat.red, -1.38 + i * 0.46, 2.5, 0.1, g); s.rotation.x = 0.28; }
    for (let i = 0; i < 7; i++) add('stall_valance_' + i, new THREE.BoxGeometry(0.46, 0.28, 0.05), i % 2 ? mat.white : mat.red, -1.38 + i * 0.46, 2.07, 1.22, g);
    [[-0.9, mat.orange], [0, mat.yellow], [0.9, mat.red]].forEach(([x, fm], i) => { add('crate_fruit_' + i, new THREE.BoxGeometry(0.75, 0.28, 0.6), mat.woodLight, x, 1.09, 0.2, g);
      for (let k = 0; k < 6; k++) add(`fruit_${i}_${k}`, new THREE.SphereGeometry(0.12, 10, 8), fm, x - 0.22 + (k % 3) * 0.22, 1.26, 0.07 + Math.floor(k / 3) * 0.26, g); });
    add('barrel_stall', new THREE.CylinderGeometry(0.34, 0.34, 0.9, 20), mat.navy, 2.0, 0.45, 0.6, g);
    add('crate_stall', new THREE.BoxGeometry(0.7, 0.6, 0.7), mat.wood, -2.0, 0.3, 0.7, g).rotation.y = 0.3;
    rod('stall_lantern_cord', new V3(1.0, 2.24, 1.0), new V3(1.0, 1.98, 1.0), 0.015, mat.rope, g);
    add('lantern_glass_stall', new THREE.BoxGeometry(0.24, 0.3, 0.24), mat.glass, 1.0, 1.82, 1.0, g);
    add('stall_lantern_cap', new THREE.ConeGeometry(0.2, 0.16, 4), mat.navy, 1.0, 2.03, 1.0, g).rotation.y = Math.PI / 4;
  }

  // ===== pier =====
  const W = 3.4, hw = W / 2, xa0 = edgeX - 3, xa1 = edgeX + 14, hx0 = edgeX - 2.4, hx1 = edgeX + 2.4, hzN = PZ - 5.4, BZ = PZ + 13;
  const pier = new THREE.Group(); pier.name = 'pier'; root.add(pier);
  let pi = 0;
  for (let x = xa0 + 0.26; x < xa1; x += 0.52) { const hut = x > hx0 && x < hx1, z0 = hut ? hzN : PZ - hw, z1 = PZ + hw;
    const p = add('plank_' + pi++, new THREE.BoxGeometry(0.46, 0.14, z1 - z0 + (rnd() - 0.5) * 0.14), rnd() < 0.7 ? mat.woodLight : mat.wood, x, DY - 0.07 + (rnd() - 0.5) * 0.03, (z0 + z1) / 2, pier); p.rotation.y = (rnd() - 0.5) * 0.025; }
  for (let z = PZ + hw + 0.26; z < BZ; z += 0.52) { const p = add('plank_' + pi++, new THREE.BoxGeometry(W + (rnd() - 0.5) * 0.14, 0.14, 0.46), rnd() < 0.7 ? mat.woodLight : mat.wood, xa1 - hw, DY - 0.07 + (rnd() - 0.5) * 0.03, z, pier); p.rotation.y = (rnd() - 0.5) * 0.025; }
  [PZ - 1.3, PZ + 1.3].forEach((z, i) => add('stringer_a_' + i, new THREE.BoxGeometry(xa1 - xa0, 0.28, 0.22), mat.woodDark, (xa0 + xa1) / 2, DY - 0.28, z, pier));
  [PZ - 3.2, hzN + 0.4].forEach((z, i) => add('stringer_hut_' + i, new THREE.BoxGeometry(hx1 - hx0, 0.28, 0.22), mat.woodDark, (hx0 + hx1) / 2, DY - 0.28, z, pier));
  [-1.3, 1.3].forEach((d, i) => add('stringer_b_' + i, new THREE.BoxGeometry(0.22, 0.28, BZ - PZ - hw), mat.woodDark, xa1 - hw + d, DY - 0.28, (PZ + hw + BZ) / 2, pier));
  const posts = [];
  function post(x, z, tall = 0.75) {
    const top = DY + tall, bot = -2.4, i = posts.length;
    add('pier_post_' + i, new THREE.CylinderGeometry(0.2, 0.22, top - bot, 10), mat.woodDark, x, (top + bot) / 2, z, pier);
    add('post_rope_band_' + i, new THREE.TorusGeometry(0.22, 0.05, 6, 16), mat.rope, x, top - 0.28, z, pier).rotation.x = Math.PI / 2;
    add('post_cap_' + i, new THREE.CylinderGeometry(0.17, 0.24, 0.12, 10), mat.wood, x, top + 0.06, z, pier);
    const p = { x, z, top, water: !inIsland(x, z) }; posts.push(p); return p;
  }
  const row = (fixed, a, b, axis) => { const out = [], n = Math.max(1, Math.round((b - a) / 3)); for (let k = 0; k <= n; k++) { const v = a + (b - a) * k / n; out.push(axis === 'x' ? post(v, fixed) : post(fixed, v)); } return out; };
  const aSouth = row(PZ + hw + 0.14, edgeX + 0.6, xa1 - W - 0.14, 'x');
  const aNorth = row(PZ - hw - 0.14, hx1 + 0.14, xa1 + 0.14, 'x');
  const hutPosts = [post(hx0 - 0.14, hzN - 0.14), post(hx1 + 0.14, hzN - 0.14)];
  const bOuter = row(xa1 + 0.14, PZ - hw + 2.86, BZ + 0.14, 'z'); bOuter.unshift(aNorth[aNorth.length - 1]);
  const bInner = row(xa1 - W - 0.14, PZ + hw + 0.14, BZ + 0.14, 'z');
  // braces under the deck
  aSouth.forEach((p, i) => p.water && rod('brace_a_' + i, new V3(p.x, 0.15, p.z), new V3(p.x, DY - 0.42, PZ - 1.3), 0.07, mat.woodDark, pier));
  bInner.forEach((p, i) => i && rod('brace_b_' + i, new V3(p.x, 0.15, p.z), new V3(xa1 - hw + 1.3, DY - 0.42, p.z), 0.07, mat.woodDark, pier));
  // rope railings
  let ri = 0;
  const sag = (a, b, h = 0.5) => { const pts = []; for (let i = 0; i <= 8; i++) { const u = i / 8; pts.push(new V3(a.x + (b.x - a.x) * u, DY + h - Math.sin(u * Math.PI) * 0.28, a.z + (b.z - a.z) * u)); } add('rope_rail_' + ri++, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.045, 6), mat.rope, 0, 0, 0, pier); };
  const chainRope = list => list.forEach((p, i) => i && sag(list[i - 1], p));
  chainRope(aSouth); chainRope(aNorth); chainRope(bOuter); sag(bOuter[bOuter.length - 1], bInner[bInner.length - 1]);
  // numbered-race flags on the outer posts
  const flags = [];
  [[1, mat.red], [2, mat.yellow], [3, mat.orange], [4, mat.roof]].forEach(([k, fm]) => { const p = bOuter[k]; if (!p) return;
    add('flag_pole_' + k, new THREE.CylinderGeometry(0.045, 0.05, 2.4, 8), mat.woodDark, p.x, p.top + 1.2, p.z, pier);
    const fg = new THREE.Group(); fg.position.set(p.x, p.top + 1.7, p.z); pier.add(fg);
    const s = new THREE.Shape(); s.moveTo(0, -0.34); s.lineTo(1.1, 0); s.lineTo(0, 0.34); s.closePath();
    add('flag_' + k, new THREE.ExtrudeGeometry(s, { depth: 0.03, bevelEnabled: false }), fm, 0.05, 0, 0, fg); flags.push({ fg, ph: k * 1.3 }); });
  // mast at the corner + pennant line from the hut ridge
  const corner = bOuter[0]; add('corner_mast', new THREE.CylinderGeometry(0.06, 0.08, 3.4, 8), mat.woodDark, corner.x, corner.top + 1.7, corner.z, pier);
  // end beacon
  const BE = bOuter[bOuter.length - 1];
  add('beacon_pole', new THREE.CylinderGeometry(0.06, 0.06, 1.1, 8), mat.metal, BE.x, BE.top + 0.6, BE.z, pier);
  add('beacon_box', new THREE.BoxGeometry(0.34, 0.26, 0.34), mat.navy, BE.x, BE.top + 1.2, BE.z, pier);
  add('nav_lamp_beacon', new THREE.SphereGeometry(0.15, 20, 14), mat.navRed, BE.x, BE.top + 1.45, BE.z, pier);
  // ladder on the inner side of the T
  { const lx = xa1 - W - 0.32, lz = BZ - 2.4; [-0.35, 0.35].forEach((d, i) => add('ladder_rail_' + i, new THREE.CylinderGeometry(0.04, 0.04, 3.0, 8), mat.metal, lx, DY - 0.75, lz + d, pier));
    for (let k = 0; k < 6; k++) add('ladder_rung_' + k, new THREE.CylinderGeometry(0.03, 0.03, 0.7, 6), mat.metal, lx, -0.3 + k * 0.42, lz, pier).rotation.x = Math.PI / 2; }
  // cleats + deck cargo
  [[edgeX + 5, PZ + hw - 0.25], [edgeX + 9, PZ + hw - 0.25], [xa1 - W + 0.25, PZ + 6], [xa1 - W + 0.25, PZ + 9.5]].forEach(([x, z], i) => { add('cleat_base_' + i, new THREE.BoxGeometry(0.2, 0.1, 0.2), mat.rubber, x, DY + 0.05, z, pier); add('cleat_horn_' + i, new THREE.CapsuleGeometry(0.05, 0.4, 4, 8), mat.rubber, x, DY + 0.14, z, pier).rotation.z = Math.PI / 2; });
  add('crate_0', new THREE.BoxGeometry(0.8, 0.7, 0.8), mat.wood, hx1 + 1.2, DY + 0.35, PZ - 0.9, pier);
  add('crate_1', new THREE.BoxGeometry(0.65, 0.55, 0.65), mat.woodLight, hx1 + 1.25, DY + 0.98, PZ - 0.85, pier).rotation.y = 0.35;
  add('barrel_0', new THREE.CylinderGeometry(0.32, 0.32, 0.85, 20), mat.red, hx1 + 2.3, DY + 0.43, PZ - 1.05, pier);
  add('barrel_1', new THREE.CylinderGeometry(0.32, 0.32, 0.85, 20), mat.navy, xa1 - 0.7, DY + 0.43, PZ - 0.9, pier);
  [[xa1 - 1.0, BZ - 1.1], [edgeX + 7, PZ + 0.9]].forEach(([x, z], i) => [0, 1].forEach(k => add(`rope_coil_${i}_${k}`, new THREE.TorusGeometry(0.34 - k * 0.1, 0.06, 8, 24), mat.rope, x, DY + 0.06 + k * 0.08, z, pier).rotation.x = Math.PI / 2));
  // lantern posts
  function lamp(name, x, y0, z, dir = 1) {
    add(name + '_post', new THREE.CylinderGeometry(0.09, 0.11, 2.7, 8), mat.woodDark, x, y0 + 1.35, z);
    add(name + '_arm', new THREE.BoxGeometry(0.6, 0.08, 0.08), mat.woodDark, x + dir * 0.28, y0 + 2.6, z);
    add('lantern_glass_' + name, new THREE.BoxGeometry(0.26, 0.34, 0.26), mat.glass, x + dir * 0.5, y0 + 2.28, z);
    add(name + '_cap', new THREE.ConeGeometry(0.24, 0.22, 4), mat.navy, x + dir * 0.5, y0 + 2.55, z).rotation.y = Math.PI / 4;
    add(name + '_base', new THREE.BoxGeometry(0.3, 0.06, 0.3), mat.navy, x + dir * 0.5, y0 + 2.09, z);
  }
  lamp('lamp_root', edgeX - 1.2, SY, PZ + hw + 0.5);
  lamp('lamp_end', xa1 - W + 0.2, DY, BZ - 0.2, 1);

  // ===== dock hut =====
  { const hut = new THREE.Group(); hut.name = 'dock_hut'; root.add(hut); hutG = hut;
    const zF = PZ - 1.5, zB = hzN + 0.25, zc = (zF + zB) / 2, eave = DY + 2.55, ridge = DY + 3.5, slope = 0.4, half = 2.35;
    [[hx0 + 0.2, zB], [hx1 - 0.2, zB], [hx0 + 0.2, zF], [hx1 - 0.2, zF]].forEach(([x, z], i) => add('hut_post_' + i, new THREE.BoxGeometry(0.24, eave - DY, 0.24), mat.woodDark, x, (DY + eave) / 2, z, hut));
    [zB, zF].forEach((z, i) => add('hut_beam_' + i, new THREE.BoxGeometry(hx1 - hx0, 0.2, 0.2), mat.woodDark, (hx0 + hx1) / 2, eave - 0.1, z, hut));
    for (let x = hx0 + 0.45, k = 0; x < hx1 - 0.3; x += 0.45, k++) add('hut_wall_' + k, new THREE.BoxGeometry(0.42, eave - DY - 0.2, 0.1), k % 2 ? mat.wood : mat.woodLight, x, (DY + eave - 0.2) / 2, zB, hut);
    [0.3, 0.7, 1.1].forEach((y, k) => add('hut_side_' + k, new THREE.BoxGeometry(0.1, 0.32, zF - zB), k % 2 ? mat.wood : mat.woodLight, hx0 + 0.2, DY + y, zc, hut));
    add('hut_counter', new THREE.BoxGeometry(3.0, 1.0, 0.7), mat.wood, (hx0 + hx1) / 2 + 0.3, DY + 0.5, zF - 0.7, hut);
    add('hut_counter_top', new THREE.BoxGeometry(3.2, 0.1, 0.9), mat.woodLight, (hx0 + hx1) / 2 + 0.3, DY + 1.05, zF - 0.7, hut);
    add('crate_fish', new THREE.BoxGeometry(0.8, 0.25, 0.55), mat.woodLight, (hx0 + hx1) / 2 + 0.8, DY + 1.23, zF - 0.7, hut);
    for (let k = 0; k < 4; k++) add('fish_' + k, new THREE.CapsuleGeometry(0.08, 0.3, 4, 8), mat.metal, (hx0 + hx1) / 2 + 0.55 + k * 0.17, DY + 1.36, zF - 0.7, hut).rotation.x = Math.PI / 2;
    const L = hx1 - hx0 + 0.9;
    [-1, 1].forEach(s => { const slab = add('hut_roof_' + (s < 0 ? 'n' : 's'), new THREE.BoxGeometry(L, 0.16, half), mat.roof, (hx0 + hx1) / 2, ridge - Math.sin(slope) * half / 2, zc + s * Math.cos(slope) * half / 2, hut); slab.rotation.x = s * slope;
      for (let k = 0; k < 6; k++) add(`roof_batten_${s < 0 ? 'n' : 's'}_${k}`, new THREE.BoxGeometry(0.09, 0.05, half), mat.roofDark, -L / 2 + 0.35 + k * (L - 0.7) / 5, 0.1, 0, slab); });
    add('hut_ridge_cap', new THREE.BoxGeometry(L + 0.1, 0.16, 0.42), mat.roofDark, (hx0 + hx1) / 2, ridge + 0.04, zc, hut);
    const ring = new THREE.Group(); ring.name = 'life_ring'; ring.position.set(hx1 - 0.2, DY + 1.55, zF + 0.2); hut.add(ring);
    for (let i = 0; i < 4; i++) add('life_ring_' + i, new THREE.TorusGeometry(0.36, 0.1, 10, 16, Math.PI / 2), i % 2 ? mat.white : mat.red, 0, 0, 0, ring).rotation.z = i * Math.PI / 2 + Math.PI / 4;
    rod('hut_lantern_cord', new V3(hx0 + 1.1, eave - 0.2, zF), new V3(hx0 + 1.1, eave - 0.55, zF), 0.015, mat.rope, hut);
    add('lantern_glass_hut', new THREE.BoxGeometry(0.24, 0.32, 0.24), mat.glass, hx0 + 1.1, eave - 0.72, zF, hut);
    add('hut_lantern_cap', new THREE.ConeGeometry(0.22, 0.18, 4), mat.navy, hx0 + 1.1, eave - 0.48, zF, hut).rotation.y = Math.PI / 4;
    // pennant line: ridge -> corner mast
    const A = new V3(hx1 + 0.5, ridge + 0.05, zc), B = new V3(corner.x, corner.top + 3.3, corner.z);
    const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new V3().lerpVectors(A, B, u).setY(A.y + (B.y - A.y) * u - Math.sin(u * Math.PI) * 0.9)); }
    const curve = new THREE.CatmullRomCurve3(pts); add('flag_line', new THREE.TubeGeometry(curve, 24, 0.018, 4), mat.rope, 0, 0, 0, hut);
    const ang = -Math.atan2(B.z - A.z, B.x - A.x);
    for (let k = 1; k < 12; k++) { const p = curve.getPoint(k / 12), tri = new THREE.Shape(); tri.moveTo(-0.2, 0); tri.lineTo(0.2, 0); tri.lineTo(0, -0.48);
      add(`pennant_${k}`, new THREE.ShapeGeometry(tri), flagCols[k % flagCols.length], p.x, p.y, p.z, hut).rotation.y = ang; }
  }

  // ===== rowboats =====
  const boats = [];
  function rowboat(name, paint, x, z, ry, tie) {
    const rb = new THREE.Group(); rb.name = name; rb.position.set(x, WL - 0.12, z); rb.rotation.order = 'YXZ'; rb.rotation.y = ry; root.add(rb);
    const L = 3.8, B = 1.45;
    const rs = (s, path = new THREE.Shape()) => { const l = L * s / 2, b = B * s / 2; path.moveTo(-l, -b * 0.78); path.lineTo(-l * 0.1, -b); path.quadraticCurveTo(l * 0.7, -b, l, 0); path.quadraticCurveTo(l * 0.7, b, -l * 0.1, b); path.lineTo(-l, b * 0.78); path.closePath(); return path; };
    const band = (s, h) => { const sh = rs(s); sh.holes.push(rs(h, new THREE.Path())); return sh; };
    extr(name + '_keel', rs(0.8), 0, 0.18, mat.woodDark, 0, 0, rb);
    extr(name + '_hull_paint', band(0.93, 0.84), 0.15, 0.3, paint, 0, 0, rb);
    extr(name + '_hull', band(1.0, 0.9), 0.45, 0.28, mat.woodLight, 0, 0, rb);
    extr(name + '_gunwale', band(1.03, 0.9), 0.73, 0.07, mat.woodDark, 0, 0, rb);
    extr(name + '_floor', rs(0.86), 0.2, 0.05, mat.wood, 0, 0, rb);
    [-0.9, 0.45].forEach((tx, i) => add(`${name}_thwart_${i}`, new THREE.BoxGeometry(0.3, 0.08, B * 0.86), mat.wood, tx, 0.6, 0, rb));
    [-1, 1].forEach((s, i) => { const o = rod(`${name}_oar_${i}`, new V3(-1.5, 0.7, s * 0.25), new V3(1.1, 0.7, s * 0.12), 0.04, mat.woodLight, rb, 6); add(`${name}_oar_blade_${i}`, new THREE.BoxGeometry(0.55, 0.03, 0.18), mat.woodLight, 1.35, 0.7, s * 0.11, rb); });
    rb.updateMatrixWorld(); const bow = new V3(L / 2 - 0.1, 0.8, 0).applyMatrix4(rb.matrixWorld);
    rod(name + '_mooring', bow, new V3(tie.x, tie.top - 0.3, tie.z), 0.025, mat.rope);
    boats.push({ rb, x, z, ry, ph: rnd() * 6.28 });
  }
  rowboat('rowboat_0', mat.red, xa1 - W - 2.3, PZ + 5.4, -Math.PI / 2 + 0.06, bInner[1] || bInner[0]);
  rowboat('rowboat_1', mat.navy, xa1 - W - 2.2, PZ + 9.0, -Math.PI / 2 - 0.05, bInner[2] || bInner[1]);
  rowboat('rowboat_2', mat.roof, edgeX + 8, PZ - hw - 2.1, Math.PI + 0.04, aNorth[1] || aNorth[0]);


  // ---------------- source: sea stacks ----------------
  // sea stacks
  const stacks = [[-27, 9], [16, -17]];
  stacks.forEach(([x, z], s) => [[0, 0, 1.8], [1.6, 0.9, 1.1], [-1.2, 1.2, 0.8]].forEach(([dx, dz, r], k) => { const b = add(`stack_rock_${s}_${k}`, new THREE.DodecahedronGeometry(r, 0), mat.rock, x + dx, r * 0.3 - 0.4, z + dz); b.scale.y = 1.1; b.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3); }));


  // ---------------- source: ink outlines (smoothed normals so faceted parts stay closed) ----------------
  const inkMat = w => { const m = new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#152042', side: THREE.BackSide }); m.onBeforeCompile = s => { s.vertexShader = 'attribute vec3 inkN;\n' + s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normalize(inkN) * ' + w.toFixed(3) + ';'); }; m.customProgramCacheKey = () => 'ink' + w; return m; };
  const inkThick = inkMat(0.085), inkThin = inkMat(0.028);
  const inkCache = new Map();
  const inkGeo = g => { if (inkCache.has(g)) return inkCache.get(g);
    const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), keys = [];
    for (let i = 0; i < p.count; i++) { const k = Math.round(p.getX(i) * 400) + '_' + Math.round(p.getY(i) * 400) + '_' + Math.round(p.getZ(i) * 400); keys.push(k); let a = acc.get(k); if (!a) acc.set(k, a = [0, 0, 0]); a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); }
    const arr = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) { let [x, y, z] = acc.get(keys[i]), l = Math.hypot(x, y, z); if (l < 1e-5) { x = n.getX(i); y = n.getY(i); z = n.getZ(i); l = 1; } arr[i * 3] = x / l; arr[i * 3 + 1] = y / l; arr[i * 3 + 2] = z / l; }
    const og = new THREE.BufferGeometry(); og.setAttribute('position', p); og.setAttribute('inkN', new THREE.BufferAttribute(arr, 3)); if (g.index) og.setIndex(g.index); inkCache.set(g, og); return og; };
  const bold = /^(cliff|sand_top|boulder|stack_rock|hut_roof|hut_post|hut_ridge|pier_post|stall_(table|post|awning)|palm_\d+_trunk|rowboat_\d+_(hull|gunwale|keel)|crate|barrel|bush|stringer)/;
  const meshes = []; root.traverse(o => o.isMesh && meshes.push(o));
  meshes.forEach(o => { if (/^(pennant|flag_line|flag_\d|nav_lamp|grass_patch|path_stone|crab_)/.test(o.name)) return; const l = new THREE.Mesh(inkGeo(o.geometry), bold.test(o.name) ? inkThick : inkThin); l.name = o.name + '_outline'; l.userData.ink = true; o.add(l); });
  const beaconHalo = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#ff2a1f', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  beaconHalo.position.set(BE.x, BE.top + 1.45, BE.z); root.add(beaconHalo);
  const beaconPL = new THREE.PointLight('#ff2a1f', 4, 7 * ctx.scale, 2), LK = Math.pow(ctx.scale, 1.3), BK = ctx.scale * ctx.scale; // lights keep their reach on the scaled-up island beaconPL.position.copy(beaconHalo.position); root.add(beaconPL);

  // ---------------- source: painted sand (ripples, grains, pebbles, wet edge) ----------------
  const NOISE = `
    float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
      return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
    float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }`;
  // as in the source, sand and grass get no rim light (on flat ground it shows as a pale sheen at low camera angles)
  mat.grass.onBeforeCompile = () => {}; mat.grass.customProgramCacheKey = () => 'station-grass';
  mat.sand.onBeforeCompile = s => {
    // island-local position (the source used world space with the island at the origin)
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;').replace('#include <project_vertex>', '#include <project_vertex>\nvSW = transformed;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vSW;\n' + NOISE).replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 sp = vSW.xz; float vd = length(vViewPosition) / ${ctx.scale.toFixed(4)}, nearR = 1.0 - smoothstep(16.0, 70.0, vd), nearG = 1.0 - smoothstep(6.0, 32.0, vd);
        diffuseColor.rgb *= 0.9 + 0.2 * fbm(sp * 0.16);
        float rip = sin(sp.x * 1.6 + sp.y * 0.75 + fbm(sp * 0.3) * 5.5);
        diffuseColor.rgb *= 1.0 - 0.06 * smoothstep(0.55, 0.95, rip) * nearR;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.86, 0.6), smoothstep(0.1, 0.35, rip) * (1.0 - smoothstep(0.35, 0.55, rip)) * 0.07 * nearR);
        float h1 = hash(floor(sp * 24.0)), h2 = hash(floor(sp * 31.0) + 5.1), h3 = hash(floor(sp * 5.0) + 2.3);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.68, 0.43, 0.18), step(0.9, h1) * 0.55 * nearG);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.95, 0.84), step(0.93, h2) * 0.6 * nearG);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.55, 0.5), step(0.985, h3) * step(length(fract(sp * 5.0) - 0.5), 0.18) * 0.7);
        float wet = 1.0 - smoothstep(1.2, 1.5, vSW.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.64, 0.4, 0.16), wet * 0.7); }`); };
  mat.sand.customProgramCacheKey = () => 'station-sand';
  // wood (pier planks, posts, hut, boats): no rim light, and at night it stays warm instead of turning moon-grey
  const woodNight = { value: 0 };
  [mat.wood, mat.woodLight, mat.woodDark].forEach(m => {
    m.onBeforeCompile = s => { s.uniforms.uWoodNight = woodNight;
      s.fragmentShader = 'uniform float uWoodNight;\n' + s.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= mix(vec3(1.0), vec3(0.86, 0.74, 0.6), uWoodNight);\n#include <opaque_fragment>'); };
    m.customProgramCacheKey = () => 'station-wood'; m.needsUpdate = true; });

  // ---------------- flags and pennants: cloth that ripples in the wind (on top of the source's swing) ----------------
  const windT = { value: 0 };
  const cloth = (m, kind) => { const c = m.clone(), prev = m.onBeforeCompile; c.side = THREE.DoubleSide;
    c.onBeforeCompile = s => { prev(s); s.uniforms.uWindT = windT; s.vertexShader = 'uniform float uWindT;\n' + s.vertexShader.replace('#include <begin_vertex>', kind === 'flag'
      ? '#include <begin_vertex>\nfloat fk = clamp(position.x / 1.1, 0.0, 1.0); transformed.z += sin(position.x * 5.5 - uWindT * 7.0) * 0.12 * fk; transformed.y += sin(position.x * 4.0 - uWindT * 5.0) * 0.03 * fk;'
      : '#include <begin_vertex>\nfloat pk = clamp(-position.y / 0.48, 0.0, 1.0); transformed.z += sin(uWindT * 6.5 + position.y * 7.0 + modelMatrix[3].x * 1.7) * 0.11 * pk;'); };
    c.customProgramCacheKey = () => 'cloth-' + kind; return c; };
  const flagMeshes = []; root.traverse(o => { if (o.isMesh && /^flag_\d+$/.test(o.name)) flagMeshes.push(o); });
  flagMeshes.forEach(o => { o.material = cloth(o.material, 'flag'); });
  const pennantMats = new Map(); root.traverse(o => { if (o.isMesh && /^pennant_\d+$/.test(o.name)) { if (!pennantMats.has(o.material)) pennantMats.set(o.material, cloth(o.material, 'pennant')); o.material = pennantMats.get(o.material); } });

  // ---------------- source: foam around the shore, pier posts, rowboats and stacks ----------------
  const foamMat = o => new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: o, depthWrite: false });
  const FY = 0.1;
  const shoreFoam = [[0.9, 3.6, 1.6, 0.32], [0.9, 2.0, 0.7, 0.8]].map(([d0, d1, j, o]) => { const s = shapeOf(isl, d1, j); s.holes.push(shapeOf(isl, d0, 0, new THREE.Path())); const g = new THREE.ShapeGeometry(s); g.translate(-IC.x, IC.z, 0);
    const m = new THREE.Mesh(g, foamMat(o)); m.rotation.x = -Math.PI / 2; m.position.set(IC.x, FY, IC.z); m.userData.o = o; root.add(m); return m; });
  const postFoam = posts.filter(p => p.water).map((p, i) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.26, 0.48, 18), foamMat(0.7)); m.rotation.x = -Math.PI / 2; m.position.set(p.x, FY, p.z); m.userData.ph = i * 0.7; root.add(m); return m; });
  const boatFoam = boats.map(b => { const m = new THREE.Mesh(new THREE.RingGeometry(1, 1.1, 48), foamMat(0.6)); m.rotation.order = 'YXZ'; m.rotation.set(-Math.PI / 2, b.ry, 0); m.position.set(b.x, FY, b.z); root.add(m); return m; });
  stacks.forEach(([x, z]) => { const m = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.4, 28), foamMat(0.6)); m.rotation.x = -Math.PI / 2; m.position.set(x, FY, z + 0.5); m.scale.set(1.3, 1, 1); root.add(m); });

  // ---------------- source: night kit for the island (lantern glow, fireflies) ----------------
  const dotTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const lampFx = [[edgeX - 0.7, SY + 2.28, PZ + hw + 0.5], [xa1 - W + 0.7, DY + 2.28, BZ - 0.2], [hx0 + 1.1, DY + 1.83, PZ - 1.5], [-1, SY + 1.82, -9]].map(([x, y, z]) => {
    const pl = new THREE.PointLight('#ffbf66', 0, 11 * ctx.scale, 1.3); pl.position.set(x, y, z); root.add(pl);
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 2.4), new THREE.MeshBasicMaterial({ color: '#ffc773', map: dotTex, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(x, y, z); root.add(halo); return { pl, halo }; });
  const ffN = 40, ffBase = [];
  for (let i = 0; i < ffN; i++) { const s = bushSpots[i % bushSpots.length]; ffBase.push([s[0] + (rnd2() - 0.5) * 4.5, SY + 0.5 + rnd2() * 1.8, s[1] + (rnd2() - 0.5) * 4.5, rnd2() * 6.28]); }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ffN * 3), 3));
  const fireflies = new THREE.Points(ffGeo, new THREE.PointsMaterial({ color: '#dcff7a', map: dotTex, size: 0.45 * ctx.scale, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })); fireflies.frustumCulled = false; root.add(fireflies);

  // ---------------- merge everything that never moves, per material ----------------
  {
    const dynamic = new Set([...palms.map(p => p.joints[0].j.parent), ...crabs.map(c => c.g), ...flags.map(f => f.fg), ...boats.map(b => b.rb)]);
    root.updateMatrixWorld(true);
    const isDynamic = o => { for (let p = o; p && p !== root; p = p.parent) if (dynamic.has(p)) return true; return false; };
    const statics = [], buckets = new Map(), nm = new THREE.Matrix3(), v = new V3();
    root.traverse(o => { if (o.isMesh && !Array.isArray(o.material) && o.material.type !== 'MeshBasicMaterial' || o.userData.ink) { if (o.isMesh && !isDynamic(o)) statics.push(o); } });
    statics.forEach(o => {
      const m = o.material, g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      g.applyMatrix4(o.matrixWorld);
      if (o.userData.ink) { const n = g.attributes.inkN; nm.getNormalMatrix(o.matrixWorld); for (let i = 0; i < n.count; i++) { v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); n.setXYZ(i, v.x, v.y, v.z); } }
      Object.keys(g.attributes).forEach(k => { if (k === 'position' || (o.userData.ink ? k === 'inkN' : (k === 'normal' || (k === 'uv' && m.map) || (k === 'color' && m.vertexColors)))) return; g.deleteAttribute(k); });
      if (!buckets.has(m)) buckets.set(m, []); buckets.get(m).push(g);
    });
    statics.forEach(o => o.removeFromParent());
    buckets.forEach((list, m) => { const merged = mergeGeometries(list, false); if (!merged) return; const mesh = new THREE.Mesh(merged, m); mesh.name = 'merged_' + m.name; mesh.frustumCulled = false; const ink = m.name === 'ink_outline'; mesh.castShadow = mesh.receiveShadow = !ink; root.add(mesh); });
  }

  root.traverse(o => { if (o.isMesh && !o.userData.ink && o.material.type !== 'MeshBasicMaterial') o.castShadow = o.receiveShadow = true; });

  // ---------------- per frame (source: treeTick, crabTick, flags, beacon, foam, rowboats, night) ----------------
  const tq = new THREE.Quaternion(), te = new THREE.Euler();
  const wrapA = a => Math.atan2(Math.sin(a), Math.cos(a));
  function tick(t, dt, night, camera) {
    // trees: wind travels up the trunk, fronds ripple with a lag
    const wind = 0.75 + 0.25 * Math.sin(t * 0.21) + 0.15 * Math.sin(t * 0.53 + 1.3);
    palms.forEach(p => p.joints.forEach(({ j, q0, k }, i) => { te.set(wind * (0.012 + 0.032 * k) * Math.sin(t * 1.05 - i * 0.35 + p.ph), 0, wind * (0.01 + 0.024 * k) * Math.sin(t * 0.8 - i * 0.3 + p.ph * 1.7)); j.quaternion.copy(q0).multiply(tq.setFromEuler(te)); }));
    fronds.forEach(f => { f.inner.rotation.z = f.base0 + (0.05 + 0.06 * wind) * Math.sin(t * 1.7 + f.ph); f.outer.rotation.z = f.ob + (0.1 + 0.12 * wind) * Math.sin(t * 1.7 + f.ph - 1.1); f.fr.rotation.x = 0.07 * wind * Math.sin(t * 1.3 + f.ph * 0.7); });
    // crabs: dash, freeze, look around, pick at the sand
    crabs.forEach(c => { const g = c.g; let walk = 0;
      if (c.wait > 0) c.wait -= dt;
      else { const dx = c.tx - g.position.x, dz = c.tz - g.position.z, d = Math.hypot(dx, dz);
        if (d < 0.05) { c.wait = rnd2() < 0.3 ? 3 + rnd2() * 4 : 0.3 + rnd2() * 1.4; c.speed = 0.7 + rnd2() * 2.4;
          for (let k = 0; k < 12; k++) { const a = rnd2() * 6.28, r = 0.6 + rnd2() * 3, x = g.position.x + Math.cos(a) * r, z = g.position.z + Math.sin(a) * r; if (beachOK(x, z)) { c.tx = x; c.tz = z; break; } } }
        else { const want = Math.atan2(-dz, dx), dA = wrapA(want - g.rotation.y), dB = wrapA(want + Math.PI - g.rotation.y), dd = Math.abs(dA) < Math.abs(dB) ? dA : dB;
          g.rotation.y += dd * Math.min(1, dt * 9);
          if (Math.abs(dd) < 0.3) { walk = 1; const st = Math.min(d, c.speed * dt); g.position.x += dx / d * st; g.position.z += dz / d * st; } } }
      c.gait += dt * (walk ? 12 + c.speed * 7 : 0);
      c.legs.forEach(l => { const p = c.gait + l.ph; l.lg.rotation.z = walk ? Math.max(0, Math.sin(p)) * 0.42 : 0; l.lg.rotation.y = l.ry + (walk ? Math.cos(p) * 0.24 : 0); });
      c.body.position.y = c.bodyY + (walk ? Math.abs(Math.sin(c.gait)) * 0.01 : 0); c.body.rotation.z = walk ? Math.sin(c.gait) * 0.035 : 0;
      c.eyes.forEach((e, i) => { e.rotation.x = walk ? 0.2 : -0.15 + Math.sin(t * 0.8 + c.ph + i) * 0.25; e.rotation.z = walk ? 0 : Math.sin(t * 0.5 + c.ph * 2 + i) * 0.3; });
      c.claws.forEach((cl, i) => { const feed = walk ? 0 : Math.pow(Math.max(0, Math.sin(t * 1.7 + c.ph + i * Math.PI)), 3);
        cl.arm.rotation.x = walk ? -0.1 : feed * 0.45 - 0.05; cl.dact.rotation.y = (i ? -1 : 1) * (0.04 + (walk ? 0 : Math.max(0, Math.sin(t * 5 + c.ph + i)) * 0.4)); }); });
    // flags swing on their poles and the cloth ripples
    windT.value = t; flags.forEach(f => { f.fg.rotation.y = 0.35 + Math.sin(t * 3 + f.ph) * 0.22; });
    // end-of-pier beacon blinks
    const on = (t % 1.4) < 0.85 ? 1 : 0.12; mat.navRed.emissiveIntensity = on; beaconHalo.material.opacity = 0.5 * on; beaconPL.intensity = 4 * BK * on;
    // foam breathes along the shore and around the posts
    shoreFoam.forEach((m, i) => { const s = 1 + Math.sin(t * 0.9 + i * 1.7) * 0.008; m.scale.set(s, s, 1); m.material.opacity = m.userData.o * (0.8 + 0.2 * Math.sin(t * 1.3 + i)); });
    postFoam.forEach(m => { const p = (t * 0.5 + m.userData.ph) % 1; m.scale.setScalar(0.9 + p * 0.9); m.material.opacity = 0.75 * (1 - p * 0.8); });
    // rowboats ride the swell
    boats.forEach((b, i) => { const h = ctx.waveAt(b.x, b.z, t); b.rb.position.y = WL - 0.12 + h + Math.sin(t * 1.3 + b.ph) * 0.05; b.rb.rotation.x = Math.sin(t * 1.1 + b.ph) * 0.045; b.rb.rotation.z = Math.sin(t * 0.8 + b.ph * 2) * 0.025; b.rb.rotation.y = b.ry + Math.sin(t * 0.3 + b.ph) * 0.04;
      boatFoam[i].position.y = FY + h; const s = 1 + Math.sin(t * 1.6 + b.ph) * 0.06; boatFoam[i].scale.set(2.15 * s, 0.85 * s, 1); });
    // night: lanterns glow and flicker, fireflies over the bushes
    woodNight.value = night;
    mat.glass.emissiveIntensity = 0.6 + 2.4 * night;
    lampFx.forEach((l, i) => { const fl = 1 + Math.sin(t * 9 + i * 2) * 0.05 + Math.sin(t * 23 + i) * 0.03; l.pl.intensity = 7 * LK * night * fl; l.halo.material.opacity = 0.55 * night * fl; l.halo.quaternion.copy(camera.quaternion); });
    fireflies.material.opacity = night * 0.95;
    if (night > 0.01) { const a = ffGeo.attributes.position; ffBase.forEach(([x, y, z, ph], i) => a.setXYZ(i, x + Math.sin(t * 0.5 + ph) * 0.9, y + Math.sin(t * 0.9 + ph * 2) * 0.35, z + Math.cos(t * 0.4 + ph) * 0.9)); a.needsUpdate = true; }
  }

  return { root, tick, isl, IC, edgeX, PZ, W, hw, BZ, xa0, xa1, hx0, hx1, hzN, posts, stacks, shopAt: { market: [-2, SY + 3.5, -10], boathouse: [(hx0 + hx1) / 2, DY + 4.4, (PZ - 1.5 + hzN + 0.25) / 2] } };
}
