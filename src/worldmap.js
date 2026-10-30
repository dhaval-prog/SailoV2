// The world map: every city chart on Earth. Charts you have sailed are unlocked; the rest are
// locked until you travel there by sea-plane (a coin fare by distance). Zoom from the whole
// world down through countries and states to cities; search finds any city on Earth.
//   - land and country borders: Natural Earth (world-atlas), loaded with the map
//   - state and city names when zoomed in: Mapbox vector tiles (with a token)
//   - city search: Open-Meteo / GeoNames (geocode.js)

import { feature, mesh } from 'topojson-client';
import { WORLD_CITIES, kmBetween, fareFor, regionAt } from './regions.js';
import { chartFor, visitedCharts, homeChart } from './chart-store.js';
import { searchCities } from './geocode.js';

const TOKEN = (import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN) || '';
const W = 1024; // world width in map units (Web Mercator)
const NS = 'http://www.w3.org/2000/svg';
const mx = lng => (lng + 180) / 360 * W;
const my = lat => { const p = Math.max(-82, Math.min(82, lat)) * Math.PI / 180; return (1 - Math.log(Math.tan(Math.PI / 4 + p / 2)) / Math.PI) / 2 * W; };
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const debounce = (f, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => f(...a), ms); }; };
const LEVELS = ['World', 'Countries', 'States', 'Cities'];
const levelOf = k => k < 2.5 ? 0 : k < 7 ? 1 : k < 18 ? 2 : 3;

// ---- geometry -> SVG paths ----
// rings that cross the 180° line are joined up (longitudes run past ±180) and drawn twice, once on each side
const unwrap = ring => { let off = 0, prev = null; return ring.map(([lng, lat]) => { if (prev !== null) { const d = lng + off - prev; if (d > 180) off -= 360; else if (d < -180) off += 360; } prev = lng + off; return [prev, lat]; }); };
const ringPath = (ring, dp) => { const r = unwrap(ring), draw = sh => r.map(([lng, lat], i) => (i ? 'L' : 'M') + (mx(lng) + sh).toFixed(dp) + ' ' + my(lat).toFixed(dp)).join('') + 'Z';
  const lo = Math.min(...r.map(q => q[0])), hi = Math.max(...r.map(q => q[0])); return draw(0) + (hi > 180 ? draw(-W) : '') + (lo < -180 ? draw(W) : ''); };
const geoPath = (g, dp) => { if (!g) return ''; const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
  return polys.map(p => p.map(r => ringPath(r, dp)).join('')).join(''); };
const linePath = (g, dp) => (g.type === 'MultiLineString' ? g.coordinates : [g.coordinates]).map(l => l.map(([lng, lat], i) => (i ? 'L' : 'M') + mx(lng).toFixed(dp) + ' ' + my(lat).toFixed(dp)).join('')).join('');
// label point of a country: the area-weighted centre of its biggest ring
function labelPoint(g) {
  const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; let best = null;
  for (const p of polys) { const r = unwrap(p[0]).map(([lng, lat]) => [mx(lng), my(lat)]); let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const f = r[j][0] * r[i][1] - r[i][0] * r[j][1]; a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f; }
    a /= 2; if (!best || Math.abs(a) > best.a) { const xs = r.map(q => q[0]); let x = cx / (6 * a); x = ((x % W) + W) % W; best = { a: Math.abs(a), x, y: cy / (6 * a), w: Math.max(...xs) - Math.min(...xs) }; } }
  return best;
}
let atlas = {};
const loadAtlas = async res => atlas[res] ||= (async () => {
  const topo = (await (res === 50 ? import('world-atlas/countries-50m.json') : import('world-atlas/countries-110m.json'))).default, dp = res === 50 ? 2 : 1;
  const countries = feature(topo, topo.objects.countries).features;
  const landF = feature(topo, topo.objects.land);
  return { land: (landF.features || [landF]).map(f => geoPath(f.geometry, dp)).join(''),
    borders: linePath(mesh(topo, topo.objects.countries, (a, b) => a !== b), dp),
    names: countries.map(f => ({ name: f.properties?.name, ...labelPoint(f.geometry) })).filter(c => c.name && c.x) };
})();

