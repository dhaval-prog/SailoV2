// Wooden Tug: the Tugboat model from Ocean-3 (export/tugboat.glb, its textures built in): a planked orange hull over a
// slate bottom, tyre fenders, a white wheelhouse with a hipped roof and a funnel, chain railings on posts.
// The model is ~5.7 units long along its z axis, bow at -z; here it's turned bow-first along +x (like every boat) and
// scaled up to a big working tug (~14 m: a third longer than the Lighthouse Tug) and sat in the water so only a thin
// band of the slate shows. Its hull and trim can be painted (the Garage): the wood keeps its grain, in your colour.
// Its own: nav lights (red to port, green to starboard on the wheelhouse, a white masthead light on the roof), at night
// warm windows and a deck lamp, and smoke from the funnel while it runs (more the faster it goes).
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import tugUrl from '../assets/tugboat2/tugboat.glb?url';

const SIZE = 1.3, K = 1.9 * SIZE; // (1.9: the Lighthouse Tug's length; SIZE: how much bigger this one is)
const LIFT = 0.85 - 0.38 * K; // how far the model's origin sits above the boat's: the sea (0.85) meets the model at y≈0.38,
// just under the top of the slate
// paint: the hull's planks (wood_orange) and its trim, the rim and the roof (wood_orange_light); 'natural' is the wood
const PAINT_KEY = 'woodtug.paint', PAINT_COLS = ['natural', '#ee3427', '#ffb21a', '#2343a0', '#2cc4a8', '#3f8f4a', '#fff7ea', '#3b3134'];
const PAINTED = { hull: 'wood_orange', trim: 'wood_orange_light' };
// model (x, y, z) to boat units (bow +x)
const at = (x, y, z) => [-z * K, y * K + LIFT, x * K];

