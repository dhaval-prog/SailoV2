// Sailo · Drive: the same city as the sea, on land. Drive a car along its real streets (city.js), past its buildings,
// parks and lakes. A second mode beside sailing: the Sail button goes back to the sea, and each keeps its own spot.
// This first part is the world and the driving; fuel at the petrol pumps, taxi passengers, fishing at the lakes and
// other drivers come next. The car is a placeholder (car.js) until the real vehicle models arrive.
import * as THREE from 'three';
import { WORLD, CHART, clampToWorld } from '../world.js';
import { ensure, zoneAt } from '../geo.js';
import { createCity } from './city.js';
import { buildCar, driveStep, CAR } from './car.js';
import './drive.css';

const SAVE = 'sailo:drive';
const canvas = document.getElementById('dv-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const SUNC = new THREE.Color('#fff4e0'), MOONC = new THREE.Color('#9fb6ff');
const scene = new THREE.Scene(), DAY_SKY = new THREE.Color('#a9dcf2'), NIGHT_SKY = new THREE.Color('#0d1b33');
scene.background = DAY_SKY.clone(); scene.fog = new THREE.Fog(DAY_SKY.clone(), 350, 1300);
const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 4000);
const hemi = new THREE.HemisphereLight('#ffffff', '#b9a98a', 1.4); scene.add(hemi);
const sun = new THREE.DirectionalLight('#fff4e0', 2.2); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 }); scene.add(sun, sun.target);
const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }; addEventListener('resize', resize); resize();

const city = createCity({ THREE, scene });
const car = buildCar({ THREE }); scene.add(car.group);

// ---------- where you are: the last drive's spot, else the middle of the chart (moved onto the nearest road) ----------
const st = (() => { try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s && s.chart === CHART.id && isFinite(s.x)) return { x: s.x, z: s.z, yaw: s.yaw || 0, v: 0, steer: 0, placed: true }; } catch { /* none */ } return { x: 0, z: 0, yaw: 0, v: 0, steer: 0, placed: false }; })();
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify({ chart: CHART.id, x: +st.x.toFixed(1), z: +st.z.toFixed(1), yaw: +st.yaw.toFixed(3) })); } catch { /* storage blocked */ } };
setInterval(save, 4000); addEventListener('pagehide', save);
function placeOnRoad() { // the first time the roads round you are known: onto the nearest one, facing along it
  const r = city.nearestRoad(st.x, st.z, 700); if (!r) return false;
  if (!st.placed || r.d > r.w / 2) { st.x = r.x; st.z = r.z; st.yaw = Math.atan2(-r.dir[1], r.dir[0]); } st.placed = true; return true; }

// ---------- controls: keys, and on screen a wheel (drag it) and two pedals ----------
const keys = new Set(); addEventListener('keydown', e => { keys.add(e.key.toLowerCase()); if (e.key === ' ') e.preventDefault(); }); addEventListener('keyup', e => keys.delete(e.key.toLowerCase())); addEventListener('blur', () => keys.clear());
const ui = { steer: 0, gas: false, brake: false, wheelId: null, wheelX: 0 };
const wheel = document.getElementById('dv-wheel'), wheelSvg = wheel.querySelector('svg');
wheel.addEventListener('pointerdown', e => { ui.wheelId = e.pointerId; ui.wheelX = e.clientX; wheel.setPointerCapture(e.pointerId); e.preventDefault(); });
wheel.addEventListener('pointermove', e => { if (e.pointerId !== ui.wheelId) return; ui.steer = Math.max(-1, Math.min(1, (e.clientX - ui.wheelX) / 70)); });
const letGo = e => { if (e.pointerId !== ui.wheelId) return; ui.wheelId = null; ui.steer = 0; }; wheel.addEventListener('pointerup', letGo); wheel.addEventListener('pointercancel', letGo);
[['dv-gas', 'gas'], ['dv-brake', 'brake']].forEach(([id, k]) => { const b = document.getElementById(id);
  b.addEventListener('pointerdown', e => { ui[k] = true; b.classList.add('on'); b.setPointerCapture(e.pointerId); e.preventDefault(); });
  const up = () => { ui[k] = false; b.classList.remove('on'); }; b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); });
const input = () => {
  const l = keys.has('arrowleft') || keys.has('a'), r = keys.has('arrowright') || keys.has('d'), f = keys.has('arrowup') || keys.has('w') || ui.gas, b = keys.has('arrowdown') || keys.has('s') || keys.has(' ') || ui.brake;
  return { thr: (f ? 1 : 0) - (b ? 1 : 0), steer: ui.wheelId != null ? ui.steer : (r ? 1 : 0) - (l ? 1 : 0) };
};