// ---- state & city names from Mapbox tiles (zoomed in) ----
const tileCache = new Map(); let mbLib = null;
async function mbLabels(z, x, y) {
  const id = `${z}/${x}/${y}`; if (tileCache.has(id)) return tileCache.get(id);
  const p = (async () => {
    if (!mbLib) { const [vt, pbf] = await Promise.all([import('@mapbox/vector-tile'), import('pbf')]); mbLib = { VectorTile: vt.VectorTile, Pbf: pbf.default }; }
    const r = await fetch(`https://api.mapbox.com/v4/mapbox.mapbox-streets-v8/${id}.vector.pbf?access_token=${TOKEN}`); if (!r.ok) return [];
    const t = new mbLib.VectorTile(new mbLib.Pbf(new Uint8Array(await r.arrayBuffer()))), L = t.layers.place_label, out = []; if (!L) return out;
    for (let i = 0; i < L.length; i++) { const f = L.feature(i), pr = f.properties, g = f.toGeoJSON(x, y, z).geometry; if (g.type !== 'Point') continue;
      const kind = pr.class === 'state' ? 'state' : pr.class === 'settlement' && /^(city|town)$/.test(pr.type) ? 'city' : null; if (!kind) continue;
      out.push({ name: pr.name_en || pr.name, kind, rank: +pr.symbolrank || 9, x: mx(g.coordinates[0]), y: my(g.coordinates[1]) }); }
    return out;
  })().catch(() => []);
  tileCache.set(id, p); return p;
}

