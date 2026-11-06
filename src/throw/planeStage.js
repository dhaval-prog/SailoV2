// The folding paper plane: a WebGL canvas running MySpace's paper-plane engine (planeEngine.js, ported unchanged), with
// the letter's own text and first photo baked onto its paper (letterTexture.js). Port of PaperPlaneStageImpl.web.
import * as THREE from 'three';
import { createPaperPlane } from './planeEngine.js';
import { bakeLetterTexture } from './letterTexture.js';
import paperTexture from './paper-texture.jpg';

export function createPlaneStage(container, { onPhase, onError } = {}) {
  let engine = null, renderer = null;
  const ro = new ResizeObserver(([e]) => { const { width, height } = e.contentRect; if (!width || !height) return;
    if (!engine) start(width, height); else engine.resize(width, height); });
  ro.observe(container);
  function start(width, height) {
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
      container.appendChild(renderer.domElement);
      const texture = new THREE.TextureLoader().load(paperTexture); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
      engine = createPaperPlane({ renderer, texture, width, height, onPhase, onError });
      queue.splice(0).forEach(([m, a]) => api[m](...a));
    } catch (err) { onError?.(err); }
  }
  const queue = []; // (calls made before the first layout, replayed once the engine exists)
  const call = m => (...a) => { if (engine) engine[m](...a); else queue.push([m, a]); };
  const api = {
    setActive: call('setActive'), fold: call('fold'), fly: call('fly'), reset: call('reset'), holdReady: call('holdReady'), unready: call('unready'), setReadyBank: call('setReadyBank'), seek: call('seek'), setOptions: call('setOptions'),
    setContent(content, size) { bakeLetterTexture(content, size).then(tex => { if (engine) { try { renderer.initTexture(tex); } catch { /* uploaded on first use instead */ } engine.setTexture(tex); } else queue.push(['setTexture', [tex]]); }).catch(e => console.warn('[Throw] letter texture failed:', e)); },
    setTexture: t => engine?.setTexture(t),
    dispose() { ro.disconnect(); engine?.dispose(); renderer?.domElement.remove(); engine = null; },
  };
  return api;
}
