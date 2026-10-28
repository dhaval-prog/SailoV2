// Start-up: decide which city (chart) to sail before the scene loads, because the whole scene
// is measured from that city's centre.
//   1. a chart saved on this device -> resume it
//   2. played before charts existed (a saved position, always Pune) -> Pune Paradise
//   3. a position saved in Supabase for this device -> resume that chart
//   4. a new player -> the city picker (use my location, or country -> state -> city)
import './styles.css';
import { savedChart, setChart, validChart, PUNE } from './chart-store.js';
import { rpc, deviceId } from './supabase.js';

async function chooseChart() {
  if (savedChart()) return;
  let legacy = false; try { legacy = !!localStorage.getItem('sailo:pos'); } catch { /* storage blocked */ }
  if (legacy) { setChart(PUNE); return; }
  try { const rows = await rpc('get_boat_position_v2', { p_device: deviceId() }, { timeout: 2500 }); const r = rows && rows[0];
    if (r) { setChart(validChart(r.chart) ? r.chart : PUNE); return; } } catch { /* offline: ask */ }
  const { openPicker } = await import('./picker.js');
  window.__sailoChart = setChart(await openPicker({ first: true })); // (also kept in memory in case storage is blocked)
}

await chooseChart();
await import('./main.js');
