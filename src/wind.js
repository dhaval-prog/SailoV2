// The wind: one direction that the swell runs with (main.js), the whitecaps streak along, the funnel smoke drifts on
// (the boats) and the sea's sound follows. It shifts every few minutes, slowly (over half a minute), and it's worked out
// from the clock, so every captain at sea has the same wind at the same time.
const SLOT = 4 * 60 * 1000, TURN = 30 * 1000; // a new wind every 4 minutes, turning to it over 30 s
export const BASE = Math.atan2(0.3, 1);       // the direction the swell was drawn for (main.js: its main wave train)
// where the wind blows toward, in a slot: wandering round the base, never all the way about
const angleAt = slot => BASE + 0.9 * Math.sin(slot * 1.7) + 0.5 * Math.sin(slot * 0.63 + 1);
const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/** The wind now: from (the old direction), to (the new), k (how far it's turned, 0…1), angle (the blend), x/z (unit,
 *  toward), and where it blows from on the compass. */
export const WIND = { from: angleAt(0), to: angleAt(0), k: 1, angle: BASE, x: 1, z: 0, slot: -1 };

/** Every frame. onShift(text) when a new wind sets in. */
export function stepWind(onShift) {
  const now = Date.now(), slot = Math.floor(now / SLOT), into = now - slot * SLOT;
  if (slot !== WIND.slot) { const first = WIND.slot < 0; WIND.slot = slot; WIND.from = angleAt(slot - 1); WIND.to = angleAt(slot); if (!first) onShift?.(`Wind shifting · from the ${fromName(WIND.to)}`); }
  const k = Math.min(1, into / TURN); WIND.k = k * k * (3 - 2 * k);
  let d = WIND.to - WIND.from; d = Math.atan2(Math.sin(d), Math.cos(d)); WIND.angle = WIND.from + d * WIND.k;
  WIND.x = Math.cos(WIND.angle); WIND.z = Math.sin(WIND.angle);
}
/** Where a wind blowing toward `a` comes from, on the compass (north is −z, east +x). */
export function fromName(a) { const fx = -Math.cos(a), fz = -Math.sin(a), b = (Math.atan2(fx, -fz) * 180 / Math.PI + 360) % 360; return COMPASS[Math.round(b / 45) % 8]; }