export function buildWoodTug({ THREE, scene }) {
  const group = new THREE.Group(); group.name = 'woodtug_model';
  const holder = new THREE.Group(); holder.rotation.y = -Math.PI / 2; holder.scale.setScalar(K); holder.position.y = LIFT; group.add(holder);
  const windows = [], painted = {}; // (painted: the player's own copies of the hull and trim materials)
  // the copy other captains' boats are made from (cpu-fleet.js): the model as it comes, never repainted
  const template = new THREE.Group(); template.name = 'woodtug_template';
  const holderT = holder.clone(false); template.add(holderT);
  let paint = { hull: 'natural', trim: 'natural' }; try { Object.assign(paint, JSON.parse(localStorage.getItem(PAINT_KEY)) || {}); } catch { /* none */ }
  const ready = new Promise(resolve => new GLTFLoader().load(tugUrl, gltf => {
    const m = gltf.scene;
    holderT.add(m.clone(true)); // (before the player's copy gets its own paint)
    // a grey copy of each painted wood's texture: tinted, it takes any colour and keeps the grain (shared with
    // other captains' boats through the material, for their colours)
    m.traverse(o => { if (!o.isMesh) return; const part = Object.keys(PAINTED).find(k => PAINTED[k] === o.material.name); if (!part) return;
      if (!painted[part]) { const orig = o.material; orig.userData.grey = greyOf(orig.map); painted[part] = { mat: orig.clone(), map: orig.map, color: orig.color.clone(), grey: orig.userData.grey }; } // (the model's own colour tints its grain: kept for 'natural')
      o.material = painted[part].mat; });
    applyPaint();
    m.traverse(o => { if (!o.isMesh) return; o.castShadow = true; o.receiveShadow = true;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(mt => { if (mt.map) mt.map.anisotropy = 4; if (/glass/.test(mt.name)) { mt.transparent = true; mt.opacity = 0.75; }
        if (/^(window_glass|mat_9cc6ff)$/.test(mt.name) && !windows.some(w => w.mt === mt)) { // (they glow at night: lit ones by their own light, unlit ones by warming)
          if (mt.emissive) { mt.emissive = new THREE.Color('#ffc46b'); mt.emissiveIntensity = 0; }
          windows.push({ mt, day: mt.color.clone() }); } }); });
    holder.add(m); resolve(group);
  }, undefined, () => resolve(group)));

  function greyOf(tex) {
    if (!tex?.image) return null; const img = tex.image, w = img.width, h = img.height, c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, w, h), px = d.data; let sum = 0;
    for (let i = 0; i < px.length; i += 4) { const l = 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; px[i] = px[i + 1] = px[i + 2] = l; sum += l; }
    const k = 225 / Math.max(1, sum / (px.length / 4)); for (let i = 0; i < px.length; i += 4) px[i] = px[i + 1] = px[i + 2] = Math.min(255, px[i] * k); // (brightened: the colour shows true)
    g.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = tex.colorSpace; t.flipY = tex.flipY; t.wrapS = tex.wrapS; t.wrapT = tex.wrapT;
    t.repeat.copy(tex.repeat); t.offset.copy(tex.offset); t.anisotropy = 4; return t;
  }
  function applyPaint() { Object.entries(painted).forEach(([part, p]) => { const c = paint[part];
    if (!c || c === 'natural' || !p.grey) { p.mat.map = p.map; p.mat.color.copy(p.color); } else { p.mat.map = p.grey; p.mat.color.set(c); } }); }
  // the hull seen from above, bow at +x: a fine bow, a full rounded stern (for the foam and ripples round it)
  function outline(s = 1, path = new THREE.Shape()) {
    s *= SIZE; const L = 4.9 * s, B = 3.0 * s;
    path.moveTo(-L + 1.2 * s, -B);
    path.lineTo(L * 0.3, -B);
    path.bezierCurveTo(L * 0.8, -B, L, -B * 0.45, L + 0.2 * s, 0);
    path.bezierCurveTo(L, B * 0.45, L * 0.8, B, L * 0.3, B);
    path.lineTo(-L + 1.2 * s, B);
    path.bezierCurveTo(-L - 0.1 * s, B, -L - 0.2 * s, B * 0.55, -L - 0.2 * s, 0);
    path.bezierCurveTo(-L - 0.2 * s, -B * 0.55, -L - 0.1 * s, -B, -L + 1.2 * s, -B);
    return path;
  }
  // where things go on deck (boat units, bow +x): the anchor at the bow, the rod over the stern quarter, the catch
  // landing on the after deck behind the wheelhouse, the boat menu above the funnel
  const A = at(1.05, 0.574, -2.05);
  const fit = { anchor: { x: A[0], z: A[2], y0: A[1], s: 1.3 * SIZE }, hawseY: at(0, 0.94, 0)[1], rod: at(-0.84, 0.86, 2.05), land: at(0, 0.65, 1.63), menuY: 8.5 * SIZE };
  // ---------- nav lights: red to port, green to starboard at the wheelhouse's front corners, white on the roof ----------
  const nav = [['port', '#ff2a1f', at(-0.95, 1.78, -0.42)], ['starboard', '#1fff6a', at(0.95, 1.78, -0.42)], ['mast', '#fff4d6', at(0, 2.5, -0.25)]].map(([tag, c, p]) => {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 10), new THREE.MeshStandardMaterial({ name: 'nav_lamp_' + tag, color: c, emissive: new THREE.Color(c), emissiveIntensity: 1 }));
    const halo = new THREE.Mesh(new THREE.SphereGeometry(0.34, 16, 12), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    const pl = new THREE.PointLight(c, 0, 5, 2); [lamp, halo, pl].forEach(o => { o.position.set(...p); group.add(o); });
    return { lamp, halo, pl, mast: tag === 'mast' }; });
  // ---------- at night: a warm lamp over the after deck ----------
  const deckLamp = new THREE.PointLight('#ffc77a', 0, 10, 1.6); deckLamp.position.set(...at(0, 2.2, 1.7)); group.add(deckLamp);

  // ---------- funnel smoke: soft grey puffs out of the funnel top, left behind as the boat goes ----------
  const FUNNEL = new THREE.Vector3(...at(0, 2.82, 0.45)), smokeG = new THREE.Group(); smokeG.name = 'woodtug_smoke'; scene?.add(smokeG);
  const puffGeo = new THREE.IcosahedronGeometry(0.55, 1), puffs = Array.from({ length: 30 }, () => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshStandardMaterial({ color: '#dcdcdc', roughness: 1, transparent: true, opacity: 0, depthWrite: false, flatShading: true }));
    m.visible = false; m.userData = { life: 0, max: 1, v: new THREE.Vector3(), s0: 1 }; smokeG.add(m); return m; });
  let puffI = 0, puffAcc = 0; const wp = new THREE.Vector3();
  function puff(back, speed) {
    const m = puffs[puffI++ % puffs.length], u = m.userData; group.localToWorld(wp.copy(FUNNEL)); m.position.copy(wp);
    u.life = 0; u.max = 2.6 + Math.random() * 1.2; u.s0 = 0.55 + Math.random() * 0.35;
    u.v.set(back.x * (0.4 + speed * 0.5) + (Math.random() - 0.5) * 0.4, 1.5 + Math.random() * 0.7, back.z * (0.4 + speed * 0.5) + (Math.random() - 0.5) * 0.4);
    m.rotation.set(Math.random() * 6, Math.random() * 6, 0); m.visible = true;
  }
  const back = new THREE.Vector3(), q = new THREE.Quaternion(), WARM = new THREE.Color('#ffc46b');
  /** Every frame while it's the boat you sail: lights for the hour, and smoke for the speed. */
  function tick(t, dt, { vel = 0, maxV = 6, night = 0 } = {}) {
    const k = Math.min(1, Math.abs(vel) / maxV), blink = ((t % 1.2) < 0.8) ? 1 : 0.25;
    nav.forEach((n, i) => { const on = n.mast ? 1 : (i === 0 ? blink : ((t + 0.6) % 1.2 < 0.8 ? 1 : 0.25));
      n.lamp.material.emissiveIntensity = (0.6 + night) * on; n.halo.material.opacity = (0.25 + 0.45 * night) * on; n.pl.intensity = (0.6 + 3 * night) * on; });
    windows.forEach(w => { if (w.mt.emissive) w.mt.emissiveIntensity = night * 0.9; else w.mt.color.copy(w.day).lerp(WARM, night * 0.85); }); deckLamp.intensity = night * 7;
    // smoke: a trickle at idle, a thick trail at full ahead; it drifts aft of the boat
    group.getWorldQuaternion(q); back.set(-1, 0, 0).applyQuaternion(q).setY(0).normalize();
    puffAcc += dt * (1.6 + 7 * k); while (puffAcc > 1) { puffAcc -= 1; puff(back, k * maxV * 0.25); }
    smokeTick(dt, night);
  }
  function smokeTick(dt, night = 0) {
    puffs.forEach(m => { const u = m.userData; if (!m.visible) return; u.life += dt; const a = u.life / u.max; if (a >= 1) { m.visible = false; return; }
      m.position.addScaledVector(u.v, dt); u.v.y *= 1 - dt * 0.35; m.scale.setScalar(u.s0 * (1 + a * 2.6)); m.rotation.y += dt * 0.4;
      m.material.opacity = 0.5 * Math.min(1, a * 6) * (1 - a); m.material.color.setScalar(0.86 - 0.35 * night); });
  }
  return { group, template, outline, fit, outlines: [], ready, tick, smokeTick,
    /** The Garage: the hull and trim paint ('natural' or a colour), its swatches, and a change to them. */
    paint: () => ({ paint, colours: PAINT_COLS, set(next) { Object.assign(paint, next); try { localStorage.setItem(PAINT_KEY, JSON.stringify(paint)); } catch { /* storage blocked */ } applyPaint(); } }) };
}
