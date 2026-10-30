// Sail boat, built in code exactly as in Sail_Boat.html (same hull, rig, sails, pennants, nav lights
// and ink outlines). The game shows it inside the player's boat group when it is the active boat.
import { mergeStatic, tidyOutlines, moving } from '../merge-static.js';

export function buildSailBoat(ctx) {
  const { THREE, M } = ctx;
  const emit = (...a) => ctx.emit(...a);
  // ---------------- source: materials, hull, cabin, cockpit, rig, sails, outlines, nav lights ----------------
  const mat = {
    yellow: M('hull_yellow', '#ffb21a'),
    bottom: M('hull_bottom', '#9a2418'),
    white: M('paint_white', '#fff7ea'),
    red: M('paint_red', '#ee3427'),
    navy: M('paint_navy', '#2343a0'),
    orange: M('buoy_orange', '#ff7414'),
    rubber: M('rubber', '#3b3134'),
    metal: M('metal', '#a9b4c2'),
    glass: M('glass', '#a6ecff', { emissive: new THREE.Color('#ffe08a'), emissiveIntensity: 0.3 }),
    wood: M('wood', '#b5733a'),
    woodLight: M('wood_light', '#d49a55'),
    navRed: M('nav_red', '#ff2a1f', { emissive: new THREE.Color('#ff2a1f'), emissiveIntensity: 1 }),
    navGreen: M('nav_green', '#1fff6a', { emissive: new THREE.Color('#1fff6a'), emissiveIntensity: 1 }),
    rope: M('rope', '#e6cf9a'),
    deck: M('deck', '#9a958c'),
    flag: M('flag_cloth', '#ffffff', { side: THREE.DoubleSide }),
  };
  const flagCols = ['#ee3427', '#ffb21a', '#2343a0', '#fff7ea', '#2cc4a8'].map((c, i) => M('pennant_' + i, c, { side: THREE.DoubleSide }));
  const boat = new THREE.Group(); boat.name = 'sail_boat';
  function add(name, geo, m, x = 0, y = 0, z = 0, parent = boat) {
    const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rod(name, a, b, r, m, parent = boat) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const mesh = add(name, new THREE.CylinderGeometry(r, r, len, 8), m, 0, 0, 0, parent);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
    return mesh;
  }
  // top-view hull outline, bow at +x: fine entry, moderate stern
  function outline(s = 1, path = new THREE.Shape()) {
    const L = 5.4 * s, B = 1.55 * s;
    path.moveTo(-L + 0.3 * s, -B * 0.86);
    path.bezierCurveTo(-L * 0.5, -B * 1.02, L * 0.1, -B * 1.02, L * 0.38, -B * 0.92);
    path.bezierCurveTo(L * 0.8, -B * 0.72, L * 0.98, -B * 0.3, L + 0.55 * s, 0);
    path.bezierCurveTo(L * 0.98, B * 0.3, L * 0.8, B * 0.72, L * 0.38, B * 0.92);
    path.bezierCurveTo(L * 0.1, B * 1.02, -L * 0.5, B * 1.02, -L + 0.3 * s, B * 0.86);
    path.bezierCurveTo(-L - 0.05 * s, B * 0.8, -L - 0.05 * s, -B * 0.8, -L + 0.3 * s, -B * 0.86);
    return path;
  }
  const HB = (() => { const pts = outline(1).getPoints(300); return x => { let best = 0; pts.forEach(p => { if (Math.abs(p.x - x) < 0.08) best = Math.max(best, Math.abs(p.y)); }); return best; }; })();
  function prism(name, sh, y0, h, m) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); return add(name, g, m, 0, y0);
  }
  function slab(name, s, y0, h, m, holeS) {
    const sh = outline(s); if (holeS) sh.holes.push(outline(holeS, new THREE.Path()));
    return prism(name, sh, y0, h, m);
  }
  function side(name, pts, hw, m, bevel = 0.05, parent = boat) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * hw, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 });
    g.translate(0, 0, -hw); return add(name, g, m, 0, 0, 0, parent);
  }
  function pad(x0, x1, hw, r = 0.2, path = new THREE.Shape()) {
    path.moveTo(x0 + r, -hw); path.lineTo(x1 - r, -hw); path.quadraticCurveTo(x1, -hw, x1, -hw + r);
    path.lineTo(x1, hw - r); path.quadraticCurveTo(x1, hw, x1 - r, hw); path.lineTo(x0 + r, hw);
    path.quadraticCurveTo(x0, hw, x0, hw - r); path.lineTo(x0, -hw + r); path.quadraticCurveTo(x0, -hw, x0 + r, -hw);
    return path;
  }
  // cambered sail panel: luff L(v) -> leech R(v); belly + sheet twist toward -z (leeward)
  function sailGeo(Lf, Rf, depth, twist, v0 = 0, v1 = 1, off = 0, NU = 18, NV = 28, u0 = 0, u1 = 1) {
    const pos = [], idx = [];
    for (let j = 0; j <= NV; j++) { const v = v0 + (v1 - v0) * j / NV, A = Lf(v), B = Rf(v), ch = A.distanceTo(B);
      for (let i = 0; i <= NU; i++) { const u = u0 + (u1 - u0) * i / NU, p = A.clone().lerp(B, u);
        pos.push(p.x, p.y, -(depth * ch * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.9) + twist * u * (1 - v) * ch / 4) + off); } }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const sailMat = M('sail_cloth', '#fff7ea', { side: THREE.DoubleSide });
  const sailRed = M('sail_red', '#ee3427', { side: THREE.DoubleSide }), sailNavy = M('sail_navy', '#2343a0', { side: THREE.DoubleSide });
  const inkLine = M('ink_line', '#152042');
  // ---------- hull ----------
  slab('keel', 0.82, 0, 0.35, mat.bottom);
  slab('hull_bottom', 0.93, 0.35, 0.5, mat.bottom);
  slab('boot_stripe', 1.004, 0.84, 0.08, mat.navy);
  slab('hull', 1.0, 0.85, 0.85, mat.yellow);
  slab('hull_pinstripe', 1.006, 1.2, 0.05, mat.orange);
  slab('fender_rub', 1.03, 1.52, 0.14, mat.rubber);
  slab('deck', 0.97, 1.7, 0.04, mat.deck);
  slab('toe_rail', 1.0, 1.7, 0.1, mat.wood, 0.97);
  // keel fin + bulb, spade rudder, folding prop
  add('keel_fin', new THREE.BoxGeometry(1.3, 1.9, 0.16), mat.bottom, 0.35, -0.85, 0).scale.set(1, 1, 1);
  add('keel_bulb', new THREE.CapsuleGeometry(0.26, 1.3, 8, 24), mat.rubber, 0.2, -1.85, 0).rotation.z = Math.PI / 2;
  add('rudder', new THREE.BoxGeometry(0.55, 1.3, 0.09), mat.bottom, -4.25, -0.2, 0);
  add('prop_strut', new THREE.BoxGeometry(0.1, 0.35, 0.05), mat.metal, -2.9, -0.12, 0);
  add('prop_shaft', new THREE.CylinderGeometry(0.04, 0.04, 0.6, 10), mat.metal, -3.0, -0.28, 0).rotation.z = Math.PI / 2;
  const prop = new THREE.Group(); prop.name = 'propeller'; prop.position.set(-3.35, -0.28, 0); boat.add(prop);
  add('prop_hub', new THREE.CylinderGeometry(0.07, 0.09, 0.14, 20), mat.wood, 0, 0, 0, prop).rotation.z = Math.PI / 2;
  for (let i = 0; i < 2; i++) { const arm = new THREE.Group(); arm.rotation.x = i * Math.PI; prop.add(arm); const bl = add('prop_blade_' + i, new THREE.CapsuleGeometry(0.06, 0.18, 6, 12), mat.woodLight, 0, 0.18, 0, arm); bl.scale.set(0.35, 1, 1.2); bl.rotation.y = 0.5; }
  // transom ladder
  for (let k = 0; k < 3; k++) add('swim_ladder_' + k, new THREE.BoxGeometry(0.05, 0.04, 0.4), mat.metal, -5.18, 1.45 - k * 0.24, 0.55);
  // hanging fenders
  [-2.6, -0.6].forEach((x, i) => [-1, 1].forEach(sd => {
    const tag = i + '_' + (sd > 0 ? 'p' : 's'), z = sd * (HB(x) + 0.14);
    add('fender_' + tag, new THREE.CapsuleGeometry(0.13, 0.38, 8, 24), mat.rubber, x, 1.22, z);
    rod('fender_rope_' + tag, new THREE.Vector3(x, 1.6, z), new THREE.Vector3(x, 1.82, sd * (HB(x) - 0.05)), 0.014, mat.rope);
  }));
  // ---------- cabin trunk ----------
  side('cabin_trunk', [[-1.6, 1.72], [-1.6, 2.38], [1.3, 2.38], [2.4, 1.72]], 0.92, mat.white);
  [-1.0, -0.05, 0.85].forEach((x, i) => [-1, 1].forEach(sd => { const m = add('cabin_port_' + i + (sd > 0 ? '_p' : '_s'), new THREE.CapsuleGeometry(0.075, 0.34, 6, 16), mat.glass, x, 2.07, sd * 0.975); m.rotation.z = Math.PI / 2; m.scale.set(1, 1, 0.14); }));
  add('cabin_hatch', new THREE.BoxGeometry(0.55, 0.07, 0.6), mat.glass, 0.95, 2.47, 0);
  add('companionway', new THREE.BoxGeometry(0.03, 0.55, 0.55), mat.navy, -1.665, 2.06, 0);
  add('handrail_p', new THREE.BoxGeometry(1.8, 0.05, 0.05), mat.woodLight, -0.1, 2.48, 0.62);
  add('handrail_s', new THREE.BoxGeometry(1.8, 0.05, 0.05), mat.woodLight, -0.1, 2.48, -0.62);
  // ---------- cockpit ----------
  [-1, 1].forEach(sd => { const c = side('cockpit_coaming_' + (sd > 0 ? 'p' : 's'), [[-4.55, 1.72], [-4.55, 2.05], [-1.6, 2.05], [-1.6, 1.72]], 0.04, mat.white, 0.02); c.position.z = sd * 0.98; });
  [-1, 1].forEach(sd => { const tg = sd > 0 ? 'p' : 's';
    add('cockpit_bench_' + tg, new THREE.BoxGeometry(2.6, 0.3, 0.42), mat.white, -3.0, 1.87, sd * 0.72);
    add('cockpit_cushion_' + tg, new THREE.BoxGeometry(2.5, 0.09, 0.38), mat.orange, -3.0, 2.06, sd * 0.72);
    add('winch_' + tg, new THREE.CylinderGeometry(0.1, 0.12, 0.18, 20), mat.metal, -1.95, 2.14, sd * 0.98);
    add('winch_cabin_' + tg, new THREE.CylinderGeometry(0.08, 0.1, 0.14, 20), mat.metal, -1.45, 2.45, sd * 0.55);
  });
  add('helm_pedestal', new THREE.BoxGeometry(0.24, 0.78, 0.28), mat.wood, -4.05, 2.1, 0);
  add('helm_axle', new THREE.CylinderGeometry(0.04, 0.04, 0.25, 12), mat.metal, -3.9, 2.42, 0).rotation.z = Math.PI / 2;
  const wheel = new THREE.Group(); wheel.name = 'ships_wheel'; wheel.position.set(-3.78, 2.42, 0); boat.add(wheel);
  add('wheel_rim', new THREE.TorusGeometry(0.44, 0.035, 12, 48), mat.woodLight, 0, 0, 0, wheel).rotation.y = Math.PI / 2;
  add('wheel_hub', new THREE.CylinderGeometry(0.08, 0.08, 0.1, 20), mat.wood, 0, 0, 0, wheel).rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) add('wheel_spoke_' + i, new THREE.CylinderGeometry(0.02, 0.02, 1.18, 8), mat.woodLight, 0, 0, 0, wheel).rotation.x = i * Math.PI / 4;
  for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; add('wheel_handle_' + i, new THREE.CapsuleGeometry(0.028, 0.07, 4, 10), mat.wood, 0, Math.cos(an) * 0.6, Math.sin(an) * 0.6, wheel).rotation.x = -an; }
  // ---------- foredeck ----------
  add('crate_0', new THREE.BoxGeometry(0.45, 0.38, 0.42), mat.wood, 3.15, 1.93, -0.45);
  [0, 1].forEach(k => add('rope_coil_0_' + k, new THREE.TorusGeometry(0.22 - k * 0.07, 0.042, 10, 32), mat.rope, 3.1, 1.78 + k * 0.06, 0.5).rotation.x = Math.PI / 2);
  add('windlass', new THREE.CylinderGeometry(0.12, 0.12, 0.3, 20), mat.metal, 4.85, 1.82, 0).rotation.x = Math.PI / 2;
  add('foredeck_hatch', new THREE.BoxGeometry(0.5, 0.06, 0.5), mat.glass, 2.75, 1.76, 0);
  [[4.6, 0.45], [4.6, -0.45], [-4.9, 1.0], [-4.9, -1.0]].forEach(([x, z], i) => { add('cleat_' + i, new THREE.BoxGeometry(0.24, 0.05, 0.06), mat.metal, x, 1.86, z); add('cleat_foot_' + i, new THREE.BoxGeometry(0.09, 0.06, 0.05), mat.metal, x, 1.81, z); });
  // ---------- pulpits + lifelines ----------
  const railXs = [-4.4, -3.3, -2.2, -1.1, 0.0, 1.1, 2.2, 3.2, 4.1];
  [-1, 1].forEach(sd => {
    const sn = sd > 0 ? 'p' : 's';
    const tops = railXs.map((x, i) => { const z = sd * (HB(x) - 0.08); add('stanchion_' + sn + '_' + i, new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6), mat.metal, x, 2.08, z); return new THREE.Vector3(x, 2.38, z); });
    rod('lifeline_' + sn, tops[0], tops[tops.length - 1], 0.012, mat.metal);
    rod('lifeline_low_' + sn, tops[0].clone().setY(2.12), tops[tops.length - 1].clone().setY(2.12), 0.01, mat.metal);
    rod('bow_pulpit_' + sn, tops[tops.length - 1], new THREE.Vector3(5.55, 2.3, sd * 0.12), 0.022, mat.metal);
    rod('bow_pulpit_leg_' + sn, new THREE.Vector3(5.1, 1.78, sd * (HB(5.1) - 0.08)), new THREE.Vector3(5.1, 2.32, sd * (HB(5.1) - 0.1)), 0.02, mat.metal);
    rod('stern_pulpit_' + sn, tops[0], new THREE.Vector3(-5.05, 2.38, sd * (HB(-5.05) - 0.1)), 0.022, mat.metal);
    rod('stern_pulpit_leg_' + sn, new THREE.Vector3(-5.05, 1.78, sd * (HB(-5.05) - 0.1)), new THREE.Vector3(-5.05, 2.38, sd * (HB(-5.05) - 0.1)), 0.02, mat.metal);
  });
  rod('stern_pulpit_rail', new THREE.Vector3(-5.05, 2.38, -(HB(-5.05) - 0.1)), new THREE.Vector3(-5.05, 2.38, HB(-5.05) - 0.1), 0.022, mat.metal);
  const ring = new THREE.Group(); ring.name = 'life_ring'; ring.position.set(-5.1, 2.12, -0.7); ring.rotation.y = Math.PI / 2; boat.add(ring);
  for (let i = 0; i < 4; i++) add('life_ring_' + i, new THREE.TorusGeometry(0.22, 0.065, 12, 16, Math.PI / 2), i % 2 ? mat.white : mat.red, 0, 0, 0, ring).rotation.z = i * Math.PI / 2;
  // nav lights on the bow pulpit
  const NAVP = [5.1, 2.42, HB(5.1) - 0.1];
  [[-1, mat.navRed, 'port'], [1, mat.navGreen, 'starboard']].forEach(([sd, m, tag]) => {
    add('nav_box_' + tag, new THREE.BoxGeometry(0.2, 0.14, 0.09), mat.navy, NAVP[0], NAVP[1] - 0.1, sd * NAVP[2]);
    add('nav_lamp_' + tag, new THREE.SphereGeometry(0.075, 20, 14), m, NAVP[0], NAVP[1], sd * NAVP[2]);
  });
  // ---------- mast + rig ----------
  const MX = 0.7, MTOP = 11.6;
  const tower = new THREE.Group(); tower.name = 'mast_rig'; boat.add(tower);
  add('mast', new THREE.CylinderGeometry(0.085, 0.11, MTOP - 2.38, 24), mat.metal, MX, (MTOP + 2.38) / 2, 0, tower);
  add('mast_step', new THREE.CylinderGeometry(0.16, 0.18, 0.1, 24), mat.navy, MX, 2.43, 0, tower);
  add('spreaders', new THREE.BoxGeometry(0.06, 0.05, 1.6), mat.metal, MX, 6.7, 0, tower);
  add('masthead', new THREE.BoxGeometry(0.3, 0.1, 0.12), mat.navy, MX - 0.05, MTOP + 0.03, 0, tower);
  add('mast_band', new THREE.CylinderGeometry(0.095, 0.095, 0.25, 24), mat.red, MX, 9.0, 0, tower);
  const anemo = new THREE.Group(); anemo.name = 'anemometer'; anemo.position.set(MX, MTOP + 0.38, 0); tower.add(anemo);
  add('anemo_mast', new THREE.CylinderGeometry(0.015, 0.015, 0.35, 6), mat.metal, MX, MTOP + 0.22, 0, tower);
  add('anemometer_bar', new THREE.BoxGeometry(0.36, 0.022, 0.022), mat.metal, 0, 0, 0, anemo);
  add('anemometer_bar_2', new THREE.BoxGeometry(0.022, 0.022, 0.36), mat.metal, 0, 0, 0, anemo);
  [[0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]].forEach(([x, z], i) => add('anemometer_cup_' + i, new THREE.SphereGeometry(0.05, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.metal, x, -0.02, z, anemo));
  const radar = new THREE.Group(); radar.name = 'windex'; radar.position.set(MX - 0.15, MTOP + 0.1, 0); tower.add(radar);
  add('windex_arm', new THREE.BoxGeometry(0.5, 0.02, 0.02), mat.metal, -0.25, 0, 0, radar);
  { const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(0.45, 0.06); tri.lineTo(0, 0.3); add('burgee', new THREE.ShapeGeometry(tri), flagCols[0], -0.5, 0.02, 0, radar); }
  const stay = (n, a, b) => rod(n, a, b, 0.014, mat.metal, tower);
  const FS0 = new THREE.Vector3(MX + 0.05, 10.4, 0), FS1 = new THREE.Vector3(5.78, 2.05, 0);
  stay('forestay', FS0, FS1);
  stay('backstay', new THREE.Vector3(MX - 0.08, MTOP, 0), new THREE.Vector3(-5.2, 1.95, 0));
  [-1, 1].forEach(sd => { const sn = sd > 0 ? 'p' : 's', cp = new THREE.Vector3(MX - 0.1, 1.86, sd * (HB(MX) - 0.1)), sp = new THREE.Vector3(MX, 6.7, sd * 0.8);
    stay('shroud_' + sn + '_low', cp, sp); stay('shroud_' + sn + '_up', sp, new THREE.Vector3(MX, 10.3, sd * 0.09));
    stay('shroud_' + sn + '_lower', new THREE.Vector3(MX - 0.6, 1.86, sd * (HB(MX - 0.6) - 0.1)), new THREE.Vector3(MX, 6.6, sd * 0.09)); });
  // mainsail on a swinging boom
  const MAIN_A = -0.3;
  const mainG = new THREE.Group(); mainG.name = 'mainsail_rig'; mainG.position.set(MX, 0, 0); mainG.rotation.y = MAIN_A; tower.add(mainG);
  add('boom', new THREE.CylinderGeometry(0.075, 0.075, 4.4, 16), mat.navy, -2.15, 2.95, 0, mainG).rotation.z = Math.PI / 2;
  add('boom_cover', new THREE.CylinderGeometry(0.09, 0.09, 0.8, 16), mat.red, -0.55, 2.95, 0, mainG).rotation.z = Math.PI / 2;
  add('gooseneck', new THREE.BoxGeometry(0.16, 0.12, 0.14), mat.metal, -0.02, 2.95, 0, mainG);
  const mHead = new THREE.Vector2(0.06, 11.2), mClew = new THREE.Vector2(-4.15, 3.02);
  const mLuff = v => new THREE.Vector2(0.12, 3.02 + (11.2 - 3.02) * v);
  const mLeech = v => { const p = mClew.clone().lerp(mHead, v), d = mHead.clone().sub(mClew).normalize(); return p.add(new THREE.Vector2(-d.y, d.x).multiplyScalar(0.42 * Math.sin(Math.PI * v) * (1 - 0.3 * v))); };
  const SAILSTYLE = { classic: true };
  const SAILTEX = {};
  function texSail(name, geo, parent, key) {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 512;
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.magFilter = THREE.NearestFilter;
    const m = M(name + '_cloth', '#ffffff', { side: THREE.DoubleSide, map: tex });
    geo.computeBoundingBox(); const bb = geo.boundingBox, p = geo.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    SAILTEX[key] = { cv, tex, bb: bb.clone() };
    return add(name, geo, m, 0, 0, 0, parent);
  }
  texSail('mainsail', sailGeo(mLuff, mLeech, 0.1, 0.5), mainG, 'main');
  { const vv = 0.38, A = mLuff(vv), B = mLeech(vv), bb = SAILTEX.main.bb, W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y;
    SAILTEX.main.box = { uL: (A.x - bb.min.x) / W, uR: (B.x - bb.min.x) / W, v: ((A.y + B.y) / 2 - bb.min.y) / H, aspect: W / H }; }
  [[0.12, 0.17, sailRed], [0.19, 0.215, sailNavy]].forEach(([a, b, m], i) => [0.012, -0.012].forEach((o, k) => add('mainsail_band_' + i + (k ? 'b' : 'a'), sailGeo(mLuff, mLeech, 0.1, 0.5, a, b, o, 18, 3), m, 0, 0, 0, mainG)));
  [0.35, 0.55, 0.75].forEach((v, i) => { const a = mLeech(v), b = mLuff(v).lerp(a, 0.72); rod('batten_' + i, new THREE.Vector3(b.x, b.y, -0.02), new THREE.Vector3(a.x, a.y, -0.01), 0.018, inkLine, mainG); });
  rod('mainsheet', new THREE.Vector3(-3.95, 2.9, 0), new THREE.Vector3(-3.95, 2.1, 0), 0.016, mat.rope, mainG);
  // jib on the forestay
  const jT = new THREE.Vector2(5.5, 2.45), jH = new THREE.Vector2(1.05, 9.9), jC = new THREE.Vector2(1.25, 2.6);
  const jLuff = v => jT.clone().lerp(jH, v), jLeech = v => { const p = jC.clone().lerp(jH, v), d = jH.clone().sub(jC).normalize(); return p.add(new THREE.Vector2(d.y, -d.x).multiplyScalar(-0.15 * Math.sin(Math.PI * v))); };
  texSail('jib', sailGeo(jLuff, jLeech, 0.11, 0.95), tower, 'jib');
  [0.012, -0.012].forEach((o, k) => add('jib_uv_strip' + (k ? 'b' : 'a'), sailGeo(jLuff, jLeech, 0.11, 0.95, 0, 1, o, 4, 28, 0.86, 1), sailNavy, 0, 0, 0, tower));
  rod('jib_sheet', new THREE.Vector3(jC.x, jC.y, -(0.95 * jC.distanceTo(jT) / 4)), new THREE.Vector3(-1.95, 2.18, -0.98), 0.014, mat.rope, tower);
  // pennant line down the backstay
  const top = new THREE.Vector3(MX - 0.08, MTOP - 0.4, 0);
  { const end = new THREE.Vector3(-5.0, 2.4, 0), n = 13;
    for (let k = 1; k < n; k++) { const p = top.clone().lerp(end, k / n);
      const tri = new THREE.Shape(); tri.moveTo(-0.14, 0); tri.lineTo(0.14, 0); tri.lineTo(0, -0.34);
      add('pennant_aft_' + k, new THREE.ShapeGeometry(tri), flagCols[k % flagCols.length], p.x, p.y, p.z + 0.03); } }
  let ANC_LIFT = 0;
  // sheer rising to the bow + raked forefoot (baked)
  {
    const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const lift = x => 0.45 * Math.pow(sm((x - 0.8) / 5.2), 1.6);
    const rake = x => 0.7 * Math.pow(sm((x - 2.2) / 3.8), 1.4);
    boat.updateMatrixWorld(true);
    const inv = new THREE.Matrix4(), v = new THREE.Vector3();
    boat.traverse(o => {
      if (!o.isMesh) return;
      o.geometry = o.geometry.clone();
      const pos = o.geometry.attributes.position; inv.copy(o.matrixWorld).invert();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const y0 = v.y;
        v.y += lift(v.x) * Math.min(1, Math.max(0, y0 / 1.9));
        if (y0 < 0.85 && y0 > -0.05) v.y += rake(v.x) * (1 - y0 / 0.85);
        v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true; o.geometry.computeVertexNormals();
    });
    ANC_LIFT = lift(4.7);
  }
  // ink outlines: thick on silhouette parts, thin on details
  const inkMat = w => { const m = new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#152042', side: THREE.BackSide }); m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + w.toFixed(3) + ';'); }; return m; };
  const inkThick = inkMat(0.055), inkThin = inkMat(0.016);
  const bold = /^(keel|hull$|hull_bottom|toe_rail|fender_rub|cabin_trunk|cockpit_coaming|mast$|boom$|crate|fender_\d)/;
  const outlines = [], meshes = [];
  boat.traverse(o => o.isMesh && meshes.push(o));
  meshes.forEach(o => { if (/^(pennant|flag_line|nav_lamp|mainsail|jib|batten|burgee|forestay|backstay|shroud|lifeline|mainsheet|jib_sheet|fender_rope|stanchion)/.test(o.name)) return; const l = new THREE.Mesh(o.geometry, bold.test(o.name) ? inkThick : inkThin); l.name = o.name + '_outline'; l.castShadow = false; o.add(l); outlines.push(l); });
  const navFx = [];
  [['port', '#ff2a1f', -1], ['starboard', '#1fff6a', 1]].forEach(([tag, c, sd]) => {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(NAVP[0], NAVP[1], sd * NAVP[2]); boat.add(halo); outlines.push(halo);
    const pl = new THREE.PointLight(c, 3, 5, 2); pl.position.copy(halo.position); boat.add(pl); outlines.push(pl);
    navFx.push({ halo, pl, mat: tag === 'port' ? mat.navRed : mat.navGreen, ph: sd > 0 ? 0.5 : 0 });
  });
  // ---------------- source: sails lower and furl while anchored ----------------
  const SAILS = { f: 0, main: [], jib: [], sheet: null };
  {
    const bb = new THREE.Box3();
    mainG.children.forEach(o => { if (/^(mainsail|batten)/.test(o.name)) SAILS.main.push(o); });
    SAILS.bands = SAILS.main.filter(o => /^mainsail_band/.test(o.name)); SAILS.main = SAILS.main.filter(o => !/^mainsail_band/.test(o.name));
    tower.children.forEach(o => { if (/^jib(_uv_strip|$)/.test(o.name)) SAILS.jib.push(o); if (o.name === 'jib_sheet') SAILS.sheet = o; });
    const mainBody = SAILS.main.find(o => o.name === 'mainsail'), jibBody = SAILS.jib.find(o => o.name === 'jib');
    mainBody.geometry.computeBoundingBox(); jibBody.geometry.computeBoundingBox();
    SAILS.mainY = mainBody.geometry.boundingBox.min.y + 0.02;
    SAILS.jibX = jibBody.geometry.boundingBox.max.x; SAILS.jibY = jibBody.geometry.boundingBox.min.y;
    const g = new THREE.CapsuleGeometry(0.16, 3.4, 6, 20); g.rotateZ(Math.PI / 2);
    SAILS.bundle = add('mainsail_furled', g, sailMat, -2.1, SAILS.mainY + 0.1, 0, mainG); SAILS.bundle.visible = false;
    [-1.2, -2.2, -3.2].forEach((x, i) => add('sail_tie_' + i, new THREE.TorusGeometry(0.17, 0.025, 6, 20), mat.red, x + 2.1, 0, 0, SAILS.bundle).rotation.y = Math.PI / 2);
    const jr = new THREE.CapsuleGeometry(0.09, 1.0, 6, 16); jr.rotateZ(-0.95);
    SAILS.jibRoll = add('jib_furled', jr, sailMat, SAILS.jibX - 0.4, SAILS.jibY + 0.38, 0, tower); SAILS.jibRoll.visible = false;
  }
  function stepSails(t, dt, anchor) {
    const want = anchor === 'dropping' || anchor === 'down' ? 1 : 0;
    const rate = want ? dt / 1.3 : dt / 1.8;
    SAILS.f = want ? Math.min(1, SAILS.f + rate) : Math.max(0, SAILS.f - rate);
    const f = SAILS.f, ease = f * f * (3 - 2 * f);
    const sm = Math.max(0.02, 1 - ease), sj = Math.max(0.02, 1 - Math.min(1, ease * 1.15));
    const flutter = Math.sin(t * 24) * 0.04 * Math.sin(Math.PI * f);
    SAILS.main.forEach(o => { o.visible = sm > 0.03; o.scale.set(1, sm, 1 + flutter); o.position.y = SAILS.mainY * (1 - sm); });
    SAILS.bands.forEach(o => { o.visible = SAILSTYLE.classic && sm > 0.03; o.scale.set(1, sm, 1 + flutter); o.position.y = SAILS.mainY * (1 - sm); });
    SAILS.jib.forEach(o => { o.visible = sj > 0.03; o.scale.set(sj, sj, 1 + flutter * 1.5); o.position.x = SAILS.jibX * (1 - sj); o.position.y = SAILS.jibY * (1 - sj); });
    if (SAILS.sheet) SAILS.sheet.visible = sj > 0.6;
    const b = Math.max(0, (ease - 0.55) / 0.45);
    SAILS.bundle.visible = SAILS.jibRoll.visible = b > 0.01;
    SAILS.bundle.scale.set(1, b, b); SAILS.jibRoll.scale.setScalar(b);
    if (want && f > 0 && f < 1 && Math.random() < dt * 6) { const w = new THREE.Vector3(-1.5, SAILS.mainY + 4 * sm, 0); mainG.localToWorld(w); emit(w.x, w.y, w.z, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6); }
  }
  // ---------------- sail style (source: classic / solid / 3 layers + optional small image on the mainsail) ----------------
  const STYLE_KEY = 'sailboat.sail', COLS = ['#fff7ea', '#ffffff', '#ffb21a', '#ff7414', '#ee3427', '#2343a0', '#2cc4a8', '#3b3134'];
  const style = { mode: 'classic', c: ['#ee3427', '#fff7ea', '#2343a0'], img: null };
  try { Object.assign(style, JSON.parse(localStorage.getItem(STYLE_KEY)) || {}); } catch { /* storage blocked */ }
  let styleImg = null;
  const Y0 = Math.min(SAILTEX.main.bb.min.y, SAILTEX.jib.bb.min.y), Y1 = Math.max(SAILTEX.main.bb.max.y, SAILTEX.jib.bb.max.y);
  const fill = (key, x) => {
    const T = SAILTEX[key], bb = T.bb, cy = y => (1 - (y - bb.min.y) / (bb.max.y - bb.min.y)) * 512;
    if (style.mode === 'classic') { x.fillStyle = '#fff7ea'; x.fillRect(0, 0, 256, 512); return; }
    if (style.mode === 'solid') { x.fillStyle = style.c[0]; x.fillRect(0, 0, 256, 512); return; }
    const b1 = Y0 + (Y1 - Y0) / 3, b2 = Y0 + (Y1 - Y0) * 2 / 3;
    x.fillStyle = style.c[2]; x.fillRect(0, 0, 256, 512);
    x.fillStyle = style.c[1]; x.fillRect(0, 0, 256, cy(b1));
    x.fillStyle = style.c[0]; x.fillRect(0, 0, 256, cy(b2));
  };
  const paintSails = () => {
    ['main', 'jib'].forEach(key => { const T = SAILTEX[key], x = T.cv.getContext('2d'); x.imageSmoothingEnabled = false; fill(key, x);
      if (key === 'main' && styleImg) { const SB = T.box, u0 = Math.min(SB.uL, SB.uR), u1 = Math.max(SB.uL, SB.uR), r = styleImg.height / styleImg.width, k = 2 * SB.aspect;
        let w = (u1 - u0) * 256 * 0.7, h = w * r * k; if (h > 512 * 0.22) { h = 512 * 0.22; w = h / (r * k); }
        x.drawImage(styleImg, (u0 + u1) / 2 * 256 - w / 2, (1 - SB.v) * 512 - h / 2, w, h); }
      T.tex.needsUpdate = true; });
    SAILSTYLE.classic = style.mode === 'classic' && !styleImg;
    sailMat.color.set(style.mode === 'classic' ? '#fff7ea' : style.c[style.mode === 'layers' ? 2 : 0]);
    try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)); } catch { /* storage blocked */ }
  };
  const loadImg = src => { if (!src) { styleImg = null; paintSails(); return; } const i = new Image(); i.onload = () => { styleImg = i; paintSails(); }; i.src = src; };
  loadImg(style.img);

  // ---------------- per frame: rig, wheel, prop, nav lights, sails ----------------
  function tick(t, dt, { steer = 0, vel = 0, anchor = 'up', night = 0, amp = 1 } = {}) {
    prop.rotation.x += (1.2 + Math.abs(vel) * 3) * dt * Math.sign(vel || 1);
    wheel.rotation.x = steer * 2.6;
    anemo.rotation.y = t * (5 + amp * 2); radar.rotation.y = Math.sin(t * 0.7) * 0.25;
    mainG.rotation.y = MAIN_A + steer * 0.12 + Math.sin(t * 0.6) * 0.025;
    navFx.forEach(n => { const on = ((t + n.ph) % 1.2) < 0.75 ? 1 : 0.15; n.mat.emissiveIntensity = on * (1 + night); n.halo.material.opacity = (0.45 + 0.4 * night) * on; n.pl.intensity = 3 * on * (1 + 2.5 * night); });
    mat.glass.emissiveIntensity = 0.3 + 1.6 * night;
    stepSails(t, dt, anchor);
  }

  // the parts that never move, merged per material (far fewer draw calls); the moving and furling ones stay as they are
  const KEEP = moving(prop, wheel, anemo, radar, mainG, SAILS);
  mergeStatic(THREE, boat, o => KEEP.has(o)); tidyOutlines(outlines, boat);

  return {
    group: boat, tick, outline, HB, ANC_LIFT, outlines,
    // fitting points used by the game's shared systems (anchor, fishing rod, menu)
    fit: { anchor: { x: 4.7, z: HB(4.7) + 0.3, y0: 1.5 + ANC_LIFT, s: 1.15 }, hawseY: 2.0 + ANC_LIFT, rod: [-4.7, 2.2, -0.95], land: [-3.0, 2.3, 0], menuY: 12.6 },
    style, styleColours: COLS,
    setStyle(next) { Object.assign(style, next); if ('img' in next) loadImg(style.img); else paintSails(); },
  };
}
