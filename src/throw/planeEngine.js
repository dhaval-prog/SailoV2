import * as THREE from "three";
const A = 5.5, B = 4.25, K = 1.1, EPS = 6e-3, MAXLEN = 0.26;
const PI = Math.PI;
const clamp01 = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
const E = {
  fold: (t) => (t = clamp01(t), t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => (t = clamp01(t), 1 - Math.pow(1 - t, 3)),
  inn: (t) => (t = clamp01(t), t * t * t)
};
function worldOf(poly) {
  return poly.flat.map(([x, z]) => new THREE.Vector3(x, 0, z).applyMatrix4(poly.M));
}
function clip(poly, P, n, keepPositive) {
  const W = worldOf(poly), F = poly.flat, out = [], cut = [];
  const d = W.map((w) => ((w.x - P[0]) * n[0] + (w.z - P[1]) * n[1]) * (keepPositive ? 1 : -1));
  for (let i = 0; i < F.length; i++) {
    const j = (i + 1) % F.length;
    if (d[i] >= -1e-9) out.push(F[i]);
    if (d[i] > 1e-9 && d[j] < -1e-9 || d[i] < -1e-9 && d[j] > 1e-9) {
      const t = d[i] / (d[i] - d[j]);
      const p = [F[i][0] + (F[j][0] - F[i][0]) * t, F[i][1] + (F[j][1] - F[i][1]) * t];
      out.push(p);
      cut.push(p);
    } else if (Math.abs(d[i]) <= 1e-9) cut.push(F[i]);
  }
  return { flat: out, cut };
}
function area(f) {
  let s = 0;
  for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s / 2);
}
function lineFold(p1, p2, toward) {
  const dx = p2[0] - p1[0], dz = p2[1] - p1[1], L = Math.hypot(dx, dz);
  let n = [-dz / L, dx / L];
  if ((toward[0] - p1[0]) * n[0] + (toward[1] - p1[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { P: p1, n };
}
function foldMatrix(f, theta, extraH = 0) {
  const P3 = new THREE.Vector3(f.P[0], f.h + extraH, f.P[1]);
  return new THREE.Matrix4().makeTranslation(P3.x, P3.y, P3.z).multiply(new THREE.Matrix4().makeRotationAxis(f.D, theta)).multiply(new THREE.Matrix4().makeTranslation(-P3.x, -P3.y, -P3.z));
}
function buildPattern() {
  const flatC = (p) => p.flat.reduce((s, v) => s + v[1], 0) / p.flat.length;
  const defs = [
    { id: "half", ...lineFold([-A, 0], [A, 0], [0, 1]), temp: true },
    { id: "cornerL", ...lineFold([A, 0], [A - B, B], [A, B]) },
    { id: "cornerR", ...lineFold([A, 0], [A - B, -B], [A, -B]) },
    { id: "noseL", ...lineFold([A, 0], [A - B / Math.tan(PI / 8), B], [A - B, B]) },
    { id: "noseR", ...lineFold([A, 0], [A - B / Math.tan(PI / 8), -B], [A - B, -B]) },
    { id: "center", ...lineFold([-A, 0], [A, 0], [0, 1]) },
    { id: "wing1", ...lineFold([-A, -K], [A, -K], [0, -B]), pred: (p) => flatC(p) > 0 },
    { id: "flip", all: true },
    { id: "wing2", pred: (p) => flatC(p) < 0 }
  ];
  let polys = [{ flat: [[-A, -B], [A, -B], [A, B], [-A, B]], folds: [], M: new THREE.Matrix4() }];
  const creases = [];
  defs.forEach((f, fi) => {
    const allW = polys.flatMap(worldOf);
    const ys = allW.map((v) => v.y), zs = allW.map((v) => v.z);
    if (f.id === "flip") {
      const zm = (Math.min(...zs) + Math.max(...zs)) / 2;
      f.P = [0, zm];
      f.n = [0, 1];
      f.h = (Math.min(...ys) + Math.max(...ys)) / 2;
      f.lift = (Math.max(...zs) - Math.min(...zs)) / 2 + 0.35;
      f.zm = zm;
      Object.assign(defs[8], lineFold([-A, 2 * zm + K], [A, 2 * zm + K], [0, 2 * zm + B]));
      defs[8].pivotZ = 2 * zm + K;
      defs[8].keelZ = 2 * zm;
    }
    f.D = new THREE.Vector3(-f.n[1], 0, f.n[0]);
    const next = [], moving = [];
    for (const p of polys) {
      if (f.all) {
        const q = { ...p, folds: [...p.folds, fi] };
        next.push(q);
        moving.push(q);
        continue;
      }
      if (f.pred && !f.pred(p)) {
        next.push(p);
        continue;
      }
      const pos = clip(p, f.P, f.n, true), neg = clip(p, f.P, f.n, false);
      if (pos.flat.length >= 3 && area(pos.flat) > 1e-6) {
        const q = { flat: pos.flat, folds: [...p.folds, fi], M: p.M.clone() };
        next.push(q);
        moving.push(q);
        if (neg.flat.length >= 3 && area(neg.flat) > 1e-6 && pos.cut.length >= 2)
          creases.push({ fold: fi, a: pos.cut[0], b: pos.cut[pos.cut.length - 1] });
      }
      if (neg.flat.length >= 3 && area(neg.flat) > 1e-6) next.push({ flat: neg.flat, folds: [...p.folds], M: p.M.clone() });
    }
    if (!f.all) {
      const mv = moving.flatMap(worldOf);
      let hy = Math.max(...mv.map((v) => v.y));
      const refl = mv.map((v) => {
        const s = (v.x - f.P[0]) * f.n[0] + (v.z - f.P[1]) * f.n[1];
        return [v.x - 2 * s * f.n[0], v.z - 2 * s * f.n[1]];
      });
      const bx = [Math.min(...refl.map((r) => r[0])), Math.max(...refl.map((r) => r[0]))];
      const bz = [Math.min(...refl.map((r) => r[1])), Math.max(...refl.map((r) => r[1]))];
      for (const p of next)
        if (!moving.includes(p)) {
          const w = worldOf(p);
          const px = [Math.min(...w.map((v) => v.x)), Math.max(...w.map((v) => v.x))];
          const pz = [Math.min(...w.map((v) => v.z)), Math.max(...w.map((v) => v.z))];
          if (px[0] < bx[1] - 1e-4 && px[1] > bx[0] + 1e-4 && pz[0] < bz[1] - 1e-4 && pz[1] > bz[0] + 1e-4) hy = Math.max(hy, ...w.map((v) => v.y));
        }
      f.h = hy + EPS / 2;
      let smax = 0;
      for (const v of mv) smax = Math.max(smax, (v.x - f.P[0]) * f.n[0] + (v.z - f.P[1]) * f.n[1]);
      f.smax = Math.max(smax, 0.5);
    }
    if (!f.temp) {
      const R = foldMatrix(f, PI);
      for (const p of moving) p.M = R.clone().multiply(p.M);
    }
    polys = next;
  });
  return { polys, defs, creases };
}
function triangulate(poly) {
  const tris = [];
  const f = poly.flat;
  for (let i = 1; i < f.length - 1; i++) tris.push([f[0], f[i], f[i + 1]]);
  const out = [];
  const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  while (tris.length) {
    const t = tris.pop();
    const e = [d(t[0], t[1]), d(t[1], t[2]), d(t[2], t[0])];
    const m = e.indexOf(Math.max(...e));
    if (e[m] <= MAXLEN) {
      out.push(t);
      continue;
    }
    const a = t[m], b = t[(m + 1) % 3], c = t[(m + 2) % 3];
    const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    tris.push([a, mid, c], [mid, b, c]);
  }
  return out;
}
function createPaperPlane(options) {
  const { renderer, texture, onPhase, onProgress, afterRender, onError } = options;
  const { polys, defs, creases } = buildPattern();
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 1, 300);
  scene.add(new THREE.HemisphereLight(16777215, 15263976, 1.75));
  const key = new THREE.DirectionalLight(16777215, 1.55);
  key.position.set(-6, 16, 9);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  key.shadow.bias = -4e-4;
  key.shadow.normalBias = 0.025;
  key.shadow.radius = 4;
  scene.add(key);
  scene.add(key.target);
  const fill = new THREE.DirectionalLight(16777215, 0.6);
  fill.position.set(10, 6, -6);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.ShadowMaterial({ opacity: 0.2 }));
  ground.rotation.x = -PI / 2;
  ground.position.y = -2e-3;
  ground.receiveShadow = true;
  scene.add(ground);
  const tri = [];
  polys.forEach((p, pi) => triangulate(p).forEach((t2) => tri.push([pi, t2])));
  const NV = tri.length * 3;
  const pos = new Float32Array(NV * 3), uv = new Float32Array(NV * 2), flat = new Float32Array(NV * 2), vPoly = new Uint16Array(NV);
  tri.forEach(
    ([pi, t2], i) => t2.forEach((v, k) => {
      const j = i * 3 + k;
      vPoly[j] = pi;
      flat[j * 2] = v[0];
      flat[j * 2 + 1] = v[1];
      uv[j * 2] = (v[0] + A) / (2 * A);
      uv[j * 2 + 1] = (v[1] + B) / (2 * B);
    })
  );
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geo.setAttribute("aFlat", new THREE.BufferAttribute(flat, 2));
  const NC = Math.min(creases.length, 48);
  const segU = Array.from({ length: 48 }, (_, i) => i < NC ? new THREE.Vector4(creases[i].a[0], creases[i].a[1], creases[i].b[0], creases[i].b[1]) : new THREE.Vector4());
  const strU = new Float32Array(48);
  const mat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0, side: THREE.DoubleSide, transparent: true });
  mat.polygonOffset = true;
  mat.polygonOffsetFactor = -2;
  mat.polygonOffsetUnits = -4;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSeg = { value: segU };
    sh.uniforms.uStr = { value: strU };
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aFlat; varying vec2 vFlat;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvFlat = aFlat;");
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <common>",
      `#include <common>
      varying vec2 vFlat; uniform vec4 uSeg[48]; uniform float uStr[48];
      float sdSeg(vec2 p, vec2 a, vec2 b){ vec2 pa=p-a, ba=b-a; float h=clamp(dot(pa,ba)/max(dot(ba,ba),1e-6),0.,1.); return length(pa-ba*h); }`
    ).replace(
      "#include <map_fragment>",
      `#include <map_fragment>
      float cr = 0.;
      for (int i=0;i<48;i++){ if(uStr[i] <= 0.001) continue; float d = sdSeg(vFlat, uSeg[i].xy, uSeg[i].zw);
        cr = max(cr, uStr[i] * (0.20*exp(-pow(d/0.016,2.)) + 0.05*exp(-pow(d/0.07,2.)))); }
      diffuseColor.rgb *= 1. - cr;`
    );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const pivot = new THREE.Vector3(0.6, 0.03, defs[FI("wing2", defs)].pivotZ);
  const flight = new THREE.Group(), shape = new THREE.Group();
  flight.rotation.order = "YZX";
  const BASE_FLIGHT_SCALE = 1.287;
  flight.scale.setScalar(BASE_FLIGHT_SCALE);
  shape.add(mesh);
  flight.add(shape);
  scene.add(flight);
  mesh.position.copy(pivot).multiplyScalar(-1);
  mesh.scale.set(1.4, 1, 1);
  const PN = 90;
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0.11, 0, 0.03, 0.03, 0, 0.1]), 3));
  pGeo.computeVertexNormals();
  const pMesh = new THREE.InstancedMesh(pGeo, new THREE.MeshStandardMaterial({ color: 16513782, roughness: 0.9, side: THREE.DoubleSide }), PN);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  scene.add(pMesh);
  const parts = Array.from({ length: PN }, () => ({ life: 0 }));
  let pNext = 0;
  const dummy = new THREE.Object3D();
  const ang = new Float32Array(defs.length), bend = new Float32Array(defs.length), lift = new Float32Array(defs.length), crease = new Float32Array(defs.length);
  const seg = (t2, a, b) => clamp01((t2 - a) / (b - a));
  const STEPS = [
    { label: "Folding in half", dur: 3.3 },
    { label: "Corners to center", dur: 2.2 },
    { label: "Shaping the nose", dur: 2.2 },
    { label: "Folding down the middle", dur: 1.9 },
    { label: "First wing", dur: 1.8 },
    { label: "Turning it over", dur: 1.6 },
    { label: "Second wing", dur: 1.8 },
    { label: "Opening the wings", dur: 3.6 }
  ];
  const starts = [];
  {
    let s = 0.3;
    STEPS.forEach((st) => {
      starts.push(s);
      s += st.dur;
    });
  }
  const FOLD_END = starts[7] + STEPS[7].dur;
  function singleFold(i, t2, t0, dur, crStart = 0.82) {
    const u = seg(t2, t0, t0 + dur);
    ang[i] = PI * E.fold(u);
    bend[i] = 0.32 * Math.sin(PI * u);
    crease[i] = Math.max(crease[i], clamp01((u - crStart) / (1 - crStart)));
  }
  function stateAt(t2) {
    ang.fill(0);
    bend.fill(0);
    lift.fill(0);
    crease.fill(0);
    const o = { lift: 0, rx: 0, yaw: 0, pitch: 0, bank: 0, x: 0, y: 0, z: 0, wing: PI };
    const s0 = starts[0];
    {
      const u1 = seg(t2, s0, s0 + 1.55), u2 = seg(t2, s0 + 1.85, s0 + 3.05);
      ang[0] = PI * (E.fold(u1) - E.fold(u2));
      bend[0] = 0.3 * (Math.sin(PI * u1) + Math.sin(PI * u2));
      crease[0] = clamp01((u1 - 0.85) / 0.15);
    }
    singleFold(1, t2, starts[1], 1.5);
    singleFold(2, t2, starts[1] + 0.4, 1.5);
    singleFold(3, t2, starts[2], 1.5);
    singleFold(4, t2, starts[2] + 0.4, 1.5);
    singleFold(5, t2, starts[3], 1.6);
    singleFold(6, t2, starts[4], 1.5);
    {
      const u = seg(t2, starts[5], starts[5] + 1.35);
      ang[7] = PI * E.fold(u);
      lift[7] = defs[7].lift * Math.sin(PI * u) * 1.05;
    }
    singleFold(8, t2, starts[6], 1.5);
    const f0 = starts[7], tt = t2 - f0;
    const uL = E.fold(seg(tt, 0, 1.3)), uR = E.fold(seg(tt, 0.35, 1.8)), uW = E.fold(seg(tt, 0.55, 2)), uY = E.fold(seg(tt, 1.5, 2.9));
    const b = tt > 2.4 ? -0.22 * Math.exp(-5 * (tt - 2.4)) * Math.sin(9 * (tt - 2.4)) : 0;
    o.x = 0;
    o.y = 2.8 * uL + b * uY;
    o.z = -pivot.z * uL;
    o.rx = -PI / 2 * uR;
    o.wing = PI - (PI / 2 + 0.16) * uW;
    o.yaw = 1.38 * uY;
    o.pitch = 0.1 * uY;
    o.bank = 0.1 * uY;
    if (uW > 0) {
      ang[6] = ang[8] = o.wing;
    }
    return o;
  }
  const _v = new THREE.Vector3();
  const bbMin = new THREE.Vector3(), bbMax = new THREE.Vector3();
  function applyFolds() {
    const mats = polys.map((p) => {
      let active = -1;
      for (const fi of p.folds) if (bend[fi] > 1e-3 && ang[fi] > 1e-4 && !defs[fi].all) active = fi;
      const pre = new THREE.Matrix4(), post = new THREE.Matrix4();
      let passed = false;
      for (const fi of p.folds) {
        if (fi === active) {
          passed = true;
          continue;
        }
        if (ang[fi] === 0) continue;
        const R = foldMatrix(defs[fi], ang[fi], lift[fi]);
        if (!passed) pre.premultiply(R);
        else post.premultiply(R);
      }
      return { pre, post, active };
    });
    bbMin.set(1e9, 1e9, 1e9);
    bbMax.set(-1e9, -1e9, -1e9);
    for (let j = 0; j < NV; j++) {
      const m = mats[vPoly[j]];
      _v.set(flat[j * 2], 0, flat[j * 2 + 1]).applyMatrix4(m.pre);
      if (m.active >= 0) {
        const f = defs[m.active], th = ang[m.active];
        const rx = _v.x - f.P[0], rz = _v.z - f.P[1];
        const s = rx * f.n[0] + rz * f.n[1], a = rx * f.D.x + rz * f.D.z, y0 = _v.y - f.h;
        const k = th * bend[m.active] / f.smax;
        let X, Y, phi;
        if (Math.abs(k) < 1e-5) {
          X = s * Math.cos(th);
          Y = s * Math.sin(th);
          phi = th;
        } else {
          phi = th - k * s;
          X = (Math.sin(th) - Math.sin(phi)) / k;
          Y = (Math.cos(phi) - Math.cos(th)) / k;
        }
        const hn = X - y0 * Math.sin(phi), vy = Y + y0 * Math.cos(phi);
        _v.set(f.P[0] + a * f.D.x + hn * f.n[0], f.h + vy, f.P[1] + a * f.D.z + hn * f.n[1]);
      }
      _v.applyMatrix4(m.post);
      pos[j * 3] = _v.x;
      pos[j * 3 + 1] = _v.y;
      pos[j * 3 + 2] = _v.z;
      bbMin.min(_v);
      bbMax.max(_v);
    }
    geo.attributes.position.needsUpdate = true;
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    for (let i = 0; i < NC; i++) strU[i] = crease[creases[i].fold];
  }
  const camTarget = new THREE.Vector3(0, 0, 1.4), camGoal = new THREE.Vector3();
  let camDist = 24, aspect = 1;
  let zoomOut = 1;
  function resize(w, h) {
    renderer.setSize(w, h, false);
    aspect = w / Math.max(1, h);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    camDist = 23 * Math.max(1, 1.45 / aspect) * zoomOut;
  }
  resize(options.width, options.height);
  function placeCamera(time) {
    const drift = Math.sin(time * 0.25) * 0.35;
    const dir = new THREE.Vector3(drift * 0.02, 0.78, 0.62).normalize();
    camera.position.copy(camTarget).addScaledVector(dir, camDist);
    camera.position.x += drift;
    camera.lookAt(camTarget);
    key.target.position.copy(camTarget);
    key.position.set(camTarget.x - 6, 16, camTarget.z + 9);
  }
  let phase = "idle", t = 0, speed = 1, trail = true, follow = true, flyT = 0, resetT = 1, last = 0, raf = 0, clock = 0;
  let formation = stateAt(0);
  let readyBankExtra = 0;
  const MAX_READY_BANK = 0.32;
  const READY_FRAME_LIFT = 6;
  const READY_PITCH_FORWARD = -0.45;
  const READY_SCALE_BOOST = 1.2;
  function setPose(o, extra = {}) {
    flight.position.set(pivot.x + o.x + (extra.x || 0), pivot.y + o.y + (extra.y || 0), pivot.z + o.z + (extra.z || 0));
    flight.rotation.set((o.bank || 0) + (extra.bank || 0), (o.yaw || 0) + (extra.yaw || 0), (o.pitch || 0) + (extra.pitch || 0));
    shape.rotation.x = o.rx + (extra.rx || 0);
  }
  function emit(worldPos) {
    const p = parts[pNext];
    pNext = (pNext + 1) % PN;
    p.life = 1;
    p.pos = worldPos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.4));
    p.vel = new THREE.Vector3(-1.5 - Math.random() * 2, -0.3 - Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
    p.rot = new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6);
    p.spin = new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8);
    p.size = 0.6 + Math.random() * 1.1;
  }
  function tickParticles(dt) {
    for (let i = 0; i < PN; i++) {
      const p = parts[i];
      if (p.life > 0 && p.pos && p.vel && p.rot) {
        p.life -= dt / 1.3;
        p.vel.y -= dt * 0.9;
        p.vel.multiplyScalar(1 - dt * 1.2);
        p.pos.addScaledVector(p.vel, dt);
        p.rot.x += p.spin.x * dt;
        p.rot.y += p.spin.y * dt;
        p.rot.z += p.spin.z * dt;
        dummy.position.copy(p.pos);
        dummy.rotation.copy(p.rot);
        dummy.scale.setScalar(Math.max(0, p.life) * (p.size || 1));
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      pMesh.setMatrixAt(i, dummy.matrix);
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }
  let dirty = true;
  let renderErrored = false;
  function frame(now) {
    raf = requestAnimationFrame(frame);
    if (!last) last = now;
    const dt = Math.min(0.05, (now - last) / 1e3);
    last = now;
    clock += dt;
    if (phase === "folding") {
      t += dt * speed;
      dirty = true;
      const si = starts.findIndex((s, i) => t < s + STEPS[i].dur);
      const idx = si < 0 ? STEPS.length - 1 : si;
      onProgress?.({ step: idx + 1, total: STEPS.length, label: STEPS[idx].label, progress: clamp01(t / FOLD_END) });
      if (t >= FOLD_END) {
        t = FOLD_END;
        phase = "ready";
        onPhase?.("ready");
      }
    }
    if (dirty && !renderErrored) {
      try {
        formation = stateAt(t);
        applyFolds();
      } catch (err) {
        renderErrored = true;
        onError?.(err);
      }
      dirty = false;
    }
    if (phase === "idle" || phase === "folding") {
      flight.scale.setScalar(BASE_FLIGHT_SCALE);
      if (resetT < 1) {
        resetT = Math.min(1, resetT + dt * 1.6);
        mat.opacity = E.out(resetT);
      }
      const drop = resetT < 1 ? 1.6 * (1 - E.out(resetT)) : 0;
      setPose(formation, { y: drop });
    } else if (phase === "ready") {
      flight.scale.setScalar(BASE_FLIGHT_SCALE * READY_SCALE_BOOST);
      const bob = Math.sin(clock * 1.6) * 0.06 * clamp01(clock * 1);
      const idleBank = Math.sin(clock * 1.1) * 0.02;
      setPose(formation, {
        y: bob,
        yaw: PI / 2 - formation.yaw,
        bank: -formation.pitch,
        // READY_PITCH_FORWARD noses the resting plane down slightly rather than dead level — per
        // user request, reads as "about to land" rather than "parked", the same negative-pitch
        // direction as the flying phase's own nose-up climb-out uses positive pitch for.
        pitch: idleBank - formation.bank + READY_PITCH_FORWARD,
        rx: readyBankExtra * MAX_READY_BANK
      });
    } else if (phase === "flying" || phase === "done") {
      flight.scale.setScalar(BASE_FLIGHT_SCALE);
      flyT += dt * speed;
      const u = flyT;
      const back = Math.sin(PI * clamp01(u / 0.45)) * (u < 0.45 ? 1 : 0);
      const go = Math.max(0, u - 0.3);
      const fwd = -0.45 * back + 3.2 * go * go + 3.5 * go;
      const y = -0.18 * back + 1.6 * go + 0.8 * go * go;
      const yawT = E.fold(seg(u, 0.25, 1.4));
      const hd = formation.yaw + (PI / 2 - 1.38) * yawT;
      setPose(formation, {
        x: fwd * Math.cos(hd),
        y,
        z: -fwd * Math.sin(hd),
        yaw: (PI / 2 - 1.38) * yawT,
        pitch: 0.2 * E.fold(seg(u, 0.2, 0.9)) - 0.06 * back,
        bank: Math.sin(go * 3) * 0.06 * clamp01(go)
      });
      if (trail && go > 0.05 && u < 3.2) {
        mesh.updateWorldMatrix(true, false);
        const tw = new THREE.Vector3(-A + 0.4, pivot.y, pivot.z - 0.3).applyMatrix4(mesh.matrixWorld);
        for (let k = 0; k < 2; k++) if (Math.random() < 0.85) emit(tw);
      }
      if (phase === "flying" && u > 3.4) {
        phase = "done";
        onPhase?.("done");
      }
    }
    tickParticles(dt);
    if (follow && phase !== "flying" && phase !== "done") {
      flight.updateWorldMatrix(true, true);
      const c = new THREE.Vector3().addVectors(bbMin, bbMax).multiplyScalar(0.5).applyMatrix4(mesh.matrixWorld);
      const readyLift = phase === "ready" ? READY_FRAME_LIFT : 0;
      camGoal.set(c.x * 0.5, Math.min(c.y, 3) * 0.55 + readyLift, c.z * 0.75 + 2.1);
    } else if (!follow) camGoal.set(0, 0, 1.4);
    camTarget.lerp(camGoal, 1 - Math.exp(-dt * 2.2));
    placeCamera(clock);
    renderer.render(scene, camera);
    afterRender?.();
  }
  raf = requestAnimationFrame(frame);
  return {
    /** Stop / restart the frame loop (the letter pauses it while the plane is hidden, i.e. while you write). */
    setActive(on) { if (on && !raf) { last = 0; raf = requestAnimationFrame(frame); } else if (!on && raf) { cancelAnimationFrame(raf); raf = 0; } },
    fold() {
      if (phase !== "idle") return;
      phase = "folding";
      onPhase?.("folding");
    },
    fly() {
      if (phase !== "ready") return;
      flyT = 0;
      phase = "flying";
      onPhase?.("flying");
    },
    reset() {
      phase = "idle";
      t = 0;
      flyT = 0;
      resetT = 0;
      mat.opacity = 0;
      dirty = true;
      parts.forEach((p) => p.life = 0);
      onPhase?.("idle");
    },
    /** Sets phase to 'ready' directly — for a gesture-driven caller already at t = FOLD_END via seek(). */
    holdReady() {
      phase = "ready";
      onPhase?.("ready");
    },
    /** -1 (full left) .. 1 (full right) — banks the held 'ready' plane in place, without moving
     * it, for a caller driving this from a live horizontal drag. Only has any effect while
     * `phase === 'ready'`; harmless to call otherwise. */
    setReadyBank(v) {
      readyBankExtra = Math.max(-1, Math.min(1, v));
    },
    setOptions(o) {
      if (o.speed) speed = o.speed;
      if (o.trail != null) trail = o.trail;
      if (o.follow != null) follow = o.follow;
      if (o.zoomOut != null && o.zoomOut > 0 && o.zoomOut !== zoomOut) {
        camDist = camDist / zoomOut * o.zoomOut;
        zoomOut = o.zoomOut;
      }
    },
    /**
     * Swaps the material's texture (e.g. a freshly-baked letter texture) and disposes the old
     * one. Deliberately does NOT set `mat.needsUpdate` — that forces a full shader program
     * recompile, which this never needs (we're swapping between two non-null textures, not
     * toggling the map on/off, so the compiled shader's #define USE_MAP branch is unaffected),
     * and this call happens right as a fold gesture starts, i.e. right as per-frame vertex
     * position updates begin — recompiling the program at that exact moment is an avoidable
     * risk on GL bindings less forgiving than a desktop browser's.
     */
    setTexture(next) {
      const old = mat.map;
      mat.map = next;
      if (old && old !== next) old.dispose();
    },
    /** `tt` is a 0..1 progress fraction over the whole fold timeline (see PaperPlaneStageHandle.seek). */
    seek(tt) {
      t = clamp01(tt) * FOLD_END;
      dirty = true;
      if (mat.opacity !== 1) {
        resetT = 1;
        mat.opacity = 1;
      }
    },
    resize,
    dispose() {
      cancelAnimationFrame(raf);
      renderer.dispose();
    },
    get phase() {
      return phase;
    },
    FOLD_END
  };
}
function FI(id, defs) {
  return defs.findIndex((d) => d.id === id);
}
export {
  createPaperPlane
};
