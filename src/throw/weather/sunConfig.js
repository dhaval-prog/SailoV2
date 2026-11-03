const MORNING = { intensity: 0.5, angle: 35, elevation: 0.35, warmth: 0.75, glowRadius: 0.9 };
const MIDDAY = { intensity: 1, angle: 12, elevation: 0.95, warmth: 0.4, glowRadius: 1 };
const AFTERNOON = { intensity: 0.72, angle: 24, elevation: 0.55, warmth: 0.62, glowRadius: 0.96 };
const EVENING = { intensity: 0.42, angle: 42, elevation: 0.18, warmth: 0.92, glowRadius: 1.18 };
function sunConfigForHour(hour) {
  if (hour >= 5 && hour < 10) return MORNING;
  if (hour >= 10 && hour < 16) return MIDDAY;
  if (hour >= 16 && hour < 19) return AFTERNOON;
  return EVENING;
}
export {
  sunConfigForHour
};
