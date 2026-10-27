import './styles.css';
import './three-d-stage.js';
import { initHud } from './hud.js';

const stage = document.querySelector('three-d-stage');
const { THREE } = await stage.ready;
const ramp = new THREE.DataTexture(new Uint8Array([118, 134, 205, 255, 198, 210, 242, 255, 255, 255, 255, 255]), 3, 1);
ramp.minFilter = ramp.magFilter = THREE.NearestFilter; ramp.needsUpdate = true;
const rim = s => { s.fragmentShader = s.fragmentShader.replace('#include <opaque_fragment>', 'float rimF = 1.0 - max(dot(normalize(vViewPosition), normalize(normal)), 0.0);\noutgoingLight += vec3(0.62, 0.88, 1.0) * smoothstep(0.62, 0.68, rimF) * 0.45;\n#include <opaque_fragment>'); };
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
const boat = new THREE.Group(); boat.name = 'lighthouse_tug';
function add(name, geo, m, x = 0, y = 0, z = 0, parent = boat) {
  const mesh = new THREE.Mesh(geo, m); mesh.name = name; mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function rod(name, a, b, r, m) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length();
  const mesh = add(name, new THREE.CylinderGeometry(r, r, len, 8), m);
  mesh.position.copy(a).addScaledVector(d, 0.5);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  return mesh;
}
// top-view hull outline, bow at +x (chubby beam)
function outline(s = 1, path = new THREE.Shape()) {
  const L = 5 * s, B = 2.25 * s;
  path.moveTo(-L + 0.9 * s, -B);
  path.lineTo(L * 0.4, -B);
  path.bezierCurveTo(L * 0.85, -B, L, -B * 0.5, L + 0.25 * s, 0);
  path.bezierCurveTo(L, B * 0.5, L * 0.85, B, L * 0.4, B);
  path.lineTo(-L + 0.9 * s, B);
  path.bezierCurveTo(-L - 0.2 * s, B, -L - 0.2 * s, -B, -L + 0.9 * s, -B);
  return path;
}
function slab(name, s, y0, h, m, holeS) {
  const sh = outline(s);
  if (holeS) sh.holes.push(outline(holeS, new THREE.Path()));
  const g = new THREE.ExtrudeGeometry(sh, { depth: h, bevelEnabled: false, curveSegments: 24 });
  g.rotateX(-Math.PI / 2);
  return add(name, g, m, 0, y0);
}
// hull
slab('keel', 0.86, 0, 0.35, mat.bottom);
slab('hull_bottom', 0.95, 0.35, 0.45, mat.bottom);
slab('hull', 1.0, 0.8, 1.0, mat.yellow);
slab('fender_rub', 1.035, 1.55, 0.22, mat.rubber);
slab('deck', 0.955, 1.8, 0.04, mat.deck);
slab('bulwark', 1.0, 1.8, 0.45, mat.yellow, 0.955);
slab('bulwark_cap', 1.008, 2.25, 0.05, mat.white, 0.95);
// big bow pushing fender
const bf = add('bow_fender', new THREE.CapsuleGeometry(0.58, 1.7, 8, 32), mat.rubber, 5.2, 1.3, 0);
bf.rotation.x = Math.PI / 2;
[-1.3, 0, 1.3].forEach((z, i) => { const t = add('stern_tyre_' + i, new THREE.TorusGeometry(0.34, 0.14, 12, 32), mat.rubber, -5.08, 1.45, z); t.rotation.y = Math.PI / 2; });
[-2.5, 0, 2.5].forEach((x, i) => [-1, 1].forEach(sd => add(`side_tyre_${i}_${sd > 0 ? 'p' : 's'}`, new THREE.TorusGeometry(0.28, 0.11, 12, 32), mat.rubber, x, 1.35, sd * 2.32)));
// side floaters (fenders) hanging off the bulwark
[-3.6, -1.25, 1.25].forEach((x, i) => [-1, 1].forEach(sd => {
  const tag = `${i}_${sd > 0 ? 'p' : 's'}`, z = sd * 2.47;
  add('floater_' + tag, new THREE.CapsuleGeometry(0.2, 0.5, 8, 24), mat.white, x, 1.4, z);
  add('floater_cap_top_' + tag, new THREE.CylinderGeometry(0.12, 0.2, 0.12, 20), mat.navy, x, 1.82, z);
  add('floater_cap_bot_' + tag, new THREE.CylinderGeometry(0.2, 0.12, 0.12, 20), mat.navy, x, 0.98, z);
  rod('floater_rope_' + tag, new THREE.Vector3(x, 1.88, z), new THREE.Vector3(x, 2.28, sd * 2.2), 0.018, mat.rope);
}));
// cabin
add('cabin', new THREE.BoxGeometry(3.4, 1.4, 2.8), mat.yellow, 0.6, 2.54, 0);
add('cabin_roof', new THREE.BoxGeometry(3.7, 0.12, 3.1), mat.white, 0.6, 3.3, 0);
[-1.41, 1.41].forEach((z, k) => [-0.4, 0.6, 1.6].forEach((x, i) => add(`cabin_window_${k}_${i}`, new THREE.BoxGeometry(0.6, 0.5, 0.02), mat.glass, x, 2.75, z)));
add('cabin_window_front', new THREE.BoxGeometry(0.02, 0.5, 2.0), mat.glass, 2.311, 2.75, 0);
add('cabin_door', new THREE.BoxGeometry(0.02, 1.0, 0.7), mat.navy, -1.111, 2.35, 0);
// nav lights: port (red, -z) and starboard (green, +z)
[[-1, mat.navRed, 'port'], [1, mat.navGreen, 'starboard']].forEach(([sd, m, tag]) => {
  add('nav_box_' + tag, new THREE.BoxGeometry(0.3, 0.22, 0.12), mat.navy, 2.15, 3.47, sd * 1.42);
  add('nav_lamp_' + tag, new THREE.SphereGeometry(0.1, 20, 14), m, 2.15, 3.66, sd * 1.42);
});
// life ring on cabin aft wall
const ring = new THREE.Group(); ring.name = 'life_ring'; ring.position.set(-1.2, 2.6, 0.95); ring.rotation.y = Math.PI / 2; boat.add(ring);
for (let i = 0; i < 4; i++) add('life_ring_' + i, new THREE.TorusGeometry(0.27, 0.075, 12, 16, Math.PI / 2), i % 2 ? mat.white : mat.red, 0, 0, 0, ring).rotation.z = i * Math.PI / 2;
// lighthouse tower (exaggerated: taller + wider)
const tower = new THREE.Group(); tower.name = 'lighthouse'; tower.position.set(0.1, 3.36, 0); tower.scale.set(1.2, 1.3, 1.2); boat.add(tower);
add('tower_body', new THREE.CylinderGeometry(0.62, 0.75, 3.0, 48), mat.white, 0, 1.5, 0, tower);
[0.55, 1.65, 2.7].forEach((y, i) => { const r = 0.75 - (y / 3) * 0.13 + 0.012; add('tower_band_' + i, new THREE.CylinderGeometry(r - 0.01, r + 0.01, 0.32, 48), mat.red, 0, y, 0, tower); });
[0.25, 0.25 + Math.PI].forEach((a, i) => add('tower_window_' + i, new THREE.BoxGeometry(0.02, 0.35, 0.25), mat.glass, Math.cos(a) * 0.71, 1.1, Math.sin(a) * 0.71, tower).rotation.y = -a);
add('gallery', new THREE.CylinderGeometry(0.95, 0.85, 0.16, 48), mat.red, 0, 3.08, 0, tower);
for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; add('gallery_post_' + i, new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6), mat.navy, Math.cos(a) * 0.9, 3.36, Math.sin(a) * 0.9, tower); }
add('gallery_rail', new THREE.TorusGeometry(0.9, 0.025, 8, 64), mat.navy, 0, 3.56, 0, tower).rotation.x = Math.PI / 2;
add('lantern_base', new THREE.CylinderGeometry(0.5, 0.5, 0.3, 32), mat.white, 0, 3.31, 0, tower);
add('lantern_glass', new THREE.CylinderGeometry(0.44, 0.44, 0.6, 32), mat.glass, 0, 3.76, 0, tower);
for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; add('lantern_mullion_' + i, new THREE.BoxGeometry(0.04, 0.6, 0.04), mat.navy, Math.cos(a) * 0.45, 3.76, Math.sin(a) * 0.45, tower); }
add('lantern_roof', new THREE.ConeGeometry(0.62, 0.55, 32), mat.yellow, 0, 4.33, 0, tower);
add('roof_ball', new THREE.SphereGeometry(0.1, 16, 12), mat.red, 0, 4.66, 0, tower);
add('mast', new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8), mat.metal, 0, 5.1, 0, tower);
const anemo = new THREE.Group(); anemo.name = 'anemometer'; anemo.position.set(0, 5.45, 0); tower.add(anemo);
add('anemometer_bar', new THREE.BoxGeometry(0.5, 0.03, 0.03), mat.metal, 0, 0, 0, anemo);
add('anemometer_bar_2', new THREE.BoxGeometry(0.03, 0.03, 0.5), mat.metal, 0, 0, 0, anemo);
[[0.25, 0], [-0.25, 0], [0, 0.25], [0, -0.25]].forEach(([x, z], i) => add('anemometer_cup_' + i, new THREE.SphereGeometry(0.07, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.metal, x, -0.03, z, anemo));
add('vane', new THREE.BoxGeometry(0.03, 0.18, 0.28), mat.red, 0, 5.62, 0, tower);
// stack
add('stack', new THREE.CylinderGeometry(0.42, 0.42, 1.6, 40), mat.navy, 1.6, 4.1, 0.6);
add('stack_band', new THREE.CylinderGeometry(0.435, 0.435, 0.35, 40), mat.red, 1.6, 4.5, 0.6);
add('stack_cap', new THREE.CylinderGeometry(0.46, 0.46, 0.08, 40), mat.rubber, 1.6, 4.94, 0.6);
// antenna mast on cabin roof
add('antenna_mast', new THREE.CylinderGeometry(0.04, 0.05, 1.8, 10), mat.white, -0.8, 4.26, -1.05);
add('antenna_yard', new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), mat.white, -0.8, 4.75, -1.05).rotation.x = Math.PI / 2;
add('radar', new THREE.BoxGeometry(0.6, 0.1, 0.14), mat.navy, -0.8, 5.2, -1.05);
add('mast_flag', new THREE.BoxGeometry(0.5, 0.32, 0.015), mat.red, -0.53, 4.98, -1.05);
// foredeck
add('bitt', new THREE.CylinderGeometry(0.14, 0.14, 0.45, 20), mat.metal, 3.5, 2.04, 0);
add('bitt_cross', new THREE.CylinderGeometry(0.06, 0.06, 0.6, 12), mat.metal, 3.5, 2.12, 0).rotation.x = Math.PI / 2;
add('winch', new THREE.CylinderGeometry(0.3, 0.3, 0.9, 24), mat.red, 2.8, 2.14, 0).rotation.x = Math.PI / 2;
add('winch_rope', new THREE.CylinderGeometry(0.33, 0.33, 0.6, 24), mat.rope, 2.8, 2.14, 0).rotation.x = Math.PI / 2;
// rope coils
[[3.4, 1.2], [-3.7, 1.25], [-1.6, -1.5]].forEach(([x, z], i) => [0, 1].forEach(k => add(`rope_coil_${i}_${k}`, new THREE.TorusGeometry(0.3 - k * 0.09, 0.055, 10, 32), mat.rope, x, 1.9 + k * 0.08, z).rotation.x = Math.PI / 2));
// aft deck cargo
add('crate_0', new THREE.BoxGeometry(0.8, 0.7, 0.8), mat.wood, -2.4, 2.19, -0.9);
add('crate_1', new THREE.BoxGeometry(0.7, 0.6, 0.7), mat.wood, -2.3, 2.84, -0.85).rotation.y = 0.3;
add('crate_2', new THREE.BoxGeometry(0.9, 0.55, 0.7), mat.wood, -3.4, 2.12, -0.6);
add('barrel_0', new THREE.CylinderGeometry(0.3, 0.3, 0.8, 24), mat.red, -2.5, 2.24, 0.9);
add('barrel_1', new THREE.CylinderGeometry(0.3, 0.3, 0.8, 24), mat.navy, -3.2, 2.24, 1.0);
// ship's wheel on a wooden pedestal
add('helm_pedestal', new THREE.BoxGeometry(0.28, 0.85, 0.36), mat.wood, -1.62, 2.25, 0);
add('helm_axle', new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), mat.metal, -1.8, 2.62, 0).rotation.z = Math.PI / 2;
const wheel = new THREE.Group(); wheel.name = 'ships_wheel'; wheel.position.set(-1.95, 2.62, 0); boat.add(wheel);
add('wheel_rim', new THREE.TorusGeometry(0.4, 0.04, 12, 48), mat.woodLight, 0, 0, 0, wheel).rotation.y = Math.PI / 2;
add('wheel_hub', new THREE.CylinderGeometry(0.09, 0.09, 0.1, 20), mat.wood, 0, 0, 0, wheel).rotation.z = Math.PI / 2;
for (let i = 0; i < 4; i++) add('wheel_spoke_' + i, new THREE.CylinderGeometry(0.022, 0.022, 1.08, 8), mat.woodLight, 0, 0, 0, wheel).rotation.x = i * Math.PI / 4;
for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; add('wheel_handle_' + i, new THREE.CapsuleGeometry(0.035, 0.08, 4, 10), mat.wood, 0, Math.cos(a) * 0.56, Math.sin(a) * 0.56, wheel).rotation.x = -a; }
for (let i = 0; i < 7; i++) add('aft_rail_post_' + i, new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), mat.white, -4.15, 2.55, -1.5 + i * 0.5);
add('aft_rail', new THREE.CylinderGeometry(0.03, 0.03, 3.0, 8), mat.white, -4.15, 2.8, 0).rotation.x = Math.PI / 2;
// pennant line: lighthouse roof -> bow bitt, and -> stern rail
const top = new THREE.Vector3(0.1, 3.36 + 4.66 * 1.3, 0);
[[new THREE.Vector3(3.5, 2.27, 0), 'fore'], [new THREE.Vector3(-4.15, 2.8, 0), 'aft']].forEach(([end, tag]) => {
  rod('flag_line_' + tag, top, end, 0.012, mat.rope);
  for (let k = 1; k < 9; k++) {
    const p = top.clone().lerp(end, k / 9);
    const tri = new THREE.Shape(); tri.moveTo(-0.16, 0); tri.lineTo(0.16, 0); tri.lineTo(0, -0.38);
    add(`pennant_${tag}_${k}`, new THREE.ShapeGeometry(tri), flagCols[k % flagCols.length], p.x, p.y, p.z);
  }
});
// prop + rudder
add('rudder', new THREE.BoxGeometry(0.6, 0.9, 0.08), mat.bottom, -4.45, 0.2, 0);
add('prop_shaft', new THREE.CylinderGeometry(0.06, 0.06, 1.0, 12), mat.metal, -5.2, 0.95, 0).rotation.z = Math.PI / 2;
const prop = new THREE.Group(); prop.name = 'wooden_propeller'; prop.position.set(-5.72, 0.95, 0); boat.add(prop);
add('prop_hub', new THREE.CylinderGeometry(0.13, 0.16, 0.26, 24), mat.wood, 0, 0, 0, prop).rotation.z = Math.PI / 2;
add('prop_cone', new THREE.ConeGeometry(0.13, 0.22, 24), mat.wood, -0.24, 0, 0, prop).rotation.z = Math.PI / 2;
for (let i = 0; i < 4; i++) { const arm = new THREE.Group(); arm.rotation.x = i * Math.PI / 2; prop.add(arm); const b = add('prop_blade_' + i, new THREE.CapsuleGeometry(0.1, 0.42, 6, 16), mat.woodLight, 0, 0.36, 0, arm); b.scale.set(0.35, 1, 1.25); b.rotation.y = 0.5; }