/** Open the world map. opts: { current (chart), coins(): number, travel(chart, fare): bool, settled(): promise (the fare paid) } */
export function openWorldMap({ current, coins, travel, settled }) {
  const el = document.createElement('div'); el.className = 'wm'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'wm-title');
  el.innerHTML = `<div class="wm-card">
    <header class="wm-head"><div><h2 id="wm-title">World map</h2><p>Sailed charts are unlocked. Fly to a new city to unlock it.</p></div><button class="icon-btn" id="wm-x" type="button" aria-label="Close world map"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></header>
    <div class="wm-search"><input id="wm-q" type="search" placeholder="Search any city on Earth" autocomplete="off" spellcheck="false"><div class="wm-res" id="wm-res"></div></div>
    <div class="wm-wrap" id="wm-wrap"><svg class="wm-svg" id="wm-svg" role="img" aria-label="World map with city charts"></svg>
      <div class="map-zoom wm-zoom"><span class="map-zoom-l" id="wm-l">World</span><button type="button" id="wm-home" aria-label="Back to your city"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3"/><circle cx="12" cy="12" r="7"/></svg></button><button type="button" id="wm-in" aria-label="Zoom in"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6v12M6 12h12"/></svg></button><button type="button" id="wm-out" aria-label="Zoom out"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12h12"/></svg></button></div>
      <div class="wm-loading" id="wm-loading">Loading the world…</div></div>
    <div class="wm-pick" id="wm-pick" hidden></div>
    <p class="wm-credit">Land © Natural Earth · places © Mapbox © OpenStreetMap · cities GeoNames</p></div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('open'));
  const $ = id => el.querySelector('#' + id), svg = $('wm-svg'), wrap = $('wm-wrap');
  const node = (tag, attrs, parent = svg) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  const sea = node('rect', { x: -W, y: -W * 0.2, width: W * 3, height: W * 1.4, class: 'wm-sea' });
  const grat = node('path', { class: 'wm-grat', d: Array.from({ length: 11 }, (_, i) => `M${i * W / 12 + W / 12} 0V${W}`).join('') + [-60, -30, 0, 30, 60].map(l => `M0 ${my(l)}H${W}`).join('') });
  const landP = node('path', { class: 'wm-land' }), bordP = node('path', { class: 'wm-border' }), routeP = node('path', { class: 'wm-route' });
  const labelsG = node('g', { class: 'wm-labels' }), pinsG = node('g', { class: 'wm-pins' }), planeG = node('g', { class: 'wm-plane', visibility: 'hidden' });
  node('path', { d: 'M12 0 L-6 -7 L-3 0 L-6 7 Z M-2 -1 L-9 -12 L-6 -12 L3 -1 Z M-2 1 L-9 12 L-6 12 L3 1 Z' }, planeG);
  void sea; void grat;

  // ---- the charts: starter cities, plus any sailed chart, plus where you are now ----
  const seen = new Map(visitedCharts().map(c => [c.id, c]));
  const pins = new Map();
  const addPin = c => { const ch = c.id ? c : chartFor(c); if (pins.has(ch.id)) return pins.get(ch.id);
    const p = { chart: seen.get(ch.id) || ch, id: ch.id, name: ch.city || ch.name, lat: ch.lat, lng: ch.lng, x: mx(ch.lng), y: my(ch.lat) }; pins.set(ch.id, p); return p; };
  WORLD_CITIES.forEach(addPin); seen.forEach(addPin); addPin(current);
  const stateOf = p => p.id === current.id ? 'here' : seen.has(p.id) ? 'open' : 'locked';

  // ---- view: zoom / pan ----
  const view = { cx: mx(current.lng), cy: my(current.lat), w: W };
  const aspect = () => { const r = wrap.getBoundingClientRect(); return r.height / (r.width || 1) || 0.75; };
  let dirty = true, res = 110, data = null;
  const apply = () => {
    view.w = Math.max(W / 220, Math.min(W * 1.2, view.w)); const h = view.w * aspect();
    view.cy = Math.max(h / 2 - W * 0.05, Math.min(W * 1.05 - h / 2, view.cy));
    svg.setAttribute('viewBox', `${view.cx - view.w / 2} ${view.cy - h / 2} ${view.w} ${h}`);
    const k = W / view.w; $('wm-l').textContent = LEVELS[levelOf(k)];
    if (k > 4 && res !== 50) { res = 50; loadAtlas(50).then(d => { data = d; landP.setAttribute('d', d.land); bordP.setAttribute('d', d.borders); dirty = true; }); }
    dirty = true;
  };
  const zoomAt = (f, x = view.cx, y = view.cy) => { const w0 = view.w; view.w = Math.max(W / 220, Math.min(W * 1.2, view.w * f)); const r = view.w / w0; view.cx = x + (view.cx - x) * r; view.cy = y + (view.cy - y) * r; apply(); };
  const toMap = (cx, cy) => { const pt = svg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  svg.addEventListener('wheel', e => { e.preventDefault(); const p = toMap(e.clientX, e.clientY); zoomAt(Math.pow(1.0018, e.deltaY), p.x, p.y); }, { passive: false });
  const ptrs = new Map(); let drag = null, pinch = null, moved = false;
  svg.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); moved = false;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cy: view.cy };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; drag = null; } });
  const onMove = e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], m = toMap((a[0] + b[0]) / 2, (a[1] + b[1]) / 2); zoomAt(pinch.w * pinch.d / Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])) / view.w, m.x, m.y); moved = true; return; }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!moved && Math.hypot(dx, dy) < 6) return; moved = true;
      const k = view.w / svg.getBoundingClientRect().width; view.cx = drag.cx - dx * k; view.cy = drag.cy - dy * k; apply(); } };
  const onUp = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) drag = null; };
  addEventListener('pointermove', onMove); addEventListener('pointerup', onUp); addEventListener('pointercancel', onUp);
  $('wm-in').addEventListener('click', () => zoomAt(0.5)); $('wm-out').addEventListener('click', () => zoomAt(2));
  $('wm-home').addEventListener('click', () => { view.cx = mx(current.lng); view.cy = my(current.lat); view.w = W / 12; apply(); select(pins.get(current.id)); });

  // ---- drawing labels and pins (screen-sized, never overlapping) ----
  let mbNames = [], mbKey = '';
  function paint() {
    dirty = false; if (!data) return;
    const rect = svg.getBoundingClientRect(), px = rect.width / view.w, k = W / view.w, L = levelOf(k), h = view.w * aspect(), x0 = view.cx - view.w / 2, y0 = view.cy - h / 2;
    const inView = (x, y) => x > x0 && x < x0 + view.w && y > y0 && y < y0 + h, scr = (x, y) => [(x - x0) * px, (y - y0) * px];
    const taken = [], free = r => !taken.some(b => r[0] < b[2] && r[2] > b[0] && r[1] < b[3] && r[3] > b[1]);
    pinsG.replaceChildren(); labelsG.replaceChildren();
    // pins first: you are here, sailed charts, then locked ones
    const order = [...pins.values()].filter(p => inView(p.x, p.y)).sort((a, b) => ({ here: 0, open: 1, locked: 2 })[stateOf(a)] - ({ here: 0, open: 1, locked: 2 })[stateOf(b)]);
    for (const p of order) {
      const st = stateOf(p), [sx, sy] = scr(p.x, p.y), r = [sx - 9, sy - 9, sx + 9, sy + 9]; if (st === 'locked' && !free(r)) continue; taken.push(r);
      const g = node('g', { class: `wm-pin ${st}`, transform: `translate(${p.x} ${p.y}) scale(${1 / px})`, 'data-id': p.id, tabindex: 0, role: 'button', 'aria-label': `${p.name}: ${st === 'locked' ? 'locked' : st === 'here' ? 'you are here' : 'unlocked'}` }, pinsG);
      if (st === 'here') node('circle', { r: 13, class: 'wm-pulse' }, g);
      node('circle', { r: st === 'locked' ? 6 : 7.5 }, g);
      if (st === 'locked') node('path', { d: 'M-2.4 -0.5v-1.6a2.4 2.4 0 0 1 4.8 0v1.6M-3.2 -0.5h6.4v4h-6.4z', class: 'wm-lock' }, g);
      else node('path', { d: 'M0 -4v7.5M-3.5 1.2a3.6 3.6 0 0 0 7 0M-2 -2.6h4', class: 'wm-anchor' }, g);
      const show = st !== 'locked' || L >= 1, text = p.name;
      if (show) { const w = text.length * 6.6 + 6, lr = [sx + 10, sy - 8, sx + 10 + w, sy + 6]; if (free(lr)) { taken.push(lr); node('text', { x: 11, y: 4, class: 'wm-pin-t' }, g).textContent = text; } }
    }
    // country names (bigger countries first), then states and cities from Mapbox when zoomed in
    const names = [];
    data.names.forEach(c => { if (!inView(c.x, c.y)) return; const w = c.w * px; if (L === 0 && w < 70) return; if (w < 24) return; names.push({ t: c.name.toUpperCase(), x: c.x, y: c.y, cls: 'country', fs: L === 0 ? 10 : 12, pri: -w }); });
    if (L >= 2) mbNames.forEach(n => { if (!inView(n.x, n.y)) return; if (n.kind === 'city' && (L < 3 && n.rank > 4)) return; names.push({ t: n.kind === 'state' ? n.name.toUpperCase() : n.name, x: n.x, y: n.y, cls: n.kind, fs: n.kind === 'state' ? 11 : 11.5, pri: (n.kind === 'state' ? 1e5 : 2e5) + n.rank }); });
    names.sort((a, b) => (L >= 2 ? (a.cls === 'country') - (b.cls === 'country') : 0) || a.pri - b.pri);
    for (const n of names) { const [sx, sy] = scr(n.x, n.y), w = n.t.length * n.fs * (n.cls === 'city' ? 0.56 : 0.72), r = [sx - w / 2, sy - n.fs, sx + w / 2, sy + 3];
      if (!free(r)) continue; taken.push(r);
      const g = node('g', { transform: `translate(${n.x} ${n.y}) scale(${1 / px})`, class: `wm-n wm-n-${n.cls}` }, labelsG);
      if (n.cls === 'city') node('circle', { cy: -3.5, r: 1.8 }, g);
      node('text', { y: n.cls === 'city' ? -7 : 0, 'font-size': n.fs }, g).textContent = n.t; }
    // fetch Mapbox names for the view when zoomed in
    if (TOKEN && L >= 2) { const z = Math.max(3, Math.min(7, Math.round(Math.log2(k)) + 1)), n = 2 ** z, t0x = Math.floor(x0 / W * n), t1x = Math.floor((x0 + view.w) / W * n), t0y = Math.max(0, Math.floor(y0 / W * n)), t1y = Math.min(n - 1, Math.floor((y0 + h) / W * n));
      const key = `${z}:${t0x}:${t1x}:${t0y}:${t1y}`;
      if (key !== mbKey && (t1x - t0x + 1) * (t1y - t0y + 1) <= 16) { mbKey = key; const jobs = []; for (let x = t0x; x <= t1x; x++) for (let y = t0y; y <= t1y; y++) jobs.push(mbLabels(z, ((x % n) + n) % n, y));
        Promise.all(jobs).then(r => { if (mbKey === key) { mbNames = r.flat(); dirty = true; } }); } }
  }
  const loop = () => { if (!el.isConnected) return; if (dirty) paint(); requestAnimationFrame(loop); }; loop();

  // ---- choosing a city ----
  // your current city's card also shows your home city (the first one you sailed) and a way back
  const home = homeChart();
  const homeCol = () => { if (!home || home.id === current.id) return `<div class="wm-fly wm-home-col"><small>${home ? 'This is your home city' : ''}</small></div>`;
    const km = kmBetween(current, home); return `<div class="wm-fly wm-home-col"><small><b>Home · ${esc(home.name)}</b><br>${Math.round(km).toLocaleString('en')} km · sea-plane</small><button type="button" id="wm-gohome">Fly home · ${fareFor(km)}c</button></div>`; };
  const pickEl = $('wm-pick');
  function select(p) {
    const st = stateOf(p), c = p.chart, km = kmBetween(current, c), fare = fareFor(km), where = [c.region, c.country].filter(Boolean).join(', '), reg = regionAt(c.lat, c.lng).name;
    pickEl.hidden = false;
    pickEl.innerHTML = `<div class="wm-pick-main"><b>${esc(c.name || c.city + ' Waters')}</b><small>${esc(where)}${where ? ' · ' : ''}${esc(reg)}</small>
      <span class="wm-tag ${st}">${st === 'here' ? 'You are here' : st === 'open' ? 'Unlocked' : 'Locked · fly there to unlock'}</span></div>
      ${st === 'here' ? homeCol() : `<div class="wm-fly"><small>${Math.round(km).toLocaleString('en')} km · sea-plane</small><button type="button" id="wm-go">Fly · ${fare}c</button></div>`}
      <p class="wm-msg" id="wm-msg"></p>`;
    $('wm-gohome')?.addEventListener('click', () => { const h = home && addPin(home), hf = fareFor(kmBetween(current, home)), have = coins();
      if (have < hf) { $('wm-msg').textContent = `You need ${hf} coins to fly home (you have ${have}). Sell fish at Paradise Station to earn more.`; return; }
      fly(h, hf); });
    $('wm-go')?.addEventListener('click', () => { const have = coins();
      if (have < fare) { $('wm-msg').textContent = `You need ${fare} coins (you have ${have}). Sell fish at Paradise Station to earn more.`; return; }
      fly(p, fare); });
  }
  svg.addEventListener('click', e => { if (moved) return; const g = e.target.closest('.wm-pin'); if (g) select(pins.get(g.dataset.id)); });
  svg.addEventListener('keydown', e => { const g = e.target.closest?.('.wm-pin'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); select(pins.get(g.dataset.id)); } });
  // search any city on Earth
  const q = $('wm-q'), resEl = $('wm-res');
  q.addEventListener('keydown', e => e.stopPropagation()); q.addEventListener('keyup', e => e.stopPropagation());
  q.addEventListener('input', debounce(async () => { const t = q.value; if (t.trim().length < 2) { resEl.innerHTML = ''; return; } const list = await searchCities('', t); if (q.value !== t) return;
    resEl.innerHTML = list.length ? list.slice(0, 8).map((c, i) => `<button type="button" data-i="${i}"><b>${esc(c.name)}</b><small>${esc([c.region, c.country].filter(Boolean).join(', '))}</small></button>`).join('') : '<div class="wm-none">No cities found</div>';
    resEl.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => { const c = list[+b.dataset.i], p = addPin(c); resEl.innerHTML = ''; q.value = c.name;
      view.cx = p.x; view.cy = p.y; view.w = W / 30; apply(); select(p); })); }));

  // ---- the flight: a great-circle route, the sea-plane flies it, then the new city loads ----
  function fly(p, fare) {
    if (!travel(p.chart, fare)) return; // (travel spends the fare)
    const a = current, b = p.chart, r = Math.PI / 180, v = (lat, lng) => [Math.cos(lat * r) * Math.cos(lng * r), Math.cos(lat * r) * Math.sin(lng * r), Math.sin(lat * r)];
    const A = v(a.lat, a.lng), B = v(b.lat, b.lng), om = Math.acos(Math.min(1, A[0] * B[0] + A[1] * B[1] + A[2] * B[2])) || 1e-6, pts = [];
    for (let i = 0; i <= 64; i++) { const t = i / 64, s1 = Math.sin((1 - t) * om) / Math.sin(om), s2 = Math.sin(t * om) / Math.sin(om), P = [0, 1, 2].map(j => s1 * A[j] + s2 * B[j]);
      let x = mx(Math.atan2(P[1], P[0]) / r); const y = my(Math.asin(P[2]) / r); if (pts.length && Math.abs(x - pts[pts.length - 1][0]) > W / 2) x += x < pts[pts.length - 1][0] ? W : -W; pts.push([x, y]); }
    routeP.setAttribute('d', pts.map((q, i) => (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1)).join(''));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), bw = Math.max(...xs) - Math.min(...xs), bh = Math.max(...ys) - Math.min(...ys);
    view.cx = (Math.max(...xs) + Math.min(...xs)) / 2; view.cy = (Math.max(...ys) + Math.min(...ys)) / 2; view.w = Math.max(W / 40, bw * 1.5, bh / aspect() * 1.5); apply();
    pickEl.innerHTML = `<div class="wm-pick-main"><b>Flying to ${esc(p.chart.name || p.name)}…</b><small>−${fare} coins</small></div>`;
    planeG.setAttribute('visibility', 'visible'); const t0 = performance.now(), dur = 2600;
    const step = () => { const k = Math.min(1, (performance.now() - t0) / dur), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, i = Math.min(63, Math.floor(e * 64)), f = e * 64 - i;
      const [x1, y1] = pts[i], [x2, y2] = pts[i + 1], x = x1 + (x2 - x1) * f, y = y1 + (y2 - y1) * f, s = view.w / svg.getBoundingClientRect().width;
      planeG.setAttribute('transform', `translate(${x} ${y}) rotate(${Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI}) scale(${s * 1.4})`);
      routeP.style.strokeDashoffset = String((1 - e) * 2000);
      if (k < 1) requestAnimationFrame(step); else { el.classList.add('arrive'); setTimeout(() => Promise.resolve(settled?.()).finally(() => location.reload()), 700); } }; // (once the fare is settled)
    routeP.style.strokeDasharray = '2000'; requestAnimationFrame(step);
  }

  // ---- open / close ----
  const close = () => { el.classList.remove('open'); removeEventListener('pointermove', onMove); removeEventListener('pointerup', onUp); removeEventListener('pointercancel', onUp); removeEventListener('keydown', onKey); setTimeout(() => el.remove(), 250); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  addEventListener('keydown', onKey); $('wm-x').addEventListener('click', close);
  el.addEventListener('click', e => { if (e.target === el) close(); });
  new ResizeObserver(() => apply()).observe(wrap);
  loadAtlas(110).then(d => { if (res === 110) data = d; landP.setAttribute('d', (data || d).land); bordP.setAttribute('d', (data || d).borders); $('wm-loading').remove(); dirty = true; });
  apply(); select(pins.get(current.id));
  return { close };
}
