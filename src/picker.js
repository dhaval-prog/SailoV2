// "Where do you want to sail?": the city picker. New players see it before the scene loads
// (boot.js); anyone can open it later from the map to change city. "Use my location" asks the
// browser for your position and finds your city; or choose country -> state -> city.
// Resolves with the chosen chart, or null when cancelled.

import { countries, searchCountries, searchStates, searchCities, cityAt, myLocation } from './geocode.js';
import { chartFor, PUNE, visitedCharts } from './chart-store.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const debounce = (f, ms = 280) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };

export function openPicker({ first = false, current = null } = {}) {
  return new Promise(resolve => {
    const el = document.createElement('div'); el.className = 'pk'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'pk-title');
    const recent = visitedCharts().filter(c => c.id !== current).sort((a, b) => b.t - a.t).slice(0, 4);
    el.innerHTML = `<div class="pk-card">
      ${first ? '' : '<button class="pk-x" id="pk-x" type="button" aria-label="Close">×</button>'}
      <div class="pk-ico" aria-hidden="true"><svg viewBox="0 0 48 48"><circle cx="24" cy="24" r="17"/><path d="M7 24h34M24 7c5 5 7 11 7 17s-2 12-7 17c-5-5-7-11-7-17s2-12 7-17Z"/></svg></div>
      <h2 id="pk-title">${first ? 'Where do you want to sail?' : 'Sail another city'}</h2>
      <p class="pk-sub">Your city becomes a 400 sq mi ocean, with its real neighbourhoods floating on the water.</p>
      <button class="pk-loc" id="pk-loc" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z"/><circle cx="12" cy="9.8" r="2.4"/></svg><span>Use my location</span></button>
      <p class="pk-msg" id="pk-msg" role="status"></p>
      <div class="pk-or"><span>or choose</span></div>
      <label class="pk-f"><span>Country</span><input id="pk-country" type="search" placeholder="Search countries" autocomplete="off" spellcheck="false"></label>
      <div class="pk-list" id="pk-country-l"></div>
      <label class="pk-f"><span>State / province <small>(optional)</small></span><input id="pk-state" type="search" placeholder="Choose a country first" autocomplete="off" spellcheck="false" disabled></label>
      <div class="pk-list" id="pk-state-l"></div>
      <label class="pk-f"><span>City</span><input id="pk-city" type="search" placeholder="Choose a country first" autocomplete="off" spellcheck="false" disabled></label>
      <div class="pk-list" id="pk-city-l"></div>
      <div class="pk-quick">${[{ ...PUNE, tag: 'The original' }, ...recent.filter(c => c.id !== 'pune').map(c => ({ ...c, tag: 'Sailed before' }))].filter(c => c.id !== current).map((c, i) => `<button type="button" class="pk-chip" data-q="${i}"><b>${esc(c.name)}</b><small>${esc(c.tag)}</small></button>`).join('')}</div>
      <div class="pk-go" id="pk-go" hidden><div><b id="pk-go-name"></b><small id="pk-go-sub"></small></div><button type="button" id="pk-sail">Set sail</button></div>
      <p class="pk-credit">Cities: <a href="https://www.geonames.org" target="_blank" rel="noopener">GeoNames</a> via Open-Meteo · © Mapbox</p>
    </div>`;
    document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
    const $ = id => el.querySelector('#' + id), quick = [{ ...PUNE }, ...recent.filter(c => c.id !== 'pune')].filter(c => c.id !== current);
    let country = null, state = '', chosen = null;
    const done = c => { el.classList.remove('open'); setTimeout(() => el.remove(), 250); removeEventListener('keydown', onKey); resolve(c); };
    const onKey = e => { if (e.key === 'Escape' && !first) done(null); };
    addEventListener('keydown', onKey);
    $('pk-x')?.addEventListener('click', () => done(null));
    const say = (t, bad) => { $('pk-msg').textContent = t; $('pk-msg').classList.toggle('bad', !!bad); };
    const pick = chart => { chosen = chart; $('pk-go').hidden = false; $('pk-go-name').textContent = chart.name; $('pk-go-sub').textContent = [chart.region, chart.country].filter(Boolean).join(', '); $('pk-sail').focus(); };
    el.querySelectorAll('[data-q]').forEach(b => b.addEventListener('click', () => pick(quick[+b.dataset.q])));
    $('pk-sail').addEventListener('click', () => chosen && done(chosen));
    // a suggestions list under a field
    const list = (id, items, label, onPick) => { const L = $(id); L.innerHTML = items.map((it, i) => `<button type="button" data-i="${i}">${label(it)}</button>`).join('');
      L.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { L.innerHTML = ''; onPick(items[+b.dataset.i]); })); };
    // country
    const ci = $('pk-country');
    const showCountries = () => list('pk-country-l', searchCountries(ci.value), c => esc(c.name), c => {
      country = c; ci.value = c.name; state = ''; ['pk-state', 'pk-city'].forEach(id => { $(id).disabled = false; $(id).value = ''; });
      $('pk-state').placeholder = `e.g. a state in ${c.name}`; $('pk-city').placeholder = `Search cities in ${c.name}`; $('pk-city').focus(); });
    ci.addEventListener('input', () => { country = null; ['pk-state', 'pk-city'].forEach(id => { $(id).disabled = true; $(id).placeholder = 'Choose a country first'; }); showCountries(); });
    ci.addEventListener('focus', showCountries);
    // state (optional): narrows the city search
    const si = $('pk-state');
    si.addEventListener('input', debounce(async () => { const q = si.value; state = ''; if (!country) return; const r = await searchStates(country.cc, q); if (si.value !== q) return;
      list('pk-state-l', r, s => esc(s), s => { state = s; si.value = s; $('pk-city').focus(); }); }));
    // city
    const cy = $('pk-city');
    cy.addEventListener('input', debounce(async () => { const q = cy.value; if (!country) return; const r = await searchCities(country.cc, q, state || si.value.trim()); if (cy.value !== q) return;
      if (!r.length && q.trim().length >= 2) { $('pk-city-l').innerHTML = '<div class="pk-none">No cities found. Check the spelling, or try a nearby city.</div>'; return; }
      list('pk-city-l', r, c => `<b>${esc(c.name)}</b><small>${esc([c.region, c.country].filter(Boolean).join(', '))}</small>`, c => { cy.value = c.name; pick(chartFor(c)); }); }));
    // use my location
    $('pk-loc').addEventListener('click', async () => {
      say('Finding you…'); $('pk-loc').disabled = true;
      try { const p = await myLocation(); say('Finding your city…'); const c = await cityAt(p.lat, p.lng);
        if (c) { say(`You're near ${c.name}.`); pick(chartFor(c)); } else say('Couldn’t name your city. Please choose it below.', true); }
      catch (e) { say(e?.code === 1 ? 'Location permission was not given. Please choose your city below.' : 'Couldn’t get your location. Please choose your city below.', true); ci.focus(); }
      finally { $('pk-loc').disabled = false; }
    });
    countries(); // warm the list
    if (first) $('pk-loc').focus(); else ci.focus();
  });
}
