// The sailable world. Units are metres; the ocean is a square centred on the
// harbour (0, 0), which sits at the active chart's centre (chart.js). For Pune Paradise
// the square is sized from the real coordinates of the starter localities (plus a margin)
// so every one of them lies inside it; any other city gets an ocean of the same size around
// its centre. lat/lng map onto it with a local flat projection (accurate to well under 1%
// across a chart).
import { SEED } from './geo-seed.js';
import { CHART, isPune } from './chart.js';

const MILE = 1609.344;
const MARGIN = 2500; // metres of open water beyond the outermost Pune locality

const lats = SEED.map(r => r[1]), lngs = SEED.map(r => r[2]);
const LAT0 = isPune ? (Math.min(...lats) + Math.max(...lats)) / 2 : CHART.lat, LNG0 = isPune ? (Math.min(...lngs) + Math.max(...lngs)) / 2 : CHART.lng;
// local projection constants (WGS84 metres per degree at the centre latitude)
const phi = LAT0 * Math.PI / 180;
const M_LAT = 111132.92 - 559.82 * Math.cos(2 * phi) + 1.175 * Math.cos(4 * phi);
const M_LNG = Math.max(1000, 111412.84 * Math.cos(phi) - 93.5 * Math.cos(3 * phi)); // (never 0 near the poles)
const spanM = Math.max((Math.max(...lats) - Math.min(...lats)) * M_LAT, (Math.max(...lngs) - Math.min(...lngs)) * M_LNG) + MARGIN * 2;
const SIDE_MI = isPune ? Math.ceil(spanM / MILE) : 20; // whole miles per side (Pune works out at 20 too)
const SIDE = SIDE_MI * MILE;

export { CHART };
export const ORIGIN = { lat: LAT0, lng: LNG0, mLat: M_LAT, mLng: M_LNG };
/** lat/lng -> world metres (x east, z south). */
export const project = (lat, lng) => [(lng - LNG0) * M_LNG, -(lat - LAT0) * M_LAT];
/** world metres -> [lat, lng]. */
export const unproject = (x, z) => [LAT0 - z / M_LAT, LNG0 + x / M_LNG];

export const WORLD = {
  name: CHART.name,
  city: CHART.city,
  areaSqMi: SIDE_MI * SIDE_MI,
  areaKm2: SIDE * SIDE / 1e6,
  side: SIDE,
  half: SIDE / 2,
  warn: 600, // metres from the edge where the "leaving …" warning starts
  mile: MILE,
};

/** Clamp a horizontal position to the ocean, keeping `pad` metres from the edge. */
export const clampToWorld = (x, z, pad = 0) => {
  const h = WORLD.half - pad;
  return [Math.max(-h, Math.min(h, x)), Math.max(-h, Math.min(h, z))];
};

/** Metres from (x, z) to the nearest edge (negative once outside). */
export const edgeDistance = (x, z) => WORLD.half - Math.max(Math.abs(x), Math.abs(z));

/** "1.2 mi N · 0.4 mi E" style readout relative to the harbour (−z is north). */
export const formatPosition = (x, z) => {
  const f = (v, pos, neg) => `${(Math.abs(v) / MILE).toFixed(1)} mi ${v >= 0 ? pos : neg}`;
  return `${f(-z, 'N', 'S')} · ${f(x, 'E', 'W')}`;
};
