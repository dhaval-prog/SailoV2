// "Diorama" theme: a soft, calm, toy-like low-poly look (no outlines, flat-shaded faces, desaturated
// pastel tones, shadows leaning blue-green, a hazy glow of sunlight at the top left). Applied as one sweep
// over the scene, and again every so often for things added later (other boats, wildlife, stations).
//   - ink outlines (inverted-hull meshes) are hidden
//   - toon materials: flat shading, a softer light ramp (depth comes from the angle of each face), no cyan rim
//   - colours: desaturated and nudged toward pastel, except the accents (the boats, which stay the warm pops)

const isOutline = m => m && (m.name === 'ink_outline' || m.name === 'ink_line' || (m.isMeshBasicMaterial && m.side === 1 /* BackSide */ && !m.map && m.color && m.color.r + m.color.g + m.color.b < 0.6));

export function createTheme(THREE, { scene, accents = [] }) {
  // a soft four-step ramp, smoothed: faces read by their angle to the light, without hard cel bands
  const ramp = new THREE.DataTexture(new Uint8Array([150, 150, 150, 255, 188, 188, 188, 255, 222, 222, 222, 255, 255, 255, 255, 255]), 4, 1);
  ramp.minFilter = ramp.magFilter = THREE.LinearFilter; ramp.needsUpdate = true;
  const hsl = {};

  function themeMaterial(m, accent) {
    if (!m || m.userData.diorama) return; m.userData.diorama = true;
    if (isOutline(m)) { m.visible = false; return; }
    if (m.isMeshToonMaterial || m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial) {
      m.flatShading = true;
      if (m.isMeshToonMaterial) { m.gradientMap = ramp;
        // drop the cyan rim light the cel look added
        const before = m.onBeforeCompile, key = m.customProgramCacheKey;
        m.onBeforeCompile = function (sh, r) { if (before) before.call(this, sh, r); sh.fragmentShader = sh.fragmentShader.replace(/outgoingLight \+= vec3\([^;]*rimF[^;]*;/g, ''); };
        m.customProgramCacheKey = function () { return (key ? key.call(this) : '') + '|diorama'; }; }
      // pastel, desaturated colours (the accents keep their pop)
      if (m.color && !accent && !m.vertexColors) { m.color.getHSL(hsl); m.color.setHSL(hsl.h, hsl.s * 0.72, hsl.l + (0.6 - hsl.l) * 0.12); }
      m.needsUpdate = true;
    }
  }
  const each = (root, f) => root.traverse(o => { if (!o.isMesh) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach(f); });
  function sweep() {
    // the accents first: boat materials are shared with every captain's copy of that boat, so they stay saturated everywhere
    accents.forEach(a => a && each(a, m => themeMaterial(m, true)));
    each(scene, m => themeMaterial(m, false));
  }
  sweep(); setInterval(sweep, 1500);

  // hazy sunlight glowing in from the top left
  const haze = document.createElement('div'); haze.id = 'sun-haze'; haze.setAttribute('aria-hidden', 'true'); document.body.appendChild(haze);
  return { sweep, setGlow: k => { haze.style.opacity = Math.max(0, Math.min(1, k)).toFixed(3); } };
}
