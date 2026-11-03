function wrapLng(lng) {
  let l = lng;
  while (l > 180) l -= 360;
  while (l < -180) l += 360;
  return l;
}
function clampLat(lat) {
  return Math.max(-85, Math.min(85, lat));
}
function shortestLngDelta(a, b) {
  return wrapLng(b - a);
}
function flightPath(from, to, options = {}) {
  const samples = options.samples ?? 64;
  const bow = options.bow ?? 0.18;
  const deltaLng = shortestLngDelta(from.longitude, to.longitude);
  const totalDeltaLat = to.latitude - from.latitude;
  const midLat = (from.latitude + to.latitude) / 2;
  const poleSign = midLat >= 0 ? 1 : -1;
  const angularSpan = Math.hypot(totalDeltaLat, deltaLng);
  const bulge = Math.min(35, angularSpan * bow) * poleSign;
  const points = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const arc = Math.sin(Math.PI * t) * bulge;
    const lat = clampLat(from.latitude + totalDeltaLat * t + arc);
    const lng = wrapLng(from.longitude + deltaLng * t);
    points.push({ latitude: lat, longitude: lng });
  }
  return points;
}
function latLngAtProgress(points, t) {
  const clampedT = Math.max(0, Math.min(1, t));
  const idxFloat = clampedT * (points.length - 1);
  const idx = Math.min(points.length - 2, Math.max(0, Math.floor(idxFloat)));
  const localT = idxFloat - idx;
  const a = points[idx];
  const b = points[idx + 1];
  const deltaLng = shortestLngDelta(a.longitude, b.longitude);
  const deltaLat = b.latitude - a.latitude;
  const latitude = a.latitude + deltaLat * localT;
  const longitude = wrapLng(a.longitude + deltaLng * localT);
  const bearingDeg = Math.atan2(-deltaLat, deltaLng) * 180 / Math.PI;
  return { position: { latitude, longitude }, bearingDeg };
}
function planeSizeForProgress(t, max, min) {
  const c = Math.max(0, Math.min(1, t));
  const eased = c < 0.5 ? 2 * c * c : 1 - Math.pow(-2 * c + 2, 2) / 2;
  return max + (min - max) * eased;
}
const FADE_START = 0.82;
function planeOpacityForProgress(t) {
  const c = Math.max(0, Math.min(1, t));
  if (c < FADE_START) return 1;
  const local = (c - FADE_START) / (1 - FADE_START);
  return 1 - local;
}
const COINCIDENT_PIN_EPSILON_DEG = 2e-4;
const COINCIDENT_PIN_OFFSET_DEG = 35e-5;
function spreadCoincidentPins(pins) {
  const groups = /* @__PURE__ */ new Map();
  for (const p of pins) {
    const key = `${Math.round(p.latitude / COINCIDENT_PIN_EPSILON_DEG)},${Math.round(p.longitude / COINCIDENT_PIN_EPSILON_DEG)}`;
    const existing = groups.get(key);
    if (existing) existing.push(p);
    else groups.set(key, [p]);
  }
  const result = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const lngScale = Math.max(0.15, Math.cos(group[0].latitude * Math.PI / 180));
    group.forEach((pin, i) => {
      const angle = 2 * Math.PI * i / group.length - Math.PI / 2;
      result.push({
        ...pin,
        latitude: pin.latitude + COINCIDENT_PIN_OFFSET_DEG * Math.sin(angle),
        longitude: pin.longitude + COINCIDENT_PIN_OFFSET_DEG * Math.cos(angle) / lngScale
      });
    });
  }
  return result;
}
export {
  flightPath,
  latLngAtProgress,
  planeOpacityForProgress,
  planeSizeForProgress,
  spreadCoincidentPins
};
