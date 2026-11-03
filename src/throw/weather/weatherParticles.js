const INTENSITY_COUNT_FACTOR = { light: 0.5, medium: 0.75, heavy: 1 };
function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}
function generateFallingParticles(quality, intensity, tuning) {
  const factor = INTENSITY_COUNT_FACTOR[intensity];
  const particles = [];
  const layerCounts = tuning.qualityLayerCounts[quality];
  const total = layerCounts.reduce((sum, c) => sum + Math.max(1, Math.round(c * factor)), 0);
  const swayFactor = tuning.swayAmplitudeFactor ?? 0;
  let revealIndex = 0;
  for (let layer = 0; layer < 3; layer++) {
    const count = Math.max(1, Math.round(layerCounts[layer] * factor));
    for (let i = 0; i < count; i++) {
      const length = tuning.layerBaseLength[layer] * randomBetween(0.75, 1.3);
      particles.push({
        x: Math.random(),
        length,
        thickness: tuning.layerBaseThickness[layer] * randomBetween(0.8, 1.25),
        opacity: tuning.layerBaseOpacity[layer] * randomBetween(0.7, 1.15),
        layer,
        phase: Math.random(),
        revealAt: total > 1 ? revealIndex / (total - 1) : 0,
        swayAmplitude: swayFactor > 0 ? length * swayFactor * randomBetween(0.6, 1.4) : 0,
        swayPhase: Math.random()
      });
      revealIndex++;
    }
  }
  return particles;
}
export {
  generateFallingParticles
};
