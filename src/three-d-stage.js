/**
 * <three-d-stage> — 3D object viewer + exporter shell (three.js).
 *
 * Owns the WebGL renderer, studio lighting, orbit controls (drag to orbit,
 * wheel/pinch to zoom, right-drag to pan), a camera auto-framed to the
 * object's bounds, resize handling, and a toolbar that exports the current
 * object as OBJ + MTL or GLB.
 *
 * Attributes:
 *   name       — export file basename (default "model")
 *   background — CSS color behind the scene
 *   autorotate — when present, a slow turntable until the user interacts
 */
import * as THREE_NS from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const stylesheet = `
  :host {
    position: relative;
    display: block;
    width: 100%;
    height: 100vh;
  height: 100dvh;
    background: var(--stage-bg, #f0eee6);
    overflow: hidden;
  }
  canvas { display: block; outline: none; }
  .toolbar {
    position: absolute;
    right: 16px;
    bottom: 16px;
    display: flex;
    gap: 8px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }
  .toolbar button {
    appearance: none;
    border: 1px solid rgba(20, 20, 19, 0.18);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.92);
    color: #1a1915;
    font-family: inherit;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1;
    padding: 9px 12px;
    cursor: default;
  }
  .toolbar button:hover { background: #fff; }
  .toolbar button:active { transform: translateY(1px); }
  .toolbar button[disabled] { opacity: 0.5; pointer-events: none; }
  .note {
    position: absolute;
    left: 16px;
    bottom: 16px;
    max-width: 60%;
    font: 400 12px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: rgba(26, 25, 21, 0.55);
    user-select: none;
  }
  .err {
    position: absolute;
    inset: 0;
    display: none;
    align-items: center;
    justify-content: center;
    padding: 24px;
    font: 500 14px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #8a2f20;
    text-align: center;
    white-space: pre-line;
  }
  @media (max-width: 640px), (max-height: 480px), (pointer: coarse) {
    .toolbar, .note { display: none; }
  }
`;

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