// ink outlines: thick on silhouette parts, thin on details
const inkMat = w => { const m = new THREE.MeshBasicMaterial({ name: 'ink_outline', color: '#152042', side: THREE.BackSide }); m.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * ' + w.toFixed(3) + ';'); }; return m; };
const inkThick = inkMat(0.055), inkThin = inkMat(0.016);
const bold = /^(keel|hull|bulwark|fender_rub|bow_fender|cabin$|cabin_roof|tower_body|gallery$|lantern_roof|stack$|crate|barrel|stern_tyre|winch$)/;
const outlines = [], meshes = [];
boat.traverse(o => o.isMesh && meshes.push(o));
meshes.forEach(o => { if (/^(pennant|flag_line|nav_lamp)/.test(o.name)) return; const l = new THREE.Mesh(o.geometry, bold.test(o.name) ? inkThick : inkThin); l.name = o.name + '_outline'; l.castShadow = false; o.add(l); outlines.push(l); });
const navFx = [];
[['port', '#ff2a1f', -1], ['starboard', '#1fff6a', 1]].forEach(([tag, c, sd]) => {
  const halo = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.set(2.15, 3.66, sd * 1.42); boat.add(halo); outlines.push(halo);
  const pl = new THREE.PointLight(c, 3, 5, 2); pl.position.copy(halo.position); boat.add(pl); outlines.push(pl);
  navFx.push({ halo, pl, mat: tag === 'port' ? mat.navRed : mat.navGreen, ph: sd > 0 ? 0.5 : 0 });
});
stage.setObject(boat);

// lighting: warm key, cool sky/ground wash, cyan back light
stage._scene.traverse(o => {
  if (o.isHemisphereLight) { o.color.set('#fff3dc'); o.groundColor.set('#4f86d6'); o.intensity = 1.15; }
  else if (o.isDirectionalLight && o === stage._key) { o.color.set('#fff0d2'); o.intensity = 2.6; }
  else if (o.isDirectionalLight) { o.color.set('#8fe1ff'); o.intensity = 1.3; o.position.set(-6, 4, -5); }
});
stage._ground.visible = false;
{ const tgt = stage._controls.target, d = stage._camera.position.distanceTo(tgt) * 1.9; tgt.y = 2.5;
  stage._camera.position.copy(tgt).add(new THREE.Vector3(0.9, 0.32, 1.2).normalize().multiplyScalar(d)); stage._camera.far = 2000; stage._camera.updateProjectionMatrix(); stage._controls.update(); }

// painted sea + sky + clouds + debris (scene-level, not exported)
const WL = 0.85;
const seaGroup = new THREE.Group(); stage._scene.add(seaGroup);
const NOISE = `
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), f.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; } return v; }`;
const seaU = { time: { value: 0 }, bp: { value: new THREE.Vector2() }, yaw: { value: 0 }, uAmp: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) }, uHaze: { value: new THREE.Color(0.92, 0.99, 1) }, uFog: { value: new THREE.Vector2(170, 390) }, uSun: { value: new THREE.Vector3(0.45, 0.75, 0.35).normalize() }, uSpec: { value: 1 }, uFlash: { value: 0 } };
const nz = (x, y) => { const l = Math.hypot(x, y); return [x / l, y / l]; };
const WD = [nz(1, 0.3), nz(-0.4, 1), nz(0.7, -0.7), nz(0.2, 1)], WA = [0.34, 0.2, 0.11, 0.05], WK = [0.18, 0.29, 0.52, 0.95], WS = [1.1, 1.5, 2.1, 2.9];
const ENV = { amp: 1 };
const waveJS = (x, z, t) => { let s = 0; for (let i = 0; i < 4; i++) s += WA[i] * Math.sin((WD[i][0] * x + WD[i][1] * z) * WK[i] + t * WS[i]); return s * ENV.amp; };
const WAVE_GLSL = `
  float waveH(vec2 p, float t){
    return 0.34 * sin(dot(normalize(vec2(1.0, 0.3)), p) * 0.18 + t * 1.1)
         + 0.2 * sin(dot(normalize(vec2(-0.4, 1.0)), p) * 0.29 + t * 1.5)
         + 0.11 * sin(dot(normalize(vec2(0.7, -0.7)), p) * 0.52 + t * 2.1)
         + 0.05 * sin(dot(normalize(vec2(0.2, 1.0)), p) * 0.95 + t * 2.9); }`;
