import { generateFallingParticles } from "./weatherParticles.js";
const RAIN_LAYER_SPEED_MULTIPLIER = [0.55, 0.8, 1.15];
const RAIN_TUNING = {
  layerSpeedMultiplier: RAIN_LAYER_SPEED_MULTIPLIER,
  layerBaseOpacity: [0.32, 0.52, 0.78],
  layerBaseLength: [13, 20, 30],
  layerBaseThickness: [1, 1.3, 1.8],
  // Kept modest even at "high": this is a screen-space atmospheric layer, not a hero visual, and
  // the map underneath has to stay the thing that's actually readable.
  qualityLayerCounts: { high: [22, 18, 13], medium: [14, 12, 8], low: [7, 6, 4] }
};
function generateRainParticles(quality, intensity) {
  return generateFallingParticles(quality, intensity, RAIN_TUNING);
}
export {
  RAIN_LAYER_SPEED_MULTIPLIER,
  generateRainParticles
};
