// HUD wiring: account/settings panel (top right), camera dock (bottom right)
// and the per-frame readouts (compass, speed, stats). The scene hands in
// callbacks; this module only touches the DOM.

import { WORLD, formatPosition } from './world.js';
import { PLACE, clock, fetchWeather, isNight } from './live.js';
import { STATION, STATIONS, S as ECON, FISH, REGION, localOdds, fishWhere, BOAT_SPECS, SPEED_UP, burnFor, boatStatus } from './station.js';
import { routeLength } from './route.js';
import { currentSession, signOut } from './auth.js';
import { beforeSignOut, lastSaved } from './cloud.js';
import { regionList, placeList, poiList, shackList, SHACK_NAME, ensure, zoneAt, onChange, groupLabel } from './geo.js';
import { nameIslands } from './island-names.js';
import { CHART, setChart } from './chart.js';
import { createGarageFriends } from './garage-friends.js';
import { isTablet, isLefty, setLefty } from './tablet.js';

const RANKS = [[0, 'Deckhand'], [3, 'Bosun'], [8, 'First mate'], [15, 'Captain'], [30, 'Sea legend']];
const KEY = 'sailo:settings';

const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = s => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode */ } };

function ripple(el, e) {
  const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height);
  const s = document.createElement('span');
  s.className = 'rip';
  s.style.cssText = `width:${d}px;height:${d}px;left:${(e.clientX || r.left + r.width / 2) - r.left - d / 2}px;top:${(e.clientY || r.top + r.height / 2) - r.top - d / 2}px`;
  el.appendChild(s);
  setTimeout(() => s.remove(), 600);
}