class ThreeDStage extends HTMLElement {
  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = stylesheet;
    root.appendChild(style);
    this._err = document.createElement('div');
    this._err.className = 'err';
    root.appendChild(this._err);
    const note = document.createElement('div');
    note.className = 'note';
    note.textContent = matchMedia('(pointer: coarse)').matches
      ? 'Drag to orbit · pinch to zoom · two-finger drag to pan'
      : 'Drag to orbit · scroll to zoom · right-drag to pan';
    root.appendChild(note);
    this._toolbar = document.createElement('div');
    this._toolbar.className = 'toolbar';
    this._objBtn = document.createElement('button');
    this._objBtn.type = 'button';
    this._objBtn.textContent = 'Download OBJ + MTL';
    this._objBtn.addEventListener('click', () => this._runExport('obj'));
    this._glbBtn = document.createElement('button');
    this._glbBtn.type = 'button';
    this._glbBtn.textContent = 'Download GLB';
    this._glbBtn.addEventListener('click', () => this._runExport('glb'));
    this._toolbar.appendChild(this._objBtn);
    this._toolbar.appendChild(this._glbBtn);
    root.appendChild(this._toolbar);
    this._setButtonsEnabled(false);
    /** Resolves with { THREE } once the scene is live — build the model
     *  in `await stage.ready` so nothing races the library load. */
    this.ready = new Promise((resolve, reject) => {
      this._readyResolve = resolve;
      this._readyReject = reject;
    });
  }

  connectedCallback() {
    if (this._booted) {
      // Re-attached after a removal — resume what disconnected stopped.
      if (this._renderer) {
        this._renderer.setAnimationLoop(this._loop);
        this._ro && this._ro.observe(this);
      }
      return;
    }
    this._booted = true;
    this._boot().catch((err) => {
      this._err.style.display = 'flex';
      this._err.textContent =
        'WebGL could not start on this device.\n\n' +
        String(err && err.message ? err.message : err);
      this._readyReject(err);
    });
  }

  async _boot() {
    const bg = this.getAttribute('background');
    if (bg) this.style.setProperty('--stage-bg', bg);
    const THREE = THREE_NS;
    this._THREE = THREE;
    // preserveDrawingBuffer keeps the last frame readable after
    // compositing (toDataURL / drawImage) — it's what lets the
    // screenshot tools capture the scene instead of a blank canvas.
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this._renderer = renderer;
    this.shadowRoot.insertBefore(renderer.domElement, this._err);

    const scene = new THREE.Scene();
    this._scene = scene;

    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
    camera.position.set(3, 2.2, 4);
    this._camera = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    this._controls = controls;

    // Neutral studio: soft sky/ground wash, a shadow-casting key light,
    // and a dim fill from behind so silhouettes never go black.
    scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0002;
    this._key = key;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
    fill.position.set(-5, 3, -4);
    scene.add(fill);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ opacity: 0.18 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this._ground = ground;
    scene.add(ground);

    this._autorotate = this.hasAttribute('autorotate');
    controls.autoRotate = this._autorotate;
    controls.autoRotateSpeed = 1.2;
    controls.addEventListener('start', () => {
      controls.autoRotate = false;
    });

    const fit = () => {
      const w = this.clientWidth || 1;
      const h = this.clientHeight || 1;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    fit();
    this._ro = new ResizeObserver(fit);
    this._loop = () => {
      controls.update();
      renderer.render(scene, camera);
    };
    // Detached while three.js was fetching? Stay idle — the
    // connectedCallback resume starts the loop and observer on
    // reattach.
    if (this.isConnected) {
      this._ro.observe(this);
      renderer.setAnimationLoop(this._loop);
    }

    this._readyResolve({ THREE });
  }

  disconnectedCallback() {
    // Stop rendering and observing while detached; connectedCallback
    // resumes both. (The renderer itself is kept — a move within the
    // document must not rebuild the scene.)
    if (this._renderer) this._renderer.setAnimationLoop(null);
    if (this._ro) this._ro.disconnect();
  }

  /** Show (and own) the object. Replaces any previous object, enables
   *  shadows on every mesh, rests it on the ground plane, and frames
   *  the camera to its bounds. */
  setObject(object) {
    const THREE = this._THREE;
    if (!THREE) throw new Error('three-d-stage: not ready — await stage.ready first');
    if (this._object) this._scene.remove(this._object);
    this._object = object;
    object.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(object);
    if (!box.isEmpty()) {
      // Rest the object on the ground without moving its origin.
      this._ground.position.y = box.min.y;
      const sphere = box.getBoundingSphere(new THREE.Sphere());
      const dist =
        (sphere.radius / Math.tan((this._camera.fov * Math.PI) / 360)) * 1.35;
      const dir = new THREE.Vector3(1, 0.55, 1.25).normalize();
      this._camera.position
        .copy(sphere.center)
        .add(dir.multiplyScalar(dist));
      this._camera.near = Math.max(dist / 100, 0.01);
      this._camera.far = dist * 100;
      this._camera.updateProjectionMatrix();
      this._controls.target.copy(sphere.center);
      this._controls.update();
      const span = sphere.radius * 3;
      this._key.shadow.camera.left = -span;
      this._key.shadow.camera.right = span;
      this._key.shadow.camera.top = span;
      this._key.shadow.camera.bottom = -span;
      this._key.shadow.camera.updateProjectionMatrix();
    }
    this._scene.add(object);
    this._setButtonsEnabled(true);
  }

  get _basename() {
    return (this.getAttribute('name') || 'model').replace(/[^\w.-]+/g, '_');
  }

  _setButtonsEnabled(on) {
    this._objBtn.disabled = !on;
    this._glbBtn.disabled = !on;
  }

  /** Every mesh and material needs a unique name for o/usemtl lines —
   *  fill in stable fallbacks, and return the unique material list. */
  _nameParts() {
    const mats = [];
    const seen = new Set();
    let meshI = 0;
    let matI = 0;
    this._object.traverse((o) => {
      if (!o.isMesh) return;
      if (!o.name) o.name = 'part_' + meshI;
      meshI += 1;
      const list = Array.isArray(o.material) ? o.material : [o.material];
      for (const m of list) {
        if (!m || mats.includes(m)) continue;
        if (!m.name) {
          m.name = 'mat_' + matI;
          matI += 1;
        }
        while (seen.has(m.name)) {
          m.name = m.name + '_' + matI;
          matI += 1;
        }
        seen.add(m.name);
        mats.push(m);
      }
    });
    return mats;
  }

  /** One export attempt.
   *  Rethrows so a failure stays visible on the console. */
  async _runExport(format) {
    if (!this._object) return;
    try {
      await (format === 'obj' ? this._exportObj() : this._exportGlb());
    } catch (err) {
      console.error('[three-d-stage] export failed', err);
      throw err;
    }
  }

  async _exportObj() {
    if (!this._object) return;
    const mod = await import('three/addons/exporters/OBJExporter.js');
    const mats = this._nameParts();
    const base = this._basename;
    const obj =
      'mtllib ' + base + '.mtl\n' + new mod.OBJExporter().parse(this._object);
    let mtl = '# Exported by three-d-stage\n';
    for (const m of mats) {
      const c = m.color || { r: 0.8, g: 0.8, b: 0.8 };
      const rough = typeof m.roughness === 'number' ? m.roughness : 0.5;
      const opacity = typeof m.opacity === 'number' ? m.opacity : 1;
      mtl += 'newmtl ' + m.name + '\n';
      mtl +=
        'Kd ' + c.r.toFixed(4) + ' ' + c.g.toFixed(4) + ' ' + c.b.toFixed(4) + '\n';
      mtl += 'Ks 0.2000 0.2000 0.2000\n';
      mtl += 'Ns ' + Math.round((1 - rough) * 200) + '\n';
      mtl += 'd ' + opacity.toFixed(4) + '\n\n';
    }
    download(new Blob([obj], { type: 'text/plain' }), base + '.obj');
    download(new Blob([mtl], { type: 'text/plain' }), base + '.mtl');
  }

  async _exportGlb() {
    if (!this._object) return;
    const mod = await import('three/addons/exporters/GLTFExporter.js');
    this._nameParts();
    const base = this._basename;
    const buf = await new mod.GLTFExporter().parseAsync(this._object, {
      binary: true,
    });
    download(
      new Blob([buf], { type: 'model/gltf-binary' }),
      base + '.glb'
    );
  }
}

if (!customElements.get('three-d-stage')) customElements.define('three-d-stage', ThreeDStage);
