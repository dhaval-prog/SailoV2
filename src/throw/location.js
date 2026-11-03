// "Let Throw know where you are" (port of MySpace's ThrowLocationSetupScreen): use the device's location (the real GPS
// fix is stored; the city label is the nearest curated city), or search a city. Also reached later to change it.
import { h } from './ui.js';
import { searchThrowCities, nearestThrowCity } from './cities.js';

export function locationSetup(store, { onDone, onBack, mode = 'setup' }) {
  const root = h('div.t-screen.t-loc', h('div.t-glass-backdrop'));
  let manual = false, requesting = false, query = '', error = null;
  const choose = async city => { const { error: e } = await store.setMyLocation(city); if (e) { error = e; render(); } else onDone(); };
  const useDevice = () => {
    error = null; requesting = true; render();
    if (!navigator.geolocation) { requesting = false; manual = true; render(); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      const exact = { latitude: pos.coords.latitude, longitude: pos.coords.longitude }, label = nearestThrowCity(exact.latitude, exact.longitude);
      await choose({ city: label.city, country: label.country, ...exact }); requesting = false;
    }, () => { requesting = false; manual = true; render(); }, { enableHighAccuracy: true, timeout: 15000 });
  };
  function render() {
    const kids = [h('div.t-glass-backdrop')];
    if (onBack) kids.push(h('button.t-back', { type: 'button', on: { click: onBack } }, 'Cancel'));
    if (!manual) kids.push(h('div.t-loc-center',
      h('div.t-loc-title', mode === 'edit' ? 'Update your location' : 'Let Throw know where you are'),
      h('div.t-loc-body', mode === 'edit' ? "Change where your letters travel from — use your phone's current location, or pick a different city." : 'Your location helps your letters travel from where you are to where your friends are.'),
      error ? h('div.t-loc-error', error) : null,
      h('button.t-loc-primary', { type: 'button', disabled: requesting, on: { click: useDevice } }, requesting ? h('span.t-spin') : 'Allow Location'),
      h('button.t-loc-secondary', { type: 'button', on: { click: () => { manual = true; render(); } } }, mode === 'edit' ? 'Pick a different city instead' : 'Not Now — pick my city')));
    else {
      const input = h('input.t-loc-search', { type: 'search', placeholder: 'Search for your city', value: query, autocomplete: 'off' });
      const list = h('div.t-loc-list');
      const fill = () => { const res = searchThrowCities(query, 40);
        list.replaceChildren(...(res.length ? res.map(c => h('button.t-loc-row', { type: 'button', on: { click: () => choose(c) } }, h('span.t-loc-city', c.city), h('span.t-loc-country', c.country)))
          : [h('div.t-loc-empty', `No cities match "${query}"`)])); };
      input.addEventListener('input', () => { query = input.value; fill(); });
      kids.push(h('div.t-loc-manual', h('div.t-loc-title', 'Where are you?'), h('div.t-loc-searchwrap', input), error ? h('div.t-loc-error', error) : null, list));
      fill(); setTimeout(() => input.focus(), 50);
    }
    root.replaceChildren(...kids);
  }
  render();
  return root;
}
