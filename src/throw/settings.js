// Throw settings (port of the Throw part of MySpace's AccountScreen): location (edit) and who can see it, paper & plane
// colour and map colour (Auto / Day / Night), the map background, and weather (automatic or a chosen condition,
// reduced flashing). Saved to user_settings / throw_profiles, the same as MySpace, so both apps share them.
import { h, icon } from './ui.js';
import { sb } from './data.js';
import { isDaytimeNow } from './solarTime.js';

const I = { pin: 'M12 22s7-7.4 7-12.5A7 7 0 0 0 5 9.5C5 14.6 12 22 12 22z M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z', eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42', bolt: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  auto: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 3v18', moon: 'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z', chev: 'M9 6l6 6-6 6' };
export const WEATHER = [['clear', 'Clear', I.sun], ['sunny', 'Sunny', 'M17 18a5 5 0 0 0-10 0 M12 2v7 M4.22 10.22l1.42 1.42 M1 18h2 M21 18h2 M18.36 11.64l1.42-1.42 M23 22H1 M16 6l-4-4-4 4'],
  ['cloudy', 'Cloudy', 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'], ['rain', 'Rain', 'M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25 M8 19v1 M8 14v1 M12 21v1 M12 16v1 M16 19v1 M16 14v1'],
  ['thunderstorm', 'Storm', 'M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9 M13 11l-4 6h6l-4 6'], ['lightning', 'Lightning', I.bolt],
  ['wind', 'Wind', 'M9.59 4.59A2 2 0 1 1 11 8H2 M12.59 19.41A2 2 0 1 0 14 16H2 M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2'], ['snow', 'Snow', 'M12 2v20 M4.93 4.93l14.14 14.14 M2 12h20 M4.93 19.07L19.07 4.93']];
const VIS = [['friends', 'FRIENDS'], ['all', 'EVERYONE'], ['ghost', 'NOBODY']];

/** Your Throw display settings (user_settings), with day/night worked out for 'auto'. */
export async function loadPrefs(myId) {
  const p = { mode: 'auto', mapMode: 'auto', showMap: true, weatherMode: 'automatic', weatherCondition: 'clear', weatherIntensity: 'medium', reducedFlashing: false };
  try { const { data } = await sb().from('user_settings').select('throw_color_mode, throw_map_color_mode, throw_map_show_background, throw_weather_mode, throw_weather_manual_condition, throw_weather_manual_intensity, throw_weather_reduced_flashing').eq('user_id', myId).maybeSingle();
    if (data) Object.assign(p, { mode: data.throw_color_mode || 'auto', mapMode: data.throw_map_color_mode || 'auto', showMap: data.throw_map_show_background !== false,
      weatherMode: data.throw_weather_mode || 'automatic', weatherCondition: data.throw_weather_manual_condition || 'clear', weatherIntensity: data.throw_weather_manual_intensity || 'medium', reducedFlashing: !!data.throw_weather_reduced_flashing }); } catch { /* defaults */ }
  return resolveDay(p);
}
export function resolveDay(p) { const day = isDaytimeNow(); p.isDay = p.mode === 'day' ? true : p.mode === 'night' ? false : day; p.mapIsDay = p.mapMode === 'day' ? true : p.mapMode === 'night' ? false : day; return p; }
const save = (myId, patch) => sb().from('user_settings').upsert({ user_id: myId, ...patch }, { onConflict: 'user_id' }).then(({ error }) => { if (error) console.warn('[Throw] save settings failed:', error.message); });

export function throwSettings(store, prefs, { onBack, onEditLocation }) {
  const root = h('div.t-screen.t-set');
  const toggle = on => h('span.t-toggle' + (on ? '.on' : ''), h('span'));
  const rowBtn = ({ label, sub, ico, chip, value, on, onClick }) => h('button.t-set-row', { type: 'button', on: { click: onClick } },
    h('span.t-set-chip', { style: { background: chip } }, icon(ico, { size: 18, stroke: 2.2, color: '#111' })),
    h('span.t-set-text', h('b', label), h('small', sub)), on !== undefined ? toggle(on) : h('span.t-set-value', value, icon(I.chev, { size: 14, stroke: 2.4, color: '#111' })));
  const seg = (value, set) => h('div.t-seg', [['auto', 'Auto', I.auto], ['day', 'Day', I.sun], ['night', 'Night', I.moon]].map(([m, label, d]) =>
    h('button.t-seg-btn.' + m + (value === m ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(value === m), on: { click: () => { if (value !== m) set(m); } } }, icon(d, { size: 15, stroke: 2.2 }), label)));
  function render() {
    const S = store.state, vi = Math.max(0, VIS.findIndex(v => v[0] === S.locationVisibility)), auto = prefs.weatherMode === 'automatic';
    root.replaceChildren(
      h('button.t-back', { type: 'button', on: { click: onBack } }, '‹ Back'),
      h('div.t-set-scroll',
        h('div.t-set-head', h('span', 'Throw settings'), h('span.t-set-tag', 'THROW')),
        h('div.t-mono-label.t-set-label', 'LOCATION'),
        h('div.t-set-card', rowBtn({ label: S.myLocation ? `${S.myLocation.city}, ${S.myLocation.country}` : 'Set your location', sub: 'Where your letters are thrown from', ico: I.pin, chip: '#C3EA4F', value: 'EDIT', onClick: onEditLocation }),
          rowBtn({ label: 'Who can see my location', sub: 'Controls your pin on the Friends Map', ico: I.eye, chip: '#9EB3FF', value: VIS[vi][1], onClick: () => { store.setLocationVisibility(VIS[(vi + 1) % VIS.length][0]); render(); } })),
        h('div.t-mono-label.t-set-label', 'APPEARANCE'),
        h('div.t-set-card.pad',
          h('div.t-set-group', h('b', 'Paper & plane color'), h('small', "For the letter's paper and plane only"), seg(prefs.mode, m => { prefs.mode = m; resolveDay(prefs); save(store.myId, { throw_color_mode: m }); render(); })),
          h('div.t-set-group', h('b', 'Map color'), h('small', "For the map's basemap and recipient carousel only"), seg(prefs.mapMode, m => { prefs.mapMode = m; resolveDay(prefs); save(store.myId, { throw_map_color_mode: m }); render(); })),
          h('button.t-set-switch', { type: 'button', role: 'switch', 'aria-checked': String(prefs.showMap), on: { click: () => { prefs.showMap = !prefs.showMap; save(store.myId, { throw_map_show_background: prefs.showMap }); render(); } } },
            h('span.t-set-text', h('b', 'Show map background'), h('small', 'Uses your live location — costs more battery and data')), toggle(prefs.showMap))),
        h('div.t-mono-label.t-set-label', 'WEATHER'),
        h('div.t-set-card', rowBtn({ label: 'Automatic weather', sub: 'Based on the real weather at your Throw location', ico: I.sun, chip: '#FFD23F', on: auto, onClick: () => { prefs.weatherMode = auto ? 'manual' : 'automatic'; save(store.myId, { throw_weather_mode: prefs.weatherMode }); render(); } }),
          rowBtn({ label: 'Reduce flashing', sub: 'Softer, dimmer lightning instead of a bright flash', ico: I.bolt, chip: '#FFB4C8', on: prefs.reducedFlashing, onClick: () => { prefs.reducedFlashing = !prefs.reducedFlashing; save(store.myId, { throw_weather_reduced_flashing: prefs.reducedFlashing }); render(); } })),
        !auto ? h('div.t-wx-grid', WEATHER.map(([k, label, d]) => h('button.t-wx' + (prefs.weatherCondition === k ? '.on' : ''), { type: 'button', role: 'radio', 'aria-checked': String(prefs.weatherCondition === k),
          on: { click: () => { prefs.weatherCondition = k; save(store.myId, { throw_weather_manual_condition: k }); render(); } } }, icon(d, { size: 22, stroke: 2.2 }), h('span', label)))) : null));
  }
  render();
  return root;
}
