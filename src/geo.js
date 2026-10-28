// Pune geography over the ocean: localities, landmarks and roads as labels only (no land).
// Data comes from live map data for the area in view, and is cached:
//   - Mapbox vector tiles (place_label, poi_label, road) when a public access token is set
//     (VITE_MAPBOX_TOKEN), read through the Sailo map style's own tilesets;
//   - OpenStreetMap (Overpass API) otherwise, and always for neighbourhood boundary
//     polygons (Mapbox tiles carry no locality polygons);
//   - the starter list in geo-seed.js until live data arrives (or when offline).
// Everything is converted to world metres with the projection in world.js and clipped
// to the ocean square.

import { WORLD, project, unproject } from './world.js';
import { SEED, SEED_REGIONS } from './geo-seed.js';

export const MAPBOX_STYLE = 'mapbox://styles/dhavaldamania04112025/cmvr7naej000j01s5du0s3ahk';
const TOKEN = (import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN) || '';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const TTL = 7 * 24 * 3600 * 1000; // cached data is reused for a week
const CACHE = 'sailo-geo-v1';
const Z_PLACES = 12, Z_POIS = 14; // tile zoom for localities / for landmarks and roads

export const provider = TOKEN ? 'mapbox' : 'osm';

// ---------- small helpers ----------
const inWorld = (x, z) => Math.abs(x) <= WORLD.half && Math.abs(z) <= WORLD.half;
const keyOf = n => n.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '');
const latin = n => n && /[a-z]/i.test(n) && !/[ऀ-ॿ]/.test(n); // skip Devanagari-only names (label set is English)
const lng2t = (lng, z) => Math.floor((lng + 180) / 360 * 2 ** z);
const lat2t = (lat, z) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** z); };
const t2lng = (x, z) => x / 2 ** z * 360 - 180;
const t2lat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / 2 ** z; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
const tileBox = (x, y, z) => ({ s: t2lat(y + 1, z), w: t2lng(x, z), n: t2lat(y, z), e: t2lng(x + 1, z) });

// cache: Cache Storage when available (https / localhost), memory otherwise
const mem = new Map();
const cacheGet = async key => {
  if (mem.has(key)) return mem.get(key);
  try { const c = await caches.open(CACHE), r = await c.match('https://sailo.cache/' + key); if (!r) return null; const j = await r.json(); if (Date.now() - j.t > TTL) return null; mem.set(key, j.d); return j.d; }
  catch { return null; }
};
const cachePut = async (key, d) => { mem.set(key, d); try { const c = await caches.open(CACHE); await c.put('https://sailo.cache/' + key, new Response(JSON.stringify({ t: Date.now(), d }))); } catch { /* no cache storage */ } };

// ---------- the store ----------
// kinds: region (zoom 1), major (2), minor (3), poi / road / society (4)
const places = new Map(); // locality key -> place
const pois = new Map();   // id -> landmark / road / society
const zones = [];         // { name, key, ring:[[x,z]], area, box }
const listeners = new Set();
let changed = false;
const notify = () => { changed = true; };
setInterval(() => { if (changed) { changed = false; listeners.forEach(f => f()); } }, 400);
export const onChange = f => { listeners.add(f); return () => listeners.delete(f); };

const addPlace = (name, lat, lng, kind, group, src) => {
  if (!latin(name)) return; const [x, z] = project(lat, lng); if (!inWorld(x, z)) return;
  const k = keyOf(name), cur = places.get(k);
  if (cur) { // live data refines the starter position (same name within 4 km)
    if (cur.src === 'seed' && src !== 'seed' && Math.hypot(cur.x - x, cur.z - z) < 4000) { cur.x = x; cur.z = z; cur.lat = lat; cur.lng = lng; cur.src = src; notify(); }
    return;
  }
  places.set(k, { name, key: k, lat, lng, x, z, kind, group: group || groupAt(x, z), src }); notify();
};
const addPoi = (id, name, lat, lng, kind, cat) => {
  if (pois.has(id) || !latin(name)) return; const [x, z] = project(lat, lng); if (!inWorld(x, z)) return;
  pois.set(id, { id, name, x, z, kind, cat }); notify();
};
const ringArea = r => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2); };
const addZone = (name, ringLL) => {
  if (!latin(name) || ringLL.length < 4) return; const k = keyOf(name); if (zones.some(z => z.key === k)) return;
  const ring = ringLL.map(([lat, lng]) => project(lat, lng)); let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  ring.forEach(([x, z]) => { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); });
  if (x1 < -WORLD.half || x0 > WORLD.half || z1 < -WORLD.half || z0 > WORLD.half) return;
  const area = ringArea(ring); if (area < 2e4 || area > 6e7) return; // ignore tiny plots and whole districts
  zones.push({ name, key: k, ring, area, box: [x0, z0, x1, z1] }); zones.sort((a, b) => a.area - b.area); notify();
};