// ---------- camera: behind the car, a drag turns it round, the wheel / pinch zooms ----------
const cam = { dist: 14, yawOff: 0, drag: null, pos: new THREE.Vector3(), look: new THREE.Vector3() };
canvas.addEventListener('pointerdown', e => { cam.drag = { x: e.clientX, off: cam.yawOff, id: e.pointerId }; });
addEventListener('pointermove', e => { if (cam.drag && e.pointerId === cam.drag.id) cam.yawOff = cam.drag.off - (e.clientX - cam.drag.x) / 160; });
addEventListener('pointerup', e => { if (cam.drag?.id === e.pointerId) cam.drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); cam.dist = Math.max(6, Math.min(80, cam.dist * Math.pow(1.0015, e.deltaY))); }, { passive: false });
document.getElementById('dv-zin').onclick = () => { cam.dist = Math.max(6, cam.dist / 1.4); }; document.getElementById('dv-zout').onclick = () => { cam.dist = Math.min(80, cam.dist * 1.4); };

// ---------- HUD ----------
const $ = id => document.getElementById(id);
let hudT = 0, bumpT = 0;
const nightNow = () => { const d = new Date(), h = d.getHours() + d.getMinutes() / 60; return h < 5.5 || h > 19.5 ? 1 : h < 7 ? (7 - h) / 1.5 : h > 18 ? (h - 18) / 1.5 : 0; };
function paintHud() {
  $('dv-speed').textContent = Math.round(Math.abs(st.v) * 3.6);
  const r = city.nearestRoad(st.x, st.z, 30), z = zoneAt(st.x, st.z);
  $('dv-road').textContent = r?.road.name || (r ? 'Unnamed road' : 'Off road');
  $('dv-place').textContent = z?.name || WORLD.city;
  $('dv-loading').hidden = city.loaded > 0 && st.placed;
}

// ---------- every frame ----------
let last = performance.now(), ensureT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if ((ensureT -= dt) < 0) { ensureT = 3; ensure(st.x - 6000, st.z - 6000, st.x + 6000, st.z + 6000, false); } // (the localities' names)
  city.update(dt, st.x, st.z);
  if (!st.placed || city.changed && Math.abs(st.v) < 0.1 && !city.onRoad(st.x, st.z)) placeOnRoad();
  // drive (once you're on the map)
  const inp = input();
  if (st.placed) {
    const road = city.onRoad(st.x, st.z), ox = st.x, oz = st.z; let [nx, nz] = driveStep(st, inp, dt, { road });
    [nx, nz] = clampToWorld(nx, nz);
    const fx = nx + Math.cos(st.yaw) * Math.sign(st.v || 1) * CAR.length / 2, fz = nz - Math.sin(st.yaw) * Math.sign(st.v || 1) * CAR.length / 2; // (the bumper that leads)
    const hit = !city.onRoad(fx, fz) && (city.solidAt(fx, fz) || city.solidAt(nx, nz)); // (a road always goes: over a river it's a bridge)
    if (hit) { if (Math.abs(st.v) > 3 && now - bumpT > 900) { bumpT = now; navigator.vibrate?.(30); flash(hit === 'water' ? 'Water! Find a road round it.' : 'Bump!'); } st.v *= -0.15; st.x = ox; st.z = oz; }
    else { st.x = nx; st.z = nz; }
  }
  const night = nightNow();
  car.group.position.set(st.x, 0, st.z); car.group.rotation.y = st.yaw; car.pose(st.v, st.steer, dt, { night, braking: inp.thr < 0 && st.v > 0.5 });
  // camera
  if (!cam.drag && Math.abs(st.v) > 1) cam.yawOff *= 1 - Math.min(1, dt * 1.2); // (eases back behind the car as you drive)
  const a = st.yaw + Math.PI + cam.yawOff, h = cam.dist * 0.42 + 1.5;
  cam.pos.set(st.x + Math.cos(a) * cam.dist, h, st.z - Math.sin(a) * cam.dist); cam.look.set(st.x, 1.2, st.z);
  camera.position.lerp(cam.pos, Math.min(1, dt * 5)); camera.lookAt(cam.look);
  // sun and sky for the hour; shadows follow the car
  sun.position.set(st.x + 60, 120, st.z + 40); sun.target.position.set(st.x, 0, st.z); sun.intensity = 2.2 * (1 - night) + 0.45 * night; sun.color.copy(SUNC).lerp(MOONC, night); hemi.intensity = 1.4 - night * 0.75; // (a bright moon at night)
  scene.background.copy(DAY_SKY).lerp(NIGHT_SKY, night); scene.fog.color.copy(scene.background);
  wheelSvg.style.transform = `rotate(${-st.steer / 0.62 * 110}deg)`; // (the on-screen wheel turns with the front wheels)
  if ((hudT -= dt) < 0) { hudT = 0.25; paintHud(); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
let flashT; function flash(msg) { const el = $('dv-toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(flashT); flashT = setTimeout(() => el.classList.remove('show'), 1800); }
$('dv-sail').onclick = () => { save(); location.href = './index.html'; };
requestAnimationFrame(frame);
if (import.meta.env.DEV) window.__drive = { st, city, car, keys, ui };