export function initHud(api) {
  const $ = id => document.getElementById(id);
  const saved = load();
  const prefs = { name: saved.name || 'Captain', night: !!saved.night, sunset: !!saved.sunset && !saved.night, w: saved.w || 'clear', live: saved.live !== false };

  // ---- account panel ----
  const btn = $('acct-btn'), panel = $('acct-panel'), nameIn = $('acct-name');
  const setOpen = open => {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    if (open) panel.scrollTop = 0;
  };
  btn.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  // no close button: a tap anywhere outside the panel (or Escape) closes it
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  addEventListener('pointerdown', e => { if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false); });

  // account: who's signed in, and signing out (back to the sign-in page)
  currentSession().then(ses => { const who = $('acct-who'), out = $('acct-out');
    if (ses) { who.textContent = ses.user?.email ? `Signed in as ${ses.user.email}` : 'Signed in'; out.textContent = 'Sign out'; }
    out.addEventListener('click', async () => { out.disabled = true; out.textContent = 'Saving…'; await beforeSignOut(); await signOut(); location.reload(); }); });
  // progress is safe: "Saved ✓ · just now" after each cloud save (cloud.js)
  { const el = $('acct-saved'); let at = lastSaved();
    const ago = t => { const s2 = (Date.now() - Date.parse(t)) / 1000; return s2 < 60 ? 'just now' : s2 < 3600 ? `${Math.floor(s2 / 60)} min ago` : new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); };
    const paintSaved = () => { el.hidden = !at; if (at) el.textContent = `Saved ✓ · ${ago(at)}`; };
    addEventListener('sailo:saved', e => { at = e.detail?.at || at; paintSaved(); }); setInterval(paintSaved, 30000); paintSaved(); }
  // the city you're sailing, and changing it (the world map)
  $('acct-city').textContent = `Sailing ${WORLD.name}`;
  $('acct-city-btn').addEventListener('click', () => { setOpen(false); openWorld(); });
  nameIn.value = prefs.name;
  nameIn.addEventListener('input', () => { prefs.name = nameIn.value.trim() || 'Captain'; save(prefs); });
  nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('keyup', e => e.stopPropagation());

  const tod = $('tod');
  const paint = () => {
    const st = api.getState();
    const mode = st.night ? 'night' : prefs.sunset && !prefs.live ? 'sunset' : 'day'; tod.classList.toggle('night', mode === 'night'); tod.classList.toggle('sunset', mode === 'sunset'); document.body.classList.toggle('is-night', mode === 'night');
    tod.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-checked', String(b.dataset.t === mode)));
    document.querySelectorAll('.wx').forEach(b => b.setAttribute('aria-checked', String(b.dataset.w === st.w)));
    document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === st.view)); // (on phones they orbit the wheel, outside the dock)
    const top = st.view === 'top', was = document.body.classList.contains('view-top'); document.body.classList.toggle('view-top', top);
    // the course hint: shown for a few seconds each time the top view opens, then it fades away
    if (top && !was) { document.body.classList.add('hint-on'); clearTimeout(hintT); hintT = setTimeout(() => document.body.classList.remove('hint-on'), 5000); }
    if (!top) { clearTimeout(hintT); document.body.classList.remove('hint-on'); }
  };
  let hintT = 0;
  // picking a time of day or weather by hand switches live mode off
  // Day (midday), Sunset (the golden hour look) or Night; picking one turns live time off
  const manualDay = () => api.setDayTime?.(prefs.sunset ? { mins: 1095, set: 1110 } : null);
  tod.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { prefs.night = b.dataset.t === 'night'; prefs.sunset = b.dataset.t === 'sunset'; setLive(false); api.setNight(prefs.night); manualDay(); save(prefs); paint(); }));
  document.querySelectorAll('.wx').forEach(b => b.addEventListener('click', () => { prefs.w = b.dataset.w; setLive(false); api.setWeather(prefs.w); save(prefs); paint(); }));
  document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => api.exportModel(b.dataset.export)));

  // ---- camera dock ----
  const dock = $('dock');
  dock.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => ripple(b, e)));
  dock.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { api.setView(b.dataset.v); paint(); }));
  dock.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => api.zoomBy(b.dataset.z === 'in' ? 0.7 : 1.45)));
  // "⋯": the less-used controls (photo, zoom) live in a small tray beside it
  { const more = $('dk-more'), tray = $('dk-tray'); const setTray = open => { tray.hidden = !open; more.setAttribute('aria-expanded', open); more.classList.toggle('on', open); };
    more.addEventListener('click', e => { e.stopPropagation(); setTray(tray.hidden); });
    tray.querySelectorAll('.dk').forEach(b => b.addEventListener('click', () => setTray(false))); // view, map, photo close it; zoom keeps it open
    addEventListener('pointerdown', e => { if (!tray.hidden && !e.target.closest('.dk-moreg')) setTray(false); }, true);
    addEventListener('keydown', e => { if (e.key === 'Escape') setTray(false); }); }
  $('dk-compass').addEventListener('click', () => setMap(true));
  $('dk-shot').addEventListener('click', () => {
    const canvas = api.stage.shadowRoot.querySelector('canvas');
    const shutter = $('shutter');
    shutter.classList.remove('snap'); void shutter.offsetWidth; shutter.classList.add('snap');
    canvas.toBlob(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob), a = document.createElement('a');
      a.href = url; a.download = `sailo-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }, 'image/png');
  });

  // ---- live time & weather (Pune) ----
  const liveSw = $('live-sw'), clkTime = $('clk-time'), clkDate = $('clk-date'), clkWx = $('clk-wx'), clkIco = $('clk-ico'), clkWxt = $('clk-wxt');
  const WX_LABEL = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', storm: 'Storm', fog: 'Fog', snow: 'Snow' };
  let wx = null, lastClock = '';
  const applyLive = () => {
    if (!prefs.live) return;
    api.setNight(isNight(clock().mins, wx));
    api.setDayTime?.({ mins: clock().mins, set: wx?.sunset ?? 1110 }); // midday, afternoon, golden hour
    if (wx) api.setWeather(wx.preset);
    paint();
  };
  function setLive(on) {
    prefs.live = on; liveSw.setAttribute('aria-checked', String(on)); document.body.classList.toggle('live', on); save(prefs);
    if (on) applyLive();
  }
  liveSw.addEventListener('click', () => { setLive(!prefs.live); if (!prefs.live) { api.setNight(prefs.night); manualDay(); api.setWeather(prefs.w); paint(); } });
  // tablets: left-handed captains swap the wheel and the throttle (tablet.js)
  { const sw = $('lefty-sw'), show = () => sw.setAttribute('aria-checked', String(isLefty()));
    sw.addEventListener('click', () => { setLefty(!isLefty()); show(); }); addEventListener('sailo:controls', show); show(); }
  const escT = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const tick = () => {
    const c = clock(), key = c.time + c.date;
    if (key !== lastClock) { const i = c.time.indexOf(':'); clkTime.innerHTML = i < 0 ? escT(c.time) : `${escT(c.time.slice(0, i))}<i class="blink">:</i>${escT(c.time.slice(i + 1))}`; clkDate.textContent = `${c.date} · ${PLACE.name}`; lastClock = key; applyLive(); paintWxIcon(); }
  };
  // weather icon: the settings icon by day; at night a moon replaces the sun (clear) or peeks from behind the cloud (cloudy)
  // white weather glyphs for the scene, 20×14 like the asset pack's cloud (weather-cloudy.svg)
  const CLOUD = '<circle cx="7" cy="8" r="5"/><circle cx="12" cy="6" r="6"/><rect x="3" y="8" width="15" height="6" rx="3"/>';
  const SMALL_CLOUD = '<g transform="translate(1.5 -1.5) scale(.85)">' + CLOUD + '</g>';
  const WX_ICONS = {
    clear: '<circle cx="10" cy="7" r="3.6"/><g stroke="#fff" stroke-width="1.6" stroke-linecap="round"><path d="M10 .8v1.4M10 11.8v1.4M3.8 7H2.4M17.6 7h-1.4M5.6 2.6l1 1M14.4 2.6l-1 1M5.6 11.4l1-1M14.4 11.4l-1-1"/></g>',
    cloudy: CLOUD,
    rain: SMALL_CLOUD + '<g stroke="#fff" stroke-width="1.5" stroke-linecap="round"><path d="M6 12.2l-.8 1.6M10 12.2l-.8 1.6M14 12.2l-.8 1.6"/></g>',
    storm: SMALL_CLOUD + '<path d="M10.5 9.5 8 13.6h2.2l-.9 2.4 3.2-4.2h-2.1l1.1-2.3z"/>',
    fog: '<g stroke="#fff" stroke-width="1.7" stroke-linecap="round"><path d="M2 3.5h12M5 7h13M2 10.5h11"/></g>',
    snow: SMALL_CLOUD + '<circle cx="6" cy="13" r="1"/><circle cx="10" cy="13.4" r="1"/><circle cx="14" cy="13" r="1"/>',
  };
  const MOON = '<path d="M12.5 1.5a6 6 0 1 0 5.5 8.2 4.8 4.8 0 0 1-5.5-8.2Z"/>';
  const NIGHT_ICONS = { clear: MOON, cloudy: '<g opacity=".85">' + MOON + '</g><g transform="translate(-2 1.5) scale(.82)">' + CLOUD + '</g>' };
  let iconKey = '';
  const paintWxIcon = () => {
    if (!wx) return;
    const night = isNight(clock().mins, wx), key = wx.preset + night; if (key === iconKey) return; iconKey = key;
    clkIco.innerHTML = `<svg viewBox="0 0 20 14" fill="#fff">${(night && NIGHT_ICONS[wx.preset]) || WX_ICONS[wx.preset] || CLOUD}</svg>`;
  };
  const refreshWx = async () => {
    const w = await fetchWeather(); if (!w) return;
    wx = w; clkWx.hidden = false; paintWxIcon();
    clkWxt.innerHTML = `${w.tempC != null ? `<span class="wx-t">${escT(w.tempC)}°</span><span class="wx-l">C </span>` : ''}<span class="wx-l">${WX_LABEL[w.preset]}</span>`; clkWxt.title = `${w.tempC != null ? w.tempC + '°C ' : ''}${WX_LABEL[w.preset]}`;
    applyLive();
  };

  // apply saved preferences, then let live mode take over
  api.setNight(prefs.night); manualDay();
  api.setWeather(prefs.w);
  setLive(prefs.live);
  paint();
  tick(); setInterval(tick, 10000);
  refreshWx(); setInterval(refreshWx, 10 * 60 * 1000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); refreshWx(); } });

  // ---- map (compass button): the whole ocean, the boat, and click-to-pin a course ----
  const mapEl = $('map'), mapSvg = $('map-svg');
  // the active city's names everywhere the page mentions it
  $('map-title').innerHTML = String(WORLD.name).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/(\S+)$/, '<em>$1</em>'); $('map-sub').textContent = `${WORLD.areaSqMi} sq mi of open ocean · ${WORLD.city}'s real localities`;
  document.querySelector('#loc .loc-text b').textContent = WORLD.name; document.querySelector('#welcome b').textContent = WORLD.name;
  if ($('welcome-sub')) $('welcome-sub').textContent = `${WORLD.areaSqMi} square miles of ${WORLD.city}, turned into open ocean`;
  { const r = document.querySelector('.rank'); if (r?.lastChild?.nodeType === 3) r.lastChild.textContent = ` Lighthouse Tug · ${WORLD.name}`; }
  { const l = document.querySelector('.live-sub'); if (l) l.textContent = `Follows the real sky over ${WORLD.city}`; }
  document.title = `Sailo · ${WORLD.name}`;
  // change city: pick another and the page reloads into it (your spot in each city is remembered)
  // the world map: every city chart; fly to one (coins) to sail it. Your spot in each city is remembered.
  let worldOpen = false;
  const openWorld = async () => { if (worldOpen) return; worldOpen = true; setMap(false); const { openWorldMap } = await import('./worldmap.js');
    const wm = openWorldMap({ local: () => setMap(true), current: CHART, coins: () => api.coins(), settled: () => api.settled?.(), travel: (c, fare) => { if (!api.spend(fare, 'sea-plane')) return false; setChart(c); return true; } });
    const t = setInterval(() => { if (!document.querySelector('.wm')) { clearInterval(t); worldOpen = false; } }, 500); void wm; };
  $('map-change').addEventListener('click', openWorld);
  $('tb-world')?.addEventListener('click', openWorld);
  const H = WORLD.half, u = WORLD.side / 100; // u = 1% of the map
  const escM = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent = mapSvg) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  // the Sea Charts look: a teal lagoon with a white grid inside a dashed gold boundary, sand islands ringed by contour
  // lines, and markers drawn in screen pixels (they keep their size at any zoom: see placeMarks)
  { const d = el('defs', {}); const g = el('radialGradient', { id: 'map-sea', cx: '50%', cy: '48%', r: '70%' }, d);
    el('stop', { offset: '0', class: 'sc-sea1' }, g); el('stop', { offset: '1', class: 'sc-sea2' }, g); }
  const OUT = H * 2.2; // (the sea and its grid run past the chart's edge, so a screen of any shape is all sea)
  el('rect', { x: -OUT, y: -OUT, width: OUT * 2, height: OUT * 2, fill: 'url(#map-sea)' });
  { let d = ''; for (let m = WORLD.mile; m < OUT; m += WORLD.mile) d += `M${m} ${-OUT}V${OUT}M${-m} ${-OUT}V${OUT}M${-OUT} ${m}H${OUT}M${-OUT} ${-m}H${OUT}`;
    el('path', { d: d + `M0 ${-OUT}V${OUT}M${-OUT} 0H${OUT}`, class: 'map-grid', 'vector-effect': 'non-scaling-stroke' }); }
  el('rect', { x: -H + u * 1.6, y: -H + u * 1.6, width: WORLD.side - u * 3.2, height: WORLD.side - u * 3.2, rx: u * 1.4, class: 'map-edge', 'vector-effect': 'non-scaling-stroke' });
  // islands: a seeded sand blob for each rock met so far (terrain.js), with a beach and three contour rings
  const isleG = el('g', { class: 'map-isles' }), contourG = el('g', { class: 'map-contours' }, isleG), sandG = el('g', { class: 'map-sand' }, isleG);
  const rnd = seed => () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const blobPts = seed => { const r = rnd(seed); return Array.from({ length: 16 }, (_, i) => { const a = i / 16 * Math.PI * 2, k = 0.72 + 0.4 * r(); return [Math.cos(a) * k, Math.sin(a) * k * 0.82]; }); };
  const blobPath = (pts, k) => { const p = pts.map(([x, y]) => [x * k, y * k]), n = p.length, f = v => v.toFixed(3); let d = `M${f(p[0][0])} ${f(p[0][1])}`; // (closed Catmull-Rom, as Béziers)
    for (let i = 0; i < n; i++) { const a = p[(i - 1 + n) % n], b = p[i], c = p[(i + 1) % n], e = p[(i + 2) % n];
      d += `C${f(b[0] + (c[0] - a[0]) / 6)} ${f(b[1] + (c[1] - a[1]) / 6)} ${f(c[0] - (e[0] - b[0]) / 6)} ${f(c[1] - (e[1] - b[1]) / 6)} ${f(c[0])} ${f(c[1])}`; }
    return d + 'Z'; };
  const isles = []; let islesDrawn = 0;
  const addIsle = (x, z, r, seed, big) => { const pts = blobPts(seed), sz = el('g', {}, sandG), cg = el('g', {}, contourG);
    if (isles.length < 700 || big) [2.1, 1.7, 1.35].forEach((k, j) => el('path', { d: blobPath(pts, k), class: 'map-contour', style: `stroke-opacity:calc(var(--sc-cop) * ${0.5 + j * 0.25})`, 'vector-effect': 'non-scaling-stroke' }, cg));
    el('path', { d: blobPath(pts, 1.14), class: 'map-beach' }, sz); el('path', { d: blobPath(pts, 1), class: 'map-isle', 'vector-effect': 'non-scaling-stroke' }, sz);
    const it = { x, z, r, g: [sz, cg], big, minPx: big ? 30 : 3.5 }; isles.push(it); return it; };
  const paintRocks = () => { const all = api.rocks?.() || []; if (all.length === islesDrawn) return;
    for (let i = islesDrawn; i < all.length; i++) { const r = all[i]; addIsle(r.x, r.z, r.r, (Math.round(r.x) * 73856093) ^ (Math.round(r.z) * 19349663), false); }
    islesDrawn = all.length; placeIsles(); };
  // harbour at the centre: a dark diamond with a name pill
  const pill = (g, text, y) => { const w = text.length * 6.6 + 18; el('rect', { x: -w / 2, y, width: w, height: 22, rx: 11, class: 'sc-pill' }, g); el('text', { y: y + 15, class: 'sc-pill-t' }, g).textContent = text; };
  { const g = el('g', { class: 'map-mark', 'data-x': 0, 'data-y': 0 });
    el('rect', { x: -7, y: -7, width: 14, height: 14, rx: 3, transform: 'rotate(45)', class: 'map-harbour' }, g); pill(g, 'Harbour', 13); }
  // Paradise Stations: the home port on its own island (gold flag, name pill); a small flag in every major neighbourhood
  const stMarks = el('g', {}), drawn = new Set(), drawStation = st => { if (drawn.has(st.id)) return; drawn.add(st.id); const home = st.id === 'home';
    if (home) addIsle(st.x, st.z, 70, 1234567, true);
    const g = el('g', { class: 'map-station map-mark' + (home ? '' : ' map-station-n'), 'data-x': st.x, 'data-y': st.z }, stMarks);
    if (home) { el('circle', { r: 15, class: 'map-flag' }, g); el('path', { d: 'M-3 7V-7l8 3.5-8 3.5', class: 'map-flag-p' }, g); pill(g, 'Paradise Station', 22);
      if (st.at) el('text', { y: 58, class: 'map-label-sub' }, g).textContent = `at ${st.at}`; }
    else el('circle', { r: 5, class: 'map-flag' }, g); };
  STATIONS.forEach(drawStation); addEventListener('sailo:stations', () => { STATIONS.forEach(drawStation); placeIsles(); placeMarks(); });
  const scaleT = $('map-scale-t'), scaleB = $('map-scale-b');
  // hover preview, pinned course (marching dashes) and pin marker
  const ghost = el('circle', { r: 9, class: 'map-ghost', visibility: 'hidden' });
  const destLine = el('polyline', { class: 'map-route', 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' }); // (the route round the islands: route.js)
  const previewLine = el('polyline', { class: 'map-route map-route-pv', 'vector-effect': 'non-scaling-stroke', visibility: 'hidden' }); // (the way to a place you've tapped)
  const destM = el('g', { class: 'map-dest', visibility: 'hidden' });
  el('circle', { r: 14, class: 'map-dest-ring' }, destM);
  el('path', { d: 'M0 0C0 0-10-12-10-18A10 10 0 0 1 10-18C10-12 0 0 0 0Z', class: 'map-pin' }, destM);
  el('circle', { cy: -18, r: 3.5, class: 'map-pin-dot' }, destM);
  // the tapped place (a hollow pin) and the route's tag: distance · time · fuel, amber when the tank's tight, red when it won't make it
  const pvM = el('g', { class: 'map-dest map-dest-pv', visibility: 'hidden' }); el('circle', { r: 12, class: 'map-dest-ring' }, pvM);
  el('path', { d: 'M0 0C0 0-10-12-10-18A10 10 0 0 1 10-18C10-12 0 0 0 0Z', class: 'map-pin' }, pvM); el('circle', { cy: -18, r: 3.5, class: 'map-pin-dot' }, pvM);
  const routeTag = el('g', { class: 'map-route-tag', visibility: 'hidden' }), routeTagR = el('rect', { y: -11, height: 22, rx: 11 }, routeTag), routeTagT = el('text', { y: 4.5 }, routeTag);
  // a passenger trip's destination (passengers.js): a gold marker and a name pill
  const tripM = el('g', { class: 'map-trip', visibility: 'hidden' }); let tripFn = null, tripLabel = '';
  el('circle', { r: 13, class: 'map-trip-ring' }, tripM); el('circle', { r: 9, class: 'map-trip-dot' }, tripM);
  el('path', { d: 'M0-4.5a2 2 0 1 1 0 .01M-3.5 4.5c.4-2.6 1.6-3.6 3.5-3.6s3.1 1 3.5 3.6', class: 'map-trip-p' }, tripM);
  const tripPill = el('g', {}, tripM);
  const placeTrip = () => { const t = tripFn?.(); tripM.setAttribute('visibility', t ? 'visible' : 'hidden'); if (!t) return;
    if (t.name !== tripLabel) { tripLabel = t.name; tripPill.replaceChildren(); const w = t.name.length * 6.6 + 18; el('rect', { x: -w / 2, y: 17, width: w, height: 22, rx: 11, class: 'sc-pill' }, tripPill); el('text', { y: 32, class: 'sc-pill-t' }, tripPill).textContent = t.name; }
    tripM.setAttribute('transform', `translate(${t.x} ${t.z}) scale(${pxW})`); };
  // everyone else out on the water: local sailors and real captains online (setOthers)
  const othersG = el('g', { class: 'map-others' }), others = new Map(); let othersFn = null, othersPick = null, othersT = 0;
  // SOS calls (radio-help.js): pulsing red markers with expanding rings
  const sosG = el('g', { class: 'map-sos-g' }), sosM = new Map(); let sosFn = null, sosPick = null;
  const paintSOS = () => { const list = sosFn ? sosFn() : [], ids = new Set();
    list.forEach(s => { ids.add(s.id); let g = sosM.get(s.id);
      if (!g) { g = el('g', { class: `map-sos${s.mine ? ' mine' : ''}`, 'data-id': s.id }, sosG);
        [0, 1].forEach(i => { const c = el('circle', { r: 9, class: 'map-sos-wave', 'stroke-width': 2.2 }, g);
          el('animate', { attributeName: 'r', from: 9, to: 38, dur: '2s', begin: `${i}s`, repeatCount: 'indefinite' }, c); el('animate', { attributeName: 'opacity', from: 0.9, to: 0, dur: '2s', begin: `${i}s`, repeatCount: 'indefinite' }, c); });
        el('circle', { r: 9.5, class: 'map-sos-dot', 'stroke-width': 2.2 }, g);
        el('text', { y: 5, class: 'map-sos-x', 'font-size': 11 }, g).textContent = '!';
        el('text', { y: -18, class: 'map-sos-t', 'font-size': 13 }, g).textContent = s.mine ? 'Your SOS' : `SOS · ${s.name.split(' ')[0]}`;
        sosM.set(s.id, g); }
      g.setAttribute('transform', `translate(${s.x} ${s.z}) scale(${pxW})`); });
    sosM.forEach((g, id) => { if (!ids.has(id)) { g.remove(); sosM.delete(id); } }); };
  // you: a red disc with a white arrow (turned to the heading) and a pulse
  const boatM = el('g', { class: 'map-boat' });
  el('circle', { r: 15, class: 'map-pulse' }, boatM);
  const boatArrow = el('g', {}, boatM);
  el('circle', { r: 15, class: 'map-you' }, boatArrow); el('path', { d: 'M7 0L-6 6L-3 0L-6 -6Z', class: 'map-you-a' }, boatArrow);
  const mapPos = $('map-pos'), islesRow = $('map-isles'), coinsEl = $('map-coins');
  // ---- zoom and pan (wheel, pinch, drag, +/-). Zoom levels: 1 Pune region, 2 major neighbourhoods,
  //      3 smaller localities, 4 streets and landmarks. The view keeps the screen's shape: view.w across, view.w * ar down ----
  const V0 = WORLD.side + u * 8, VMIN = 1400, view = { cx: 0, cz: 0, w: V0 };
  const mapLevel = () => view.w > 20000 ? 1 : view.w > 9000 ? 2 : view.w > 3600 ? 3 : 4;
  let isleAsk = 0, geoDirty = true, boatXY = [0, 0], destXY = null, ar = 1, pxW = view.w / 600; // pxW: map units per screen pixel
  const svgSize = () => { const r = mapSvg.getBoundingClientRect(); return [r.width || 600, r.height || 600]; };
  // islands keep their real size, but never shrink below a few pixels across
  const placeIsles = () => { isles.forEach(it => { const k = Math.max(it.r, it.minPx * pxW); it.g.forEach(g => g.setAttribute('transform', `translate(${it.x} ${it.z}) scale(${k})`)); }); };
  const applyView = () => {
    const [sw, sh] = svgSize(); ar = sh / sw;
    view.w = Math.min(V0, Math.max(VMIN, view.w)); const vh = view.w * ar, limX = Math.max(0, H + u * 4 - view.w / 2), limZ = Math.max(0, H + u * 4 - vh / 2);
    view.cx = Math.max(-limX, Math.min(limX, view.cx)); view.cz = Math.max(-limZ, Math.min(limZ, view.cz));
    pxW = view.w / sw; const x0 = view.cx - view.w / 2, y0 = view.cz - vh / 2;
    mapSvg.setAttribute('viewBox', `${x0} ${y0} ${view.w} ${vh}`);
    mapSvg.querySelectorAll('.map-mark').forEach(n => n.setAttribute('transform', `translate(${n.dataset.x} ${n.dataset.y}) scale(${pxW})`));
    ghost.setAttribute('r', 9 * pxW);
    // scale bar: a round distance about a quarter of the width
    const steps = [100, 200, 500, WORLD.mile / 2, WORLD.mile, WORLD.mile * 2, WORLD.mile * 5], len = steps.reduce((a, b) => Math.abs(b - view.w * 0.25) < Math.abs(a - view.w * 0.25) ? b : a);
    scaleB.style.width = `${Math.round(len / pxW)}px`;
    scaleT.textContent = len < 500 ? `${len} m` : len === WORLD.mile / 2 ? '½ mi' : len === 500 ? '500 m' : `${+(len / WORLD.mile).toFixed(1)} mi`;
    $('map-zoom-l').textContent = ['', WORLD.city, 'Neighbourhoods', 'Localities', 'Streets & places'][mapLevel()];
    placeIsles(); placeMarks(); geoDirty = true;
    ensure(x0, y0, x0 + view.w, y0 + vh, mapLevel() >= 3); // (landmarks too when close in: the Fisher's Shacks are among them)
    clearTimeout(isleAsk); isleAsk = setTimeout(() => api.loadIslands?.(x0, y0, x0 + view.w, y0 + vh, view.cx, view.cz), 300);
  };
  const zoomAt = (f, wx = view.cx, wz = view.cz) => { const w0 = view.w; view.w = Math.min(V0, Math.max(VMIN, view.w * f)); const r = view.w / w0; view.cx = wx + (view.cx - wx) * r; view.cz = wz + (view.cz - wz) * r; applyView(); };
  // the boat, the pin and everyone else keep their on-screen size at any zoom
  const placeOthers = () => { const named = mapLevel() >= 2; others.forEach(o => { o.g.setAttribute('transform', `translate(${o.x} ${o.z}) scale(${pxW})`); o.t.setAttribute('visibility', named || o.live ? 'visible' : 'hidden'); }); };
  const paintOthers = () => {
    const list = othersFn ? othersFn() : [], ids = new Set();
    list.forEach(p => { ids.add(p.c.id); let o = others.get(p.c.id);
      if (!o) { const g = el('g', { class: `map-other${p.c.live ? ' live' : ''}`, 'data-id': p.c.id }, othersG);
        if (p.c.live) el('circle', { r: 12, class: 'map-other-ring' }, g);
        el('circle', { r: 7, class: 'map-sailor' }, g);
        const t = el('text', { y: -14, class: 'map-other-t', 'font-size': 12 }, g); t.textContent = p.c.name.split(' ')[0];
        o = { g, t, live: !!p.c.live }; others.set(p.c.id, o); }
      Object.assign(o, { c: p.c, x: p.x, z: p.z, yaw: p.yaw || 0, status: p.status }); });
    others.forEach((o, id) => { if (!ids.has(id)) { o.g.remove(); others.delete(id); } });
    placeOthers();
    const live = list.filter(p => p.c.live).length, cpu = list.length - live, row = $('map-others-row');
    if (row) { row.hidden = !list.length; $('map-others').textContent = [cpu ? `${cpu} local sailor${cpu === 1 ? '' : 's'} out` : '', live ? `${live} captain${live === 1 ? '' : 's'} online` : ''].filter(Boolean).join(' · '); }
  };
  const pop = { it: null }; // (the tap card's place, when one's open)
  const placeMarks = () => { placeOthers(); placeTrip(); boatM.setAttribute('transform', `translate(${boatXY[0]} ${boatXY[1]}) scale(${pxW})`); if (destXY) destM.setAttribute('transform', `translate(${destXY[0]} ${destXY[1]}) scale(${pxW})`); if (pop.it) pvM.setAttribute('transform', `translate(${pop.it.t.x} ${pop.it.t.z}) scale(${pxW})`); };
  // place names, sized in screen pixels, drawn most important first and never overlapping (nor under the chart's
  // floating cards and buttons)
  const PRI = { region: 0, major: 1, isle: 2, minor: 2, road: 3, poi: 3, society: 4 }, SIZE = { region: 10.5, major: 10, isle: 15, minor: 9.5, road: 11, poi: 11, society: 10.5 };
  const SPACING = { region: 3, major: 2.4, minor: 1.6 };
  const CATC = { food: '#ffb870', hotel: '#c9a7ff', mall: '#ff8fc7', fuel: '#ffd36b', health: '#ff8a8a', school: '#8fd0ff', park: '#7ff0c8', road: '#e9f1ff', society: '#bfefff' };
  const overlays = ['.sc-hd', '.sc-tabs', '.sc-layers', '.sc-scale', '.sc-compass', '.sc-ctrls', '.sc-panel', '.map-pop'];
  const paintGeo = () => {
    geoDirty = false; geoG.replaceChildren(); if (!mapOpen) return;
    const L = mapLevel(), sr = mapSvg.getBoundingClientRect(), px = 1 / pxW, vh = view.w * ar, x0 = view.cx - view.w / 2, y0 = view.cz - vh / 2;
    // islands have no names of their own (they're the map's buildings): one takes the real name of a place that sits on
    // it or right beside it (a landmark, a society, a locality), and that place isn't labelled again on its own
    // every island in view is named (island-names.js: the same names as its signboard at sea); a place that names the
    // island it sits on isn't labelled again on its own
    const real = L === 1 ? [] : [...placeList().filter(p => p.kind === 'major' || L >= 3), ...(L === 4 ? poiList().filter(p => p.cat !== 'shack') : [])], onIsle = new Map();
    if (L >= 3) { const m = Math.max(view.w, vh) * 0.05, inView = isles.filter(it => it.x > x0 - m && it.x < x0 + view.w + m && it.z > y0 - m && it.z < y0 + vh + m);
      if (inView.length) nameIslands(inView, isles).forEach((n, it) => onIsle.set(it, n)); }
    const used = new Set([...onIsle.values()].filter(v => v.on).map(v => v.p));
    const isleNames = [...onIsle].map(([it, { name }]) => ({ kind: 'isle', name, x: it.x, z: it.z + Math.max(it.r, 3.5 * pxW) * 1.14 + 16 * pxW }));
    const list = L === 1 ? regionList() : [...real.filter(p => !used.has(p)), ...isleNames];
    const items = list.filter(p => p.x > x0 && p.x < x0 + view.w && p.z > y0 && p.z < y0 + vh).sort((a, b) => PRI[a.kind] - PRI[b.kind]);
    const bx = (boatXY[0] - x0) * px, by = (boatXY[1] - y0) * px;
    const taken = [[bx - 20, by - 20, bx + 20, by + 20], ...overlays.map(s => mapEl.querySelector(s)).filter(n => n && n.offsetParent).map(n => { const r = n.getBoundingClientRect(); return [r.left - sr.left - 6, r.top - sr.top - 6, r.right - sr.left + 6, r.bottom - sr.top + 6]; })];
    let n = 0;
    for (const p of items) {
      if (n > 140) break;
      const r = PRI[p.kind], fs = SIZE[p.kind], up = p.kind in SPACING, text = up ? p.name.toUpperCase() : p.name;
      const w = up ? text.length * (fs * 0.62 + SPACING[p.kind]) : text.length * fs * (p.kind === 'isle' ? 0.42 : 0.56) + (r >= 3 ? 10 : 0), sx = (p.x - x0) * px, sy = (p.z - y0) * px;
      const rc = [sx - w / 2, sy - fs * 1.2, sx + w / 2, sy + fs * 0.5];
      if (taken.some(b => rc[0] < b[2] && rc[2] > b[0] && rc[1] < b[3] && rc[3] > b[1])) continue;
      taken.push(rc); n++;
      const g = el('g', { class: `map-geo-${p.kind}`, transform: `translate(${p.x} ${p.z}) scale(${pxW})` }, geoG);
      if (r >= 3) el('circle', { cy: fs * 0.25, r: 2.4, fill: CATC[p.cat] || '#fff' }, g);
      el('text', { y: r >= 3 ? -3 : 0, 'font-size': fs, class: 'map-geo-t', ...(up ? { 'letter-spacing': SPACING[p.kind] } : {}) }, g).textContent = text;
    }
    // Fisher's Shacks (every petrol pump and hospital): a hut badge, named when there's room
    if (L >= 2) { let k = 0;
      for (const p of shackList()) {
        if (p.off || p.x < x0 || p.x > x0 + view.w || p.z < y0 || p.z > y0 + vh || k++ > 120) continue;
        const g = el('g', { class: 'map-shack', transform: `translate(${p.x} ${p.z}) scale(${pxW})` }, geoG), sx = (p.x - x0) * px, sy = (p.z - y0) * px;
        el('circle', { r: 9, class: 'map-shack-b' }, g); el('path', { d: 'M-4.6 4V-.6L0-4.4 4.6-.6V4ZM-1.4 4V1h2.8v3', class: 'map-shack-i' }, g);
        const w = SHACK_NAME.length * 6.2 + 16, rc = [sx - w / 2, sy + 11, sx + w / 2, sy + 31];
        if (L >= 3 && !taken.some(b => rc[0] < b[2] && rc[2] > b[0] && rc[1] < b[3] && rc[3] > b[1])) { taken.push(rc);
          el('rect', { x: -w / 2, y: 12, width: w, height: 19, rx: 9.5, class: 'sc-pill map-shack-pill' }, g); el('text', { y: 25.5, class: 'sc-pill-t map-shack-t' }, g).textContent = SHACK_NAME; }
      } }
  };
  const geoG = el('g', { class: 'map-geo' }); mapSvg.insertBefore(geoG, isleG.nextSibling); // (names above the islands, under the markers)
  onChange(() => { geoDirty = true; });
  setInterval(() => { if (geoDirty && mapOpen) paintGeo(); }, 250);
  setInterval(() => { if (mapOpen) { const n = islesDrawn; paintRocks(); if (islesDrawn !== n) geoDirty = true; } }, 1000); // (islands arriving while the map is open)
  let pinch = null, drag = null, dragged = false; const ptrs = new Map();
  const worldAt = (cx, cy) => { const pt = mapSvg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(mapSvg.getScreenCTM().inverse()); };
  mapSvg.addEventListener('wheel', e => { e.preventDefault(); const w = worldAt(e.clientX, e.clientY); zoomAt(Math.pow(1.0018, e.deltaY), w.x, w.y); }, { passive: false });
  mapSvg.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; drag = null; } });
  addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], m = worldAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), d = Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])); zoomAt(pinch.w * pinch.d / d / view.w, m.x, m.y); dragged = true; return; }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!dragged && Math.hypot(dx, dy) < 6) return; dragged = true;
      view.cx = drag.cx - dx * pxW; view.cz = drag.cz - dy * pxW; applyView(); mapSvg.classList.add('panning'); } });
  const ptrUp = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { drag = null; mapSvg.classList.remove('panning'); } };
  addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  $('map-zin').addEventListener('click', () => zoomAt(0.5)); $('map-zout').addEventListener('click', () => { if (view.w >= V0 - 1) openWorld(); else zoomAt(2); });
  $('map-zboat').addEventListener('click', () => { view.cx = boatXY[0]; view.cz = boatXY[1]; zoomAt(Math.min(1, 6000 / view.w)); });
  new ResizeObserver(() => { if (mapOpen) applyView(); }).observe(mapSvg);
  let mapOpen = false, lastFocus = null;
  const setMap = open => {
    if (open === mapOpen) return; mapOpen = open;
    if (open) { paintRocks(); coinsEl.textContent = `${api.coins()}c`; lastFocus = document.activeElement; mapEl.hidden = false; requestAnimationFrame(() => { mapEl.classList.add('open'); applyView(); }); $('map-close').focus(); }
    else { closePop(); mapEl.classList.remove('open'); setTimeout(() => { if (!mapOpen) mapEl.hidden = true; }, 260); if (lastFocus) lastFocus.focus(); }
    document.body.classList.toggle('map-open', open);
  };
  $('map-close').addEventListener('click', () => setMap(false));
  // hover shows the spot's position; click pins a course there
  const tip = $('map-tip'), wrap = mapSvg.parentElement, help = $('map-help');
  if (matchMedia('(pointer: coarse)').matches) help.textContent = 'Tap the water to pin a course';
  const toWorld = e => { const pt = mapSvg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const w = pt.matrixTransform(mapSvg.getScreenCTM().inverse()); return Math.abs(w.x) <= H && Math.abs(w.y) <= H ? w : null; };
  const showTip = (e, w, text) => {
    const r = wrap.getBoundingClientRect(); tip.hidden = false; tip.textContent = text;
    tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    tip.classList.toggle('below', e.clientY - r.top < 56);
    ghost.setAttribute('visibility', 'visible'); ghost.setAttribute('cx', w.x); ghost.setAttribute('cy', w.y);
  };
  const hideTip = () => { tip.hidden = true; ghost.setAttribute('visibility', 'hidden'); };
  const tipText = w => { const z = zoneAt(w.x, w.y); return (z ? z.name + ' · ' : '') + formatPosition(w.x, w.y); };
  const otherAt = e => others.get(e.target.closest?.('.map-other')?.dataset.id);
  mapSvg.addEventListener('pointermove', e => { if (drag && dragged) { hideTip(); return; } const o = otherAt(e), w = toWorld(e);
    if (o && w) showTip(e, w, `${o.c.name} · ${o.status}`); else if (w) showTip(e, w, tipText(w)); else hideTip(); });
  mapSvg.addEventListener('pointerleave', hideTip);
  mapSvg.addEventListener('click', e => {
    if (dragged) { dragged = false; return; } // a pan is not a pin
    const sg = e.target.closest?.('.map-sos'); if (sg && sosPick) { setMap(false); sosPick(sg.dataset.id); return; } // an SOS: its card
    const o = otherAt(e); if (o && othersPick) { setMap(false); othersPick(o.c); return; } // a boat: their card
    const w = toWorld(e); if (!w) return;
    hideTip(); openPop(pickAt(e, w)); // (a card first: what's there, how far, how long, the fuel; "Sail here" pins it)
  });
  $('map-unpin').addEventListener('click', () => api.clearCourse());
  // ---- the tap card: what's at the spot you tapped, and the trip there ----
  const popEl = document.createElement('div'); popEl.className = 'map-pop'; popEl.hidden = true; popEl.setAttribute('role', 'dialog'); popEl.setAttribute('aria-label', 'Place');
  popEl.innerHTML = `<div class="mp-hd"><span class="mp-kind"></span><button type="button" class="mp-x" aria-label="Close"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg></button></div>
    <b class="mp-name"></b><span class="mp-sub"></span><div class="mp-stats"></div><div class="mp-chips"></div><p class="mp-warn" hidden></p><button type="button" class="mp-go">Sail here</button>`;
  mapEl.querySelector('.map-card').appendChild(popEl);
  const q = c => popEl.querySelector(c);
  // what's under a tap: a station, a Fisher's Shack, the passenger drop-off, an island, or open water (captains and SOS
  // calls keep their own cards). Each says where to sail to: beside it, not onto it.
  function pickAt(e, w) {
    const r = mapSvg.getBoundingClientRect(), px = (x, z) => [r.left + (x - (view.cx - view.w / 2)) / pxW, r.top + (z - (view.cz - view.w * ar / 2)) / pxW], near = (x, z, R) => { const [sx, sy] = px(x, z); return Math.hypot(sx - e.clientX, sy - e.clientY) < R; };
    const toward = (x, z, d) => { const dx = boatXY[0] - x, dz = boatXY[1] - z, L = Math.hypot(dx, dz) || 1; return { x: x + dx / L * d, z: z + dz / L * d }; };
    const zn = n => zoneAt(n.x, n.z)?.name;
    const hidden = k => mapSvg.classList.contains('no-' + k);
    if (!hidden('stations')) for (const st of STATIONS) if (near(st.x, st.z, 20)) { const t = { x: st.x + 70, z: st.z + 80 };
      return { kind: 'Paradise Station', name: st.id === 'home' ? 'Paradise Station' : `Paradise Station · ${st.at || zn(st) || ''}`, sub: zn(st) || formatPosition(st.x, st.z), chips: ['Fuel', 'Fish market', 'Berths', 'Passengers'], x: st.x, z: st.z, t }; }
    if (near(0, 0, 18)) return { kind: 'Harbour', name: 'The Harbour', sub: 'Where voyages start', chips: [], x: 0, z: 0, t: toward(0, 0, 30) };
    if (!hidden('trips')) { const tr = tripFn?.(); if (tr && near(tr.x, tr.z, 22)) return { kind: 'Passenger drop-off', name: tr.name, sub: zn(tr) || formatPosition(tr.x, tr.z), chips: ['Your passengers'], x: tr.x, z: tr.z, t: { x: tr.x, z: tr.z } }; }
    if (!hidden('shacks')) for (const sh of shackList()) if (!sh.off && near(sh.x, sh.z, 18)) return { kind: SHACK_NAME, name: sh.was || SHACK_NAME, sub: zn(sh) || formatPosition(sh.x, sh.z), chips: ['Fuel', 'Fish market', 'Passengers'], x: sh.x, z: sh.z, t: toward(sh.x, sh.z, 34) };
    let best = null, bd = Infinity; for (const it of isles) { if (it.big) continue; const d = Math.hypot(it.x - w.x, it.z - w.y) - Math.max(it.r, it.minPx * pxW); if (d < 8 * pxW && d < bd) { bd = d; best = it; } }
    if (best) { const nm = nameIslands([best], isles).get(best)?.name || 'Island', shack = shackList().some(sh => Math.hypot(sh.x - best.x, sh.z - best.z) < best.r + 120);
      return { kind: 'Island', name: nm, sub: zn(best) || formatPosition(best.x, best.z), chips: ['Beach', ...(shack ? ['Fisher\u2019s Shack nearby'] : [])], x: best.x, z: best.z, t: toward(best.x, best.z, best.r + 24) }; }
    const z = zoneAt(w.x, w.y); return { kind: 'Open water', name: z ? z.name : 'Open water', sub: formatPosition(w.x, w.y), chips: [], x: w.x, z: w.y, t: { x: w.x, z: w.y } };
  }
  function openPop(it) {
    pop.it = it; it.legs = api.route?.(it.t.x, it.t.z) || [it.t]; const trip = tripOf(it.legs);
    q('.mp-kind').textContent = it.kind; q('.mp-name').textContent = it.name; q('.mp-sub').textContent = it.sub;
    q('.mp-stats').innerHTML = `<span><small>Distance</small>${fmtDist(trip.L)}</span><span><small>Time</small>${fmtTime(trip.secs)}</span><span class="${trip.state}"><small>Fuel</small>${Math.ceil(trip.need)} of ${Math.floor(trip.have)} L</span>`;
    q('.mp-chips').innerHTML = it.chips.map(c => `<i>${escM(c)}</i>`).join('');
    const w = q('.mp-warn'), go = q('.mp-go'); w.hidden = trip.state === 'ok'; w.className = `mp-warn ${trip.state}`;
    w.textContent = trip.state === 'out' ? 'Not enough fuel to get there: refuel at a Fisher\u2019s Shack or a Paradise Station first.' : 'Fuel will be tight: you\u2019ll arrive nearly empty.';
    go.textContent = api.anchored?.() ? 'Raise the anchor first' : 'Sail here'; go.disabled = !!api.anchored?.();
    const pts = ptsOf(boatXY[0], boatXY[1], it.legs); previewLine.setAttribute('points', polyStr(pts)); previewLine.setAttribute('visibility', 'visible');
    pvM.setAttribute('visibility', 'visible'); placeTag(pts, trip); placeMarks();
    popEl.hidden = false; mapEl.classList.add('pop-open'); requestAnimationFrame(() => popEl.classList.add('in'));
  }
  function closePop() { if (!pop.it) return; pop.it = null; popEl.classList.remove('in'); mapEl.classList.remove('pop-open'); previewLine.setAttribute('visibility', 'hidden'); pvM.setAttribute('visibility', 'hidden'); routeT = 0;
    setTimeout(() => { if (!pop.it) popEl.hidden = true; }, 220); }
  q('.mp-x').addEventListener('click', e => { e.stopPropagation(); closePop(); });
  q('.mp-go').addEventListener('click', e => { e.stopPropagation(); const it = pop.it; if (!it) return;
    if (api.pinCourse(it.t.x, it.t.z)) { if (navigator.vibrate) navigator.vibrate(10); closePop(); } else { const go = q('.mp-go'); go.textContent = 'Raise the anchor first'; go.disabled = true; } });
  popEl.addEventListener('pointerdown', e => e.stopPropagation());
  // ---- layers: show only what you're looking for (remembered on this device) ----
  const LAYERS = [['names', 'Names'], ['shacks', 'Shacks'], ['stations', 'Stations'], ['trips', 'Passengers'], ['captains', 'Captains']];
  let off = new Set(); try { off = new Set(JSON.parse(localStorage.getItem('sailo:map-layers')) || []); } catch { /* none */ }
  const layersEl = document.createElement('div'); layersEl.className = 'sc-layers'; layersEl.setAttribute('role', 'group'); layersEl.setAttribute('aria-label', 'Map layers');
  layersEl.innerHTML = LAYERS.map(([k, label]) => `<button type="button" data-layer="${k}" aria-pressed="true"><i aria-hidden="true"></i>${label}</button>`).join('');
  mapEl.querySelector('.map-card').appendChild(layersEl);
  const paintLayers = () => { LAYERS.forEach(([k]) => { const on = !off.has(k); mapSvg.classList.toggle('no-' + k, !on); const b = layersEl.querySelector(`[data-layer="${k}"]`); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('on', on); }); geoDirty = true; };
  layersEl.addEventListener('click', e => { const b = e.target.closest('[data-layer]'); if (!b) return; e.stopPropagation(); const k = b.dataset.layer; off.has(k) ? off.delete(k) : off.add(k);
    try { localStorage.setItem('sailo:map-layers', JSON.stringify([...off])); } catch { /* storage blocked */ } paintLayers(); });
  layersEl.addEventListener('pointerdown', e => e.stopPropagation());
  paintLayers();
  const pinRow = $('map-pin-row'), pinPos = $('map-pin'), pinDist = $('map-pin-d');
  mapEl.addEventListener('click', e => { if (e.target === mapEl) setMap(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && mapOpen) { if (pop.it) closePop(); else setMap(false); } });
  // ---- a trip's numbers: how far by the route, how long at this boat's speed, the fuel it takes and whether the tank will do ----
  const fmtDist = m => m < 1000 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(m / WORLD.mile).toFixed(1)} mi`;
  const fmtTime = s => s < 60 ? 'under a min' : s < 3600 ? `~${Math.round(s / 60)} min` : `~${(s / 3600).toFixed(1)} h`;
  const tripOf = legs => { const id = api.boatId?.() || ECON.active, sp = BOAT_SPECS[id] || BOAT_SPECS.tug, L = routeLength({ x: boatXY[0], z: boatXY[1] }, legs);
    const need = burnFor(id, L, 1), have = boatStatus(id)?.fuel ?? 0, secs = L / (sp.kn * SPEED_UP / 1.944 * 0.85);
    return { L, secs, need, have, state: have < need ? 'out' : have < need * 1.3 ? 'low' : 'ok' }; };
  const ptsOf = (x, z, legs) => [[x, z], ...legs.map(p => [p.x, p.z])];
  const polyStr = pts => pts.map(p => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  // the tag sits just above the destination's pin (clear of the boat, however short the route looks)
  const placeTag = (pts, trip) => { const [mx, mz] = pts[pts.length - 1];
    const text = `${fmtDist(trip.L)} · ${fmtTime(trip.secs)} · ${Math.ceil(trip.need)} L`; if (routeTagT.textContent !== text) { routeTagT.textContent = text; const w = text.length * 6.4 + 20; routeTagR.setAttribute('x', -w / 2); routeTagR.setAttribute('width', w); }
    routeTag.setAttribute('class', `map-route-tag ${trip.state}`); routeTag.setAttribute('transform', `translate(${mx} ${mz}) scale(${pxW}) translate(0 -50)`); routeTag.setAttribute('visibility', 'visible'); };
  let routeT = 0;
  const drawMap = (x, z, heading, dest, pos) => {
    boatXY = [x, z]; destXY = dest ? [dest.x, dest.z] : null;
    if (performance.now() > othersT) { othersT = performance.now() + 250; paintOthers(); paintSOS(); }
    placeMarks();
    boatArrow.setAttribute('transform', `rotate(${-heading * 180 / Math.PI})`);
    const vis = dest ? 'visible' : 'hidden'; destM.setAttribute('visibility', vis); destLine.setAttribute('visibility', vis);
    if (dest) { const legs = api.courseRoute?.() || [dest], pts = ptsOf(x, z, legs.length ? legs : [dest]); destLine.setAttribute('points', polyStr(pts));
      if (performance.now() > routeT && !pop.it) { routeT = performance.now() + 400; const trip = tripOf(legs.length ? legs : [dest]); placeTag(pts, trip);
        pinPos.textContent = formatPosition(dest.x, dest.z); pinDist.textContent = `${fmtDist(trip.L)} to go · ${fmtTime(trip.secs)}`; } }
    else if (!pop.it) routeTag.setAttribute('visibility', 'hidden');
    pinRow.hidden = !dest; help.hidden = !!dest;
    const zn = zoneAt(x, z), here = `You're at <b>${escM(zn ? zn.name : WORLD.city)}</b> <span class="sc-mono">${escM(pos)}</span>`; if (mapPos.innerHTML !== here) mapPos.innerHTML = here;
    // the islands met so far, and the way home to Paradise Station
    const home = STATIONS.find(st => st.id === 'home') || STATION, hx = home.x - x, hz = home.z - z, hd = Math.hypot(hx, hz), n = isles.filter(it => !it.big).length;
    const dir = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(((Math.atan2(hx, -hz) * 180 / Math.PI + 360) % 360) / 45) % 8];
    const isl = `${n ? `${n} island${n === 1 ? '' : 's'} · ` : ''}<b>Paradise Station</b> ${hd < WORLD.mile * 0.1 ? 'here' : `${(hd / WORLD.mile).toFixed(1)} mi ${dir}`}`; if (islesRow.innerHTML !== isl) islesRow.innerHTML = isl;
    const c = `${api.coins()}c`; if (coinsEl.textContent !== c) coinsEl.textContent = c;
  };

  // ---- quick actions (fleet, search, inbox) and the shared sheet ----
  const sheet = $('sheet'), sheetBody = $('sheet-body');
  let sheetOpen = false, sheetFocus = null;
  // kind 'garage' / 'friends': the full-screen Naked HUD form (garage-friends.js); other sheets keep the card
  const openSheet = (title, sub, html, kind = '') => {
    sheet.classList.toggle('nk', !!kind); sheet.dataset.kind = kind;
    $('sheet-title').textContent = title; $('sheet-sub').textContent = sub; sheetBody.innerHTML = html;
    if (!sheetOpen) { sheetFocus = document.activeElement; sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); sheetOpen = true; }
    $('sheet-close').focus();
  };
  let afterSheet = null; // one-off: runs when the sheet next closes (the first-entry flow waits on it)
  const closeSheet = () => { if (!sheetOpen) return; sheetOpen = false; sheet.classList.remove('open'); setTimeout(() => { if (!sheetOpen) sheet.hidden = true; }, 260); if (sheetFocus) sheetFocus.focus();
    const f = afterSheet; afterSheet = null; f?.(); };
  $('sheet-close').addEventListener('click', closeSheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtMi = m => `${(m / WORLD.mile).toFixed(1)} mi`;
  // garage / my fleet (the "new" dot clears once it's been opened)
  const SEEN = 'sailo:garage-seen'; let seen = false; try { seen = localStorage.getItem(SEEN) === '1'; } catch { /* storage blocked */ }
  $('tb-fleet-dot').hidden = seen; $('dk-more').classList.toggle('has-new', !seen);
  const lastStats = { catchN: 0, distNm: 0, topKn: 0, x: 0, z: 0 };
  const gf = createGarageFriends({ api, openSheet, closeSheet, sheet, sheetBody, paintFleet: () => paintFleet(), lastStats,
    ECON, FISH, REGION, localOdds, fishWhere, STATION, WORLD,
    onGarageOpen: () => { try { localStorage.setItem(SEEN, '1'); } catch { /* storage blocked */ } $('tb-fleet-dot').hidden = true; $('dk-more').classList.remove('has-new'); paintMenu(); } });
  const openGarage = gf.openGarage;
  const paintFleet = () => { $('tb-fleet-n').textContent = api.boats().length; $('tb-fleet').setAttribute('aria-label', `My fleet: ${api.boats().length} boats`); };
  paintFleet();
  $('tb-fleet').addEventListener('click', openGarage);
  // search: places in this chart; picking one pins a course there
  const stationPlaces = () => STATIONS.map(st => ({ name: st.id === 'home' ? 'Paradise Station' : `Paradise Station · ${st.at}`, sub: `${st.id === 'home' && st.at ? st.at + ' · ' : ''}Fish Market · Boathouse · fuel`, x: st.x, z: st.z }));
  const PLACES = [{ name: 'Harbour', sub: 'Where every voyage starts', x: 0, z: 0 }, ...stationPlaces()];
  const openSearch = () => {
    openSheet('Search', 'Find a place and sail there', '<label class="ns-field"><img src="./hud/white/search.svg" alt="" draggable="false"><input class="sh-input" id="sh-q" type="search" placeholder="Search places" autocomplete="off" spellcheck="false"></label><div id="sh-results" class="sheet-body"></div>', 'search');
    const q = $('sh-q'), res = $('sh-results');
    PLACES.length = 0; PLACES.push({ name: 'Harbour', sub: 'Where every voyage starts', x: 0, z: 0 }, ...stationPlaces()); placeList().sort((a, b) => a.name.localeCompare(b.name)).forEach(p => PLACES.push({ name: p.name, sub: groupLabel(p.group), x: p.x, z: p.z }));
    const paint = () => { const term = q.value.trim().toLowerCase(), list = PLACES.filter(p => !term || p.name.toLowerCase().includes(term)).slice(0, term ? 40 : 12);
      res.innerHTML = list.length ? list.map((p, i) => `<button class="sh-row" style="--n:${i}" data-i="${PLACES.indexOf(p)}"><div><b>${p.name}</b><br><small>${p.sub} · ${formatPosition(p.x, p.z)}</small></div><span class="go"><em>${fmtMi(Math.hypot(p.x - lastStats.x, p.z - lastStats.z))}</em><span class="ns-sail">Sail<img src="./gf/teal/arrow.svg" alt="" draggable="false"></span></span></button>`).join('') : '<div class="sh-msg">No places match that search.</div>'; };
    q.addEventListener('input', paint);
    // typing must not steer the boat (Escape still closes)
    q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeSheet(); }); q.addEventListener('keyup', e => e.stopPropagation()); paint(); q.focus();
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const p = PLACES[+b.dataset.i];
      if (Math.hypot(p.x - lastStats.x, p.z - lastStats.z) < 40) { closeSheet(); return; }
      if (api.pinCourse(p.x + (p === PLACES[1] ? 70 : 0), p.z + (p === PLACES[1] ? 80 : 0))) closeSheet(); });
  };
  $('tb-search').addEventListener('click', openSearch);
  // inbox
  const INBOX_SEEN = 'sailo:inbox-seen'; let inboxSeen = false; try { inboxSeen = localStorage.getItem(INBOX_SEEN) === '1'; } catch { /* storage blocked */ }
  const harbourNotes = cls => `
    <div class="${cls}"><time>Today</time><b>Welcome aboard, ${esc(prefs.name)}!</b><br>Steer with the wheel, tap the water to set a course, and tap your tug to fish or drop anchor.</div>
    <div class="${cls}"><time>Today</time><b>Paradise Station is open</b><br>Sell your catch at the Fish Market and refuel at the Boathouse, ${STATION.where}${STATION.at ? ` (at ${esc(STATION.at)})` : ''}. Use Search to sail there.</div>`;
  const markInboxSeen = () => { if (inboxSeen) return; inboxSeen = true; try { localStorage.setItem(INBOX_SEEN, '1'); } catch { /* storage blocked */ } paintMenu(); paintInboxN(); };
  // tablets: one inbox, the radio's (captains' messages, then these notes from the harbour), with one badge on the top bar
  let radioInbox = null, radioUnread = 0;
  const paintInboxN = () => { const n = isTablet() ? radioUnread + (inboxSeen ? 0 : 2) : 0, b = $('tb-inbox-n'); b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n); };
  const openInbox = () => { if (radioInbox && isTablet()) { radioInbox(); return; }
    markInboxSeen(); openSheet('Inbox', 'Messages from the harbour', harbourNotes('sh-msg')); };
  paintInboxN(); addEventListener('sailo:controls', paintInboxN);
  $('tb-inbox').addEventListener('click', openInbox);
  // phones: the grid button under the avatar holds fleet, search, inbox, map, photo and zoom;
  // its badge counts what is new (an unseen garage, unread inbox messages)
  const menuBtn = $('hud-menu-btn'), menu = $('hud-menu');
  const setMenu = open => { menu.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); menuBtn.classList.toggle('on', open); };
  function paintMenu() {
    const garageNew = !$('tb-fleet-dot').hidden, unread = inboxSeen ? 0 : 2, n = (garageNew ? 1 : 0) + unread;
    $('hud-menu-n').hidden = !n; $('hud-menu-n').textContent = n;
    $('hm-fleet-n').textContent = api.boats().length; $('hm-inbox-n').hidden = !unread; $('hm-inbox-n').textContent = unread;
  }
  menuBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(menu.hidden); });
  menu.querySelectorAll('[data-proxy]').forEach(b => b.addEventListener('click', () => { setMenu(false); $(b.dataset.proxy).click(); paintMenu(); }));
  menu.querySelectorAll('[data-proxy-z]').forEach(b => b.addEventListener('click', () => api.zoomBy(b.dataset.proxyZ === 'in' ? 0.7 : 1.45)));
  addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && !menuBtn.contains(e.target)) setMenu(false); }, true);
  addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
  paintMenu();
  // add friends: share an invite link carrying your captain code (garage-friends.js)
  const openFriends = gf.openFriends;

  // ---- per-frame readouts ----
  const needle = document.querySelector('#dk-compass .needle'), north = document.querySelector('#dk-compass .dk-north');
  const spd = $('spd'), gear = $('gear'), arc = $('joy-speed'), hdgEl = $('hdg');
  // a one-off note on the scene (Naked HUD): fallbacks, "your progress followed you"; a Settings shortcut when it mentions them
  const noteEl = document.createElement('div'); noteEl.id = 'nk-note'; noteEl.setAttribute('role', 'status'); noteEl.innerHTML = '<p></p><button type="button" hidden>Open Settings</button>'; document.body.appendChild(noteEl);
  let noteT = 0;
  const note = (text, ms = 7000) => { noteEl.querySelector('p').textContent = text; const b = noteEl.querySelector('button'); b.hidden = !/Settings/.test(text);
    noteEl.classList.remove('show'); void noteEl.offsetWidth; noteEl.classList.add('show'); clearTimeout(noteT); noteT = setTimeout(() => noteEl.classList.remove('show'), ms); };
  noteEl.querySelector('button').addEventListener('click', () => { noteEl.classList.remove('show'); setOpen(true); });
  // phones: the place name and time show for a moment as the game opens, then make room (coins, fuel and the compass move up)
  if (matchMedia('(max-width: 720px), (max-height: 520px), (pointer: coarse) and (orientation: portrait) and (max-width: 1100px)').matches) setTimeout(() => { document.body.classList.add('tl-fade'); setTimeout(() => document.body.classList.add('tl-brief'), 450); }, 2800);
  setTimeout(() => { let t = null; try { t = sessionStorage.getItem('sailo:note'); sessionStorage.removeItem('sailo:note'); } catch { /* storage blocked */ } if (t) note(t, 9000); }, 2500); // (left by sign-in / start-up)
  // first entry: name your captain, then pick a boat in the Garage. Skip (or ✕) leaves it for later.
  const openWelcome = onDone => {
    let ended = false; const end = () => { if (!ended) { ended = true; onDone?.(); } };
    openSheet('Make it yours', 'Name your captain, then pick the boat you’ll sail.', `
      <label class="wl-field"><span>Captain name</span><input id="wl-name" maxlength="18" spellcheck="false" autocomplete="nickname" placeholder="Captain"></label>
      <p class="wl-hint">This is how other sailors will see you. You can change it any time in Settings.</p>
      <div class="wl-acts"><button type="button" class="wl-go" id="wl-go">Choose your boat →</button><button type="button" class="wl-skip" id="wl-skip">Skip for now</button></div>`, 'welcome');
    afterSheet = end;
    const inp = $('wl-name'); inp.value = prefs.name === 'Captain' ? '' : prefs.name;
    inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') $('wl-go').click(); }); inp.addEventListener('keyup', e => e.stopPropagation());
    setTimeout(() => inp.focus(), 350);
    $('wl-go').addEventListener('click', () => { const n = inp.value.trim(); if (n) { prefs.name = n; nameIn.value = n; save(prefs); }
      afterSheet = null; gf.openGarage({ intro: 'Pick the boat you’ll sail: tap Sail this boat. The Garage is always here in the top bar.' }); afterSheet = end; });
    $('wl-skip').addEventListener('click', () => closeSheet());
  };
  const stCatch = $('st-catch'), stDist = $('st-dist'), stTop = $('st-top'), rankEl = $('acct-rank'), lvl = $('you-lvl');
  const locPos = $('loc-pos'), warn = $('edge-warn');
  let last = { kn: -1, gear: '', c: -1, d: '', top: -1, az: 1e9, pos: '', warn: '' };
  return {
    paint,
    /** Tablets: the top bar's inbox opens the radio's (open()); its badge counts the radio's unread messages too. */
    routeInbox: open => { radioInbox = open; },
    inboxUnread: n => { if (n !== radioUnread) { radioUnread = n; paintInboxN(); } },
    /** The harbour's notes, for the radio's inbox (seen once shown). */
    harbourNotes: () => { markInboxSeen(); return harbourNotes('rd-note'); },
    openGarage, openFriends, openProfile: () => setOpen(true), openWelcome, note,
    /** Any full-screen Naked sheet (a local sailor's card, ...). */
    openPanel: (title, sub, html, kind = 'panel') => openSheet(title, sub, html, kind),
    closePanel: () => closeSheet(), captainName: () => prefs.name, rank: () => rankEl.textContent,
    /** The other boats on the map: list() => [{ c, x, z, yaw, status }]; pick(c) when one is tapped. */
    setOthers: (list, pick) => { othersFn = list; othersPick = pick; },
    /** A passenger trip's destination on the map: fn() -> { x, z, name } | null. */
    setTripTarget: fn => { tripFn = fn; },
    /** SOS calls on the map: list() => [{ id, x, z, name, mine }]; pick(id) when one is tapped. */
    setSOS: (list, pick) => { sosFn = list; sosPick = pick; },
    update({ x, z, heading, dest, edge, az, kn, maxKn = 12, gearName, catchN, distNm, topKn }) {
      lastStats.catchN = catchN; lastStats.distNm = distNm; lastStats.topKn = topKn; lastStats.x = x; lastStats.z = z;
      const pos = formatPosition(x, z);
      if (mapOpen) drawMap(x, z, heading, dest, pos);
      if (pos !== last.pos) { locPos.textContent = pos; last.pos = pos; }
      const w = edge < 1 ? `You've reached the edge of ${WORLD.name}` : edge < WORLD.warn ? `Leaving ${WORLD.name} · ${Math.round(edge)} m to the edge` : '';
      if (w !== last.warn) { warn.textContent = w || warn.textContent; warn.classList.toggle('show', !!w); last.warn = w; }
      const deg = Math.round(az * 180 / Math.PI);
      if (deg !== last.az) { needle.style.transform = north.style.transform = `rotate(${deg}deg)`; last.az = deg; }
      const k = Math.round(Math.abs(kn) * 10) / 10;
      if (k !== last.kn) { spd.textContent = k.toFixed(1); arc.style.strokeDasharray = `${Math.min(100, Math.abs(kn) / maxKn * 100)} 100`; last.kn = k; }
      { const b = ((90 - heading * 180 / Math.PI) % 360 + 360) % 360, h = `${['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(b / 45) % 8]} ${Math.round(b) % 360}°`; if (h !== last.hdg) { hdgEl.textContent = h; last.hdg = h; } }
      if (gearName !== last.gear) { gear.textContent = gearName; gear.className = { Ahead: 'fwd', Autopilot: 'fwd', Astern: 'rev', Anchored: 'hold' }[gearName] || ''; last.gear = gearName; }
      if (catchN !== last.c) {
        if (last.c >= 0) { const s = stCatch.parentElement; s.classList.remove('bump'); void s.offsetWidth; s.classList.add('bump'); }
        stCatch.textContent = catchN; last.c = catchN;
        let r = 0; RANKS.forEach(([n], i) => { if (catchN >= n) r = i; });
        rankEl.textContent = RANKS[r][1]; lvl.textContent = r + 1;
      }
      const d = distNm.toFixed(2);
      if (d !== last.d) { stDist.textContent = d; last.d = d; }
      const tk = Math.round(topKn);
      if (tk !== last.top) { stTop.textContent = tk; last.top = tk; }
    },
  };
}