const makeSea = waves => new THREE.ShaderMaterial({
  name: 'sea', uniforms: seaU, defines: waves ? { WAVES: 1 } : {}, extensions: { derivatives: true },
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
      vec3 col = mix(deep, mid, smoothstep(4.0, 70.0, d));
      col = mix(col, far, smoothstep(50.0, 200.0, d));
      float blot = fbm(p * 0.035 + vec2(time * 0.008, 0.0));
      col = mix(col, deep * 0.82, smoothstep(0.55, 0.72, blot) * 0.55);
      float glow = fbm(p * 0.05 + 7.3);
      col = mix(col, lite, smoothstep(0.6, 0.78, glow) * 0.45);
      float st = fbm(vec2(p.x * 0.09, p.y * 0.55) + vec2(time * 0.05, 0.0));
      col = mix(col, lite, smoothstep(0.66, 0.7, st) * 0.4);
      float cr = noise(vec2(p.x * 0.55 + time * 0.35, p.y * 2.8));
      col = mix(col, vec3(0.93, 0.99, 1.0), step(0.96, cr) * 0.6 * (1.0 - smoothstep(25.0, 110.0, d)));
      vec2 dd = p - bp - vec2(-0.6, 0.9); vec2 lc = vec2(dot(dd, vec2(cos(yaw), -sin(yaw))), dot(dd, vec2(sin(yaw), cos(yaw)))); float sh = length(lc / vec2(6.8, 3.4));
      col *= mix(0.72, 1.0, smoothstep(0.55, 1.15, sh));
      #ifdef WAVES
      vec3 n = normalize(cross(dFdx(wp), dFdy(wp))); if (n.y < 0.0) n = -n;
      vec3 sunD = uSun;
      float lamb = dot(n, sunD);
      col *= 0.86 + 0.24 * smoothstep(0.62, 0.8, lamb);
      col = mix(col, lite, smoothstep(0.25, 0.55, vh) * 0.45);
      float capN = noise(p * 1.3 + vec2(time * 0.6, 0.0));
      col = mix(col, vec3(0.95, 1.0, 1.0), smoothstep(0.42, 0.5, vh + (capN - 0.5) * 0.35) * 0.75);
      vec3 vdir = normalize(cameraPosition - wp);
      float spec = pow(max(dot(reflect(-sunD, n), vdir), 0.0), 60.0);
      float tw = step(0.72, noise(p * 2.6 + vec2(time * 1.7, -time * 1.3)));
      col *= uTint;
      col += vec3(1.0, 0.98, 0.9) * step(0.35, spec * tw) * (1.0 - smoothstep(20.0, 70.0, d)) * uSpec;
      #else
      col *= uTint;
      #endif
      col += uFlash * vec3(0.25, 0.3, 0.38);
      col = mix(col, uHaze, smoothstep(uFog.x, uFog.y, d));
      gl_FragColor = vec4(col, 1.0);
    }`,
});
const seaMesh = new THREE.Mesh(new THREE.CircleGeometry(420, 128), makeSea(false)); seaMesh.rotation.x = -Math.PI / 2; seaMesh.position.y = WL - 0.02; seaGroup.add(seaMesh);
const nearGeo = new THREE.PlaneGeometry(150, 150, 240, 240); nearGeo.rotateX(-Math.PI / 2);
const seaNear = new THREE.Mesh(nearGeo, makeSea(true)); seaNear.position.y = WL; seaNear.frustumCulled = false; seaGroup.add(seaNear);
// spray particles (bow spray when moving, hull splashes when idle)
const SPN = 260, sprayPos = new Float32Array(SPN * 3).fill(-999), sprayVel = new Float32Array(SPN * 3), sprayLife = new Float32Array(SPN);
const sprayGeo = new THREE.BufferGeometry(); sprayGeo.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
const spray = new THREE.Points(sprayGeo, new THREE.PointsMaterial({ color: '#f4feff', size: 0.28, transparent: true, opacity: 0.9, depthWrite: false })); spray.frustumCulled = false; stage._scene.add(spray);
let sprayI = 0;
const emit = (x, y, z, vx, vy, vz) => { const i = sprayI++ % SPN; sprayPos.set([x, y, z], i * 3); sprayVel.set([vx, vy, vz], i * 3); sprayLife[i] = 0.8 + Math.random() * 0.6; };
const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uStars: { value: 0 }, uFlash: { value: 0 }, time: seaU.time };
const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: skyU,
  vertexShader: 'varying vec3 dir; void main(){ dir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform float uStars; uniform float uFlash; uniform float time; varying vec3 dir; ${NOISE}
    void main(){ float y = dir.y;
      vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.06, y));
      col = mix(col, uTop, smoothstep(0.06, 0.55, y));
      col = mix(col, col * 0.93, smoothstep(0.6, 0.7, fbm(vec2(atan(dir.z, dir.x) * 6.0, y * 30.0))) * step(0.05, y) * 0.6);
      vec2 sc = vec2(atan(dir.z, dir.x) * 90.0, y * 180.0); vec2 ci = floor(sc); float sh = hash(ci);
      float star = step(0.986, sh) * (1.0 - smoothstep(0.08, 0.38, length(fract(sc) - 0.5))) * (0.6 + 0.4 * sin(time * (2.0 + sh * 5.0) + sh * 50.0));
      col += vec3(0.95, 0.97, 1.0) * star * uStars * smoothstep(0.04, 0.25, y);
      col += uFlash * vec3(0.5, 0.55, 0.7) * smoothstep(-0.05, 0.4, y);
      gl_FragColor = vec4(col, 1.0); }`,
}));
stage._scene.add(sky);
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const cloudGroup = new THREE.Group(); stage._scene.add(cloudGroup);
const cloudVS = 'uniform vec2 size; varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0); mv.xy += position.xy * size; gl_Position = projectionMatrix * mv; }';
const cloudU = { time: seaU.time, cover: { value: 0.35 }, dark: { value: 0 }, tint: { value: new THREE.Color(1, 1, 1) }, fade: { value: 1 }, flash: { value: 0 } };
const cloudFS = `uniform float seed; uniform float time; uniform float cover; uniform float dark; uniform vec3 tint; uniform float fade; uniform float flash; uniform float rank; varying vec2 vUv; ${NOISE}
  float fbm6(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 6; i++) { v += a * noise(p); p = p * 2.07 + 3.1; a *= 0.5; } return v; }
  void main(){
    vec2 q = vUv; vec2 drift = vec2(time * 0.012, time * 0.004); float n = fbm6(q * vec2(2.0, 3.2) + seed + drift), n2 = fbm6(q * 7.0 + seed * 1.7 - drift * 2.5);
    float r = length(q * vec2(1.0, 1.7));
    float base = smoothstep(-0.62, -0.3, q.y + (n2 - 0.5) * 0.12);
    float dens = n * 0.8 + n2 * 0.2 - r * 0.62 + 0.12 + dark * 0.08;
    float a = smoothstep(0.16, 0.44, dens) * base * smoothstep(rank - 0.06, rank + 0.06, cover) * fade;
    if (a < 0.01) discard;
    float lit = smoothstep(-0.55, 0.65, q.y + (n2 - 0.5) * 0.9 + (n - 0.5) * 0.5);
    vec3 col = mix(vec3(0.6, 0.69, 0.8), vec3(1.0, 0.995, 0.975), lit);
    col = mix(col, vec3(1.0), (1.0 - smoothstep(0.16, 0.34, dens)) * 0.5 * lit);
    col = mix(col, vec3(0.3, 0.33, 0.39) * (0.65 + 0.45 * lit), dark);
    col *= tint; col += flash * vec3(0.85, 0.9, 1.0) * (0.4 + 0.6 * (1.0 - lit));
    gl_FragColor = vec4(col, a);
  }`;
