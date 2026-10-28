// Remembers where the boat was so the next visit starts there, in the right city.
// Positions are stored as latitude/longitude plus the chart (the city ocean) they are in;
// the scene works in metres around the active chart's centre (world.js) and converts.
// Each browser gets a random device id (kept in localStorage); the position is saved to
// Supabase through RPC functions keyed by that id, and also kept locally so a reload works
// offline. Whichever copy is newer wins. Older saves (x/z only) were all in Pune Paradise.
import { CHART, chartRecord } from './chart.js';
import { project, unproject } from './world.js';
import { rpc, deviceId } from './supabase.js';

const LOCAL_KEY = 'sailo:pos'; // the last save anywhere; each chart also keeps its own (sailo:pos@<chart>)
const chartKey = id => `${LOCAL_KEY}@${id}`;

const num = Number.isFinite;
// normalise a saved record to { chart, lat, lng, heading, t } (legacy x/z saves were Pune Paradise, whose
// x/z have been metres from today's Pune centre since the Pune geography update)
const norm = (r, t) => {
  if (!r || !num(r.heading)) return null;
  if (num(r.lat) && num(r.lng) && r.chart?.id) return { chart: r.chart, lat: r.lat, lng: r.lng, heading: r.heading, t };
  if (num(r.x) && num(r.z) && CHART.id === 'pune') { const [lat, lng] = unproject(r.x, r.z); return { chart: { id: 'pune' }, lat, lng, heading: r.heading, t }; }
  return null;
};
/** In scene metres for this chart, or null when the save belongs to another chart. */
const here = p => { if (!p || p.chart?.id !== CHART.id) return null; const [x, z] = project(p.lat, p.lng); return { x, z, heading: p.heading, t: p.t }; };

const readLocal = (key = LOCAL_KEY) => { try { const r = JSON.parse(localStorage.getItem(key)); return norm(r, r?.t || 0); } catch { return null; } };

/** The locally saved position in this chart ({ x, z, heading, t }), available instantly. */
export const localPosition = () => here(readLocal(chartKey(CHART.id))) || here(readLocal());

/** The last save anywhere (local or Supabase, newest wins): { chart, lat, lng, heading, t } or null. Used at start-up to resume the right city. */
export async function lastSave(timeout = 2500) {
  const local = readLocal();
  let remote = null;
  try {
    const rows = await rpc('get_boat_position_v2', { p_device: deviceId() }, { timeout });
    const r = rows && rows[0]; if (r) remote = norm(r, Date.parse(r.updated_at) || 0);
  } catch { /* offline or blocked: fall back to the local copy */ }
  if (local && remote) return (local.t || 0) >= remote.t ? local : remote;
  return remote || local;
}

/** Last saved position in this chart ({ x, z, heading, t }) or null. */
export async function loadPosition() { return here(await lastSave()) || localPosition(); }

/** Save the position locally and to Supabase. Use keepalive when the page is closing. */
export function savePosition({ x, z, heading }, { keepalive = false } = {}) {
  const [lat, lng] = unproject(x, z), chart = chartRecord(), p = { chart, lat, lng, heading, t: Date.now() };
  try { const j = JSON.stringify(p); localStorage.setItem(LOCAL_KEY, j); localStorage.setItem(chartKey(chart.id), j); } catch { /* storage blocked */ }
  return rpc('save_boat_position_v2', { p_device: deviceId(), p_chart: chart, p_lat: lat, p_lng: lng, p_x: x, p_z: z, p_heading: heading }, { keepalive }).catch(() => {});
}
