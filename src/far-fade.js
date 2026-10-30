// Far away, solid things (rocks, a harbour island) dissolve into the haze the way the sea does, so they never stand
// on the horizon as flat dark shapes: between 55% of the haze's far end and its end they're dropped pixel by pixel (a
// fine screen-door dither: no see-through sorting), and gone beyond. uFog is the sea's own haze (main.js: seaU.uFog).
export function farFade(uFog) {
  const done = new WeakSet();
  return mat => { if (!mat || done.has(mat) || mat.isShaderMaterial) return; done.add(mat);
    const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey?.bind(mat);
    mat.onBeforeCompile = (sh, r) => { prev?.call(mat, sh, r); sh.uniforms.uFarFog = uFog;
      sh.vertexShader = 'varying float vFarD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vFarD = length(mvPosition.xyz);');
      sh.fragmentShader = 'uniform vec2 uFarFog; varying float vFarD;\n' + sh.fragmentShader.replace('void main() {', `void main() {
        { float fd = smoothstep(uFarFog.y * 0.55, uFarFog.y, vFarD); if (fd > 0.0 && fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453) < fd) discard; }`); };
    mat.customProgramCacheKey = () => (prevKey ? prevKey() : '') + '|farfade'; mat.needsUpdate = true; };
}