const cloudMeshes = [];
for (let i = 0; i < 16; i++) {
  const ang = (i / 16) * Math.PI * 2 + rnd() * 0.3, r = 520 + rnd() * 230, y = 35 + rnd() * 110, w = 150 + rnd() * 170;
  for (let k = 0; k < 3; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { ...cloudU, rank: { value: (i / 16) * 0.3 }, seed: { value: rnd() * 100 }, size: { value: new THREE.Vector2(w * (0.6 + rnd() * 0.5), w * (0.4 + rnd() * 0.2)) } }, vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false }));
    m.position.set(Math.cos(ang) * r + (k - 1) * w * 0.35, y + rnd() * 12, Math.sin(ang) * r + (k - 1) * 20); m.frustumCulled = false; cloudGroup.add(m); m.userData = { y: m.position.y, ph: rnd() * 6.28 }; cloudMeshes.push(m);
  }
}
// extra overhead cloud layer that rolls in with heavier weather
for (let i = 0; i < 18; i++) {
  const ang = rnd() * Math.PI * 2, r = 90 + rnd() * 380, y = 55 + rnd() * 40, w = 110 + rnd() * 140;
  for (let k = 0; k < 2; k++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ uniforms: { ...cloudU, rank: { value: 0.4 + (i / 18) * 0.55 }, seed: { value: rnd() * 100 }, size: { value: new THREE.Vector2(w * (0.7 + rnd() * 0.5), w * (0.45 + rnd() * 0.2)) } }, vertexShader: cloudVS, fragmentShader: cloudFS, transparent: true, depthWrite: false }));
    m.position.set(Math.cos(ang) * r + (k - 0.5) * w * 0.4, y + rnd() * 8, Math.sin(ang) * r); m.frustumCulled = false; cloudGroup.add(m); m.userData = { y: m.position.y, ph: rnd() * 6.28 }; cloudMeshes.push(m);
  }
}
// moon (child of sky so it follows the boat)
const moon = new THREE.Mesh(new THREE.SphereGeometry(26, 24, 16), new THREE.MeshBasicMaterial({ color: '#fff4d6', transparent: true, opacity: 0, fog: false, depthWrite: false })); moon.position.set(-330, 280, -440); sky.add(moon);
const moonHalo = new THREE.Mesh(new THREE.SphereGeometry(70, 24, 16), new THREE.MeshBasicMaterial({ color: '#9fb8ff', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, fog: false, depthWrite: false })); moon.add(moonHalo);
// rain + snow
const RN = 1600, rainPos = new Float32Array(RN * 6), rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rainSeed = Array.from({ length: RN }, () => [Math.random() * 90 - 45, Math.random() * 40, Math.random() * 90 - 45, 18 + Math.random() * 8]);
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: '#d4e6ff', transparent: true, opacity: 0, depthWrite: false, fog: false })); rain.frustumCulled = false; stage._scene.add(rain);
const SNN = 1600, snowPos = new Float32Array(SNN * 3), snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snowSeed = Array.from({ length: SNN }, () => [Math.random() * 90 - 45, Math.random() * 40, Math.random() * 90 - 45, 1 + Math.random() * 1.2, Math.random() * 6.28]);
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.24, transparent: true, opacity: 0, depthWrite: false, fog: false })); snow.frustumCulled = false; stage._scene.add(snow);
// lighthouse beam (night)
const beamPivot = new THREE.Group(); beamPivot.position.set(0, 3.76, 0); tower.add(beamPivot); outlines.push(beamPivot);
const beamMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false });
[0, Math.PI].forEach(r => { const g = new THREE.ConeGeometry(2.6, 28, 20, 1, true); g.translate(0, -14, 0); g.rotateZ(Math.PI / 2); g.rotateZ(-0.3); const b = new THREE.Mesh(g, beamMat); b.rotation.y = r; beamPivot.add(b); });
const poolMat = new THREE.MeshBasicMaterial({ color: '#fff2b0', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const pools = [0, Math.PI].map(r => { const m = new THREE.Mesh(new THREE.CircleGeometry(3.2, 32), poolMat); m.rotation.order = 'YXZ'; m.scale.set(2.2, 1, 1); m.userData.r = r; stage._scene.add(m); return m; });
const lanternW = new THREE.Vector3();
// weather + time of day
const C = c => new THREE.Color(c);
const PRESET = {
  clear:  { top: '#33a8e8', mid: '#8cd9f5', hor: '#f0fcff', tint: [1, 1, 1], cover: 0.32, dark: 0, amp: 1, fog: [170, 390], cfade: 1, rain: 0, snow: 0, sun: 1, storm: 0 },
  cloudy: { top: '#6d9cc0', mid: '#a9cadc', hor: '#e6f0f4', tint: [0.86, 0.9, 0.95], cover: 0.8, dark: 0.25, amp: 1.25, fog: [150, 380], cfade: 1, rain: 0, snow: 0, sun: 0.6, storm: 0 },
  rain:   { top: '#5a7590', mid: '#8ea3b4', hor: '#c3cfd6', tint: [0.68, 0.76, 0.84], cover: 1, dark: 0.55, amp: 1.6, fog: [90, 300], cfade: 1, rain: 1, snow: 0, sun: 0.35, storm: 0 },
  storm:  { top: '#26313f', mid: '#47525f', hor: '#76828c', tint: [0.46, 0.55, 0.63], cover: 1, dark: 0.88, amp: 2.5, fog: [60, 240], cfade: 1, rain: 1.6, snow: 0, sun: 0.18, storm: 1 },
  fog:    { top: '#b8d0dc', mid: '#d4e2e8', hor: '#e4edf0', tint: [0.86, 0.9, 0.93], cover: 0.6, dark: 0.1, amp: 0.7, fog: [6, 75], cfade: 0.12, rain: 0, snow: 0, sun: 0.5, storm: 0 },
  snow:   { top: '#9fb6cc', mid: '#c9d8e3', hor: '#eef3f6', tint: [0.76, 0.84, 0.9], cover: 0.9, dark: 0.22, amp: 0.9, fog: [70, 280], cfade: 1, rain: 0, snow: 1, sun: 0.5, storm: 0 },
};
const NIGHT = { top: C('#050d24'), mid: C('#0f2148'), hor: C('#24406b'), tint: C('#3f5680') };
const state = { w: 'clear', night: false, view: 'chase' };
const VIEWS = { chase: stage._camera.position.clone().sub(stage._controls.target), top: new THREE.Vector3(5, 62, 16) };
stage._controls.minDistance = 8; stage._controls.maxDistance = 260; stage._controls.zoomSpeed = 1.4;
let zoomAnim = null;
const zoomBy = f => { const off = (zoomAnim ? zoomAnim.to : stage._camera.position.clone().sub(stage._controls.target)); const l = Math.min(260, Math.max(8, off.length() * f)); zoomAnim = { from: stage._camera.position.clone().sub(stage._controls.target), to: off.clone().setLength(l), k: 0 }; stage._controls.autoRotate = false; };
let camAnim = null;
const sphA = new THREE.Spherical(), sphB = new THREE.Spherical(), animOff = new THREE.Vector3();
// interpolate camera offsets on a sphere (shortest way round) so view changes orbit instead of dipping through the boat
const lerpOff = (a, b, e, out) => { sphA.setFromVector3(a); sphB.setFromVector3(b); const dth = Math.atan2(Math.sin(sphB.theta - sphA.theta), Math.cos(sphB.theta - sphA.theta)); return out.setFromSphericalCoords(sphA.radius + (sphB.radius - sphA.radius) * e, sphA.phi + (sphB.phi - sphA.phi) * e, sphA.theta + dth * e); };
const animCam = (to, ty1, dur = 1.3) => { const tg = stage._controls.target; stage._controls.autoRotate = false; zoomAnim = null; camAnim = { from: stage._camera.position.clone().sub(tg), to, rel: new THREE.Vector3(tg.x - boat.position.x, tg.y, tg.z - boat.position.z), ty1, dur, k: 0 }; };
const setView = v => { state.view = v; animCam(VIEWS[v].clone(), v === 'top' ? WL : 2.5); };
const recenter = () => setView(state.view);
const faceNorth = () => { const off = stage._camera.position.clone().sub(stage._controls.target); sphA.setFromVector3(off); animCam(new THREE.Vector3().setFromSphericalCoords(sphA.radius, sphA.phi, 0), stage._controls.target.y, 0.8); };
const E = { top: C('#33a8e8'), mid: C('#8cd9f5'), hor: C('#f0fcff'), tint: C('#ffffff'), cover: 0.32, dark: 0, amp: 1, fogN: 170, fogF: 390, cfade: 1, rain: 0, snow: 0, sun: 1, night: 0 };
stage._scene.fog = new THREE.Fog('#f0fcff', 170, 390);
let flash = 0, nextBolt = 3;
const lights = {}; stage._scene.traverse(o => { if (o.isHemisphereLight) lights.hemi = o; else if (o.isDirectionalLight && o === stage._key) lights.key = o; else if (o.isDirectionalLight) lights.back = o; });
const tmp = new THREE.Color();
const deckLight = new THREE.PointLight('#ffd9a0', 0, 22, 1.6); deckLight.position.set(0.5, 6.5, 0); boat.add(deckLight); outlines.push(deckLight);
const deckLight2 = new THREE.PointLight('#cfe0ff', 0, 18, 1.6); deckLight2.position.set(-3.5, 4.5, 0); boat.add(deckLight2); outlines.push(deckLight2);
function stepEnv(t, dt) {
  if (zoomAnim && !camAnim) { zoomAnim.k = Math.min(1, zoomAnim.k + dt / 0.35); const e = 1 - Math.pow(1 - zoomAnim.k, 3); stage._camera.position.copy(stage._controls.target).add(zoomAnim.from.clone().lerp(zoomAnim.to, e)); if (zoomAnim.k >= 1) zoomAnim = null; }
  if (camAnim) { camAnim.k = Math.min(1, camAnim.k + dt / camAnim.dur); const e = camAnim.k * camAnim.k * (3 - 2 * camAnim.k); const tg = stage._controls.target, r = camAnim.rel;
    tg.set(boat.position.x + r.x * (1 - e), r.y + (camAnim.ty1 - r.y) * e, boat.position.z + r.z * (1 - e)); stage._camera.position.copy(tg).add(lerpOff(camAnim.from, camAnim.to, e, animOff)); if (camAnim.k >= 1) camAnim = null; }
  const P = PRESET[state.w], n = state.night ? 1 : 0, k = Math.min(1, dt * 1.2);
  const dim = 1 - 0.45 * P.dark;
  [['top'], ['mid'], ['hor']].forEach(([key]) => { tmp.set(P[key]).lerp(NIGHT[key].clone().multiplyScalar(dim), n); E[key].lerp(tmp, k); });
  tmp.setRGB(...P.tint); if (n) tmp.multiply(NIGHT.tint); E.tint.lerp(tmp, k);
  const L = (a, b) => a + (b - a) * k;
  E.cover = L(E.cover, P.cover); E.dark = L(E.dark, P.dark); E.amp = L(E.amp, P.amp); E.fogN = L(E.fogN, P.fog[0]); E.fogF = L(E.fogF, P.fog[1]);
  E.cfade = L(E.cfade, P.cfade); E.rain = L(E.rain, P.rain); E.snow = L(E.snow, P.snow); E.sun = L(E.sun, P.sun); E.night = L(E.night, n);
  if (P.storm) { nextBolt -= dt; if (nextBolt <= 0) { flash = 1; nextBolt = 2.5 + Math.random() * 6; setTimeout(() => { flash = 0.8; }, 140); } }
  flash = Math.max(0, flash - dt * 4.5);
  ENV.amp = E.amp; seaU.uAmp.value = E.amp; seaU.uTint.value.copy(E.tint); seaU.uHaze.value.copy(E.hor); seaU.uFog.value.set(E.fogN, E.fogF); seaU.uFlash.value = flash;
  seaU.uSun.value.set(0.45, 0.75, 0.35).normalize().lerp(new THREE.Vector3(-0.53, 0.46, -0.71), E.night).normalize();
  seaU.uSpec.value = Math.max(0, 1.1 - E.cover * 0.4 - E.dark) * (1 - 0.4 * E.night);
  skyU.uTop.value.copy(E.top); skyU.uMid.value.copy(E.mid); skyU.uHor.value.copy(E.hor); skyU.uStars.value = E.night * Math.max(0, 1 - E.cover * 0.75); skyU.uFlash.value = flash;
  cloudU.cover.value = E.cover; cloudU.dark.value = E.dark; cloudU.fade.value = E.cfade; cloudU.flash.value = flash;
  cloudU.tint.value.setRGB(1, 1, 1).lerp(C('#4a5c86'), E.night * 0.85);
  stage._scene.fog.color.copy(E.hor); const camD = stage._camera.position.distanceTo(stage._controls.target); stage._scene.fog.near = Math.max(E.fogN, camD * 1.05); stage._scene.fog.far = Math.max(E.fogF, camD * 1.05 + 60);
  lights.hemi.color.set('#fff3dc').lerp(C('#7488bb'), E.night); lights.hemi.groundColor.set('#4f86d6').lerp(C('#14244c'), E.night);
  lights.hemi.intensity = Math.max(0.6 * E.night, (0.55 + 0.6 * E.sun) * (1 - 0.6 * E.night)) + flash * 2.5;
  lights.key.color.set('#fff0d2').lerp(C('#a9c1ff'), E.night); lights.key.intensity = 2.6 * E.sun * (1 - E.night) + 0.9 * E.night;
  deckLight.intensity = E.night * 26 + E.dark * (1 - E.night) * 10; deckLight2.intensity = deckLight.intensity * 0.6;
  lights.back.intensity = 1.3 * (0.5 + 0.5 * E.sun) * (1 - 0.6 * E.night);
  moon.material.opacity = E.night * Math.max(0.15, 1 - E.cover * 0.85); moonHalo.material.opacity = moon.material.opacity * 0.12;
  mat.glass.emissiveIntensity = 0.3 + 1.6 * E.night;
  beamMat.opacity = Math.max(E.night, (1 - E.cfade) * 0.6, E.dark * 0.5) * 0.16; beamPivot.rotation.y = t * 0.9;
  poolMat.opacity = beamMat.opacity * 1.6;
  if (poolMat.opacity > 0.002) { beamPivot.getWorldPosition(lanternW); const hd = Math.max(4, (lanternW.y - WL) / Math.tan(0.3)) * 0.92;
    pools.forEach(p => { const a = beamPivot.rotation.y + p.userData.r + boat.rotation.y; const px = lanternW.x + Math.cos(a) * hd, pz = lanternW.z - Math.sin(a) * hd; p.position.set(px, WL + 0.06 + waveJS(px, pz, t), pz); p.rotation.set(-Math.PI / 2, a, 0); }); }
  const cx = boat.position.x, cz = boat.position.z;
  rain.material.opacity = Math.min(0.6, E.rain * 0.5) * (1 - 0.45 * E.night) * (state.view === 'top' ? 0.6 : 1);
  if (E.rain > 0.01) for (let i = 0; i < RN; i++) { const s = rainSeed[i]; s[1] -= s[3] * dt * (0.7 + E.rain * 0.4); if (s[1] < 0) s[1] += 40; const x = cx + s[0], z = cz + s[2], y = WL + s[1]; rainPos.set([x, y, z, x + 0.35 * E.rain, y + 0.9, z + 0.15], i * 6); }
  rainGeo.attributes.position.needsUpdate = true;
  snow.material.opacity = Math.min(1, E.snow) * 0.95;
  if (E.snow > 0.01) for (let i = 0; i < SNN; i++) { const s = snowSeed[i]; s[1] -= s[3] * dt; if (s[1] < 0) s[1] += 40; snowPos.set([cx + s[0] + Math.sin(t * 0.8 + s[4]) * 0.8, WL + s[1], cz + s[2] + Math.cos(t * 0.6 + s[4]) * 0.8], i * 3); }
  snowGeo.attributes.position.needsUpdate = true;
  cloudGroup.rotation.y += dt * (0.004 + E.dark * 0.012);
  cloudMeshes.forEach(m => { m.position.y = m.userData.y + Math.sin(t * 0.15 + m.userData.ph) * 3; });
}
// HUD: account panel (time of day, weather, export) + camera dock
const hud = initHud({
  stage, getState: () => state, setView, zoomBy, faceNorth, recenter,
  setNight: n => { state.night = n; }, setWeather: w => { if (PRESET[w]) state.w = w; },
  exportModel: f => stage._runExport(f),
});
addEventListener('keydown', e => { if (e.key === '+' || e.key === '=') zoomBy(0.7); if (e.key === '-' || e.key === '_') zoomBy(1.45); if (e.key === 'v' || e.key === 'V') { setView(state.view === 'top' ? 'chase' : 'top'); hud.paint(); } });
sky.renderOrder = -1;
const foamMat = new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0.85, depthWrite: false });
const hugShape = outline(1.1); hugShape.holes.push(outline(1.0, new THREE.Path()));
const hug = new THREE.Mesh(new THREE.ShapeGeometry(hugShape, 24), foamMat); hug.rotation.x = -Math.PI / 2; hug.position.y = WL + 0.01; seaGroup.add(hug);
const rings = [0, 1, 2].map(i => { const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.04, 96), foamMat.clone()); r.rotation.x = -Math.PI / 2; r.position.y = WL + 0.008 + i * 0.001; seaGroup.add(r); return r; });

