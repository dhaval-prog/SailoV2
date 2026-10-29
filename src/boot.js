// Start-up: decide which city (chart) to sail before the scene loads, because the whole scene
// is measured from that city's centre.
//   1. a chart saved on this device -> resume it
//   2. played before charts existed (a saved position, always Pune) -> Pune Paradise
//   3. a position saved in Supabase for this device (guests) -> resume that chart
//   4. a new player -> the city picker (use my location, or country -> state -> city)
// Before all that, the captain signs in (or sails as a guest): signin.js, shown only when needed.
import './styles.css';
import { savedChart, setChart, validChart, PUNE } from './chart-store.js';
import { rpc, deviceId } from './supabase.js';

async function chooseChart() {
  if (savedChart()) return;
  let legacy = false; try { legacy = !!localStorage.getItem('sailo:pos'); } catch { /* storage blocked */ }
  if (legacy) { setChart(PUNE); return; }
  if (!cloud.isAccount()) try { const rows = await rpc('get_boat_position_v2', { p_device: deviceId() }, { timeout: 2500 }); const r = rows && rows[0]; // (a device's save; an account's comes with its progress)
    if (r) { setChart(validChart(r.chart) ? r.chart : PUNE); return; } } catch { /* offline: ask */ }
  const { openPicker } = await import('./picker.js');
  window.__sailoChart = setChart(await openPicker({ first: true })); // (also kept in memory in case storage is blocked)
}

await (await import('./signin.js')).ensureSignedIn();
// a signed-in captain's progress follows their account: bring this device up to date first
const cloud = await import('./cloud.js');
await cloud.syncOnStart();
await chooseChart();
// a new city's station goes to a real harbour: look it up once and keep it with the chart
{ const c = savedChart() || window.__sailoChart;
  if (c && c.station === undefined) { const { findHarbour } = await import('./harbour.js'); const st = await findHarbour(c); if (st !== undefined) window.__sailoChart = setChart({ ...c, station: st }); } }
await import('./main.js');
cloud.startAutoSave();
