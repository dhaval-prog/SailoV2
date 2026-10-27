// Motor Yacht, built in code exactly as in Motor_Yacht.html (hull with window ports, saloon, flybridge,
// hardtop, radar arch, dressing line, nav lights, ink outlines) with its own night shading
// (rim light fades out and colours warm at night) and the optional custom flag on the arch.

export function buildMotorYacht(ctx) {
  const { THREE } = ctx;
  // ---------------- source: toon materials with night-aware rim, hull, decks, arch, outlines, nav lights ----------------
  const ramp = new THREE.DataTexture(new Uint8Array([118, 134, 205, 255, 198, 210, 242, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const RIM = { value: 1 }, NIGHTWARM = { value: 0 };
  const rim = s => { s.uniforms.uRim = RIM; s.uniforms.uNightWarm = NIGHTWARM; s.fragmentShader = 'uniform float uRim; uniform float uNightWarm;\n' + s.fragmentShader.replace('#include <opaque_fragment>', 'float rimF = 1.0 - max(dot(normalize(vViewPosition), normalize(normal)), 0.0);\noutgoingLight += vec3(0.62, 0.88, 1.0) * smoothstep(0.62, 0.68, rimF) * 0.45 * uRim;\noutgoingLight *= mix(vec3(1.0), vec3(1.0, 0.88, 0.76) * 0.74, uNightWarm);\n#include <opaque_fragment>'); };
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
  const boat = new THREE.Group(); boat.name = 'motor_yacht';
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
  // top-view hull outline, bow at +x: long fine entry, wide square transom
  function outline(s = 1, path = new THREE.Shape()) {
    const L = 6.0 * s, B = 1.85 * s;
    path.moveTo(-L + 0.35 * s, -B);
    path.lineTo(L * 0.05, -B);
    path.bezierCurveTo(L * 0.62, -B, L * 0.95, -B * 0.4, L + 0.55 * s, 0);
    path.bezierCurveTo(L * 0.95, B * 0.4, L * 0.62, B, L * 0.05, B);
    path.lineTo(-L + 0.35 * s, B);
    path.bezierCurveTo(-L - 0.02 * s, B, -L - 0.02 * s, -B, -L + 0.35 * s, -B);
    return path;
  }
  const HB = (() => { const pts = outline(1).getPoints(300); return x => { let best = 0; pts.forEach(p => { if (Math.abs(p.x - x) < 0.08) best = Math.max(best, Math.abs(p.y)); }); return best; }; })();
  function prism(name, sh, y0, h, m, bevel = 0) {
    const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 2, curveSegments: 24 });
    g.rotateX(-Math.PI / 2); if (bevel) g.translate(0, bevel, 0); return add(name, g, m, 0, y0);
  }
  function slab(name, s, y0, h, m, holeS) {
    const sh = outline(s); if (holeS) sh.holes.push(outline(holeS, new THREE.Path()));
    return prism(name, sh, y0, h, m);
  }
  // side-profile extrusion (x,y polygon pushed across the beam) — gives the raked yacht silhouette
  function side(name, pts, hw, m, bevel = 0.06, parent = boat) {
    const sh = new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2 * hw, bevelEnabled: bevel > 0, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 16 });
    g.translate(0, 0, -hw); return add(name, g, m, 0, 0, 0, parent);
  }
  // rounded top-view footprint (for roofs / cushions)
  function pad(x0, x1, hw, r = 0.3, path = new THREE.Shape()) {
    path.moveTo(x0 + r, -hw); path.lineTo(x1 - r, -hw); path.quadraticCurveTo(x1, -hw, x1, -hw + r);
    path.lineTo(x1, hw - r); path.quadraticCurveTo(x1, hw, x1 - r, hw); path.lineTo(x0 + r, hw);
    path.quadraticCurveTo(x0, hw, x0, hw - r); path.lineTo(x0, -hw + r); path.quadraticCurveTo(x0, -hw, x0 + r, -hw);
    return path;
  }
  // ---------- hull ----------
  slab('keel', 0.84, 0, 0.35, mat.bottom);
  slab('hull_bottom', 0.94, 0.35, 0.5, mat.bottom);
  slab('hull', 1.0, 0.85, 0.85, mat.yellow);
  slab('hull_pinstripe', 1.006, 1.12, 0.06, mat.orange);
  slab('fender_rub', 1.03, 1.5, 0.16, mat.rubber);
  slab('deck', 0.965, 1.7, 0.04, mat.deck);
  slab('bulwark', 1.0, 1.7, 0.16, mat.yellow, 0.965);
  slab('bulwark_cap', 1.008, 1.86, 0.05, mat.white, 0.96);
  // hull-side cabin windows (long glass ports)
  [[-2.2, 0.9], [-0.9, 0.9], [0.4, 0.9]].forEach(([x, w], i) => [-1, 1].forEach(sd => {
    const m = add('hull_port_' + i + (sd > 0 ? '_p' : '_s'), new THREE.CapsuleGeometry(0.09, w, 6, 16), mat.glass, x, 1.3, sd * (HB(x) + 0.004));
    m.rotation.z = Math.PI / 2; m.scale.set(1, 1, 0.12);
  }));
  // swim platform, ladder, rudder, wooden propeller
  add('swim_platform', new THREE.BoxGeometry(0.9, 0.12, 3.3), mat.wood, -6.05, 1.02, 0);
  for (let i = 0; i < 6; i++) add('swim_platform_slat_' + i, new THREE.BoxGeometry(0.92, 0.02, 0.04), mat.woodLight, -6.05, 1.09, -1.35 + i * 0.54);
  for (let k = 0; k < 3; k++) add('swim_ladder_' + k, new THREE.BoxGeometry(0.06, 0.04, 0.45), mat.metal, -6.46, 0.88 - k * 0.22, 0.9);
  add('rudder', new THREE.BoxGeometry(0.55, 0.8, 0.07), mat.bottom, -5.1, 0.25, 0);
  add('prop_shaft', new THREE.CylinderGeometry(0.05, 0.05, 1.0, 12), mat.metal, -5.25, 0.6, 0).rotation.z = Math.PI / 2;
  const prop = new THREE.Group(); prop.name = 'wooden_propeller'; prop.position.set(-5.78, 0.6, 0); boat.add(prop);
  add('prop_hub', new THREE.CylinderGeometry(0.11, 0.14, 0.22, 24), mat.wood, 0, 0, 0, prop).rotation.z = Math.PI / 2;
  add('prop_cone', new THREE.ConeGeometry(0.11, 0.2, 24), mat.wood, -0.2, 0, 0, prop).rotation.z = Math.PI / 2;
  for (let i = 0; i < 3; i++) { const arm = new THREE.Group(); arm.rotation.x = i * Math.PI * 2 / 3; prop.add(arm); const bl = add('prop_blade_' + i, new THREE.CapsuleGeometry(0.09, 0.32, 6, 16), mat.woodLight, 0, 0.3, 0, arm); bl.scale.set(0.35, 1, 1.25); bl.rotation.y = 0.5; }
  // hanging fenders
  [-4.2, -2.6, -1.0].forEach((x, i) => [-1, 1].forEach(sd => {
    const tag = i + '_' + (sd > 0 ? 'p' : 's'), z = sd * (HB(x) + 0.15);
    add('fender_' + tag, new THREE.CapsuleGeometry(0.14, 0.4, 8, 24), mat.rubber, x, 1.18, z);
    rod('fender_rope_' + tag, new THREE.Vector3(x, 1.58, z), new THREE.Vector3(x, 1.89, sd * (HB(x) - 0.05)), 0.015, mat.rope);
  }));
  // guard rails from mid-ship to a bow pulpit
  const railXs = [-0.2, 0.7, 1.6, 2.5, 3.3, 4.0, 4.6, 5.1, 5.5];
  [-1, 1].forEach(sd => {
    const sn = sd > 0 ? 'p' : 's';
    const tops = railXs.map((x, i) => { const z = sd * (HB(x) - 0.07); add('stanchion_' + sn + '_' + i, new THREE.CylinderGeometry(0.02, 0.02, 0.55, 6), mat.metal, x, 2.15, z); return new THREE.Vector3(x, 2.42, z); });
    tops.push(new THREE.Vector3(6.05, 2.32, 0));
    for (let i = 0; i < tops.length - 1; i++) rod('rail_' + sn + '_' + i, tops[i], tops[i + 1], 0.022, mat.metal);
  });
  add('pulpit_post', new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), mat.metal, 6.05, 2.07, 0);
  // ---------- main-deck saloon: long, low, raked windscreen ----------
  const SHW = 1.38;
  side('saloon', [[-2.9, 1.72], [-2.9, 2.9], [0.7, 2.9], [2.9, 1.72]], SHW, mat.white);
  side('saloon_windows', [[-2.6, 2.2], [-2.6, 2.68], [0.55, 2.68], [1.75, 2.2]], SHW + 0.075, mat.glass, 0);
  { // windscreen glass on the raked face
    const a = new THREE.Vector2(0.7, 2.9), b = new THREE.Vector2(2.9, 1.72), d = b.clone().sub(a), n = new THREE.Vector2(-d.y, d.x).normalize().multiplyScalar(-1);
    const p = u => a.clone().addScaledVector(d, u).addScaledVector(n, 0.075);
    const q = u => a.clone().addScaledVector(d, u).addScaledVector(n, 0.1);
    side('windscreen', [p(0.08), p(0.62), q(0.62), q(0.08)].map(v => [v.x, v.y]), SHW - 0.18, mat.glass, 0);
  }
  [-1.5, -0.4].forEach((x, i) => [-1, 1].forEach(sd => add('saloon_mullion_' + i + (sd > 0 ? '_p' : '_s'), new THREE.BoxGeometry(0.1, 0.5, 0.02), mat.white, x, 2.44, sd * (SHW + 0.085))));
  add('saloon_door', new THREE.BoxGeometry(0.02, 0.95, 0.8), mat.glass, -2.97, 2.25, 0);
  add('saloon_door_frame', new THREE.BoxGeometry(0.03, 1.05, 0.1), mat.navy, -2.97, 2.25, 0);
  // ---------- flybridge ----------
  const FHW = 1.2;
  side('flybridge', [[-2.3, 2.96], [-2.3, 3.5], [0.2, 3.5], [1.4, 2.96]], FHW, mat.white);
  prism('flybridge_deck', pad(-2.15, 0.15, FHW - 0.12, 0.25), 3.56, 0.03, mat.deck);
  side('flybridge_screen', [[0.25, 3.5], [0.45, 3.5], [0.85, 3.86], [0.68, 3.88]], FHW - 0.2, mat.glass, 0);
  add('helm_console', new THREE.BoxGeometry(0.5, 0.5, 1.4), mat.white, 0.05, 3.8, 0);
  add('helm_pedestal', new THREE.BoxGeometry(0.22, 0.55, 0.3), mat.wood, -0.3, 3.86, 0);
  const wheel = new THREE.Group(); wheel.name = 'ships_wheel'; wheel.position.set(-0.46, 4.08, 0); boat.add(wheel);
  add('wheel_rim', new THREE.TorusGeometry(0.26, 0.03, 12, 48), mat.woodLight, 0, 0, 0, wheel).rotation.y = Math.PI / 2;
  add('wheel_hub', new THREE.CylinderGeometry(0.07, 0.07, 0.1, 20), mat.wood, 0, 0, 0, wheel).rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) add('wheel_spoke_' + i, new THREE.CylinderGeometry(0.018, 0.018, 0.72, 8), mat.woodLight, 0, 0, 0, wheel).rotation.x = i * Math.PI / 4;
  for (let i = 0; i < 8; i++) { const an = i * Math.PI / 4; add('wheel_handle_' + i, new THREE.CapsuleGeometry(0.026, 0.06, 4, 10), mat.wood, 0, Math.cos(an) * 0.37, Math.sin(an) * 0.37, wheel).rotation.x = -an; }
  add('helm_seat', new THREE.BoxGeometry(0.45, 0.28, 1.3), mat.orange, -0.95, 3.73, 0);
  add('helm_seat_back', new THREE.BoxGeometry(0.12, 0.42, 1.3), mat.orange, -1.2, 3.98, 0);
  prism('fly_lounge', pad(-2.1, -1.55, 1.0, 0.18), 3.59, 0.24, mat.orange);
  // hardtop on slim posts
  [[-1.45, 1.0], [-1.45, -1.0], [0.0, 0.95], [0.0, -0.95]].forEach(([x, z], i) => add('hardtop_post_' + i, new THREE.CylinderGeometry(0.03, 0.03, 0.95, 8), mat.metal, x, 4.05, z));
  prism('hardtop', pad(-1.7, 0.45, 1.12, 0.45), 4.52, 0.09, mat.navy, 0.03);
  // nav lights on the flybridge sides
  const NAVP = [0.9, 3.22, FHW + 0.07];
  [[-1, mat.navRed, 'port'], [1, mat.navGreen, 'starboard']].forEach(([sd, m, tag]) => {
    add('nav_box_' + tag, new THREE.BoxGeometry(0.3, 0.16, 0.1), mat.navy, NAVP[0], NAVP[1], sd * (NAVP[2] - 0.03));
    add('nav_lamp_' + tag, new THREE.SphereGeometry(0.08, 20, 14), m, NAVP[0], NAVP[1] + 0.1, sd * NAVP[2]);
  });
  // ---------- radar arch (navy, red band) with radar, anemometer, whips ----------
  const tower = new THREE.Group(); tower.name = 'radar_arch'; boat.add(tower);
  [-1, 1].forEach(sd => {
    const leg = side('arch_leg_' + (sd > 0 ? 'p' : 's'), [[-2.25, 3.5], [-1.85, 3.5], [-2.15, 4.95], [-2.45, 4.95]], 0.07, mat.navy, 0.03, tower);
    leg.position.z = sd * 1.0;
  });
  add('arch_top', new THREE.BoxGeometry(0.4, 0.14, 2.2), mat.navy, -2.3, 5.0, 0, tower);
  add('arch_band', new THREE.BoxGeometry(0.42, 0.06, 2.22), mat.red, -2.3, 4.88, 0, tower);
  add('radar_dome', new THREE.SphereGeometry(0.3, 32, 16), mat.white, -2.25, 5.2, 0.45, tower).scale.set(1, 0.55, 1);
  add('radar_pedestal', new THREE.CylinderGeometry(0.08, 0.1, 0.16, 16), mat.metal, -2.25, 5.14, -0.4, tower);
  const radar = new THREE.Group(); radar.name = 'radar_array'; radar.position.set(-2.25, 5.25, -0.4); tower.add(radar);
  add('radar_bar', new THREE.BoxGeometry(0.9, 0.08, 0.12), mat.white, 0, 0, 0, radar);
  add('anemo_mast', new THREE.CylinderGeometry(0.02, 0.02, 0.5, 8), mat.metal, -2.3, 5.3, 0, tower);
  const anemo = new THREE.Group(); anemo.name = 'anemometer'; anemo.position.set(-2.3, 5.55, 0); tower.add(anemo);
  add('anemometer_bar', new THREE.BoxGeometry(0.4, 0.025, 0.025), mat.metal, 0, 0, 0, anemo);
  add('anemometer_bar_2', new THREE.BoxGeometry(0.025, 0.025, 0.4), mat.metal, 0, 0, 0, anemo);
  [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]].forEach(([x, z], i) => add('anemometer_cup_' + i, new THREE.SphereGeometry(0.055, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.metal, x, -0.025, z, anemo));
  [-1, 1].forEach(sd => rod('whip_antenna_' + (sd > 0 ? 'p' : 's'), new THREE.Vector3(-2.35, 5.05, sd * 1.0), new THREE.Vector3(-2.75, 6.3, sd * 1.05), 0.016, mat.white, tower));
  add('mast_light', new THREE.SphereGeometry(0.06, 12, 8), mat.white, -2.3, 5.85, 0, tower);
  // ---------- foredeck ----------
  prism('sunpad_base', pad(3.0, 4.55, 0.95, 0.3), 1.72, 0.16, mat.white);
  prism('sunpad', pad(3.05, 4.5, 0.9, 0.28), 1.88, 0.14, mat.orange);
  [-0.45, 0.45].forEach((z, i) => add('sunpad_pillow_' + i, new THREE.CapsuleGeometry(0.1, 0.5, 6, 16), mat.white, 3.25, 2.1, z).rotation.x = Math.PI / 2);
  add('windlass', new THREE.CylinderGeometry(0.15, 0.15, 0.36, 24), mat.metal, 5.2, 1.84, 0).rotation.x = Math.PI / 2;
  add('foredeck_hatch', new THREE.BoxGeometry(0.55, 0.06, 0.55), mat.glass, 2.6, 1.76, 0);
  [[4.9, 0.6], [4.9, -0.6], [-5.3, 1.45], [-5.3, -1.45]].forEach(([x, z], i) => { add('cleat_' + i, new THREE.BoxGeometry(0.26, 0.05, 0.07), mat.metal, x, 1.94, z); add('cleat_foot_' + i, new THREE.BoxGeometry(0.1, 0.07, 0.06), mat.metal, x, 1.89, z); });
  // ---------- aft cockpit ----------
  prism('cockpit_bench', pad(-5.65, -5.15, 1.5, 0.15), 1.72, 0.4, mat.white);
  prism('cockpit_cushion', pad(-5.62, -5.18, 1.45, 0.14), 2.12, 0.1, mat.orange);
  add('cockpit_table', new THREE.CylinderGeometry(0.45, 0.45, 0.06, 32), mat.woodLight, -4.3, 2.3, 0);
  add('cockpit_table_leg', new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), mat.metal, -4.3, 2.0, 0);
  add('crate_0', new THREE.BoxGeometry(0.55, 0.45, 0.5), mat.wood, -3.4, 1.95, -1.15);
  add('crate_1', new THREE.BoxGeometry(0.45, 0.36, 0.4), mat.wood, -3.38, 2.35, -1.12).rotation.y = 0.35;
  [[-3.4, 1.15]].forEach(([x, z], i) => [0, 1].forEach(k => add('rope_coil_' + i + '_' + k, new THREE.TorusGeometry(0.24 - k * 0.08, 0.045, 10, 32), mat.rope, x, 1.78 + k * 0.06, z).rotation.x = Math.PI / 2));
  const ring = new THREE.Group(); ring.name = 'life_ring'; ring.position.set(-2.98, 2.35, 0.85); ring.rotation.y = Math.PI / 2; boat.add(ring);
  for (let i = 0; i < 4; i++) add('life_ring_' + i, new THREE.TorusGeometry(0.22, 0.065, 12, 16, Math.PI / 2), i % 2 ? mat.white : mat.red, 0, 0, 0, ring).rotation.z = i * Math.PI / 2;
  add('ensign_staff', new THREE.CylinderGeometry(0.03, 0.035, 1.5, 8), mat.woodLight, -5.75, 2.6, 0);
  add('ensign', new THREE.BoxGeometry(0.55, 0.36, 0.015), mat.navy, -6.04, 3.15, 0);
  // ---------- dressing line: bow pulpit -> arch top -> ensign staff ----------
  const top = new THREE.Vector3(-2.3, 5.9, 0);
  [[new THREE.Vector3(6.05, 2.35, 0), 'fore', 13], [new THREE.Vector3(-5.75, 3.32, 0), 'aft', 6]].forEach(([end, tag, n]) => {
    rod('flag_line_' + tag, top, end, 0.012, mat.rope);
    for (let k = 1; k < n; k++) {
      const p = top.clone().lerp(end, k / n);
      const tri = new THREE.Shape(); tri.moveTo(-0.14, 0); tri.lineTo(0.14, 0); tri.lineTo(0, -0.34);
      add('pennant_' + tag + '_' + k, new THREE.ShapeGeometry(tri), flagCols[k % flagCols.length], p.x, p.y, p.z);
    }
  });
  let ANC_LIFT = 0;
  // yacht lines: sheer rising to the bow + raked forefoot (baked into hull-side meshes)
  {
    const sm = u => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const lift = x => 0.6 * Math.pow(sm((x - 0.8) / 5.6), 1.6);
    const rake = x => 0.75 * Math.pow(sm((x - 2.4) / 4.0), 1.4);
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
        if (y0 < 0.85) v.y += rake(v.x) * (1 - y0 / 0.85);
        v.applyMatrix4(inv); pos.setXYZ(i, v.x, v.y, v.z);
      }
      pos.needsUpdate = true; o.geometry.computeVertexNormals();
    });
    ANC_LIFT = lift(5.0);
  }
  // ink outlines: thick on silhouette parts, thin on details
  const inkMat = w => { const m = new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#152042', side: THREE.BackSide }); m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + w.toFixed(3) + ';'); }; return m; };
  const inkThick = inkMat(0.055), inkThin = inkMat(0.016);
  const bold = /^(keel|hull$|hull_bottom|bulwark|fender_rub|saloon$|flybridge$|hardtop$|arch_|crate|fender_\d|swim_platform$|sunpad|cockpit_bench|radar_dome)/;
  const outlines = [], meshes = [];
  boat.traverse(o => o.isMesh && meshes.push(o));
  meshes.forEach(o => { if (/^(pennant|flag_line|nav_lamp)/.test(o.name)) return; const l = new THREE.Mesh(o.geometry, bold.test(o.name) ? inkThick : inkThin); l.name = o.name + '_outline'; l.castShadow = false; o.add(l); outlines.push(l); });
  const navFx = [];
  [['port', '#ff2a1f', -1], ['starboard', '#1fff6a', 1]].forEach(([tag, c, sd]) => {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(NAVP[0], NAVP[1], sd * NAVP[2]); boat.add(halo); outlines.push(halo);
    const pl = new THREE.PointLight(c, 3, 2.5, 2); pl.position.copy(halo.position); boat.add(pl); outlines.push(pl);
    navFx.push({ halo, pl, mat: tag === 'port' ? mat.navRed : mat.navGreen, ph: sd > 0 ? 0.5 : 0 });
  });
  // ---------------- source: custom flag on a staff at the starboard end of the radar arch ----------------
  const FLAG_KEY = 'motoryacht.flag', FLAG_COLS = ['#ee3427', '#ffb21a', '#ff7414', '#2343a0', '#2cc4a8', '#fff7ea', '#3b3134', '#1fff6a'];
  const flagS = { on: false, c: '#ee3427', img: null };
  try { Object.assign(flagS, JSON.parse(localStorage.getItem(FLAG_KEY)) || {}); } catch { /* storage blocked */ }
  const FG = new THREE.Group(); FG.name = 'custom_flag'; FG.position.set(0.35, 4.62, 1.08); boat.add(FG);
  add('flag_staff', new THREE.CylinderGeometry(0.03, 0.035, 2.15, 10), mat.metal, 0, 1.07, 0, FG);
  add('flag_staff_ball', new THREE.SphereGeometry(0.05, 12, 8), mat.yellow, 0, 2.18, 0, FG);
  const fcv = document.createElement('canvas'); fcv.width = 192; fcv.height = 128;
  const ftex = new THREE.CanvasTexture(fcv); ftex.colorSpace = THREE.SRGBColorSpace; ftex.magFilter = THREE.NearestFilter;
  const fg = new THREE.PlaneGeometry(1.5, 1.0, 24, 10); fg.translate(-0.75 - 0.03, 1.55, 0);
  const fbase = fg.attributes.position.array.slice();
  add('flag_cloth', fg, M('flag_cloth_custom', '#ffffff', { side: THREE.DoubleSide, map: ftex }), 0, 0, 0, FG);
  let fimg = null;
  const paintFlag = () => { const x = fcv.getContext('2d'); x.imageSmoothingEnabled = false;
    x.fillStyle = flagS.c; x.fillRect(0, 0, 192, 128);
    if (fimg) { const s = Math.min(160 / fimg.width, 104 / fimg.height), w = fimg.width * s, h = fimg.height * s; x.drawImage(fimg, (192 - w) / 2, (128 - h) / 2, w, h); }
    x.strokeStyle = '#152042'; x.lineWidth = 6; x.strokeRect(3, 3, 186, 122);
    ftex.needsUpdate = true; FG.visible = flagS.on;
    try { localStorage.setItem(FLAG_KEY, JSON.stringify(flagS)); } catch { /* storage blocked */ } };
  const loadFlagImg = src => { if (!src) { fimg = null; paintFlag(); return; } const i = new Image(); i.onload = () => { fimg = i; paintFlag(); }; i.src = src; };
  loadFlagImg(flagS.img);

  // ---------------- per frame: prop, wheel, radar, anemometer, nav lights, flag, night shading ----------------
  const fp = fg.attributes.position;
  function tick(t, dt, { steer = 0, vel = 0, night = 0, amp = 1, maxV = 6 } = {}) {
    prop.rotation.x += (1.2 + Math.abs(vel) * 3) * dt * Math.sign(vel || 1);
    wheel.rotation.x = steer * 2.6;
    anemo.rotation.y = t * (5 + amp * 2); radar.rotation.y = t * 1.6;
    navFx.forEach(n => { const on = ((t + n.ph) % 1.2) < 0.75 ? 1 : 0.15; n.mat.emissiveIntensity = on * (1 + night); n.halo.material.opacity = (0.45 + 0.4 * night) * on; n.pl.intensity = 1.6 * on * (1 + 0.5 * night); });
    RIM.value = 1 - night; NIGHTWARM.value = night;
    if (FG.visible) { const a = 0.06 + 0.04 * Math.min(1, Math.abs(vel) / maxV) + 0.05 * amp;
      for (let i = 0; i < fp.count; i++) { const bx = fbase[i * 3], d = Math.min(0, bx + 0.03), k = -d / 1.5; fp.setZ(i, Math.sin(t * 6 + d * 7 + fbase[i * 3 + 1] * 1.5) * a * k * 1.4); fp.setX(i, bx + k * k * 0.04 * Math.sin(t * 3)); }
      fp.needsUpdate = true; fg.computeVertexNormals(); }
  }

  return {
    group: boat, tick, outline, HB, ANC_LIFT, outlines,
    fit: { anchor: { x: 5.0, z: HB(5.0) + 0.3, y0: 1.5 + ANC_LIFT, s: 1.15 }, hawseY: 2.0 + ANC_LIFT, rod: [-5.3, 2.2, -1.2], land: [-4.3, 2.4, 0], menuY: 9.2 },
    flag: flagS, flagColours: FLAG_COLS,
    setFlag(next) { Object.assign(flagS, next); if ('img' in next) loadFlagImg(flagS.img); else paintFlag(); },
  };
}
