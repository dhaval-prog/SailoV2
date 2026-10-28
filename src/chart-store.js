// Saved charts (city oceans) on this device. No active chart here: boot.js uses this before the
// scene loads; chart.js fixes the active chart for the session.

const KEY = 'sailo:chart', SEEN = 'sailo:charts';

// Pune Paradise: the original chart; its centre and size come from the Pune localities (world.js)
export const PUNE = { id: 'pune', name: 'Pune Paradise', city: 'Pune', region: 'Maharashtra', country: 'India', cc: 'IN', lat: 18.5204, lng: 73.8567, tz: 'Asia/Kolkata' };

export const validChart = c => c && typeof c.id === 'string' && Number.isFinite(c.lat) && Number.isFinite(c.lng) && Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
const read = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

/** The chart saved on this device, or null on a first visit. */
export const savedChart = () => { const c = read(KEY); return validChart(c) ? (c.id === 'pune' ? { ...PUNE, ...c } : c) : null; };

/** Make a chart from a picked city. Picking Pune itself opens Pune Paradise. */
export function chartFor(city) {
  if (city.cc === 'IN' && /^pune$/i.test(city.name) && Math.hypot(city.lat - PUNE.lat, city.lng - PUNE.lng) < 0.3) return { ...PUNE };
  return { id: `${(city.cc || 'xx').toLowerCase()}-${city.gid || `${city.lat.toFixed(3)},${city.lng.toFixed(3)}`}`, name: `${city.name} Waters`, city: city.name,
    region: city.region || '', country: city.country || '', cc: city.cc || '', lat: +city.lat.toFixed(5), lng: +city.lng.toFixed(5), tz: city.tz || '' };
}

/** Save a chart as the active one (and remember it as visited). Reload to sail it. */
export function setChart(c) {
  const rec = { id: c.id, name: c.name, city: c.city, region: c.region || '', country: c.country || '', cc: c.cc || '', lat: c.lat, lng: c.lng, tz: c.tz || '' };
  try { localStorage.setItem(KEY, JSON.stringify(rec)); const seen = read(SEEN) || {}; seen[rec.id] = { ...rec, t: Date.now() }; localStorage.setItem(SEEN, JSON.stringify(seen)); } catch { /* storage blocked */ }
  return rec;
}
export const visitedCharts = () => Object.values(read(SEEN) || {});