const wake = Array.from({ length: 40 }, () => { const m = new THREE.Mesh(new THREE.CircleGeometry(1, 20), foamMat.clone()); m.rotation.x = -Math.PI / 2; m.position.y = WL + 0.012; m.visible = false; m.userData.age = 99; seaGroup.add(m); return m; });
let wakeI = 0, wakeT = 0;
hug.rotation.order = 'YXZ'; rings.forEach(r => r.rotation.order = 'YXZ'); boat.rotation.order = 'YXZ';
// drive input: joystick + keyboard
const drive = { jx: 0, jy: 0, keys: new Set() };
addEventListener('keydown', e => drive.keys.add(e.key.toLowerCase()));
addEventListener('keyup', e => drive.keys.delete(e.key.toLowerCase()));
{ const base = document.getElementById('joy'), knob = document.getElementById('knob'), dir = document.getElementById('joy-dir'); let id = null;
  const move = e => { const r = base.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const R = r.width / 2 - 26, l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; } knob.style.transform = `translate(${dx}px, ${dy}px)`; drive.jx = dx / R; drive.jy = dy / R;
    dir.style.height = Math.min(l, R) + 'px'; dir.style.transform = `translateX(-50%) rotate(${Math.atan2(dy, dx) - Math.PI / 2}rad)`; };
  base.addEventListener('pointerdown', e => { id = e.pointerId; base.setPointerCapture(id); base.classList.add('active'); move(e); e.stopPropagation(); if (navigator.vibrate) navigator.vibrate(8); });
  base.addEventListener('pointermove', e => e.pointerId === id && move(e));
  const end = e => { if (e.pointerId !== id) return; id = null; base.classList.remove('active'); drive.jx = drive.jy = 0; knob.style.transform = 'translate(0px, 0px)'; };
  base.addEventListener('pointerup', end); base.addEventListener('pointercancel', end); }
