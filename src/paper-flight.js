// The Throw button's paper plane. Taking off: the boat crumples into a paper ball, the ball opens into a flat sheet, the
// sheet folds into a white paper plane, and the plane barrel-rolls up into the sky while Throw fades in over the sea.
// Coming back (Throw's "Sea" pill, or any other way Throw closes): the plane dives back to the boat's spot, opens into a
// sheet, crumples into a ball and drops into the water, and the boat grows back out of it with a splash.
// Nothing here touches the game's state (fuel, coins, mooring) and nothing is saved: a reload mid-flight is just the
// boat at sea again. States: sea -> fold -> fly -> sky -> land -> sea.

const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const PS = 4, Q = PS / 2.4; // paper scale (about the boat's length), and how much bigger than the 2.4-scale reference
const FOLD = 2.5, CLIMB = 2.4, LAND = 2.3;

export function createPaperFlight({ THREE, stage, boat, hug, rings, WL, wave, yaw, onTakeoff, onSky, onLanded }) {
  const V3 = THREE.Vector3, UP = new V3(0, 1, 0), XAX = new V3(1, 0, 0), scene = stage._scene;

  // ---------- the paper: one sheet of 14 triangles that morphs ball (k=0) -> sheet (k=1) -> plane (k=2) ----------
  const PV = { N: [1.3, 0.1, 0], T: [-1.1, 0.1, 0], K: [-1.1, -0.34, 0], Ki: [-1.1, -0.14, 0], F: [-1.1, 0.1, 0.42], G: [-0.02, 0.2, 0.52], H: [-0.56, 0.27, 0.74], W: [-1.1, 0.32, 0.95], L: [-1.1, 0.62, 0.95] };
  const tris = [];
  [1, -1].forEach(s => {
    [['N', 'T', 'F'], ['N', 'F', 'G'], ['G', 'F', 'H'], ['H', 'F', 'W'], ['H', 'W', 'L']].forEach(v => tris.push({ v, s }));
    tris.push({ v: ['N', 'T', 'K'], s, zo: 0.014 }, { v: ['N', 'T', 'Ki'], s, zo: 0.03 });
  });
  const n = tris.length * 3, pP = new Float32Array(n * 3), pS = new Float32Array(n * 3), pC = new Float32Array(n * 3), pD = new Float32Array(n);
  { let i = 0;
    tris.forEach(({ v, s, zo }) => v.forEach(name => { const [x, y, z] = PV[name], keel = zo !== undefined;
      const pz = keel ? s * zo : s * z, sz = keel ? s * (0.42 - (0.1 - y)) : s * (0.42 + z);
      pP.set([x, y, pz], i * 3); pS.set([x, 0, sz], i * 3);
      const a = x * 2.2, b = 0.35 + (sz + 1.4) / 2.8 * 2.45, r = 0.62 * (1 + 0.22 * Math.sin(x * 7.1 + sz * 3.3) * Math.sin(sz * 5.7 - x * 2.1));
      pC.set([Math.cos(a) * Math.sin(b) * r, Math.cos(b) * r, Math.sin(a) * Math.sin(b) * r], i * 3);
      pD[i] = Math.abs(sz) / 1.4 * 0.35; i++; })); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  const mat = new THREE.MeshStandardMaterial({ name: 'paper', color: '#f7f4ec', roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  mat.userData.diorama = true; // (keep the paper's own white: the theme's pastel pass leaves it alone)
  const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true;
  const eGeo = new THREE.BufferGeometry(); eGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tris.length * 18), 3));
  const creases = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: '#b3ab99' }));
  mesh.frustumCulled = creases.frustumCulled = false;
  const paper = new THREE.Group(); paper.name = 'paper_plane'; paper.add(mesh, creases); paper.visible = false; scene.add(paper);
  function setPaper(k) {
    const p = geo.attributes.position.array, e = eGeo.attributes.position.array;
    for (let i = 0; i < n; i++) { const lo = k <= 1, a = lo ? pC : pS, b = lo ? pS : pP, w = lo ? sm(k) : sm((k - 1 - pD[i]) / 0.65);
      for (let j = 0; j < 3; j++) p[i * 3 + j] = a[i * 3 + j] + (b[i * 3 + j] - a[i * 3 + j]) * w; }
    for (let q = 0; q < tris.length; q++) for (let c = 0; c < 3; c++) { const A = q * 3 + c, B = q * 3 + (c + 1) % 3, o = A * 6;
      for (let j = 0; j < 3; j++) { e[o + j] = p[A * 3 + j]; e[o + 3 + j] = p[B * 3 + j]; } }
    geo.attributes.position.needsUpdate = eGeo.attributes.position.needsUpdate = true; geo.computeVertexNormals();
  }
  setPaper(0);

  // ---------- splash: droplets thrown out under gravity, and two foam rings riding the swell ----------
  const fx = new THREE.Group(); fx.name = 'paper_splash'; scene.add(fx);
  const dropGeo = new THREE.IcosahedronGeometry(0.14 * Q, 0), dropMat = new THREE.MeshBasicMaterial({ color: '#f6fcff' });
  const drops = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(dropGeo, dropMat); m.visible = false; fx.add(m); return { m, v: new V3(), age: 9 }; });
  const ringGeo = new THREE.RingGeometry(0.7, 1, 40);
  const sRings = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.visible = false; fx.add(m); return { m, age: 9, pow: 1 }; });
  let dropI = 0, ringI = 0;
  function splash(at, pow = 1) {
    for (let i = 0; i < 20; i++) { const d = drops[dropI++ % drops.length], a = Math.random() * 6.283, sp = (2 + Math.random() * 4) * pow * Q;
      d.age = 0; d.m.position.set(at.x + Math.cos(a) * 1.2 * Q, WL, at.z + Math.sin(a) * 1.2 * Q); d.v.set(Math.cos(a) * sp, (5 + Math.random() * 6) * pow * Math.sqrt(Q), Math.sin(a) * sp); d.m.scale.setScalar(0.6 + Math.random() * 0.9); d.m.visible = true; }
    [0, 0.18].forEach(dl => { const r = sRings[ringI++ % sRings.length]; r.age = -dl; r.pow = pow * Q; r.m.position.set(at.x, WL + 0.02, at.z); });
  }
  function splashTick(t, dt) {
    drops.forEach(d => { if (d.age > 3) { d.m.visible = false; return; } d.age += dt; d.v.y -= 22 * dt; d.m.position.addScaledVector(d.v, dt); d.m.rotation.x += dt * 6;
      d.m.visible = d.m.position.y > WL - 0.2; if (!d.m.visible) d.age = 9; });
    sRings.forEach(r => { if (r.age > 1.8) { r.m.visible = false; return; } r.age += dt; r.m.visible = r.age > 0; const p = Math.max(0, r.age) / 1.8, s = (1.5 + p * 6) * r.pow;
      r.m.scale.set(s, s, 1); r.m.material.opacity = 0.75 * (1 - p); r.m.position.y = WL + 0.02 + wave(r.m.position.x, r.m.position.z, t); });
  }

  // ---------- the flight ----------
  const fl = { ph: 'sea', tt: 0, jx: 0, jz: 0 }, camP = new V3(), camL = new V3(), look = new V3(), want = new V3(), P = new V3(), f = new V3();
  const qA = new THREE.Quaternion(), qB = new THREE.Quaternion(), mB = new THREE.Matrix4(), eu = new THREE.Euler(0, 0, 0, 'YXZ');
  const orient = (dir, roll) => { const z = new V3().crossVectors(dir, UP).normalize(), y = new V3().crossVectors(z, dir); mB.makeBasis(dir, y, z); qB.setFromRotationMatrix(mB); qA.setFromAxisAngle(XAX, roll); return qB.multiply(qA); };
  const btn = () => document.getElementById('throw-btn');
  const paintBtn = () => { const b = btn(); if (b) b.disabled = fl.ph !== 'sea'; };
  // the camera's spot for the whole show: astern and off to one side, looking at the boat's spot
  const homeCam = () => { look.copy(fl.base).setY(WL + 2.5 * Q); want.copy(look).addScaledVector(fl.dir, -15 * Q).addScaledVector(fl.side, 9 * Q).setY(WL + 10 * Q); };

  function start() {
    if (fl.ph !== 'sea') return false;
    const ctl = stage._controls, h = yaw();
    fl.ph = 'fold'; fl.tt = 0; fl.yaw = h; fl.pendingLand = false;
    fl.dir = new V3(Math.cos(h), 0, -Math.sin(h)); fl.side = new V3(-fl.dir.z, 0, fl.dir.x);
    fl.base = boat.position.clone().setY(WL);
    fl.lim = [ctl.maxPolarAngle, ctl.minDistance, ctl.maxDistance]; ctl.maxPolarAngle = Math.PI; ctl.minDistance = 0; ctl.maxDistance = Infinity;
    camP.copy(stage._camera.position); camL.copy(ctl.target); ctl.enabled = false; ctl.autoRotate = false;
    paintBtn(); onTakeoff?.();
    return true;
  }
  function land() {
    if (fl.ph === 'fly' || fl.ph === 'fold') { fl.pendingLand = true; return; } // (Throw closed before the plane got up there)
    if (fl.ph !== 'sky') return;
    fl.ph = 'land'; fl.tt = 0; homeCam(); camL.copy(look); camP.copy(want); // (snap: the sky screen is fading out over it)
    paintBtn();
  }

  // the crumple's wobble is added on top of the boat's own sway; take last frame's off before the game sets the sway
  function pre() { if (fl.jx || fl.jz) { boat.rotation.x -= fl.jx; boat.rotation.z -= fl.jz; fl.jx = fl.jz = 0; } }
  const wobble = (tt, g, o = 0) => { const j = 1 - g;
    boat.scale.set((g + o) * (1 + 0.25 * Math.sin(tt * 55) * j), (g - o) * (1 - 0.3 * j), (g + o) * (1 + 0.2 * Math.cos(tt * 47) * j));
    fl.jx = Math.sin(tt * 31) * 0.3 * j; fl.jz = Math.cos(tt * 27) * 0.25 * j; boat.rotation.x += fl.jx; boat.rotation.z += fl.jz; };

  function tick(t, dt) {
    splashTick(t, dt);
    if (fl.ph === 'sea') return;
    const prev = fl.tt; fl.tt += dt; const tt = fl.tt, cross = x => prev < x && tt >= x, cam = stage._camera, ctl = stage._controls;
    let kT = 1;
    if (fl.ph === 'fold') {
      kT = 1 - sm((tt - 0.05) / 0.65); wobble(tt, kT); boat.visible = kT > 0.001;
      paper.visible = tt > 0.3; paper.scale.setScalar(Math.max(0.001, PS * sm((tt - 0.3) / 0.45)));
      setPaper(tt < 0.75 ? 0 : tt < 1.45 ? (tt - 0.75) / 0.7 : Math.min(2, 1 + (tt - 1.45) / 1.05));
      paper.position.copy(fl.base).setY(WL + (1.2 + 2.0 * sm((tt - 0.55) / 0.95) + Math.sin(sm((tt - 0.55) / 1.2) * Math.PI) * 1.2) * Q);
      eu.set((1 - sm((tt - 0.75) / 0.7)) * tt * 9, fl.yaw + (1 - sm((tt - 0.6) / 1.9)) * Math.PI * 2, 0); paper.quaternion.setFromEuler(eu);
      if (cross(0.55)) splash(fl.base, 1.2);
      homeCam();
      if (tt >= FOLD) { fl.ph = 'fly'; fl.tt = 0; fl.q0 = paper.quaternion.clone(); boat.visible = false; setPaper(2); }
    } else if (fl.ph === 'fly') {
      kT = 0; const e = Math.min(1, tt / CLIMB);
      P.copy(fl.base).addScaledVector(fl.dir, 40 * Q * e * e); P.y = WL + (3.2 + 46 * Math.pow(e, 1.7)) * Q;
      f.copy(fl.dir).multiplyScalar(80 * e + 1).addScaledVector(UP, 78 * Math.pow(e, 0.7) + 0.3).normalize();
      paper.quaternion.copy(fl.q0).slerp(orient(f, sm((tt - 0.5) / 1.1) * Math.PI * 2), sm(tt / 0.5)); paper.position.copy(P);
      homeCam(); look.copy(P);
      if (cross(1.4)) onSky?.();
      if (tt >= CLIMB) { fl.ph = 'sky'; paper.visible = false; if (fl.pendingLand) land(); }
    } else if (fl.ph === 'sky') {
      kT = 0; look.copy(camL); want.copy(camP);
    } else { // land
      kT = 0; const a = sm(tt / 0.7);
      if (tt < 0.7) { setPaper(2); P.copy(fl.base).addScaledVector(fl.dir, -12 * Q * (1 - a)); P.y = WL + (3.2 + 24 * (1 - a) * (1 - a)) * Q;
        f.copy(fl.dir).multiplyScalar(12 + 40 * a).addScaledVector(UP, -48 * (1 - a)).normalize();
        paper.visible = true; paper.scale.setScalar(PS); paper.position.copy(P); paper.quaternion.copy(orient(f, 0)); fl.q0 = paper.quaternion.clone();
      } else { // the plane opens to a sheet, the sheet crumples into a ball, the ball drops into the water
        setPaper(tt < 1.25 ? 2 - (tt - 0.7) / 0.55 : Math.max(0, 1 - (tt - 1.25) / 0.4));
        paper.position.copy(fl.base).setY(WL + (3.2 - 0.6 * sm((tt - 0.7) / 0.55) - 1.4 * sm((tt - 1.25) / 0.4) + Math.sin(sm((tt - 0.7) / 0.5) * Math.PI) * 0.6) * Q);
        eu.set(Math.max(0, tt - 1.25) * 9, fl.yaw + sm((tt - 0.7) / 1.0) * Math.PI * 2, 0); qB.setFromEuler(eu); paper.quaternion.copy(fl.q0).slerp(qB, sm((tt - 0.7) / 0.25));
        paper.scale.setScalar(Math.max(0.001, PS * (1 - sm((tt - 1.5) / 0.35)))); paper.visible = tt < 1.85;
      }
      if (tt >= 1.45) { const g = sm((tt - 1.45) / 0.6), o = 0.08 * Math.sin(Math.min(1, Math.max(0, (tt - 1.9) / 0.35)) * Math.PI); kT = g; wobble(tt, g, o); }
      boat.visible = tt >= 1.45;
      if (cross(1.45)) splash(fl.base, 1);
      homeCam();
      if (tt >= LAND) { pre(); boat.scale.setScalar(1); boat.visible = true; kT = 1; paper.visible = false; fl.ph = 'sea';
        [ctl.maxPolarAngle, ctl.minDistance, ctl.maxDistance] = fl.lim; ctl.enabled = true; paintBtn(); onLanded?.(); }
    }
    // the foam round the hull shrinks and grows with the boat
    hug.visible = kT > 0.01; hug.scale.multiplyScalar(Math.max(0.01, kT)); if (kT < 1) rings.forEach(r => { r.visible = false; });
    if (fl.ph === 'sea') return; // (landed this frame: the game has the camera back)
    camP.lerp(want, 1 - Math.exp(-dt * 2)); camL.lerp(look, 1 - Math.exp(-dt * 4)); cam.position.copy(camP); ctl.target.copy(camL); cam.lookAt(camL);
  }

  return { start, land, pre, tick, busy: () => fl.ph !== 'sea', phase: () => fl.ph };
}
