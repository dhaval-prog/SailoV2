// A Paradise Station in every major neighbourhood. The chart's own station (Pune Paradise's original spot; elsewhere a
// real harbour) stays the home port, the local sailors' one; each major neighbourhood gets another at its centre, kept
// clear of the start of every voyage, of the ocean's edge and of each other.
// - Pune's neighbourhoods ship with the game (geo-seed.js), so every captain gets the same stations at once, and the
//   server knows them too (migration …_sailov2_stations.sql: safe harbours, no planks inside).
// - Other cities take their major neighbourhoods from the live map as it loads; the server is told of them (and keeps
//   them, spaced the same way).
import { WORLD, project } from './world.js';
import { SEED } from './geo-seed.js';

export const STATION_SPACING = 1200;  // metres between two stations
const CLEAR_OF_START = 900;           // metres from the chart's centre (where voyages start)

/** Stations for these neighbourhoods ([{ name, lat, lng }]), around the ones already there (with home first). */
export function stationsFor(places, existing) {
  const lim = WORLD.half - 1500, out = [];
  places.forEach(p => {
    let [x, z] = project(p.lat, p.lng); const d = Math.hypot(x, z);
    if (d < CLEAR_OF_START) { if (d < 1) { x = CLEAR_OF_START; z = 0; } else { x *= CLEAR_OF_START / d; z *= CLEAR_OF_START / d; } }
    x = Math.max(-lim, Math.min(lim, x)); z = Math.max(-lim, Math.min(lim, z));
    if ([...existing, ...out].some(s => Math.hypot(s.x - x, s.z - z) < STATION_SPACING)) return;
    out.push({ id: p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), name: 'Paradise Station', at: p.name, x, z });
  });
  return out;
}
/** Pune's major neighbourhoods, from the places that ship with the game. */
export const PUNE_MAJORS = SEED.filter(r => r[4]).map(([name, lat, lng]) => ({ name, lat, lng }));