let yaw = 0, vel = 0, steerS = 0, lastT = 0; const MAXV = 6;
// gentle motion
const clock = new THREE.Clock();
// ===== boat actions: fishing + anchor =====
const ACT = { fish: 'off', anchor: 'up', catch: 0 };
// anchor (stowed on starboard bow)
const anchorG = new THREE.Group(); anchorG.name = 'anchor'; const ANC = { x: 3.4, z: 1.98, y0: 1.55 }; anchorG.position.set(ANC.x, ANC.y0, ANC.z); boat.add(anchorG);
add('anchor_shank', new THREE.CylinderGeometry(0.05, 0.05, 0.8, 10), mat.metal, 0, 0, 0, anchorG);
add('anchor_stock', new THREE.CylinderGeometry(0.035, 0.035, 0.55, 8), mat.metal, 0, 0.3, 0, anchorG).rotation.x = Math.PI / 2;
add('anchor_ring', new THREE.TorusGeometry(0.08, 0.025, 8, 20), mat.metal, 0, 0.47, 0, anchorG).rotation.y = Math.PI / 2;
const crown = add('anchor_crown', new THREE.TorusGeometry(0.3, 0.05, 8, 24, Math.PI), mat.metal, 0, -0.12, 0, anchorG); crown.rotation.set(0, Math.PI / 2, Math.PI);
[-1, 1].forEach(s => add('anchor_fluke_' + (s > 0 ? 'a' : 'b'), new THREE.ConeGeometry(0.08, 0.2, 4), mat.metal, 0, -0.08, s * 0.3, anchorG).rotation.x = s * 0.5);
const chain = add('anchor_chain', new THREE.CylinderGeometry(0.035, 0.035, 1, 6), mat.rubber, ANC.x, 2.0, ANC.z); chain.visible = false;
add('hawse_pipe', new THREE.CylinderGeometry(0.1, 0.1, 0.12, 12), mat.rubber, ANC.x, 2.22, ANC.z - 0.05).rotation.x = Math.PI / 2;
// fishing rod (stern, port side)
const rodPivot = new THREE.Group(); rodPivot.position.set(-3.9, 2.35, -1.35); rodPivot.visible = false; boat.add(rodPivot);
const rodRot = new THREE.Group(); rodPivot.add(rodRot);
add('rod_handle', new THREE.CylinderGeometry(0.05, 0.05, 0.5, 8), mat.rubber, 0, 0.25, 0, rodRot);
add('rod_reel', new THREE.CylinderGeometry(0.1, 0.1, 0.08, 14), mat.red, 0.08, 0.45, 0, rodRot).rotation.z = Math.PI / 2;
add('rod_blank', new THREE.CylinderGeometry(0.012, 0.03, 2.6, 6), mat.wood, 0, 1.8, 0, rodRot);
const rodTip = new THREE.Object3D(); rodTip.position.set(0, 3.1, 0); rodRot.add(rodTip);
const lineGeo = new THREE.BufferGeometry(); lineGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(24 * 3), 3));
const fishLine = new THREE.Line(lineGeo, new THREE.LineBasicMaterial({ color: '#f7f3e6', transparent: true, opacity: 0.9 })); fishLine.frustumCulled = false; fishLine.visible = false; stage._scene.add(fishLine);
const bobber = new THREE.Group(); bobber.visible = false; stage._scene.add(bobber);
bobber.add(new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat.red));
const bb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat.white); bobber.add(bb);
const fishMat = M('fish', '#5fb0e6'), finMat = M('fin', '#ff9f43');
const fish = new THREE.Group(); fish.visible = false; stage._scene.add(fish);
const fBody = new THREE.Mesh(new THREE.SphereGeometry(0.32, 18, 12), fishMat); fBody.scale.set(1, 0.42, 0.28); fish.add(fBody);
const fTail = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.28, 4), finMat); fTail.rotation.z = Math.PI / 2; fTail.position.x = -0.38; fTail.scale.z = 0.3; fish.add(fTail);
const fEye = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), mat.rubber); fEye.position.set(0.2, 0.04, 0.08); fish.add(fEye);
fish.children.forEach(m => m.add(new THREE.Mesh(m.geometry, new THREE.MeshBasicMaterial({ color: '#152042', side: THREE.BackSide }))));
fish.children.forEach(m => { const o = m.children[0]; o.material.onBeforeCompile = s => { s.vertexShader = s.vertexShader.replace('#include <begin_vertex>', 'vec3 transformed = position + normal * 0.03;'); }; });
// ripple pool
const ripples = Array.from({ length: 14 }, () => { const r = new THREE.Mesh(new THREE.RingGeometry(0.8, 1, 40), new THREE.MeshBasicMaterial({ color: '#f2fdff', transparent: true, opacity: 0, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.visible = false; stage._scene.add(r); r.userData.age = 9; return r; });
let ripI = 0;
const ripple = (x, z, s = 1, life = 1.4) => { const r = ripples[ripI++ % ripples.length]; r.position.set(x, WL, z); r.userData = { age: 0, s, life, x, z }; r.visible = true; };
const splash = (x, z, n = 18, pw = 1) => { const y = WL + waveJS(x, z, clock.getElapsedTime()); for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, s = (0.6 + Math.random() * 1.4) * pw; emit(x, y, z, Math.cos(a) * s, (2 + Math.random() * 2.5) * pw, Math.sin(a) * s); } ripple(x, z, 0.6 * pw); setTimeout(() => ripple(x, z, 0.4 * pw, 1.8), 180); };
// DOM fx
const fxLayer = document.getElementById('fxlayer'), menu = document.getElementById('boatmenu'), statusEl = document.getElementById('status');
const floaters = [];
const floatText = (pos, text, color = '#fff7ea', big = false) => { const d = document.createElement('div'); d.textContent = text; d.style.cssText = `position:absolute;left:0;top:0;transform:translate(-50%,-50%);font:800 ${big ? 26 : 16}px/1 system-ui,sans-serif;color:${color};text-shadow:0 2px 0 #152042,0 0 6px rgba(0,0,0,0.35);white-space:nowrap`; fxLayer.appendChild(d); floaters.push({ d, pos: pos.clone(), age: 0, life: big ? 1.0 : 1.6 }); };
const projV = new THREE.Vector3();
const toScreen = p => { const r = stage.getBoundingClientRect(); projV.copy(p).project(stage._camera); return [r.left + (projV.x + 1) / 2 * r.width, r.top + (1 - projV.y) / 2 * r.height, projV.z]; };
const chip = (txt, bg) => `<div style="padding:8px 12px;border-radius:999px;background:${bg};color:#fff;border:1px solid rgba(255,255,255,0.6);backdrop-filter:blur(6px)">${txt}</div>`;
const paintStatus = () => {
  let s = '';
  if (ACT.anchor === 'down') s += chip('Anchored', 'rgba(21,32,66,0.6)');
  else if (ACT.anchor === 'dropping') s += chip('Dropping anchor…', 'rgba(21,32,66,0.6)');
  else if (ACT.anchor === 'raising') s += chip('Raising anchor…', 'rgba(21,32,66,0.6)');
  if (ACT.fish !== 'off') s += chip(ACT.fish === 'bite' ? 'Fish on!' : 'Fishing', 'rgba(238,52,39,0.7)');
  if (ACT.catch) s += chip('Catch: ' + ACT.catch, 'rgba(44,196,168,0.7)');
  statusEl.innerHTML = s;
  document.getElementById('act-fish-l').textContent = ACT.fish === 'off' ? 'Go fishing' : 'Stop fishing';
  document.getElementById('act-anchor-l').textContent = ACT.anchor === 'up' || ACT.anchor === 'raising' ? 'Drop anchor' : 'Raise anchor';
};
// state machines
const F = { k: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), wait: 0, rip: 0 };
const A = { k: 0, depth: 0, rip: 0, splashed: false };
const tipW = new THREE.Vector3(), tmpV = new THREE.Vector3(), up = new THREE.Vector3();
function startFishing() { if (Math.abs(vel) > 1.5) { floatText(boat.position.clone().setY(9), 'Slow down to fish', '#ffd36b'); return; } ACT.fish = 'casting'; F.k = 0; rodPivot.visible = true; rodPivot.scale.setScalar(0.01); paintStatus(); }
function stopFishing() { if (ACT.fish === 'off') return; ACT.fish = 'reelin'; F.k = 0; F.from.copy(bobber.position); paintStatus(); }
function dropAnchor() { if (ACT.anchor !== 'up') return; ACT.anchor = 'dropping'; A.k = 0; A.splashed = false; chain.visible = true; paintStatus(); }
function raiseAnchor() { if (ACT.anchor !== 'down') return; ACT.anchor = 'raising'; A.k = 0; paintStatus(); }
const fishNames = ['Mackerel', 'Sardine', 'Snapper', 'Tuna', 'Sea bass', 'Bluefish'];
function stepActions(t, dt) {
  // ---- anchor ----
  const hawseY = 2.1;
  if (ACT.anchor === 'dropping') {
    A.k += dt; const d = 0.5 * 7 * A.k * A.k; anchorG.position.y = ANC.y0 - d; anchorG.rotation.x = Math.sin(A.k * 9) * 0.2 * Math.max(0, 1 - A.k);
    anchorG.getWorldPosition(tmpV);
    if (!A.splashed && tmpV.y < WL + waveJS(tmpV.x, tmpV.z, t)) { A.splashed = true; splash(tmpV.x, tmpV.z, 26, 1.2); }
    if (anchorG.position.y < -8) { ACT.anchor = 'down'; anchorG.visible = false; paintStatus(); }
  } else if (ACT.anchor === 'raising') {
    A.k += dt; anchorG.visible = true; anchorG.position.y = Math.min(ANC.y0, -8 + A.k * 4.2);
    anchorG.getWorldPosition(tmpV);
    const wl = WL + waveJS(tmpV.x, tmpV.z, t);
    if (tmpV.y > wl - 0.2 && tmpV.y < wl + 1.2 && Math.random() < 0.5) emit(tmpV.x, tmpV.y - 0.3, tmpV.z, (Math.random() - 0.5) * 0.4, -0.5, (Math.random() - 0.5) * 0.4);
    if (Math.abs(tmpV.y - wl) < 0.08 && !A.up) { A.up = true; splash(tmpV.x, tmpV.z, 12, 0.7); }
    if (anchorG.position.y >= ANC.y0) { ACT.anchor = 'up'; A.up = false; chain.visible = false; anchorG.rotation.set(0, 0, 0); anchorG.scale.setScalar(1.15); floatText(tmpV.clone().setY(tmpV.y + 1), 'Clank!', '#fff7ea'); paintStatus(); }
  }
  if (anchorG.scale.x > 1) anchorG.scale.setScalar(Math.max(1, anchorG.scale.x - dt * 0.6));
  if (chain.visible) { const bot = Math.max(anchorG.position.y + 0.47, -8); const len = hawseY - bot; chain.scale.y = Math.max(0.01, len); chain.position.y = hawseY - len / 2; chain.rotation.x = ACT.anchor === 'down' ? Math.sin(t * 0.8) * 0.06 : 0; }
  if (ACT.anchor === 'down') {
    vel *= Math.pow(0.05, dt); yaw += Math.sin(t * 0.25) * dt * 0.03;
    A.rip -= dt; if (A.rip <= 0) { A.rip = 1.6; anchorG.getWorldPosition(tmpV); const cw = new THREE.Vector3(ANC.x, 0, ANC.z).applyMatrix4(boat.matrixWorld); ripple(cw.x, cw.z, 0.45, 1.8); }
  }
  // ---- fishing ----
  if (ACT.fish !== 'off') {
    rodPivot.scale.setScalar(Math.min(1, rodPivot.scale.x + dt * 4));
    if (Math.abs(vel) > 2 && ACT.fish !== 'reelin') stopFishing();
  }
  rodTip.getWorldPosition(tipW);
  const fwd = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), side = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const restTilt = 0.95;
  if (ACT.fish === 'casting') {
    F.k += dt;
    if (F.k < 0.45) rodRot.rotation.z = THREE.MathUtils.lerp(restTilt, -0.25, F.k / 0.45);
    else if (F.k < 0.7) rodRot.rotation.z = THREE.MathUtils.lerp(-0.25, restTilt + 0.35, (F.k - 0.45) / 0.25);
    else rodRot.rotation.z += (restTilt - rodRot.rotation.z) * Math.min(1, dt * 6);
    if (F.k >= 0.6 && !bobber.visible) { bobber.visible = true; fishLine.visible = true; F.from.copy(tipW); F.to.copy(boat.position).addScaledVector(fwd, -14 - Math.random() * 4).addScaledVector(side, -4 + Math.random() * 3); F.fk = 0; }
    if (bobber.visible) { F.fk += dt / 0.9; const e = Math.min(1, F.fk); bobber.position.lerpVectors(F.from, F.to, e); bobber.position.y = THREE.MathUtils.lerp(F.from.y, WL, e) + Math.sin(e * Math.PI) * 4;
      if (e >= 1) { splash(F.to.x, F.to.z, 10, 0.6); ACT.fish = 'waiting'; F.wait = 2.5 + Math.random() * 4; F.rip = 0; paintStatus(); } }
  } else if (ACT.fish === 'waiting' || ACT.fish === 'bite') {
    const wy = WL + waveJS(bobber.position.x, bobber.position.z, t);
    F.wait -= dt;
    if (ACT.fish === 'waiting') {
      bobber.position.y = wy + 0.02 + Math.sin(t * 3) * 0.02;
      if (Math.random() < dt * 0.5) bobber.position.y -= 0.06;
      F.rip -= dt; if (F.rip <= 0) { F.rip = 1.8; ripple(bobber.position.x, bobber.position.z, 0.25, 1.6); }
      if (F.wait <= 0) { ACT.fish = 'bite'; F.wait = 0.9; splash(bobber.position.x, bobber.position.z, 8, 0.5); floatText(bobber.position.clone().setY(wy + 1.4), '!', '#ffd36b', true); paintStatus(); }
    } else {
      bobber.position.y = wy - 0.12 - Math.abs(Math.sin(t * 22)) * 0.12;
      rodRot.rotation.z = restTilt + Math.sin(t * 30) * 0.06 + 0.15;
      if (Math.random() < 0.4) emit(bobber.position.x, wy, bobber.position.z, (Math.random() - 0.5) * 1.5, 1.5 + Math.random(), (Math.random() - 0.5) * 1.5);
      if (F.wait <= 0) { ACT.fish = 'reeling'; F.k = 0; F.from.copy(bobber.position); fish.visible = true; splash(bobber.position.x, bobber.position.z, 30, 1.1); paintStatus(); }
    }
  } else if (ACT.fish === 'reeling') {
    F.k += dt / 1.1; const e = Math.min(1, F.k);
    const land = new THREE.Vector3(-3.0, 2.3, -0.4).applyMatrix4(boat.matrixWorld);
    fish.position.lerpVectors(F.from, land, e); fish.position.y = THREE.MathUtils.lerp(F.from.y, land.y, e) + Math.sin(e * Math.PI) * 5;
    fish.rotation.set(Math.sin(t * 20) * 0.4, -yaw + Math.PI, -e * Math.PI * 2);
    fTail.rotation.y = Math.sin(t * 30) * 0.6;
    bobber.position.lerpVectors(F.from, tipW, e); bobber.position.y += Math.sin(e * Math.PI) * 1.5;
    rodRot.rotation.z = THREE.MathUtils.lerp(restTilt + 0.15, restTilt - 0.45, Math.sin(e * Math.PI));
    if (e >= 1) { fish.visible = false; bobber.visible = false; fishLine.visible = false; ACT.catch++; const nm = fishNames[Math.floor(Math.random() * fishNames.length)]; floatText(land.clone().setY(land.y + 1.5), '+1 ' + nm, '#7ff0c8'); for (let i = 0; i < 14; i++) emit(land.x, land.y, land.z, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2); ACT.fish = 'recast'; F.k = 0; paintStatus(); }
  } else if (ACT.fish === 'recast') { F.k += dt; rodRot.rotation.z += (restTilt - rodRot.rotation.z) * Math.min(1, dt * 5); if (F.k > 1.2) { ACT.fish = 'casting'; F.k = 0; } }
  else if (ACT.fish === 'reelin') {
    F.k += dt / 0.7; const e = Math.min(1, F.k);
    if (bobber.visible) { bobber.position.lerpVectors(F.from, tipW, e); bobber.position.y += Math.sin(e * Math.PI) * 1.2; }
    rodPivot.scale.setScalar(Math.max(0.01, 1 - Math.max(0, e - 0.5) * 2));
    if (e >= 1) { ACT.fish = 'off'; bobber.visible = false; fishLine.visible = false; rodPivot.visible = false; rodRot.rotation.z = restTilt; paintStatus(); }
  } else if (ACT.fish === 'off') rodRot.rotation.z = restTilt;
  // line with sag
  if (fishLine.visible) {
    const p = lineGeo.attributes.position, sag = ACT.fish === 'waiting' ? 1.2 : 0.3;
    for (let i = 0; i < 24; i++) { const u = i / 23; tmpV.lerpVectors(tipW, bobber.position, u); tmpV.y -= Math.sin(u * Math.PI) * sag; p.setXYZ(i, tmpV.x, tmpV.y, tmpV.z); }
    p.needsUpdate = true;
  }
  // ripples + floaters
  ripples.forEach(r => { if (!r.visible) return; const u = r.userData; u.age += dt; const a = u.age / u.life; if (a >= 1) { r.visible = false; return; } r.scale.setScalar(u.s * (0.4 + a * 3)); r.position.y = WL + waveJS(u.x, u.z, t) + 0.03; r.material.opacity = (1 - a) * 0.8; });
  for (let i = floaters.length - 1; i >= 0; i--) { const f = floaters[i]; f.age += dt; const a = f.age / f.life; if (a >= 1) { f.d.remove(); floaters.splice(i, 1); continue; } tmpV.copy(f.pos); tmpV.y += a * 2; const [x, y, z] = toScreen(tmpV); f.d.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${1 + Math.min(a * 6, 1) * 0.2})`; f.d.style.opacity = z > 1 ? 0 : (1 - Math.max(0, a - 0.6) / 0.4); }
  // menu follows the boat
  if (menu.style.display !== 'none') { tmpV.set(0.1, 10.6, 0).applyMatrix4(boat.matrixWorld); const [x, y] = toScreen(tmpV);
    // keep the menu on screen and clear of the control panels (matters on phones)
    const hw = menu.offsetWidth / 2, minY = 72 + menu.offsetHeight;
    menu.style.left = Math.min(innerWidth - hw - 8, Math.max(hw + 8, x)) + 'px'; menu.style.top = (innerWidth <= 640 ? Math.max(minY, y) : y) + 'px'; }
}
// click the boat to open the action menu
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(); let downAt = null;
// ===== top view: tap the water to set a course, the tug steers itself there =====
const seaPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -WL), tapP = new THREE.Vector3();
const course = { on: false, p: new THREE.Vector3(), k: 1, out: false };
const markG = new THREE.Group(); markG.name = 'course_buoy'; markG.visible = false; stage._scene.add(markG);
const buoy = new THREE.Group(); buoy.scale.setScalar(1.5); markG.add(buoy);
[[0.62, 0.8, 0.5, 0.25, mat.red], [0.5, 0.62, 0.45, 0.72, mat.white], [0.38, 0.5, 0.45, 1.17, mat.red], [0.26, 0.38, 0.3, 1.54, mat.white]].forEach(([rt, rb, h, y, m], i) => {
  const b = add('buoy_' + i, new THREE.CylinderGeometry(rt, rb, h, 28), m, 0, y, 0, buoy); b.add(new THREE.Mesh(b.geometry, i ? inkThin : inkThick)); });
add('buoy_pole', new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), mat.metal, 0, 2.4, 0, buoy);
{ const tri = new THREE.Shape(); tri.moveTo(0, 0); tri.lineTo(0.9, -0.22); tri.lineTo(0, -0.5); add('buoy_flag', new THREE.ShapeGeometry(tri), flagCols[0], 0.03, 3.1, 0, buoy); }
const markRings = [0, 1].map(i => { const r = new THREE.Mesh(new THREE.RingGeometry(1, 1.12, 64), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6, depthWrite: false })); r.rotation.x = -Math.PI / 2; r.position.y = 0.06; markG.add(r); return r; });
const DASHN = 90, dashes = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 0.34).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.92, depthWrite: false }), DASHN);
dashes.frustumCulled = false; dashes.count = 0; dashes.renderOrder = 5; stage._scene.add(dashes);
const dashM = new THREE.Matrix4(), dashQ = new THREE.Quaternion(), dashS = new THREE.Vector3(1, 1, 1), dashP = new THREE.Vector3(), yAxis = new THREE.Vector3(0, 1, 0);
function setCourse(p) {
  if (ACT.anchor !== 'up') { floatText(boat.position.clone().setY(9), 'Raise the anchor first', '#ffd36b'); return; }
  const off = p.clone().sub(boat.position).setY(0); if (off.length() > 150) off.setLength(150);
  if (off.length() < 5) return;
  course.p.copy(boat.position).add(off).setY(WL); course.on = true; course.k = 0; course.out = false;
  markG.visible = true; markG.position.copy(course.p);
  splash(course.p.x, course.p.z, 14, 0.7); document.body.classList.add('has-course');
  if (ACT.fish !== 'off') stopFishing();
}
function clearCourse(arrived) {
  if (!course.on) return;
  course.on = false; course.out = true; course.k = 0; dashes.count = 0; document.body.classList.remove('has-course');
  if (arrived) floatText(course.p.clone().setY(5), 'Arrived', '#7ff0c8');
}
function stepCourse(t, dt) {
  if (!markG.visible) return;
  course.k = Math.min(1, course.k + dt / (course.out ? 0.35 : 0.6));
  const e = course.k, pop = course.out ? 1 - e : 1 + Math.sin(e * Math.PI) * 0.35 * (1 - e) - Math.pow(1 - e, 3);
  buoy.scale.setScalar(1.5 * Math.max(0.001, pop));
  markG.position.y = WL + waveJS(course.p.x, course.p.z, t) - 0.25 + (course.out ? 0 : Math.pow(1 - e, 2) * 4);
  buoy.rotation.set(Math.sin(t * 1.7) * 0.08, t * 0.4, Math.cos(t * 1.3) * 0.08);
  markRings.forEach((r, i) => { const q = (t * 0.45 + i * 0.5) % 1; r.scale.setScalar((1.6 + q * 3.4) * Math.max(0.001, pop)); r.material.opacity = (1 - q) * 0.7; });
  if (course.out && e >= 1) { markG.visible = false; return; }
  if (!course.on) return;
  // marching dashes from the bow to the buoy
  const bx = boat.position.x, bz = boat.position.z, dx = course.p.x - bx, dz = course.p.z - bz, L = Math.hypot(dx, dz);
  const ux = dx / L, uz = dz / L, a0 = 3, a1 = L - 2.2, step = 1.9, shift = (t * 2.2) % step;
  dashQ.setFromAxisAngle(yAxis, Math.atan2(-uz, ux)); let n = 0;
  for (let s = a0 + shift; s < a1 && n < DASHN; s += step, n++) { const x = bx + ux * s, z = bz + uz * s; dashP.set(x, WL + waveJS(x, z, t) + 0.18, z); dashM.compose(dashP, dashQ, dashS); dashes.setMatrixAt(n, dashM); }
  dashes.count = n; dashes.instanceMatrix.needsUpdate = true;
}
stage.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
stage.addEventListener('pointerup', e => {
  if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6 || performance.now() - downAt.t > 450) return;
  const r = stage.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, stage._camera);
  const hit = ray.intersectObject(boat, true).length > 0;
  const wasOpen = menu.style.display !== 'none';
  menu.style.display = hit && !wasOpen ? 'flex' : 'none';
  if (!hit && !wasOpen && state.view === 'top' && ray.ray.intersectPlane(seaPlane, tapP)) setCourse(tapP);
});
document.getElementById('act-fish').addEventListener('click', () => { ACT.fish === 'off' ? startFishing() : stopFishing(); menu.style.display = 'none'; });
document.getElementById('act-anchor').addEventListener('click', () => { ACT.anchor === 'up' ? dropAnchor() : raiseAnchor(); menu.style.display = 'none'; });
['act-fish', 'act-anchor'].forEach(id => { const b = document.getElementById(id); b.addEventListener('pointerenter', () => b.style.transform = 'translateY(-2px)'); b.addEventListener('pointerleave', () => b.style.transform = 'none'); });
paintStatus();

const chev = [...document.querySelectorAll('.joy-dial .chev path')], youTag = document.getElementById('you-tag');
const stats = { dist: 0, top: 0 };
(function tick() {
  const t = clock.getElapsedTime();
  const dt = Math.min(0.05, t - lastT); lastT = t;
  const k = drive.keys;
  let thr = Math.max(-1, Math.min(1, -drive.jy + (k.has('w') || k.has('arrowup') ? 1 : 0) - (k.has('s') || k.has('arrowdown') ? 1 : 0)));
  let str = Math.max(-1, Math.min(1, drive.jx + (k.has('d') || k.has('arrowright') ? 1 : 0) - (k.has('a') || k.has('arrowleft') ? 1 : 0)));
  const manual = Math.abs(thr) > 0.05 || Math.abs(str) > 0.05;
  if (manual) { stage._controls.autoRotate = false; clearCourse(false); }
  if (course.on && ACT.anchor === 'up') {
    // autopilot: turn toward the buoy, ease off the throttle in tight turns and on approach
    const cx = course.p.x - boat.position.x, cz = course.p.z - boat.position.z, dist = Math.hypot(cx, cz);
    const diff = Math.atan2(Math.sin(Math.atan2(-cz, cx) - yaw), Math.cos(Math.atan2(-cz, cx) - yaw));
    str = Math.max(-1, Math.min(1, -diff * 1.8));
    thr = Math.min(1, Math.max(0.3, dist / 14)) * (Math.abs(diff) > 1.2 ? 0.15 : Math.max(0.35, 1 - Math.abs(diff) / 1.6));
    if (dist < 4.5) clearCourse(true);
    stage._controls.autoRotate = false;
  }
  if (ACT.anchor !== 'up') thr = 0;
  { const lit = { n: thr > 0.35, s: thr < -0.35, e: str > 0.35, w: str < -0.35 }; chev.forEach(c => c.classList.toggle('lit', lit[c.dataset.d])); }
  steerS += (str - steerS) * Math.min(1, dt * 4);
  if (!stage._exporting) {
    vel += (thr * MAXV - vel) * Math.min(1, dt * 0.7);
    const sv = vel / MAXV;
    yaw -= steerS * dt * 0.7 * (0.25 + 0.75 * Math.abs(sv)) * (sv < -0.02 ? -1 : 1);
    const fx = Math.cos(yaw), fz = -Math.sin(yaw), dx = fx * vel * dt, dz = fz * vel * dt;
    boat.position.x += dx; boat.position.z += dz; stats.dist += Math.hypot(dx, dz); stats.top = Math.max(stats.top, Math.abs(vel));
    stage._camera.position.x += dx; stage._camera.position.z += dz; stage._controls.target.x += dx; stage._controls.target.z += dz;
    const bx = boat.position.x, bz = boat.position.z, sx = Math.sin(yaw), sz = Math.cos(yaw);
    const hC = waveJS(bx, bz, t), hF = waveJS(bx + fx * 3, bz + fz * 3, t), hB = waveJS(bx - fx * 3, bz - fz * 3, t), hS = waveJS(bx + sx * 2, bz + sz * 2, t), hP = waveJS(bx - sx * 2, bz - sz * 2, t);
    boat.position.y += ((hC + hF + hB) / 3 * 0.85 - boat.position.y) * Math.min(1, dt * 3);
    boat.rotation.set(boat.rotation.x + (-Math.atan((hS - hP) / 4) * 0.8 + steerS * sv * 0.07 - boat.rotation.x) * Math.min(1, dt * 3), yaw, boat.rotation.z + (Math.atan((hF - hB) / 6) * 0.8 + sv * 0.035 - boat.rotation.z) * Math.min(1, dt * 3));
    const bowX = bx + fx * 5.6, bowZ = bz + fz * 5.6, bowY = WL + waveJS(bowX, bowZ, t);
    if (Math.abs(vel) > 1) for (let q = 0; q < Math.ceil(Math.abs(sv) * 4); q++) { const sd = Math.random() < 0.5 ? -1 : 1, sp = 1.5 + Math.random() * 2; emit(bowX + sx * sd * 0.6, bowY, bowZ + sz * sd * 0.6, sx * sd * sp + fx * vel * 0.4, 2 + Math.random() * 2.5 * Math.abs(sv), sz * sd * sp + fz * vel * 0.4); }
    if (Math.random() < 0.12) { const sd = Math.random() < 0.5 ? -1 : 1, along = (Math.random() - 0.5) * 7; const ex = bx + fx * along + sx * sd * 2.5, ez = bz + fz * along + sz * sd * 2.5; for (let q = 0; q < 6; q++) emit(ex, WL + waveJS(ex, ez, t), ez, sx * sd * (0.5 + Math.random()), 1.2 + Math.random() * 1.5, sz * sd * (0.5 + Math.random())); }
    prop.rotation.x += (1.2 + Math.abs(vel) * 3) * dt * Math.sign(vel || 1);
    wheel.rotation.x = steerS * 2.6;
    wakeT += dt;
    if (Math.abs(vel) > 0.6 && wakeT > 0.07) { wakeT = 0; const w = wake[wakeI++ % wake.length]; const side = (Math.random() - 0.5) * 2.2; w.position.x = boat.position.x - fx * 5.6 * Math.sign(vel) - fz * side; w.position.z = boat.position.z - fz * 5.6 * Math.sign(vel) + fx * side; w.userData.age = 0; w.userData.s = 0.4 + Math.abs(sv) * 0.6; w.visible = true; }
  }
  wake.forEach(w => { if (!w.visible) return; w.userData.age += dt; const a = w.userData.age / 2.6; if (a >= 1) { w.visible = false; return; } w.scale.setScalar(w.userData.s * (0.6 + a * 2.4)); w.position.y = WL + waveJS(w.position.x, w.position.z, t) + 0.05; w.material.opacity = (1 - a) * 0.7; });
  seaU.bp.value.set(boat.position.x, boat.position.z); seaU.yaw.value = yaw;
  seaMesh.position.x = seaNear.position.x = sky.position.x = cloudGroup.position.x = hug.position.x = boat.position.x;
  seaMesh.position.z = seaNear.position.z = sky.position.z = cloudGroup.position.z = hug.position.z = boat.position.z;
  const wy = WL + waveJS(boat.position.x, boat.position.z, t) * 0.85; hug.position.y = wy + 0.04;
  for (let i = 0; i < SPN; i++) { if (sprayLife[i] <= 0) continue; sprayLife[i] -= dt; const j = i * 3; sprayVel[j + 1] -= 9.8 * dt; sprayPos[j] += sprayVel[j] * dt; sprayPos[j + 1] += sprayVel[j + 1] * dt; sprayPos[j + 2] += sprayVel[j + 2] * dt; if (sprayLife[i] <= 0 || sprayPos[j + 1] < WL - 0.6) { sprayLife[i] = 0; sprayPos[j + 1] = -999; } }
  sprayGeo.attributes.position.needsUpdate = true;
  hug.rotation.set(-Math.PI / 2, yaw, 0);
  rings.forEach(r => { r.position.x = boat.position.x; r.position.z = boat.position.z; r.position.y = wy + 0.03; r.rotation.set(-Math.PI / 2, yaw, 0); });
  navFx.forEach(n => { const on = ((t + n.ph) % 1.2) < 0.75 ? 1 : 0.15; n.mat.emissiveIntensity = on * (1 + E.night); n.halo.material.opacity = (0.45 + 0.4 * E.night) * on; n.pl.intensity = 3 * on * (1 + 2.5 * E.night); });
  anemo.rotation.y = t * (5 + E.amp * 2);
  seaU.time.value = t;
  stepEnv(t, dt);
  stepActions(t, dt);
  stepCourse(t, dt);
  { const off = stage._camera.position.clone().sub(stage._controls.target);
    hud.update({ az: Math.atan2(off.x, off.z), kn: vel * 1.944, gearName: ACT.anchor !== 'up' ? 'Anchored' : course.on ? 'Autopilot' : vel > 0.3 ? 'Ahead' : vel < -0.3 ? 'Astern' : 'Idle', catchN: ACT.catch, distNm: stats.dist / 1852, topKn: stats.top * 1.944 });
    if (state.view === 'top') { tmpV.set(boat.position.x, boat.position.y + 9.5, boat.position.z); const [x, y] = toScreen(tmpV); youTag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`; } }
  hug.scale.setScalar(1 + Math.sin(t * 2.2) * 0.015);
  rings.forEach((r, i) => { const p = ((t * 0.22 + i / 3) % 1); r.scale.set(5.5 + p * 9 * 1.4, 3.2 + p * 9, 1); r.material.opacity = (1 - p) * 0.5; });
  requestAnimationFrame(tick);
})();

