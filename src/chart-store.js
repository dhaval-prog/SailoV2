// Saved charts (city oceans) on this device. No active chart here: boot.js uses this before the
// scene loads; chart.js fixes the active chart for the session.

const KEY = 'sailo:chart', SEEN = 'sailo:charts', HOME = 'sailo:home';

// Pune Paradise: the original chart; its centre and size come from the Pune localities (world.js)
export const PUNE = { id: 'pune', name: 'Pune Paradise', city: 'Pune', region: 'Maharashtra', country: 'India', cc: 'IN', lat: 18.5204, lng: 73.8567, tz: 'Asia/Kolkata', station: null }; // (Pune keeps its original station spot)

export const validChart = c => c && typeof c.id === 'string' && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

/** The chart saved on this device, or null on a first visit. */
export const savedChart = () => { const c = read(KEY); return validChart(c) ? (c.id === 'pune' ? { ...PUNE, ...c } : c) : null; };

/** The fields a chart keeps (also saved with the boat position). station: a real harbour/marina
 *  { name, lat, lng } found for the chart, null when none was found, or absent until looked up. */
export const record = c => { const r = { id: c.id, name: c.name, city: c.city, region: c.region || '', country: c.country || '', cc: c.cc || '', lat: c.lat, lng: c.lng, tz: c.tz || '' };
  if (c.station !== undefined) r.station = c.station && { name: String(c.station.name || '').slice(0, 60), lat: +c.station.lat, lng: +c.station.lng }; return r; };

/** Make a chart from a picked city. Picking Pune itself opens Pune Paradise. */
export function chartFor(city) {
  if (city.cc === 'IN' && /^pune$/i.test(city.name) && Math.hypot(city.lat - PUNE.lat, city.lng - PUNE.lng) < 0.3) return { ...PUNE };
  const slug = city.name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || `${city.lat.toFixed(2)},${city.lng.toFixed(2)}`;
  return { id: `${(city.cc || 'xx').toLowerCase()}-${slug}`, name: `${city.name} Waters`, city: city.name,
    region: city.region || '', country: city.country || '', cc: city.cc || '', lat: +city.lat.toFixed(5), lng: +city.lng.toFixed(5), tz: city.tz || '' };
}

/** Save a chart as the active one (and remember it as visited). Reload to sail it. */
export function setChart(c) {
  const rec = record(c);
  try { if (!read(HOME)) localStorage.setItem(HOME, JSON.stringify(rec)); localStorage.setItem(KEY, JSON.stringify(rec)); const seen = read(SEEN) || {}; seen[rec.id] = { ...rec, t: Date.now() }; localStorage.setItem(SEEN, JSON.stringify(seen)); } catch { /* storage blocked */ }
  return rec;
}
export const visitedCharts = () => Object.values(read(SEEN) || {});


/** Your home city: the first one you sailed (Pune Paradise for players from before cities). */
export const homeChart = () => { const h = read(HOME); if (validChart(h)) return h; const seen = read(SEEN) || {};
  return seen.pune ? { ...PUNE, ...seen.pune } : Object.values(seen).sort((a, b) => a.t - b.t)[0] || null; };
