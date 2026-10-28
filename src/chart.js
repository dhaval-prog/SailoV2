// Charts: each city becomes its own ocean ("Pune Paradise", "Mumbai Waters", "Tokyo Waters").
// The active chart is chosen before the scene starts (see boot.js) and everything that turns
// latitude/longitude into scene metres centres on it (world.js). Keeping every scene within
// ~16 km of its own centre is what keeps three.js precise anywhere on Earth: the scene is
// re-centred per chart instead of being placed in one huge global frame.
import { PUNE, savedChart, validChart, record } from './chart-store.js';
export { PUNE, savedChart, setChart, chartFor, visitedCharts, record } from './chart-store.js';

/** The chart this session runs in (Pune until one is chosen). */
export const CHART = savedChart() || (validChart(globalThis.__sailoChart) ? globalThis.__sailoChart : { ...PUNE });
export const isPune = CHART.id === 'pune';

/** A compact copy for saving with the boat position (also restores the chart on another device). */
export const chartRecord = (c = CHART) => record(c);

/** Remember the chart's time zone once the weather service reports it. */
export function rememberTz(tz) {
  if (!tz || CHART.tz === tz) return; CHART.tz = tz;
  try { const c = JSON.parse(localStorage.getItem('sailo:chart')); if (validChart(c) && c.id === CHART.id) { c.tz = tz; localStorage.setItem('sailo:chart', JSON.stringify(c)); } } catch { /* storage blocked */ }
}