// clean export: strip outlines and motion
const clean = fn => async () => {
  stage._exporting = true;
  const pos = boat.position.clone(), rot = boat.rotation.clone();
  boat.position.set(0, 0, 0); boat.rotation.set(0, 0, 0); anemo.rotation.set(0, 0, 0); rodRot.rotation.z = 0.95; prop.rotation.set(0, 0, 0); wheel.rotation.set(0, 0, 0);
  const parents = outlines.map(l => { const p = l.parent; p.remove(l); return p; });
  try { await fn(); } finally { outlines.forEach((l, i) => parents[i].add(l)); boat.position.copy(pos); boat.rotation.copy(rot); stage._exporting = false; }
};
stage._exportObj = clean(stage._exportObj.bind(stage));
stage._exportGlb = clean(stage._exportGlb.bind(stage));

// app shell: touch-friendly hint, and fade out the splash once the first frames are drawn
if (matchMedia('(pointer: coarse)').matches) document.getElementById('hint').textContent = 'Drag the stick to sail · tap the boat for actions';
else document.getElementById('course-hint').textContent = 'Click anywhere on the water to set a course';
requestAnimationFrame(() => requestAnimationFrame(() => { const s = document.getElementById('splash'); s.classList.add('gone'); setTimeout(() => s.remove(), 600); }));
