// Sign-in page scene (from the Sailo Sign In design pack): the Lighthouse Tug with toon shading + ink
// outlines, the painted sea, sky and cloud shaders. Day and night presets; tap to steer, sail off on sign-in.
import * as THREE_NS from 'three';
const lib = () => Promise.resolve(THREE_NS);

const FR = {
  d: { px: .68, py: .5, fW: .36, fH: .6 },
  t: { px: .55, py: .22, fW: .56, fH: .28 },
  m: { px: .5, py: .21, fW: .78, fH: .26 },
};
export const PRESETS = {
  day: { night: 0, rain: 0, frames: FR },
  night: { night: 1, rain: .7, frames: { ...FR, d: { ...FR.d, px: .36 } } },
};

export async function createScene(canvas, P, opts = {}) {
  const THREE = await lib(), V3 = THREE.Vector3, C = c => new THREE.Color(c);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, opts.maxDpr || 1.5));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(32, 1, .1, 2000);
  const N = P.night;

  // ---------- materials (toon ramp + cyan rim) ----------
  const ramp = new THREE.DataTexture(new Uint8Array([118, 134, 205, 255, 198, 210, 242, 255, 255, 255, 255, 255]), 3, 1);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
  const rim = s => { s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', 'float rimF = 1.0 - max(dot(normalize(vViewPosition), normalize(normal)), 0.0);\noutgoingLight += vec3(0.62, 0.88, 1.0) * smoothstep(0.62, 0.68, rimF) * 0.45;\n#include <opaque_fragment>'); };
  const M = (name, color, extra = {}) => { const m = Object.assign(new THREE.MeshToonMaterial({ name, color, gradientMap: ramp }), extra); m.onBeforeCompile = rim; return m; };
  const mat = {
    yellow: M('hull_yellow', '#ffb21a'), bottom: M('hull_bottom', '#9a2418'), white: M('paint_white', '#fff7ea'), red: M('paint_red', '#ee3427'),
    navy: M('paint_navy', '#2343a0'), rubber: M('rubber', '#3b3134'), metal: M('metal', '#a9b4c2'),
    glass: M('glass', '#a6ecff', { emissive: C('#ffe08a'), emissiveIntensity: .3 + 1.6 * N }),
    wood: M('wood', '#b5733a'), woodLight: M('wood_light', '#d49a55'), rope: M('rope', '#e6cf9a'), deck: M('deck', '#9a958c'),
    navRed: M('nav_red', '#ff2a1f', { emissive: C('#ff2a1f'), emissiveIntensity: 1 }), navGreen: M('nav_green', '#1fff6a', { emissive: C('#1fff6a'), emissiveIntensity: 1 }),
  };
  const flagCols = ['#ee3427', '#ffb21a', '#2343a0', '#fff7ea', '#2cc4a8'].map((c, i) => M('pennant_' + i, c, { side: THREE.DoubleSide }));
  const boat = new THREE.Group(); boat.rotation.order = 'YXZ';
  function add(name, geo, m, x = 0, y = 0, z = 0, parent = boat) { const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh; }
  function rod(name, a, b, r, m) { const d = new V3().subVectors(b, a), len = d.length(); const mesh = add(name, new THREE.CylinderGeometry(r, r, len, 8), m); mesh.position.copy(a).addScaledVector(d, .5); mesh.quaternion.setFromUnitVectors(new V3(0, 1, 0), d.normalize()); return mesh; }
  function outline(s = 1, path = new THREE.Shape()) { const L = 5 * s, B = 2.25 * s;
    path.moveTo(-L + .9 * s, -B); path.lineTo(L * .4, -B); path.bezierCurveTo(L * .85, -B, L, -B * .5, L + .25 * s, 0); path.bezierCurveTo(L, B * .5, L * .85, B, L * .4, B);
    path.lineTo(-L + .9 * s, B); path.bezierCurveTo(-L - .2 * s, B, -L - .2 * s, -B, -L + .9 * s, -B); return path; }
  function slab(name, s, y0, h, m, holeS) { const sh = outline(s); if (holeS) sh.holes.push(outline(holeS, new THREE.Path())); const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 24 }); g.rotateX(-Math.PI / 2); return add(name, g, m, 0, y0); }
  slab('keel', .86, 0, .35, mat.bottom); slab('hull_bottom', .95, .35, .45, mat.bottom); slab('hull', 1.0, .8, 1.0, mat.yellow);
  slab('fender_rub', 1.035, 1.55, .22, mat.rubber); slab('deck', .955, 1.8, .04, mat.deck); slab('bulwark', 1.0, 1.8, .45, mat.yellow, .955); slab('bulwark_cap', 1.008, 2.25, .05, mat.white, .95);
  add('bow_fender', new THREE.CapsuleGeometry(.58, 1.7, 8, 32), mat.rubber, 5.2, 1.3, 0).rotation.x = Math.PI / 2;
  [-1.3, 0, 1.3].forEach(z => add('stern_tyre', new THREE.TorusGeometry(.34, .14, 12, 32), mat.rubber, -5.08, 1.45, z).rotation.y = Math.PI / 2);
  [-2.5, 0, 2.5].forEach(x => [-1, 1].forEach(sd => add('side_tyre', new THREE.TorusGeometry(.28, .11, 12, 32), mat.rubber, x, 1.35, sd * 2.32)));
  [-3.6, -1.25, 1.25].forEach(x => [-1, 1].forEach(sd => { const z = sd * 2.47;
    add('floater', new THREE.CapsuleGeometry(.2, .5, 8, 24), mat.white, x, 1.4, z); add('floater_cap_top', new THREE.CylinderGeometry(.12, .2, .12, 20), mat.navy, x, 1.82, z); add('floater_cap_bot', new THREE.CylinderGeometry(.2, .12, .12, 20), mat.navy, x, .98, z);
    rod('floater_rope', new V3(x, 1.88, z), new V3(x, 2.28, sd * 2.2), .018, mat.rope); }));
  add('cabin', new THREE.BoxGeometry(3.4, 1.4, 2.8), mat.yellow, .6, 2.54, 0); add('cabin_roof', new THREE.BoxGeometry(3.7, .12, 3.1), mat.white, .6, 3.3, 0);
  [-1.41, 1.41].forEach(z => [-.4, .6, 1.6].forEach(x => add('cabin_window', new THREE.BoxGeometry(.6, .5, .02), mat.glass, x, 2.75, z)));
  add('cabin_window_front', new THREE.BoxGeometry(.02, .5, 2.0), mat.glass, 2.311, 2.75, 0); add('cabin_door', new THREE.BoxGeometry(.02, 1.0, .7), mat.navy, -1.111, 2.35, 0);
  [[-1, mat.navRed], [1, mat.navGreen]].forEach(([sd, m]) => { add('nav_box', new THREE.BoxGeometry(.3, .22, .12), mat.navy, 2.15, 3.47, sd * 1.42); add('nav_lamp', new THREE.SphereGeometry(.1, 20, 14), m, 2.15, 3.66, sd * 1.42); });
  const ring = new THREE.Group(); ring.position.set(-1.2, 2.6, .95); ring.rotation.y = Math.PI / 2; boat.add(ring);
  for (let i = 0; i < 4; i++) add('life_ring', new THREE.TorusGeometry(.27, .075, 12, 16, Math.PI / 2), i % 2 ? mat.white : mat.red, 0, 0, 0, ring).rotation.z = i * Math.PI / 2;
  const tower = new THREE.Group(); tower.position.set(.1, 3.36, 0); tower.scale.set(1.2, 1.3, 1.2); boat.add(tower);
  add('tower_body', new THREE.CylinderGeometry(.62, .75, 3.0, 48), mat.white, 0, 1.5, 0, tower);
  [.55, 1.65, 2.7].forEach(y => { const r = .75 - (y / 3) * .13 + .012; add('tower_band', new THREE.CylinderGeometry(r - .01, r + .01, .32, 48), mat.red, 0, y, 0, tower); });
  [.25, .25 + Math.PI].forEach(a => add('tower_window', new THREE.BoxGeometry(.02, .35, .25), mat.glass, Math.cos(a) * .71, 1.1, Math.sin(a) * .71, tower).rotation.y = -a);
  add('gallery', new THREE.CylinderGeometry(.95, .85, .16, 48), mat.red, 0, 3.08, 0, tower);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; add('gallery_post', new THREE.CylinderGeometry(.02, .02, .4, 6), mat.navy, Math.cos(a) * .9, 3.36, Math.sin(a) * .9, tower); }
  add('gallery_rail', new THREE.TorusGeometry(.9, .025, 8, 64), mat.navy, 0, 3.56, 0, tower).rotation.x = Math.PI / 2;
  add('lantern_base', new THREE.CylinderGeometry(.5, .5, .3, 32), mat.white, 0, 3.31, 0, tower); add('lantern_glass', new THREE.CylinderGeometry(.44, .44, .6, 32), mat.glass, 0, 3.76, 0, tower);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add('lantern_mullion', new THREE.BoxGeometry(.04, .6, .04), mat.navy, Math.cos(a) * .45, 3.76, Math.sin(a) * .45, tower); }
  add('lantern_roof', new THREE.ConeGeometry(.62, .55, 32), mat.yellow, 0, 4.33, 0, tower); add('roof_ball', new THREE.SphereGeometry(.1, 16, 12), mat.red, 0, 4.66, 0, tower);
  add('mast', new THREE.CylinderGeometry(.025, .025, .9, 8), mat.metal, 0, 5.1, 0, tower);
  const anemo = new THREE.Group(); anemo.position.set(0, 5.45, 0); tower.add(anemo);
  add('anemometer_bar', new THREE.BoxGeometry(.5, .03, .03), mat.metal, 0, 0, 0, anemo); add('anemometer_bar_2', new THREE.BoxGeometry(.03, .03, .5), mat.metal, 0, 0, 0, anemo);
  [[.25, 0], [-.25, 0], [0, .25], [0, -.25]].forEach(([x, z]) => add('anemometer_cup', new THREE.SphereGeometry(.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.metal, x, -.03, z, anemo));
  add('vane', new THREE.BoxGeometry(.03, .18, .28), mat.red, 0, 5.62, 0, tower);
  add('stack', new THREE.CylinderGeometry(.42, .42, 1.6, 40), mat.navy, 1.6, 4.1, .6); add('stack_band', new THREE.CylinderGeometry(.435, .435, .35, 40), mat.red, 1.6, 4.5, .6); add('stack_cap', new THREE.CylinderGeometry(.46, .46, .08, 40), mat.rubber, 1.6, 4.94, .6);
  add('antenna_mast', new THREE.CylinderGeometry(.04, .05, 1.8, 10), mat.white, -.8, 4.26, -1.05); add('antenna_yard', new THREE.CylinderGeometry(.03, .03, .9, 8), mat.white, -.8, 4.75, -1.05).rotation.x = Math.PI / 2;
  add('radar', new THREE.BoxGeometry(.6, .1, .14), mat.navy, -.8, 5.2, -1.05); const flag = add('mast_flag', new THREE.BoxGeometry(.5, .32, .015), mat.red, -.53, 4.98, -1.05);
  add('bitt', new THREE.CylinderGeometry(.14, .14, .45, 20), mat.metal, 3.5, 2.04, 0); add('bitt_cross', new THREE.CylinderGeometry(.06, .06, .6, 12), mat.metal, 3.5, 2.12, 0).rotation.x = Math.PI / 2;
  add('winch', new THREE.CylinderGeometry(.3, .3, .9, 24), mat.red, 2.8, 2.14, 0).rotation.x = Math.PI / 2; add('winch_rope', new THREE.CylinderGeometry(.33, .33, .6, 24), mat.rope, 2.8, 2.14, 0).rotation.x = Math.PI / 2;
  [[3.4, 1.2], [-3.7, 1.25], [-1.6, -1.5]].forEach(([x, z]) => [0, 1].forEach(k => add('rope_coil', new THREE.TorusGeometry(.3 - k * .09, .055, 10, 32), mat.rope, x, 1.9 + k * .08, z).rotation.x = Math.PI / 2));
  add('crate_0', new THREE.BoxGeometry(.8, .7, .8), mat.wood, -2.4, 2.19, -.9); add('crate_1', new THREE.BoxGeometry(.7, .6, .7), mat.wood, -2.3, 2.84, -.85).rotation.y = .3; add('crate_2', new THREE.BoxGeometry(.9, .55, .7), mat.wood, -3.4, 2.12, -.6);
  add('barrel_0', new THREE.CylinderGeometry(.3, .3, .8, 24), mat.red, -2.5, 2.24, .9); add('barrel_1', new THREE.CylinderGeometry(.3, .3, .8, 24), mat.navy, -3.2, 2.24, 1.0);
  add('helm_pedestal', new THREE.BoxGeometry(.28, .85, .36), mat.wood, -1.62, 2.25, 0); add('helm_axle', new THREE.CylinderGeometry(.05, .05, .3, 12), mat.metal, -1.8, 2.62, 0).rotation.z = Math.PI / 2;
  const wheel = new THREE.Group(); wheel.position.set(-1.95, 2.62, 0); boat.add(wheel);
  add('wheel_rim', new THREE.TorusGeometry(.4, .04, 12, 48), mat.woodLight, 0, 0, 0, wheel).rotation.y = Math.PI / 2; add('wheel_hub', new THREE.CylinderGeometry(.09, .09, .1, 20), mat.wood, 0, 0, 0, wheel).rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) add('wheel_spoke', new THREE.CylinderGeometry(.022, .022, 1.08, 8), mat.woodLight, 0, 0, 0, wheel).rotation.x = i * Math.PI / 4;
  for (let i = 0; i < 7; i++) add('aft_rail_post', new THREE.CylinderGeometry(.025, .025, .5, 6), mat.white, -4.15, 2.55, -1.5 + i * .5);
  add('aft_rail', new THREE.CylinderGeometry(.03, .03, 3.0, 8), mat.white, -4.15, 2.8, 0).rotation.x = Math.PI / 2;
  const top = new V3(.1, 3.36 + 4.66 * 1.3, 0), pennants = [];
  [new V3(3.5, 2.27, 0), new V3(-4.15, 2.8, 0)].forEach(end => { rod('flag_line', top, end, .012, mat.rope);
    for (let k = 1; k < 9; k++) { const p = top.clone().lerp(end, k / 9); const tri = new THREE.Shape(); tri.moveTo(-.16, 0); tri.lineTo(.16, 0); tri.lineTo(0, -.38); pennants.push(add('pennant', new THREE.ShapeGeometry(tri), flagCols[k % flagCols.length], p.x, p.y, p.z)); } });
  add('rudder', new THREE.BoxGeometry(.6, .9, .08), mat.bottom, -4.45, .2, 0); add('prop_shaft', new THREE.CylinderGeometry(.06, .06, 1.0, 12), mat.metal, -5.2, .95, 0).rotation.z = Math.PI / 2;
  const prop = new THREE.Group(); prop.position.set(-5.72, .95, 0); boat.add(prop);
  add('prop_hub', new THREE.CylinderGeometry(.13, .16, .26, 24), mat.wood, 0, 0, 0, prop).rotation.z = Math.PI / 2; add('prop_cone', new THREE.ConeGeometry(.13, .22, 24), mat.wood, -.24, 0, 0, prop).rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.x = i * Math.PI / 2; prop.add(arm); const b = add('prop_blade', new THREE.CapsuleGeometry(.1, .42, 6, 16), mat.woodLight, 0, .36, 0, arm); b.scale.set(.35, 1, 1.25); b.rotation.y = .5; }
  // anchor stowed on the starboard bow
  const anchorG = new THREE.Group(); anchorG.position.set(3.4, 1.55, 1.98); boat.add(anchorG);
  add('anchor_shank', new THREE.CylinderGeometry(.05, .05, .8, 10), mat.metal, 0, 0, 0, anchorG); add('anchor_stock', new THREE.CylinderGeometry(.035, .035, .55, 8), mat.metal, 0, .3, 0, anchorG).rotation.x = Math.PI / 2;
  add('anchor_ring', new THREE.TorusGeometry(.08, .025, 8, 20), mat.metal, 0, .47, 0, anchorG).rotation.y = Math.PI / 2;
  add('anchor_crown', new THREE.TorusGeometry(.3, .05, 8, 24, Math.PI), mat.metal, 0, -.12, 0, anchorG).rotation.set(0, Math.PI / 2, Math.PI);
  // ink outlines
  const inkMat = w => { const m = new THREE.MeshBasicMaterial({ color: '#152042', side: THREE.BackSide }); m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + w.toFixed(3) + ';'); }; return m; };
  const inkThick = inkMat(.055), inkThin = inkMat(.016);
  const bold = /^(keel|hull|bulwark|fender_rub|bow_fender|cabin$|cabin_roof|tower_body|gallery$|lantern_roof|stack$|crate|barrel|stern_tyre|winch$)/;
  const meshes = []; boat.traverse(o => o.isMesh && meshes.push(o));
  meshes.forEach(o => { if (/^(pennant|flag_line|nav_lamp)/.test(o.name)) return; const l = new THREE.Mesh(o.geometry, bold.test(o.name) ? inkThick : inkThin); l.castShadow = false; o.add(l); });
  const navFx = [];
  [['#ff2a1f', -1, mat.navRed], ['#1fff6a', 1, mat.navGreen]].forEach(([c, sd, m]) => {
    const halo = new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .45, blending: THREE.AdditiveBlending, depthWrite: false }));
    halo.position.set(2.15, 3.66, sd * 1.42); boat.add(halo); const pl = new THREE.PointLight(c, 3, 5, 2); pl.position.copy(halo.position); boat.add(pl); navFx.push({ halo, pl, m, ph: sd > 0 ? .5 : 0 }); });
  scene.add(boat);

  // ---------- lights ----------
  const hemi = new THREE.HemisphereLight(C('#fff3dc').lerp(C('#7488bb'), N), C('#4f86d6').lerp(C('#14244c'), N), N ? .6 : 1.15); scene.add(hemi);
  const key = new THREE.DirectionalLight(C('#fff0d2').lerp(C('#a9c1ff'), N), N ? .9 : 2.6); key.position.set(4, 7, 5).multiplyScalar(3); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048); key.shadow.bias = -.0002; Object.assign(key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: .5, far: 80 }); scene.add(key, key.target);
  const back = new THREE.DirectionalLight('#8fe1ff', 1.3 * (1 - .6 * N)); back.position.set(-6, 4, -5); scene.add(back);
  const deck1 = new THREE.PointLight('#ffd9a0', N * 26, 22, 1.6); deck1.position.set(.5, 6.5, 0); boat.add(deck1);
  const deck2 = new THREE.PointLight('#cfe0ff', N * 16, 18, 1.6); deck2.position.set(-3.5, 4.5, 0); boat.add(deck2);

  // ---------- painted sea ----------
  const WL = .85;
  const NOISE = `float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }`;
  const PRE = N ? { top: '#050d24', mid: '#0f2148', hor: '#24406b', tint: '#5470b4' } : { top: '#33a8e8', mid: '#8cd9f5', hor: '#f0fcff', tint: '#ffffff' };
  const seaU = { time: { value: 0 }, bp: { value: new THREE.Vector2() }, yaw: { value: 0 }, uAmp: { value: N ? 1.25 : 1 }, uTint: { value: C(PRE.tint) }, uHaze: { value: C(PRE.hor) }, uFog: { value: new THREE.Vector2(N ? 120 : 170, N ? 340 : 390) }, uSun: { value: N ? new V3(-.53, .46, -.71).normalize() : new V3(.45, .75, .35).normalize() }, uSpec: { value: N ? .5 : 1 }, uFlash: { value: 0 } };
  const WD = [[1, .3], [-.4, 1], [.7, -.7], [.2, 1]].map(([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; }), WA = [.34, .2, .11, .05], WK = [.18, .29, .52, .95], WS = [1.1, 1.5, 2.1, 2.9];
  const wave = (x, z, t) => { let s = 0; for (let i = 0; i < 4; i++) s += WA[i] * Math.sin((WD[i][0] * x + WD[i][1] * z) * WK[i] + t * WS[i]); return s * seaU.uAmp.value; };
  const WAVE_GLSL = `float waveH(vec2 p, float t){ return 0.34 * sin(dot(normalize(vec2(1.0, 0.3)), p) * 0.18 + t * 1.1) + 0.2 * sin(dot(normalize(vec2(-0.4, 1.0)), p) * 0.29 + t * 1.5) + 0.11 * sin(dot(normalize(vec2(0.7, -0.7)), p) * 0.52 + t * 2.1) + 0.05 * sin(dot(normalize(vec2(0.2, 1.0)), p) * 0.95 + t * 2.9); }`;
  const makeSea = waves => new THREE.ShaderMaterial({ uniforms: seaU, defines: waves ? { WAVES: 1 } : {},
    vertexShader: `uniform float time; uniform vec2 bp; uniform float uAmp; varying vec3 wp; varying float vh; ${WAVE_GLSL}
      void main(){ wp = (modelMatrix * vec4(position, 1.0)).xyz; vh = 0.0;
        #ifdef WAVES
        float f = 1.0 - smoothstep(45.0, 72.0, length(wp.xz - bp)); vh = waveH(wp.xz, time) * f * uAmp; wp.y += vh;
        #endif
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0); }`,
    fragmentShader: `uniform float time; uniform vec2 bp; uniform float yaw; uniform vec3 uTint; uniform vec3 uHaze; uniform vec2 uFog; uniform vec3 uSun; uniform float uSpec; uniform float uFlash; varying vec3 wp; varying float vh; ${NOISE}
      void main(){
        vec2 p = wp.xz; float d = length(p - cameraPosition.xz);
        vec3 deep = vec3(0.07, 0.33, 0.66), mid = vec3(0.11, 0.55, 0.84), far = vec3(0.24, 0.76, 0.93), lite = vec3(0.36, 0.82, 0.96);
        vec3 col = mix(deep, mid, smoothstep(4.0, 70.0, d)); col = mix(col, far, smoothstep(50.0, 200.0, d));
        float blot = fbm(p * 0.035 + vec2(time * 0.008, 0.0)); col = mix(col, deep * 0.82, smoothstep(0.55, 0.72, blot) * 0.55);
        float glow = fbm(p * 0.05 + 7.3); col = mix(col, lite, smoothstep(0.6, 0.78, glow) * 0.45);
        float st = fbm(vec2(p.x * 0.09, p.y * 0.55) + vec2(time * 0.05, 0.0)); col = mix(col, lite, smoothstep(0.66, 0.7, st) * 0.4);
        float cr = noise(vec2(p.x * 0.55 + time * 0.35, p.y * 2.8)); col = mix(col, vec3(0.93, 0.99, 1.0), step(0.96, cr) * 0.6 * (1.0 - smoothstep(25.0, 110.0, d)));
        vec2 dd = p - bp - vec2(-0.6, 0.9); vec2 lc = vec2(dot(dd, vec2(cos(yaw), -sin(yaw))), dot(dd, vec2(sin(yaw), cos(yaw)))); float sh = length(lc / vec2(6.8, 3.4));
        col *= mix(0.72, 1.0, smoothstep(0.55, 1.15, sh));
        #ifdef WAVES
        vec3 n = normalize(cross(dFdx(wp), dFdy(wp))); if (n.y < 0.0) n = -n;
        float lamb = dot(n, uSun); col *= 0.86 + 0.24 * smoothstep(0.62, 0.8, lamb);
        col = mix(col, lite, smoothstep(0.25, 0.55, vh) * 0.45);
        float capN = noise(p * 1.3 + vec2(time * 0.6, 0.0)); col = mix(col, vec3(0.95, 1.0, 1.0), smoothstep(0.42, 0.5, vh + (capN - 0.5) * 0.35) * 0.75);
        vec3 vdir = normalize(cameraPosition - wp); float spec = pow(max(dot(reflect(-uSun, n), vdir), 0.0), 60.0);
        float tw = step(0.72, noise(p * 2.6 + vec2(time * 1.7, -time * 1.3)));
        col *= uTint; col += vec3(1.0, 0.98, 0.9) * step(0.35, spec * tw) * (1.0 - smoothstep(20.0, 70.0, d)) * uSpec;
        #else
        col *= uTint;
        #endif
        col += uFlash * vec3(0.25, 0.3, 0.38);
        col = mix(col, uHaze, smoothstep(uFog.x, uFog.y, d));
        gl_FragColor = vec4(col, 1.0); }` });
  const seaFar = new THREE.Mesh(new THREE.CircleGeometry(420, 128), makeSea(false)); seaFar.rotation.x = -Math.PI / 2; seaFar.position.y = WL - .02; scene.add(seaFar);
  const nearGeo = new THREE.PlaneGeometry(150, 150, 220, 220); nearGeo.rotateX(-Math.PI / 2);
  const seaNear = new THREE.Mesh(nearGeo, makeSea(true)); seaNear.position.y = WL; seaNear.frustumCulled = false; scene.add(seaNear);

  // ---------- sky + clouds ----------
  const skyU = { uTop: { value: C(PRE.top) }, uMid: { value: C(PRE.mid) }, uHor: { value: C(PRE.hor) }, uStars: { value: N }, uFlash: { value: 0 }, time: seaU.time };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: skyU,
    vertexShader: 'varying vec3 dir; void main(){ dir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform float uStars; uniform float uFlash; uniform float time; varying vec3 dir; ${NOISE}
      void main(){ float y = dir.y; vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.06, y)); col = mix(col, uTop, smoothstep(0.06, 0.55, y));
        col = mix(col, col * 0.93, smoothstep(0.6, 0.7, fbm(vec2(atan(dir.z, dir.x) * 6.0, y * 30.0))) * step(0.05, y) * 0.6);
        vec2 sc = vec2(atan(dir.z, dir.x) * 90.0, y * 180.0); vec2 ci = floor(sc); float sh = hash(ci);
        float star = step(0.986, sh) * (1.0 - smoothstep(0.08, 0.38, length(fract(sc) - 0.5))) * (0.6 + 0.4 * sin(time * (2.0 + sh * 5.0) + sh * 50.0));
        col += vec3(0.95, 0.97, 1.0) * star * uStars * smoothstep(0.04, 0.25, y); col += uFlash * vec3(0.5, 0.55, 0.7) * smoothstep(-0.05, 0.4, y);
        gl_FragColor = vec4(col, 1.0); }` }));
  sky.renderOrder = -1; scene.add(sky);
  scene.fog = new THREE.Fog(PRE.hor, N ? 120 : 170, N ? 340 : 390);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const cloudGroup = new THREE.Group(); scene.add(cloudGroup);
  const cloudU = { time: seaU.time, cover: { value: N ? .55 : .42 }, dark: { value: N ? .15 : 0 }, tint: { value: C('#ffffff').lerp(C('#4a5c86'), N * .85) }, fade: { value: 1 }, flash: { value: 0 } };
  const cloudVS = 'uniform vec2 size; varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * size; gl_Position = projectionMatrix * mv; }';
  const cloudFS = `uniform float seed; uniform float time; uniform float cover; uniform float dark; uniform vec3 tint; uniform float fade; uniform float flash; uniform float rank; varying vec2 vUv; ${NOISE}
    float fbm6(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; } return v; }
    void main(){ vec2 q = vUv; vec2 drift = vec2(time * 0.012, time * 0.004); float n = fbm6(q * vec2(2.0, 3.2) + seed + drift), n2 = fbm6(q * 7.0 + seed * 1.7 - drift * 2.5);
      float r = length(q * vec2(1.0, 1.7)); float base = smoothstep(-0.62, -0.3, q.y + (n2 - 0.5) * 0.12);
      float dens = n * 0.8 + n2 * 0.2 - r * 0.62 + 0.12 + dark * 0.08;
      float a = smoothstep(0.16, 0.44, dens) * base * smoothstep(rank - 0.06, rank + 0.06, cover) * fade; if (a < 0.01) discard;
      float lit = smoothstep(-0.55, 0.65, q.y + (n2 - 0.5) * 0.9 + (n - 0.5) * 0.5);
      vec3 col = mix(vec3(0.6, 0.69, 0.8), vec3(1.0, 0.995, 0.975), lit); col = mix(col, vec3(1.0), (1.0 - smoothstep(0.16, 0.34, dens)) * 0.5 * lit);
      col = mix(col, vec3(0.3, 0.33, 0.39) * (0.65 + 0.45 * lit), dark); col *= tint; col += flash * vec3(0.85, 0.9, 1.0) * (0.4 + 0.6 * (1.0 - lit));
      gl_FragColor = vec4(col, a); }`;
  const cloud = (x, y, z, w, h, rank) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { ...cloudU, rank: { value: rank }, seed: { value: rnd() * 100 }, size: { value: new THREE.Vector2(w, h) } }, vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false, fog: false })); m.position.set(x, y, z); m.frustumCulled = false; m.userData = { y, ph: rnd() * 6.28 }; cloudGroup.add(m); return m; };
  for (let i = 0; i < 16; i++) { const ang = (i / 16) * Math.PI * 2 + rnd() * .3, r = 520 + rnd() * 230, y = 35 + rnd() * 110, w = 150 + rnd() * 170;
    for (let k = 0; k < 3; k++) cloud(Math.cos(ang) * r + (k - 1) * w * .35, y + rnd() * 12, Math.sin(ang) * r + (k - 1) * 20, w * (.6 + rnd() * .5), w * (.4 + rnd() * .2), (i / 16) * .3); }
  for (let i = 0; i < 18; i++) { const ang = rnd() * Math.PI * 2, r = 90 + rnd() * 380, y = 55 + rnd() * 40, w = 110 + rnd() * 140;
    for (let k = 0; k < 2; k++) cloud(Math.cos(ang) * r + (k - .5) * w * .4, y + rnd() * 8, Math.sin(ang) * r, w * (.7 + rnd() * .5), w * (.45 + rnd() * .2), .4 + (i / 18) * .55); }
  if (N) { const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4d6', fog: false })); moon.position.set(-330, 280, -440); sky.add(moon);
    const mh = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.MeshBasicMaterial({ color: '#9fb8ff', transparent: true, opacity: .12, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })); moon.add(mh); }
  // rain (night)
  const RN = 1400, rainPos = new Float32Array(RN * 6), rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rainSeed = Array.from({ length: RN }, () => [Math.random() * 90 - 45, Math.random() * 40, Math.random() * 90 - 45, 18 + Math.random() * 8]);
  const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#d4e6ff', transparent: true, opacity: P.rain * .32, depthWrite: false, fog: false })); rain.frustumCulled = false; rain.visible = P.rain > 0; scene.add(rain);

  // ---------- lighthouse beam ----------
  const beamPivot = new THREE.Group(); beamPivot.position.set(0, 3.76, 0); tower.add(beamPivot);
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false });
  [0, Math.PI].forEach(r => { const g = new THREE.ConeGeometry(2.6, 28, 20, 1, true); g.translate(0, -14, 0); g.rotateZ(Math.PI / 2); g.rotateZ(-.3); const b = new THREE.Mesh(g, beamMat); b.rotation.y = r; beamPivot.add(b); });
  const poolMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  const pools = [0, Math.PI].map(r => { const m = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), poolMat); m.rotation.order = 'YXZ'; m.scale.set(2.2, 1, 1); m.userData.r = r; scene.add(m); return m; });
  const lanternW = new V3();
  const beamBase = N ? .16 : .05; beamMat.opacity = beamBase; beamPivot.rotation.y = .5;

  // ---------- foam, rings, wake, spray, buoy ----------
  const foamMat = new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: .85, depthWrite: false });
  const hugShape = outline(1.1); hugShape.holes.push(outline(1.0, new THREE.Path()));
  const hug = new THREE.Mesh(new THREE.ShapeGeometry(hugShape, 24), foamMat); hug.rotation.order = 'YXZ'; scene.add(hug);
  const rings = [0, 1, 2].map(i => { const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.04, 96), foamMat.clone()); r.rotation.order = 'YXZ'; scene.add(r); return r; });
  const wake = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), foamMat.clone()); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.age = 99; scene.add(m); return m; });
  const ripples = Array.from({ length: 14 }, () => { const r = new THREE.Mesh(new THREE.RingGeometry(.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.visible = false; r.userData.age = 9; scene.add(r); return r; });
  let wakeI = 0, wakeT = 0, ripI = 0;
  const ripple = (x, z, s = 1, life = 1.4) => { const r = ripples[ripI++ % ripples.length]; r.position.set(x, WL, z); r.userData = { age: 0, s, life, x, z }; r.visible = true; };
  const SPN = 300, sprayPos = new Float32Array(SPN * 3).fill(-999), sprayVel = new Float32Array(SPN * 3), sprayLife = new Float32Array(SPN);
  const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
  const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: '#f4feff', size: .28, transparent: true, opacity: .9, depthWrite: false })); spray.frustumCulled = false; scene.add(spray);
  let sprayI = 0;
  const emit = (x, y, z, vx, vy, vz) => { const i = sprayI++ % SPN; sprayPos.set([x, y, z], i * 3); sprayVel.set([vx, vy, vz], i * 3); sprayLife[i] = .8 + Math.random() * .6; };
  const clock = new THREE.Clock();
  const splash = (x, z, n = 18, pw = 1) => { const y = WL + wave(x, z, clock.elapsedTime); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = (.6 + Math.random() * 1.4) * pw; emit(x, y, z, Math.cos(a) * s, (2 + Math.random() * 2.5) * pw, Math.sin(a) * s); } ripple(x, z, .6 * pw); setTimeout(() => ripple(x, z, .4 * pw, 1.8), 180); };
  const buoy = new THREE.Group(); buoy.visible = false; scene.add(buoy);
  { const b1 = new THREE.Mesh(new THREE.SphereGeometry(.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat.red), b2 = new THREE.Mesh(new THREE.CylinderGeometry(.4, .4, .16, 20), mat.white);
    const b3 = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .8, 8), mat.navy); b3.position.y = .6; b2.position.y = -.05; [b1, b2, b3].forEach(m => { buoy.add(m); const l = new THREE.Mesh(m.geometry, inkThin); m.add(l); }); }

  // ---------- motion + framing ----------
  const S = { yaw: 0, vel: 0, tgt: null, idle: 0, sail: false, kick: 0, lamp: 1, lampT: 1, frame: 'd', w: 1, h: 1 };
  const HOME = new V3(0, 0, 0), LOOK = new V3(0, 4.2, 0), tmp = new V3();
  let lastT = 0;
  function frame() {
    const f = P.frames[S.frame], w = S.w, h = S.h, fw = 2 * f.px * w, fh = 2 * f.py * h, tan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    camera.aspect = fw / fh; camera.setViewOffset(fw, fh, 0, 0, w, h);
    const dW = 11 * fw / (w * f.fW * 2 * tan * camera.aspect), dH = 10.5 * fh / (h * f.fH * 2 * tan), d = Math.max(dW, dH);
    camera.position.copy(LOOK).addScaledVector(new V3(.22, .17, 1).normalize(), d); camera.lookAt(LOOK); camera.updateProjectionMatrix();
    sky.position.set(camera.position.x, 0, camera.position.z); seaFar.position.x = camera.position.x; seaFar.position.z = camera.position.z; cloudGroup.position.set(camera.position.x, 0, camera.position.z);
  }
  function step() {
    const t = clock.getElapsedTime(), dt = Math.min(.05, t - lastT); lastT = t;
    let tx = HOME.x, tz = HOME.z;
    if (S.sail) { tx = boat.position.x + 300; tz = boat.position.z; } else if (S.tgt) { tx = S.tgt.x; tz = S.tgt.z; }
    const dx = tx - boat.position.x, dz = tz - boat.position.z, dist = Math.hypot(dx, dz); let tv = 0, steer = 0;
    if (dist > 1.4) { const want = Math.atan2(-dz, dx); const diff = ((want - S.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI; const turn = .9 * (.35 + .65 * Math.min(1, Math.abs(S.vel) / 3)); const st = Math.max(-turn * dt, Math.min(turn * dt, diff)); S.yaw += st; steer = Math.sign(st); tv = Math.min(S.sail ? 16 : 5, dist * .55) * Math.max(.18, Math.cos(diff)); }
    else if (S.tgt) { S.idle += dt; if (S.idle > 3.5) { S.tgt = null; buoy.visible = false; } } else S.yaw += (0 - S.yaw) * Math.min(1, dt * .6);
    S.vel += (tv - S.vel) * Math.min(1, dt * (S.sail ? .7 : .8));
    const fx = Math.cos(S.yaw), fz = -Math.sin(S.yaw), sv = S.vel / 6;
    boat.position.x += fx * S.vel * dt; boat.position.z += fz * S.vel * dt;
    const bx = boat.position.x, bz = boat.position.z, sx = Math.sin(S.yaw), sz = Math.cos(S.yaw);
    const hC = wave(bx, bz, t), hF = wave(bx + fx * 3, bz + fz * 3, t), hB = wave(bx - fx * 3, bz - fz * 3, t), hS = wave(bx + sx * 2, bz + sz * 2, t), hP = wave(bx - sx * 2, bz - sz * 2, t);
    S.kick *= Math.pow(.04, dt);
    boat.position.y += ((hC + hF + hB) / 3 * .85 + S.kick * .5 * Math.sin(t * 14) - boat.position.y) * Math.min(1, dt * 3);
    boat.rotation.set(boat.rotation.x + (-Math.atan((hS - hP) / 4) * .8 + steer * sv * .07 - boat.rotation.x) * Math.min(1, dt * 3), S.yaw, boat.rotation.z + (Math.atan((hF - hB) / 6) * .8 + sv * .035 + S.kick * .06 * Math.sin(t * 11) - boat.rotation.z) * Math.min(1, dt * 3));
    const bowX = bx + fx * 5.6, bowZ = bz + fz * 5.6, bowY = WL + wave(bowX, bowZ, t);
    if (Math.abs(S.vel) > 1) for (let q = 0; q < Math.ceil(Math.abs(sv) * 4); q++) { const sd = Math.random() < .5 ? -1 : 1, sp = 1.5 + Math.random() * 2; emit(bowX + sx * sd * .6, bowY, bowZ + sz * sd * .6, sx * sd * sp + fx * S.vel * .4, 2 + Math.random() * 2.5 * Math.abs(sv), sz * sd * sp + fz * S.vel * .4); }
    if (Math.random() < .12) { const sd = Math.random() < .5 ? -1 : 1, along = (Math.random() - .5) * 7; const ex = bx + fx * along + sx * sd * 2.5, ez = bz + fz * along + sz * sd * 2.5; for (let q = 0; q < 6; q++) emit(ex, WL + wave(ex, ez, t), ez, sx * sd * (.5 + Math.random()), 1.2 + Math.random() * 1.5, sz * sd * (.5 + Math.random())); }
    prop.rotation.x += (1.2 + Math.abs(S.vel) * 3) * dt; wheel.rotation.x = steer * 1.2; anemo.rotation.y = t * 6; flag.rotation.y = Math.sin(t * 5) * .15;
    wakeT += dt;
    if (Math.abs(S.vel) > .6 && wakeT > .07) { wakeT = 0; const w = wake[wakeI++ % wake.length], side = (Math.random() - .5) * 2.2; w.position.x = bx - fx * 5.6 - fz * side; w.position.z = bz - fz * 5.6 + fx * side; w.userData.age = 0; w.userData.s = .4 + Math.abs(sv) * .6; w.visible = true; }
    wake.forEach(w => { if (!w.visible) return; w.userData.age += dt; const a = w.userData.age / 2.6; if (a >= 1) { w.visible = false; return; } w.scale.setScalar(w.userData.s * (.6 + a * 2.4)); w.position.y = WL + wave(w.position.x, w.position.z, t) + .05; w.material.opacity = (1 - a) * .7; });
    seaU.bp.value.set(bx, bz); seaU.yaw.value = S.yaw; seaNear.position.x = bx; seaNear.position.z = bz;
    const wy = WL + hC * .85; hug.position.set(bx, wy + .04, bz); hug.rotation.set(-Math.PI / 2, S.yaw, 0); hug.scale.setScalar(1 + Math.sin(t * 2.2) * .015);
    rings.forEach((r, i) => { const p = ((t * .22 + i / 3) % 1); r.position.set(bx, wy + .03 + i * .001, bz); r.rotation.set(-Math.PI / 2, S.yaw, 0); r.scale.set(5.5 + p * 9 * 1.4, 3.2 + p * 9, 1); r.material.opacity = (1 - p) * .5; });
    ripples.forEach(r => { if (!r.visible) return; const u = r.userData; u.age += dt; const a = u.age / u.life; if (a >= 1) { r.visible = false; return; } r.scale.setScalar(u.s * (.4 + a * 3)); r.position.y = WL + wave(u.x, u.z, t) + .03; r.material.opacity = (1 - a) * .8; });
    for (let i = 0; i < SPN; i++) { if (sprayLife[i] <= 0) continue; sprayLife[i] -= dt; const j = i * 3; sprayVel[j + 1] -= 9.8 * dt; sprayPos[j] += sprayVel[j] * dt; sprayPos[j + 1] += sprayVel[j + 1] * dt; sprayPos[j + 2] += sprayVel[j + 2] * dt; if (sprayLife[i] <= 0 || sprayPos[j + 1] < WL - .6) { sprayLife[i] = 0; sprayPos[j + 1] = -999; } }
    sprayGeo.attributes.position.needsUpdate = true;
    navFx.forEach(n => { const on = ((t + n.ph) % 1.2) < .75 ? 1 : .15; n.m.emissiveIntensity = on * (1 + N); n.halo.material.opacity = (.45 + .4 * N) * on; n.pl.intensity = 3 * on * (1 + 2.5 * N); });
    // lamp
    S.lamp += (S.lampT - S.lamp) * Math.min(1, dt * 5);
    mat.glass.emissiveIntensity = (.3 + 1.6 * N) * (.15 + .85 * S.lamp);
    beamMat.opacity = beamBase * S.lamp; poolMat.opacity = beamMat.opacity * 1.6; beamPivot.rotation.y = t * .9;
    if (poolMat.opacity > .002) { beamPivot.getWorldPosition(lanternW); const hd = Math.max(4, (lanternW.y - WL) / Math.tan(.3)) * .92;
      pools.forEach(p => { const a = beamPivot.rotation.y + p.userData.r + boat.rotation.y; const px = lanternW.x + Math.cos(a) * hd, pz = lanternW.z - Math.sin(a) * hd; p.position.set(px, WL + .06 + wave(px, pz, t), pz); p.rotation.set(-Math.PI / 2, a, 0); }); }
    deck1.intensity = N * 26 * (.4 + .6 * S.lamp); deck2.intensity = deck1.intensity * .6;
    if (rain.visible) { const cx = camera.position.x * .3 + bx * .7, cz = camera.position.z * .3 + bz * .7; for (let i = 0; i < RN; i++) { const s = rainSeed[i]; s[1] -= s[3] * dt; if (s[1] < 0) s[1] += 40; const x = cx + s[0], z = cz + s[2], y = WL + s[1]; rainPos.set([x, y, z, x + .3, y + .9, z + .15], i * 6); } rainGeo.attributes.position.needsUpdate = true; }
    if (buoy.visible) { buoy.position.y = WL + wave(buoy.position.x, buoy.position.z, t) * .85; buoy.rotation.z = Math.sin(t * 1.7) * .12; }
    pennants.forEach((p, i) => { p.rotation.x = Math.sin(t * 4 + i) * .3; });
    cloudGroup.rotation.y += dt * .004;
    seaU.time.value = t;
    key.target.position.copy(boat.position); key.position.copy(boat.position).add(tmp.set(12, 21, 15));
    renderer.render(scene, camera);
  }
  frame(); renderer.setAnimationLoop(step);

  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new V3(0, 1, 0), -WL);
  return {
    resize(w, h, lay) { S.w = Math.max(1, w); S.h = Math.max(1, h); S.frame = lay; renderer.setSize(S.w, S.h, false); frame(); renderer.render(scene, camera); },
    setLamp(on) { S.lampT = on ? 1 : 0; },
    splashBow(n = 4) { if (S.sail) return; const p = boat.localToWorld(tmp.set(5.6, 1, (Math.random() - .5) * 1.6)); for (let i = 0; i < n; i++) emit(p.x, WL + .1, p.z, (Math.random() - .5) * 2, 2 + Math.random() * 2.5, (Math.random() - .5) * 2); S.kick = Math.min(1, S.kick + .12); },
    tap(cx, cy) {
      if (S.sail) return null;
      const r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1); ray.setFromCamera(ndc, camera);
      if (ray.intersectObject(boat, true).length) { S.kick = 1; splash(boat.position.x + 2, boat.position.z + 2.4, 26, 1.1); splash(boat.position.x - 2, boat.position.z + 2.4, 18, .9); return 'boat'; }
      const p = new V3(); if (!ray.ray.intersectPlane(plane, p)) return null;
      const off = p.clone().sub(HOME); off.y = 0; if (off.length() > 32) off.setLength(32); p.copy(HOME).add(off);
      S.tgt = p; S.idle = 0; buoy.position.set(p.x, WL, p.z); buoy.visible = true; splash(p.x, p.z, 10, .6); return 'water';
    },
    sailOff() { S.sail = true; S.tgt = null; buoy.visible = false; },
    reset() { S.sail = false; S.tgt = null; boat.position.set(-70, 0, 0); S.yaw = 0; S.vel = 9; },
    dispose() { renderer.setAnimationLoop(null); renderer.dispose(); },
  };
}
