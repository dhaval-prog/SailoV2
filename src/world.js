// The sailable world. Units are metres; the ocean is a square centred on the
// harbour (0, 0) so islands and coastlines can later be placed on a simple grid.
const MILE = 1609.344;
const AREA_SQ_MI = 200;
const SIDE = Math.sqrt(AREA_SQ_MI) * MILE; // ≈ 22.76 km (14.14 mi) per side

export const WORLD = {
  name: 'Paradise',
  areaSqMi: AREA_SQ_MI,
  areaKm2: AREA_SQ_MI * MILE * MILE / 1e6, // ≈ 518 km²
  side: SIDE,
  half: SIDE / 2, // ≈ 11.38 km from the harbour to each edge
  warn: 600, // metres from the edge where the "leaving Paradise" warning starts
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
