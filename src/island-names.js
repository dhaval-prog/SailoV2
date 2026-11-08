// Island names. The islands are the map's buildings, so they have no names of their own: each takes the name of the
// label nearest to it on the map (a landmark, a society, a locality or a street; a landmark close by wins over a
// street). Islands that share a label are numbered outward from it: the nearest is plain, then 2, 3… ("Shivtirth Road",
// "Shivtirth Road 2"), so every island has a name of its own that points at a real place. An island with no label
// within reach takes its locality's name, numbered the same way. The same rule names islands on the map screen
// (hud.js) and on their signboards at sea (island-signs.js), so an island reads the same in both.
import { placeList, poiList } from './geo.js';

const REACH = 500;          // metres: a label names islands at most this far from it
const ROAD_K = 1.6;         // a street counts as this much farther than it is (landmarks and societies first)
const CELL = 150;

/**
 * Names for these islands: Map(island → { name, p (the label), on (the label sits on the island) }).
 * `all`: every island known, so the numbering is the same whichever islands are asked about.
 */
export function nameIslands(isles, all = isles, places = placeList(), pois = poiList()) {
  if (!isles.length) return new Map();
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity; isles.forEach(it => { x0 = Math.min(x0, it.x); z0 = Math.min(z0, it.z); x1 = Math.max(x1, it.x); z1 = Math.max(z1, it.z); });
  const W = REACH * 3, box = p => p.x > x0 - W && p.x < x1 + W && p.z > z0 - W && p.z < z1 + W;
  const isRoad = p => p.cat === 'road' || p.kind === 'road';
  const labels = [...places.filter(p => p.kind !== 'major' && p.kind !== 'region'), ...pois.filter(p => p.cat !== 'shack')].filter(box); // (a Fisher's Shack is a place of its own, not a name for an island)
  const towns = places.filter(p => p.kind !== 'region');
  const grid = new Map(); labels.forEach(p => { const k = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`; (grid.get(k) || grid.set(k, []).get(k)).push(p); });
  const n = Math.ceil(REACH * ROAD_K / CELL);
  // an island's label: the nearest (streets weighed farther), else its locality
  const labelOf = it => { let best = null, bd = Infinity; const cx = Math.floor(it.x / CELL), cz = Math.floor(it.z / CELL);
    for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) for (const p of grid.get(`${cx + i},${cz + j}`) || []) {
      const d = Math.hypot(it.x - p.x, it.z - p.z) * (isRoad(p) ? ROAD_K : 1); if (d < bd && d < REACH * (isRoad(p) ? ROAD_K : 1)) { bd = d; best = p; } }
    if (best) return { key: best.name, p: best, d: Math.hypot(it.x - best.x, it.z - best.z), on: !isRoad(best) && Math.hypot(it.x - best.x, it.z - best.z) < it.r * 1.6 + 25 };
    for (const p of towns) { const d = Math.hypot(it.x - p.x, it.z - p.z); if (d < bd) { bd = d; best = p; } }
    return best ? { key: best.name, p: best, d: bd, on: false } : null; };
  // every island round these ones, grouped by the name it takes (a street's several labels count as one), nearest first
  const groups = new Map(), mine = new Map();
  for (const it of all) { if (!box(it)) continue; const l = labelOf(it); if (!l) continue; mine.set(it, l); (groups.get(l.key) || groups.set(l.key, []).get(l.key)).push([it, l.d]); }
  groups.forEach(list => list.sort((a, b) => a[1] - b[1] || a[0].x - b[0].x || a[0].z - b[0].z));
  const out = new Map();
  for (const it of isles) { const l = mine.get(it) || labelOf(it); if (!l) continue; const list = groups.get(l.key) || [], i = list.findIndex(e => e[0] === it);
    out.set(it, { name: i > 0 ? `${l.key} ${i + 1}` : l.key, p: l.p, on: l.on && i <= 0 }); }
  return out;
}
