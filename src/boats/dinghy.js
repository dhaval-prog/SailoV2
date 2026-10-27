// Dinghy Sailing Boat (daysailer), built in code exactly as in Dinghy_sailing_boat.html: sage-cream hull
// with varnished deck, tall wooden mast, mainsail on a varnished boom, big genoa, transom rudder and
// tiller, mast and deck nav lights, ink outlines, night-aware shading; sails furl at anchor, it heels
// under sail, and the sail colour / image is customisable.

export function buildDinghy(ctx) {
  const { THREE } = ctx;
  const emit = (...a) => ctx.emit(...a);
  // ---------------- source: toon materials with night-aware rim, hull, rig, sails, outlines, nav lights ----------------
  const ramp = new THREE.DataTexture(new Uint8Array([118, 134, 205, 255, 198, 210, 242, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const RIM = { value: 1 }, NIGHTWARM = { value: 0 };
  const rim = s => { s.uniforms.uRim = RIM; s.uniforms.uNightWarm = NIGHTWARM; s.fragmentShader = 'uniform float uRim; uniform float uNightWarm;\n' + s.fragmentShader.replace('#include <opaque_fragment>', 'float rimF = 1.0 - max(dot(normalize(vViewPosition), normalize(normal)), 0.0);\noutgoingLight += vec3(0.62, 0.88, 1.0) * smoothstep(0.62, 0.68, rimF) * 0.45 * uRim;\noutgoingLight *= mix(vec3(1.0), vec3(1.0, 0.74, 0.5) * 0.72, uNightWarm);\n#include <opaque_fragment>'); };
  const M = (name, color, extra = {}) => { const m = Object.assign(new THREE.MeshToonMaterial({ name, color, gradientMap: ramp }), extra); m.onBeforeCompile = rim; return m; };
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
  const boat = new THREE.Group(); boat.name = 'daysailer';
  const Y_UP = new THREE.Vector3(0, 1, 0);
  function add(name, geo, m, x = 0, y = 0, z = 0, parent = boat) {
    const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.position.set(x, y, z);
    mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
  }
  function rod(name, a, b, r, m, parent = boat) {
    const d = new THREE.Vector3().subVectors(b, a), len = d.length();
    const mesh = add(name, new THREE.CylinderGeometry(r, r, len, 8), m, 0, 0, 0, parent);
    mesh.position.copy(a).addScaledVector(d, 0.5);
    mesh.quaternion.setFromUnitVectors(Y_UP, d.normalize());
    return mesh;
  }
  // top-view outline, bow at +x: long overhanging bow, narrow transom
  function outline(s = 1, path = new THREE.Shape()) {
    const L = 4.1 * s, B = 1.12 * s;
    path.moveTo(-L + 0.2 * s, -B * 0.7);
    path.bezierCurveTo(-L * 0.55, -B * 1.02, L * 0.05, -B * 1.02, L * 0.35, -B * 0.9);
    path.bezierCurveTo(L * 0.78, -B * 0.68, L * 0.97, -B * 0.28, L + 0.45 * s, 0);
    path.bezierCurveTo(L * 0.97, B * 0.28, L * 0.78, B * 0.68, L * 0.35, B * 0.9);
    path.bezierCurveTo(L * 0.05, B * 1.02, -L * 0.55, B * 1.02, -L + 0.2 * s, B * 0.7);
    path.bezierCurveTo(-L - 0.04 * s, B * 0.62, -L - 0.04 * s, -B * 0.62, -L + 0.2 * s, -B * 0.7);
    return path;
  }
  const HB = (() => { const pts = outline(1).getPoints(300); return x => { let best = 0; pts.forEach(p => { if (Math.abs(p.x - x) < 0.07) best = Math.max(best, Math.abs(p.y)); }); return best; }; })();
  function prism(name, sh, y0, h, m) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); return add(name, g, m, 0, y0);
  }
  function slab(name, s, y0, h, m, holeS) {
    const sh = outline(s); if (holeS) sh.holes.push(outline(holeS, new THREE.Path()));
    return prism(name, sh, y0, h, m);
  }
  function pad(x0, x1, hw, r = 0.2, path = new THREE.Shape()) {
    path.moveTo(x0 + r, -hw); path.lineTo(x1 - r, -hw); path.quadraticCurveTo(x1, -hw, x1, -hw + r);
    path.lineTo(x1, hw - r); path.quadraticCurveTo(x1, hw, x1 - r, hw); path.lineTo(x0 + r, hw);
    path.quadraticCurveTo(x0, hw, x0, hw - r); path.lineTo(x0, -hw + r); path.quadraticCurveTo(x0, -hw, x0 + r, -hw);
    return path;
  }
  function sailGeo(Lf, Rf, depth, twist, v0 = 0, v1 = 1, off = 0, NU = 18, NV = 28, u0 = 0, u1 = 1) {
    const pos = [], idx = [];
    for (let j = 0; j <= NV; j++) { const v = v0 + (v1 - v0) * j / NV, A = Lf(v), B = Rf(v), ch = A.distanceTo(B);
      for (let i = 0; i <= NU; i++) { const u = u0 + (u1 - u0) * i / NU, p = A.clone().lerp(B, u);
        pos.push(p.x, p.y, -(depth * ch * Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.9) + twist * u * (1 - v) * ch / 4) + off); } }
    for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) { const a = j * (NU + 1) + i, b = a + 1, c = a + NU + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  const sailMat = M('sail_cloth', '#fff7ea', { side: THREE.DoubleSide });
  const inkLine = M('ink_line', '#152042');
  const hullMat = M('hull_sage', '#dfe4c8');
  const varnish = M('varnished_wood', '#c98a45');
  // ---------- hull: sage-cream topsides, varnished deck ----------
  slab('keel', 0.8, 0, 0.3, mat.bottom);
  slab('hull_bottom', 0.92, 0.3, 0.5, mat.bottom);
  slab('boot_stripe', 1.004, 0.79, 0.07, mat.navy);
  slab('hull', 1.0, 0.8, 0.58, hullMat);
  slab('rub_rail', 1.03, 1.3, 0.12, varnish);
  const CK = [-3.05, 0.35, 0.66];
  { const sh = outline(0.985); sh.holes.push(pad(CK[0], CK[1], CK[2], 0.35, new THREE.Path())); prism('deck', sh, 1.42, 0.05, mat.woodLight); }
  prism('cockpit_floor', pad(CK[0], CK[1], CK[2], 0.35), 1.02, 0.4, mat.deck);
  { const sh = pad(CK[0] - 0.08, CK[1] + 0.08, CK[2] + 0.08, 0.42); sh.holes.push(pad(CK[0], CK[1], CK[2], 0.35, new THREE.Path())); prism('cockpit_coaming', sh, 1.47, 0.16, varnish); }
  [-1, 1].forEach(sd => add('cockpit_bench_' + (sd > 0 ? 'p' : 's'), new THREE.BoxGeometry(2.6, 0.08, 0.3), mat.woodLight, -1.35, 1.25, sd * 0.48));
  // deck planking seams
  add('foredeck_hatch', new THREE.BoxGeometry(0.42, 0.06, 0.42), varnish, 2.2, 1.49, 0);
  [[3.6, 0.0], [-3.8, 0.42], [-3.8, -0.42]].forEach(([x, z], i) => { add('cleat_' + i, new THREE.BoxGeometry(0.22, 0.05, 0.06), mat.metal, x, 1.52, z); add('cleat_foot_' + i, new THREE.BoxGeometry(0.08, 0.06, 0.05), mat.metal, x, 1.48, z); });
  [0, 1].forEach(k => add('rope_coil_0_' + k, new THREE.TorusGeometry(0.2 - k * 0.065, 0.038, 10, 32), mat.rope, 2.75, 1.5 + k * 0.05, 0.42).rotation.x = Math.PI / 2);
  // fin keel + bulb (underwater)
  add('keel_fin', new THREE.BoxGeometry(1.0, 1.5, 0.12), mat.bottom, 0.3, -0.7, 0);
  add('keel_bulb', new THREE.CapsuleGeometry(0.2, 1.0, 8, 24), mat.rubber, 0.2, -1.45, 0).rotation.z = Math.PI / 2;
  // transom-hung rudder + tiller (pivots with steering)
  const rudderG = new THREE.Group(); rudderG.name = 'rudder_tiller'; rudderG.position.set(-4.12, 1.25, 0); boat.add(rudderG);
  add('rudder_blade', new THREE.BoxGeometry(0.5, 1.75, 0.07), varnish, -0.18, -0.82, 0, rudderG);
  add('rudder_head', new THREE.BoxGeometry(0.22, 0.3, 0.12), mat.wood, 0, 0.22, 0, rudderG);
  const tiller = rod('tiller', new THREE.Vector3(0, 0.32, 0), new THREE.Vector3(1.35, 0.42, 0), 0.04, varnish, rudderG);
  const tillerTip = new THREE.Object3D(); tillerTip.position.set(1.35, 0.42, 0); rudderG.add(tillerTip);
  add('tiller_grip', new THREE.SphereGeometry(0.055, 12, 8), mat.rubber, 1.35, 0.42, 0, rudderG);
  // nav lights on the foredeck
  const NAVP = [3.0, 1.62, HB(3.0) - 0.08];
  [[-1, mat.navRed, 'port'], [1, mat.navGreen, 'starboard']].forEach(([sd, m, tag]) => {
    add('nav_box_' + tag, new THREE.BoxGeometry(0.18, 0.12, 0.08), mat.navy, NAVP[0], NAVP[1] - 0.09, sd * NAVP[2]);
    add('nav_lamp_' + tag, new THREE.SphereGeometry(0.065, 20, 14), m, NAVP[0], NAVP[1], sd * NAVP[2]);
  });
  // ---------- tall wooden mast + rig ----------
  const MX = 1.15, MTOP = 12.8;
  const tower = new THREE.Group(); tower.name = 'mast_rig'; boat.add(tower);
  add('mast', new THREE.CylinderGeometry(0.07, 0.11, MTOP - 1.47, 24), mat.woodLight, MX, (MTOP + 1.47) / 2, 0, tower);
  add('mast_collar', new THREE.CylinderGeometry(0.15, 0.17, 0.1, 24), mat.metal, MX, 1.52, 0, tower);
  add('spreaders', new THREE.BoxGeometry(0.05, 0.05, 1.3), mat.metal, MX, 7.2, 0, tower);
  add('masthead', new THREE.BoxGeometry(0.22, 0.08, 0.1), mat.metal, MX - 0.04, MTOP + 0.03, 0, tower);
  const mastRed = M('mast_light_red', '#ff2a1f', { emissive: new THREE.Color('#ff2a1f'), emissiveIntensity: 1 }), mastGreen = M('mast_light_green', '#1fff6a', { emissive: new THREE.Color('#1fff6a'), emissiveIntensity: 1 });
  const MLP = [MX + 0.08, MTOP + 0.2, 0.16];
  add('mast_light_base', new THREE.BoxGeometry(0.16, 0.1, 0.46), mat.navy, MLP[0], MLP[1] - 0.13, 0, tower);
  [[-1, mastRed, 'port'], [1, mastGreen, 'starboard']].forEach(([sd, m, tag]) => add('mast_lamp_' + tag, new THREE.SphereGeometry(0.11, 20, 14), m, MLP[0], MLP[1], sd * MLP[2], tower));
  const anemo = new THREE.Group(); anemo.name = 'masthead_dummy';
  const radar = new THREE.Group(); radar.name = 'windex'; radar.position.set(MX - 0.1, MTOP + 0.08, 0); tower.add(radar);
  add('windex_arm', new THREE.BoxGeometry(0.45, 0.02, 0.02), mat.metal, -0.22, 0, 0, radar);
  { const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(0.4, 0.05); tri.lineTo(0, 0.26); add('burgee', new THREE.ShapeGeometry(tri), flagCols[4], -0.45, 0.02, 0, radar); }
  const stay = (n, a, b) => rod(n, a, b, 0.013, mat.metal, tower);
  stay('forestay', new THREE.Vector3(MX + 0.04, 10.6, 0), new THREE.Vector3(4.45, 1.52, 0));
  stay('backstay', new THREE.Vector3(MX - 0.06, MTOP, 0), new THREE.Vector3(-4.0, 1.5, 0));
  [-1, 1].forEach(sd => { const sn = sd > 0 ? 'p' : 's', cp = new THREE.Vector3(MX - 0.15, 1.45, sd * (HB(MX) - 0.06)), sp = new THREE.Vector3(MX, 7.2, sd * 0.65);
    stay('shroud_' + sn + '_low', cp, sp); stay('shroud_' + sn + '_up', sp, new THREE.Vector3(MX, 10.5, sd * 0.07));
    stay('shroud_' + sn + '_lower', new THREE.Vector3(MX - 0.7, 1.45, sd * (HB(MX - 0.7) - 0.06)), new THREE.Vector3(MX, 7.1, sd * 0.07)); });
  // mainsail on a varnished boom (swings with steering)
  const MAIN_A = -0.32;
  const mainG = new THREE.Group(); mainG.name = 'mainsail_rig'; mainG.position.set(MX, 0, 0); mainG.rotation.y = MAIN_A; tower.add(mainG);
  add('boom', new THREE.CylinderGeometry(0.06, 0.06, 4.7, 16), varnish, -2.35, 2.2, 0, mainG).rotation.z = Math.PI / 2;
  add('gooseneck', new THREE.BoxGeometry(0.14, 0.1, 0.12), mat.metal, -0.02, 2.2, 0, mainG);
  const mHead = new THREE.Vector2(0.06, 12.4), mClew = new THREE.Vector2(-4.55, 2.27);
  const mLuff = v => new THREE.Vector2(0.1, 2.27 + (12.4 - 2.27) * v);
  const mLeech = v => { const p = mClew.clone().lerp(mHead, v), d = mHead.clone().sub(mClew).normalize(); return p.add(new THREE.Vector2(-d.y, d.x).multiplyScalar(0.5 * Math.sin(Math.PI * v) * (1 - 0.3 * v))); };
  let SAILBOX = null;
  const mainCanvas = document.createElement('canvas'); mainCanvas.width = 256; mainCanvas.height = 512;
  const mainTex = new THREE.CanvasTexture(mainCanvas); mainTex.colorSpace = THREE.SRGBColorSpace; mainTex.magFilter = THREE.NearestFilter; mainTex.minFilter = THREE.LinearFilter;
  const mainMat = M('mainsail_cloth', '#ffffff', { side: THREE.DoubleSide, map: mainTex });
  { const g = sailGeo(mLuff, mLeech, 0.09, 0.55); g.computeBoundingBox(); const bb = g.boundingBox, p = g.attributes.position, uv = [];
    for (let i = 0; i < p.count; i++) uv.push((p.getX(i) - bb.min.x) / (bb.max.x - bb.min.x), (p.getY(i) - bb.min.y) / (bb.max.y - bb.min.y));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); add('mainsail', g, mainMat, 0, 0, 0, mainG);
    const vv = 0.38, A = mLuff(vv), B = mLeech(vv), W = bb.max.x - bb.min.x, H = bb.max.y - bb.min.y;
    SAILBOX = { uL: (A.x - bb.min.x) / W, uR: (B.x - bb.min.x) / W, v: ((A.y + B.y) / 2 - bb.min.y) / H, aspect: W / H }; }
  [0.22, 0.42, 0.62, 0.8].forEach((v, i) => { const a = mLeech(v), b = mLuff(v).lerp(a, 0.78); rod('batten_' + i, new THREE.Vector3(b.x, b.y, -0.02), new THREE.Vector3(a.x, a.y, -0.01), 0.016, inkLine, mainG); });
  [0.12, 0.3, 0.5, 0.7, 0.88].forEach((v, i) => [0.012, -0.012].forEach((o, k) => add('mainsail_seam_' + i + (k ? 'b' : 'a'), sailGeo(mLuff, mLeech, 0.09, 0.55, v, v + 0.004, o, 18, 1), mat.metal, 0, 0, 0, mainG)));
  // big overlapping genoa on the forestay
  const jT = new THREE.Vector2(4.35, 1.68), jH = new THREE.Vector2(MX + 0.1, 10.3), jC = new THREE.Vector2(-1.05, 1.95);
  const jLuff = v => jT.clone().lerp(jH, v), jLeech = v => { const p = jC.clone().lerp(jH, v), d = jH.clone().sub(jC).normalize(); return p.add(new THREE.Vector2(d.y, -d.x).multiplyScalar(-0.2 * Math.sin(Math.PI * v))); };
  add('jib', sailGeo(jLuff, jLeech, 0.11, 0.95), sailMat, 0, 0, 0, tower);
  [0.15, 0.35, 0.55, 0.75].forEach((v, i) => [0.012, -0.012].forEach((o, k) => add('jib_uv_strip' + i + (k ? 'b' : 'a'), sailGeo(jLuff, jLeech, 0.11, 0.95, v, v + 0.004, o, 18, 1), mat.metal, 0, 0, 0, tower)));
  rod('jib_sheet', new THREE.Vector3(jC.x, jC.y, -(0.95 * jC.distanceTo(jT) / 4)), new THREE.Vector3(-1.9, 1.62, -0.78), 0.013, mat.rope, tower);
  // mainsheet: boom end down to a block on the cockpit floor
  const boomEnd = new THREE.Object3D(); boomEnd.position.set(-4.3, 2.18, 0); mainG.add(boomEnd);
  const wheel = new THREE.Group(), prop = new THREE.Group(), ring = new THREE.Group();
  let ANC_LIFT = 0, SHEET_LIFT = 0;
  // sheer rising to the long bow overhang (baked)
  {
    const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const lift = x => 0.38 * Math.pow(sm((x - 0.6) / 4.0), 1.6) + 0.12 * Math.pow(sm((-x - 2.6) / 1.6), 1.5);
    const rake = x => 0.7 * Math.pow(sm((x - 1.6) / 3.0), 1.3) + 0.35 * Math.pow(sm((-x - 2.4) / 1.8), 1.3);
    boat.updateMatrixWorld(true);
    const inv = new THREE.Matrix4(), v = new THREE.Vector3();
    const skip = new Set(); rudderG.traverse(o => skip.add(o));
    boat.traverse(o => {
      if (!o.isMesh || skip.has(o)) return;
      o.geometry = o.geometry.clone();
      const pos = o.geometry.attributes.position; inv.copy(o.matrixWorld).invert();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
        const y0 = v.y;
        v.y += lift(v.x) * Math.min(1, Math.max(0, y0 / 1.45));
        if (y0 < 0.8 && y0 > -0.05) v.y += rake(v.x) * (1 - y0 / 0.8);
        v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true; o.geometry.computeVertexNormals();
    });
    ANC_LIFT = lift(3.6);
    rudderG.position.y += lift(-4.12); SHEET_LIFT = lift(-3.3);
  }
  const tmpA = new THREE.Vector3(), tmpB = new THREE.Vector3();
  const sheetBlock = new THREE.Vector3(-3.3, 1.5 + SHEET_LIFT, 0);
  const sheetLine = add('mainsheet', new THREE.CylinderGeometry(0.014, 0.014, 1, 8), mat.rope);
  add('mainsheet_block', new THREE.SphereGeometry(0.07, 12, 8), mat.metal, sheetBlock.x, sheetBlock.y, sheetBlock.z);
  function stepSkipper(t, dt, steerS) {
    rudderG.rotation.y = -steerS * 0.5;
    boat.updateMatrixWorld(true);
    const e = boat.worldToLocal(boomEnd.getWorldPosition(tmpB)), dv = e.clone().sub(sheetBlock), l = dv.length();
    sheetLine.position.copy(sheetBlock).addScaledVector(dv, 0.5); sheetLine.scale.set(1, l, 1); sheetLine.quaternion.setFromUnitVectors(Y_UP, dv.multiplyScalar(1 / l));
  }
  // ink outlines: thick on silhouette parts, thin on details
  const inkMat = w => { const m = new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#152042', side: THREE.BackSide }); m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + w.toFixed(3) + ';'); }; return m; };
  const inkThick = inkMat(0.055), inkThin = inkMat(0.016);
  const bold = /^(keel$|hull$|hull_bottom|rub_rail|cockpit_coaming|mast$|boom$)/;
  const outlines = [], meshes = [];
  boat.traverse(o => o.isMesh && meshes.push(o));
  meshes.forEach(o => { if (/^(pennant|flag_line|nav_lamp|mainsail|jib|batten|burgee|forestay|backstay|shroud|mainsheet|jib_sheet|windex)/.test(o.name)) return; const l = new THREE.Mesh(o.geometry, bold.test(o.name) ? inkThick : inkThin); l.name = o.name + '_outline'; l.castShadow = false; o.add(l); outlines.push(l); });
  const navFx = [];
  [['port', '#ff2a1f', -1], ['starboard', '#1fff6a', 1]].forEach(([tag, c, sd]) => {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(NAVP[0], NAVP[1], sd * NAVP[2]); boat.add(halo); outlines.push(halo);
    const pl = new THREE.PointLight(c, 3, 2.5, 2); pl.position.copy(halo.position); boat.add(pl); outlines.push(pl);
    navFx.push({ halo, pl, mat: tag === 'port' ? mat.navRed : mat.navGreen, ph: sd > 0 ? 0.5 : 0 });
    const mh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    mh.position.set(MLP[0], MLP[1], sd * MLP[2]); boat.add(mh); outlines.push(mh);
    const mpl = new THREE.PointLight(c, 3, 2.0, 2); mpl.position.copy(mh.position); boat.add(mpl); outlines.push(mpl);
    navFx.push({ halo: mh, pl: mpl, mat: tag === 'port' ? mastRed : mastGreen, ph: sd > 0 ? 0.6 : 0 });
  });
  // ---------------- source: sails lower and furl while anchored ----------------
  // sails lower while anchored
  const SAILS = { f: 0, main: [], jib: [], sheet: null };
  {
    const bb = new THREE.Box3();
    mainG.children.forEach(o => { if (/^(mainsail|batten)/.test(o.name)) SAILS.main.push(o); });
    tower.children.forEach(o => { if (/^jib(_uv_strip|$)/.test(o.name)) SAILS.jib.push(o); if (o.name === 'jib_sheet') SAILS.sheet = o; });
    const mainBody = SAILS.main.find(o => o.name === 'mainsail'), jibBody = SAILS.jib.find(o => o.name === 'jib');
    mainBody.geometry.computeBoundingBox(); jibBody.geometry.computeBoundingBox();
    SAILS.mainY = mainBody.geometry.boundingBox.min.y + 0.02;
    SAILS.jibX = jibBody.geometry.boundingBox.max.x; SAILS.jibY = jibBody.geometry.boundingBox.min.y;
    const g = new THREE.CapsuleGeometry(0.16, 3.4, 6, 20); g.rotateZ(Math.PI / 2);
    SAILS.bundle = add('mainsail_furled', g, sailMat, -2.35, SAILS.mainY + 0.1, 0, mainG); SAILS.bundle.visible = false;
    [-1.2, -2.2, -3.2].forEach((x, i) => add('sail_tie_' + i, new THREE.TorusGeometry(0.17, 0.025, 6, 20), mat.red, x + 2.1, 0, 0, SAILS.bundle).rotation.y = Math.PI / 2);
    const jr = new THREE.CapsuleGeometry(0.08, 0.8, 6, 16); jr.rotateZ(-0.95);
    SAILS.jibRoll = add('jib_furled', jr, sailMat, SAILS.jibX - 0.4, SAILS.jibY + 0.38, 0, tower); SAILS.jibRoll.visible = false;
  }
  function stepSails(t, dt, anchor, steerS) {
    const want = anchor === 'dropping' || anchor === 'down' ? 1 : 0;
    const rate = want ? dt / 1.3 : dt / 1.8;
    SAILS.f = want ? Math.min(1, SAILS.f + rate) : Math.max(0, SAILS.f - rate);
    const f = SAILS.f, ease = f * f * (3 - 2 * f);
    const sm = Math.max(0.02, 1 - ease), sj = Math.max(0.02, 1 - Math.min(1, ease * 1.15));
    const flutter = Math.sin(t * 24) * 0.04 * Math.sin(Math.PI * f);
    SAILS.main.forEach(o => { o.visible = sm > 0.03; o.scale.set(1, sm, 1 + flutter); o.position.y = SAILS.mainY * (1 - sm); });
    SAILS.jib.forEach(o => { o.visible = sj > 0.03; o.scale.set(sj, sj, 1 + flutter * 1.5); o.position.x = SAILS.jibX * (1 - sj); o.position.y = SAILS.jibY * (1 - sj); });
    if (SAILS.sheet) SAILS.sheet.visible = sj > 0.6;
    const b = Math.max(0, (ease - 0.55) / 0.45);
    SAILS.bundle.visible = SAILS.jibRoll.visible = b > 0.01;
    SAILS.bundle.scale.set(1, b, b); SAILS.jibRoll.scale.setScalar(b);
    stepSkipper(t, dt, steerS);
    if (want && f > 0 && f < 1 && Math.random() < dt * 6) { const w = new THREE.Vector3(-1.5, SAILS.mainY + 4 * sm, 0); mainG.localToWorld(w); emit(w.x, w.y, w.z, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6); }
  }
  // ---------------- source: sail cloth colour + low-res image ----------------
  const SAIL_KEY = 'daysailer.sail', SAIL_COLS = ['#fff7ea', '#ffffff', '#ffb21a', '#ee3427', '#2343a0', '#2cc4a8', '#3b3134'];
  const sailS = { c: SAIL_COLS[0], img: null };
  try { Object.assign(sailS, JSON.parse(localStorage.getItem(SAIL_KEY)) || {}); } catch { /* storage blocked */ }
  let simg = null;
  const paintSail = () => { const x = mainCanvas.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = sailS.c; x.fillRect(0, 0, 256, 512);
    if (simg) { const SB = SAILBOX, u0 = Math.min(SB.uL, SB.uR), u1 = Math.max(SB.uL, SB.uR), r = simg.height / simg.width, k = 2 * SB.aspect;
      let w = (u1 - u0) * 256 * 0.7, h = w * r * k; if (h > 512 * 0.22) { h = 512 * 0.22; w = h / (r * k); }
      x.drawImage(simg, (u0 + u1) / 2 * 256 - w / 2, (1 - SB.v) * 512 - h / 2, w, h); }
    mainTex.needsUpdate = true; sailMat.color.set(sailS.c);
    try { localStorage.setItem(SAIL_KEY, JSON.stringify(sailS)); } catch { /* storage blocked */ } };
  const loadSailImg = src => { if (!src) { simg = null; paintSail(); return; } const i = new Image(); i.onload = () => { simg = i; paintSail(); }; i.src = src; };
  loadSailImg(sailS.img);

  // ---------------- per frame ----------------
  let heel = 0;
  function tick(t, dt, { steer = 0, vel = 0, anchor = 'up', night = 0, amp = 1, maxV = 6 } = {}) {
    navFx.forEach(n => { const on = ((t + n.ph) % 1.2) < 0.75 ? 1 : 0.15; n.mat.emissiveIntensity = on * (1 + night); n.halo.material.opacity = (0.45 + 0.4 * night) * on; n.pl.intensity = 1.6 * on * (1 + 0.5 * night); });
    radar.rotation.y = Math.sin(t * 0.7) * 0.25; mainG.rotation.y = MAIN_A + steer * 0.12 + Math.sin(t * 0.6) * 0.025;
    RIM.value = 1 - night; NIGHTWARM.value = night;
    stepSails(t, dt, anchor, steer);
    // heels a little under sail (source), less as the sails come down
    const want = -(0.1 + 0.22 * Math.abs(vel / maxV)) * (1 - SAILS.f); heel += (want - heel) * Math.min(1, dt * 3); boat.rotation.x = heel;
  }

  return {
    group: boat, tick, outline, HB, ANC_LIFT, outlines,
    fit: { anchor: { x: 3.6, z: HB(3.6) + 0.3, y0: 1.25 + ANC_LIFT, s: 1.05 }, hawseY: 1.7 + ANC_LIFT, rod: [-3.7, 1.75, -0.6], land: [-1.8, 1.6, 0], menuY: 13.4 },
    sail: sailS, sailColours: SAIL_COLS,
    setSail(next) { Object.assign(sailS, next); if ('img' in next) loadSailImg(sailS.img); else paintSail(); },
  };
}