// starter localities and the level-1 regions
const GROUPS = {};
SEED.forEach(([name, lat, lng, group, major]) => { const [x, z] = project(lat, lng); places.set(keyOf(name), { name, key: keyOf(name), lat, lng, x, z, kind: major ? 'major' : 'minor', group, src: 'seed' }); (GROUPS[group] ||= []).push([x, z]); });
const regions = SEED_REGIONS.map(r => { const [x, z] = project(r.lat, r.lng); return { name: r.name, x, z, kind: 'region' }; });
['East', 'West', 'South', 'North'].forEach(g => { const pts = GROUPS[g]; regions.push({ name: `${g} Pune`, x: pts.reduce((a, p) => a + p[0], 0) / pts.length, z: pts.reduce((a, p) => a + p[1], 0) / pts.length, kind: 'region', group: g }); });
function groupAt(x, z) { let best = null, bd = Infinity; for (const p of places.values()) { if (p.src !== 'seed') continue; const d = Math.hypot(p.x - x, p.z - z); if (d < bd) { bd = d; best = p.group; } } return best; }

// ---------- OpenStreetMap (Overpass) ----------
let opBusy = Promise.resolve();
const overpass = q => (opBusy = opBusy.then(async () => { // one request at a time, politely spaced
  for (const u of OVERPASS) {
    try { const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }); if (r.ok) { const j = await r.json(); await new Promise(f => setTimeout(f, 800)); return j; } }
    catch { /* try the next mirror */ }
  }
  return null;
}).catch(() => null));
const osmName = t => t['name:en'] || t.name;
const OSM_MINOR = new Set(['neighbourhood', 'quarter', 'locality', 'hamlet', 'isolated_dwelling']);
// join a relation's outer ways into closed rings
function rings(members) {
  const ways = members.filter(m => m.type === 'way' && m.role !== 'inner' && m.geometry).map(m => m.geometry.map(p => [p.lat, p.lon]));
  const out = [], same = (a, b) => a[0] === b[0] && a[1] === b[1];
  while (ways.length) {
    let ring = ways.shift();
    for (let grew = true; grew && !same(ring[0], ring[ring.length - 1]);) { grew = false;
      for (let i = 0; i < ways.length; i++) { const w = ways[i], end = ring[ring.length - 1];
        if (same(w[0], end)) ring = ring.concat(w.slice(1)); else if (same(w[w.length - 1], end)) ring = ring.concat(w.slice(0, -1).reverse()); else continue;
        ways.splice(i, 1); grew = true; break; } }
    if (ring.length > 3) out.push(ring);
  }
  return out;
}
const centroidLL = pts => [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
async function osmPlaces(b) {
  const bb = `${b.s},${b.w},${b.n},${b.e}`;
  const j = await overpass(`[out:json][timeout:40];(
    node["place"~"^(suburb|neighbourhood|quarter|locality|village|town|hamlet)$"]["name"](${bb});
    way["place"~"^(suburb|neighbourhood|quarter|village)$"]["name"](${bb});
    relation["place"~"^(suburb|neighbourhood|quarter|village)$"]["name"](${bb});
    relation["boundary"="administrative"]["admin_level"~"^(9|10)$"]["name"](${bb}););out geom;`);
  if (!j) return null;
  const d = { places: [], zones: [] };
  for (const e of j.elements || []) {
    const t = e.tags || {}, name = osmName(t); if (!name) continue;
    const kind = OSM_MINOR.has(t.place) ? 'minor' : 'major';
    if (e.type === 'node') { if (t.place) d.places.push([name, e.lat, e.lon, kind]); continue; }
    if (!t.place && t.boundary !== 'administrative') continue;
    const rs = e.type === 'way' ? [e.geometry.map(p => [p.lat, p.lon])] : rings(e.members || []);
    rs.forEach(r => d.zones.push([name, r, t.boundary === 'administrative' ? 1 : 0])); // admin areas only count when they match a locality
    if (t.place && rs[0]) { const [lat, lng] = centroidLL(rs[0]); d.places.push([name, lat, lng, kind]); }
  }
  return d;
}
const OSM_POI = t => t.amenity === 'fuel' ? 'fuel' : /^(restaurant|cafe|fast_food|food_court)$/.test(t.amenity) ? 'food' : /^(hospital|clinic)$/.test(t.amenity) ? 'health'
  : /^(school|college|university)$/.test(t.amenity) ? 'school' : /^(hotel|guest_house)$/.test(t.tourism) ? 'hotel' : t.shop === 'mall' ? 'mall' : t.leisure === 'park' ? 'park'
  : (t.landuse === 'residential' || t.building === 'apartments') ? 'society' : t.highway ? 'road' : null;
async function osmPois(b, societiesOnly) {
  const bb = `${b.s},${b.w},${b.n},${b.e}`;
  const q = societiesOnly ? `nwr["landuse"="residential"]["name"](${bb});nwr["building"="apartments"]["name"](${bb});` : `
    nwr["amenity"~"^(restaurant|cafe|fast_food|food_court|fuel|hospital|clinic|school|college|university)$"]["name"](${bb});
    nwr["tourism"~"^(hotel|guest_house)$"]["name"](${bb}); nwr["shop"="mall"]["name"](${bb}); nwr["leisure"="park"]["name"](${bb});
    nwr["landuse"="residential"]["name"](${bb}); nwr["building"="apartments"]["name"](${bb});
    way["highway"~"^(trunk|primary|secondary|tertiary)$"]["name"](${bb});`;
  const j = await overpass(`[out:json][timeout:30];(${q});out center tags;`);
  if (!j) return null;
  const seenRoad = new Set(), d = [];
  for (const e of j.elements || []) {
    const t = e.tags || {}, name = osmName(t), cat = OSM_POI(t); if (!name || !cat) continue;
    const lat = e.lat ?? e.center?.lat, lng = e.lon ?? e.center?.lon; if (lat == null) continue;
    if (cat === 'road') { if (seenRoad.has(name)) continue; seenRoad.add(name); }
    d.push([`osm${e.type[0]}${e.id}`, name, lat, lng, cat === 'road' ? 'road' : cat === 'society' ? 'society' : 'poi', cat]);
  }
  return d;
}

// ---------- Mapbox vector tiles ----------
let mbTilesets = null, mbLib = null;
async function mapbox(x, y, z) {
  if (!mbLib) { const [vt, pbf] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')]); mbLib = { VectorTile: vt.VectorTile, Pbf: pbf.default }; }
  mbTilesets ||= (async () => { // the style's own vector sources (falls back to Mapbox Streets)
    try { const [, user, id] = MAPBOX_STYLE.match(/styles\/([^/]+)\/([^/?]+)/); const r = await fetch(`https://api.mapbox.com/styles/v1/${user}/${id}?access_token=${TOKEN}`);
      if (r.ok) { const s = await r.json(), src = Object.values(s.sources || {}).find(v => v.type === 'vector' && /^mapbox:\/\//.test(v.url || '')); if (src) return src.url.replace('mapbox://', ''); } }
    catch { /* keep the default */ }
    return 'mapbox.mapbox-streets-v8';
  })();
  const ts = await mbTilesets;
  const r = await fetch(`https://api.mapbox.com/v4/${ts}/${z}/${x}/${y}.vector.pbf?access_token=${TOKEN}`); if (!r.ok) return null;
  const tile = new mbLib.VectorTile(new mbLib.Pbf(new Uint8Array(await r.arrayBuffer()))), out = { places: [], pois: [] };
  const each = (layer, f) => { const L = tile.layers[layer]; if (!L) return; for (let i = 0; i < L.length; i++) { const ft = L.feature(i); f(ft.properties, ft.toGeoJSON(x, y, z).geometry, ft); } };
  each('place_label', (p, g) => { if (g.type !== 'Point' || !/^(suburb|quarter|neighbourhood|town|village|hamlet|locality)$/.test(p.type)) return;
    out.places.push([p.name_en || p.name, g.coordinates[1], g.coordinates[0], /^(suburb|town|village)$/.test(p.type) ? 'major' : 'minor']); });
  each('poi_label', (p, g, ft) => { if (g.type !== 'Point') return; const m = p.maki || '', c = p.class || '';
    const cat = m === 'fuel' ? 'fuel' : /^(restaurant|cafe|fast-food|bar|restaurant-pizza|restaurant-noodle|bakery)$/.test(m) || c === 'food_and_drink' ? 'food' : /^(hospital|doctor)$/.test(m) ? 'health'
      : /^(school|college)$/.test(m) || c === 'education' ? 'school' : m === 'lodging' || c === 'lodging' ? 'hotel' : /mall/i.test(p.type || '') || /mall/i.test(p.name || '') ? 'mall' : m === 'park' || c === 'park_like' ? 'park' : null;
    if (!cat) return; out.pois.push([`mb${ft.id ?? p.name}`, p.name_en || p.name, g.coordinates[1], g.coordinates[0], 'poi', cat]); });
  const roads = new Set();
  each('road', (p, g) => { if (!p.name || roads.has(p.name) || !/^(motorway|trunk|primary|secondary|tertiary|street)$/.test(p.class)) return;
    const line = g.type === 'LineString' ? g.coordinates : g.type === 'MultiLineString' ? g.coordinates[0] : null; if (!line || line.length < 2) return;
    roads.add(p.name); const m = line[Math.floor(line.length / 2)]; out.pois.push([`mbr${x}-${y}-${p.name}`, p.name, m[1], m[0], 'road', 'road']); });
  return out;
}

// ---------- loading by visible bounds ----------
const requested = new Set();
// each source loads on its own (Mapbox tiles come back fast; Overpass requests are queued)
function loadTile(src, layer, x, y, z) {
  const id = `${src}:${layer}:${z}/${x}/${y}`; if (requested.has(id)) return; requested.add(id);
  (async () => {
    let d = await cacheGet(id);
    if (!d) {
      const b = tileBox(x, y, z);
      if (src === 'mapbox') { d = await mapbox(x, y, z); if (d && layer === 'places') d.pois = []; else if (d) d.places = []; }
      else if (layer === 'places') d = await osmPlaces(b);
      else { const p = await osmPois(b, provider === 'mapbox'); d = p && { pois: p }; }
      if (!d) { requested.delete(id); return; } // offline or failed: ask again later
      cachePut(id, d);
    }
    d.places?.forEach(([n, lat, lng, k]) => addPlace(n, lat, lng, k, null, src));
    d.zones?.forEach(([n, r, admin]) => { if (!admin || places.has(keyOf(n))) addZone(n, r); });
    d.pois?.forEach(([i, n, lat, lng, k, c]) => addPoi(i, n, lat, lng, k, c));
  })().catch(() => requested.delete(id));
}
/** Ask for data covering a world-space rectangle; `detail` also loads landmarks and roads. */
export function ensure(x0, z0, x1, z1, detail = false) {
  const h = WORLD.half; x0 = Math.max(-h, x0); z0 = Math.max(-h, z0); x1 = Math.min(h, x1); z1 = Math.min(h, z1); if (x0 >= x1 || z0 >= z1) return;
  const [n, w] = unproject(x0, z0), [s, e] = unproject(x1, z1);
  const tiles = (z, max) => { const out = []; for (let x = lng2t(w, z); x <= lng2t(e, z); x++) for (let y = lat2t(n, z); y <= lat2t(s, z); y++) out.push([x, y]); return out.length <= max ? out : []; };
  if (provider === 'mapbox') tiles(Z_PLACES, 30).forEach(([x, y]) => loadTile('mapbox', 'places', x, y, Z_PLACES));
  tiles(Z_PLACES - 1, 9).forEach(([x, y]) => loadTile('osm', 'places', x, y, Z_PLACES - 1)); // fewer, larger Overpass queries
  if (detail) tiles(Z_POIS, 12).forEach(([x, y]) => { if (provider === 'mapbox') loadTile('mapbox', 'pois', x, y, Z_POIS); loadTile('osm', 'pois', x, y, Z_POIS); });
}

// ---------- queries ----------
export const regionList = () => regions;
export const placeList = () => [...places.values()];
export const poiList = () => [...pois.values()];
export const poisNear = (x, z, r) => { const out = []; for (const p of pois.values()) if (Math.abs(p.x - x) < r && Math.abs(p.z - z) < r) out.push(p); return out; };
const inside = (ring, x, z) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, zi] = ring[i], [xj, zj] = ring[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; };
/** The locality at a point: the smallest boundary polygon containing it, else (fallback) the
 *  nearest locality within its approximate radius. Returns { name, group, score } or null. */
export function zoneAt(x, z) {
  for (const zn of zones) { const b = zn.box; if (x < b[0] || x > b[2] || z < b[1] || z > b[3] || !inside(zn.ring, x, z)) continue;
    const p = places.get(zn.key); return { name: p?.name || zn.name, group: p?.group || groupAt(x, z), score: 0.5, poly: true }; }
  let best = null, bs = 1;
  for (const p of places.values()) { const r = p.kind === 'major' ? 1500 : 800, s = Math.hypot(p.x - x, p.z - z) / r; if (s < bs) { bs = s; best = p; } }
  return best ? { name: best.name, group: best.group, score: bs, poly: false } : null;
}
export const zoneCount = () => zones.length;
