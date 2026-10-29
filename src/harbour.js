// Finds a real harbour for a city chart's station: a marina, harbour, ferry terminal or pier from
// OpenStreetMap (or, for inland cities, a named lake), within the chart and away from its centre.
// Looked up once per chart (boot.js) and saved with it. Resolves { name, lat, lng } or null.

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const RANK = t => t.leisure === 'marina' || t['seamark:type'] === 'marina' ? 0 : t.harbour || t.landuse === 'harbour' || t['seamark:type'] === 'harbour' ? 1
  : t.amenity === 'ferry_terminal' ? 2 : t.man_made === 'pier' ? 3 : t.amenity === 'boat_rental' ? 4 : 5;
const LABEL = ['Marina', 'Harbour', 'Ferry Terminal', 'Pier', 'Boat Club', 'Lake'];

export async function findHarbour({ lat, lng }, ms = 6000) {
  const R = 13000, a = `(around:${R},${lat},${lng})`;
  const q = `[out:json][timeout:15];(nwr["leisure"="marina"]${a};nwr["harbour"]${a};nwr["landuse"="harbour"]${a};nwr["seamark:type"~"^(harbour|marina)$"]${a};
    nwr["amenity"="ferry_terminal"]${a};nwr["man_made"="pier"]["name"]${a};nwr["amenity"="boat_rental"]${a};nwr["natural"="water"]["water"~"^(lake|reservoir)$"]["name"]${a};);out center tags 80;`;
  for (const u of OVERPASS) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(u, { method: 'POST', body: 'data=' + encodeURIComponent(q), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: ctl.signal });
      if (!r.ok) continue;
      const j = await r.json(), m = Math.PI / 180;
      const best = (j.elements || []).map(e => { const t = e.tags || {}, la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon; if (la == null) return null;
        const d = Math.hypot((lo - lng) * Math.cos(lat * m), la - lat) * 111; // km from the centre
        return d < 0.8 ? null : { rank: RANK(t), d, name: (t['name:en'] || t.name || '').trim(), lat: la, lng: lo }; }).filter(Boolean)
        .sort((x, y) => x.rank - y.rank || (!!y.name - !!x.name) || x.d - y.d)[0];
      return best ? { name: best.name || LABEL[best.rank], lat: +best.lat.toFixed(5), lng: +best.lng.toFixed(5) } : null;
    } catch { /* try the next mirror */ } finally { clearTimeout(t); }
  }
  return undefined; // offline: try again next time
}
