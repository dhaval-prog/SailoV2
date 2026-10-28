// HUD wiring: account/settings panel (top right), camera dock (bottom right)
// and the per-frame readouts (compass, speed, stats). The scene hands in
// callbacks; this module only touches the DOM.

import { WORLD, formatPosition } from './world.js';
import { PLACE, clock, fetchWeather, isNight } from './live.js';
import { STATION, S as ECON, FISH } from './station.js';
import { regionList, placeList, poiList, ensure, zoneAt, onChange } from './geo.js';

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
  const prefs = { name: saved.name || 'Captain', night: !!saved.night, w: saved.w || 'clear', live: saved.live !== false };

  // ---- account panel ----
  const btn = $('acct-btn'), panel = $('acct-panel'), nameIn = $('acct-name');
  const setOpen = open => {
    panel.classList.toggle('open', open);
    panel.setAttribute('aria-hidden', String(!open));
    btn.setAttribute('aria-expanded', String(open));
    if (open) panel.scrollTop = 0;
  };
  btn.addEventListener('click', () => setOpen(!panel.classList.contains('open')));
  $('acct-close').addEventListener('click', () => setOpen(false));
  addEventListener('keydown', e => { if (e.key === 'Escape') setOpen(false); });
  addEventListener('pointerdown', e => { if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target)) setOpen(false); });

  nameIn.value = prefs.name;
  nameIn.addEventListener('input', () => { prefs.name = nameIn.value.trim() || 'Captain'; save(prefs); });
  nameIn.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') nameIn.blur(); });
  nameIn.addEventListener('keyup', e => e.stopPropagation());

  const tod = $('tod');
  const paint = () => {
    const st = api.getState();
    tod.classList.toggle('night', st.night);
    tod.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-checked', String((b.dataset.t === 'night') === st.night)));
    document.querySelectorAll('.wx').forEach(b => b.setAttribute('aria-checked', String(b.dataset.w === st.w)));
    document.querySelectorAll('#dock [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === st.view));
    document.body.classList.toggle('view-top', st.view === 'top');
  };
  // picking a time of day or weather by hand switches live mode off
  tod.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { prefs.night = b.dataset.t === 'night'; setLive(false); api.setNight(prefs.night); save(prefs); paint(); }));
  document.querySelectorAll('.wx').forEach(b => b.addEventListener('click', () => { prefs.w = b.dataset.w; setLive(false); api.setWeather(prefs.w); save(prefs); paint(); }));
  document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => api.exportModel(b.dataset.export)));
  if (matchMedia('(pointer: coarse)').matches) document.querySelector('.acct-panel .export').hidden = true;

  // ---- camera dock ----
  const dock = $('dock');
  dock.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => ripple(b, e)));
  dock.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { api.setView(b.dataset.v); paint(); }));
  dock.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => api.zoomBy(b.dataset.z === 'in' ? 0.7 : 1.45)));
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
    if (wx) api.setWeather(wx.preset);
    paint();
  };
  function setLive(on) {
    prefs.live = on; liveSw.setAttribute('aria-checked', String(on)); document.body.classList.toggle('live', on); save(prefs);
    if (on) applyLive();
  }
  liveSw.addEventListener('click', () => { setLive(!prefs.live); if (!prefs.live) { api.setNight(prefs.night); api.setWeather(prefs.w); paint(); } });
  const tick = () => {
    const c = clock(), key = c.time + c.date;
    if (key !== lastClock) { clkTime.textContent = c.time; clkDate.textContent = `${c.date} · ${PLACE.name}`; lastClock = key; applyLive(); paintWxIcon(); }
  };
  // weather icon: the settings icon by day; at night a moon replaces the sun (clear) or peeks from behind the cloud (cloudy)
  const MOON = '<path d="M30 10a12 12 0 1 0 9 19 10 10 0 0 1-9-19Z" fill="#dfe6ff" stroke="#aab8e8"/>';
  const NIGHT_ICONS = {
    clear: `<svg viewBox="0 0 48 48">${MOON}<path d="M11 13v3M9.5 14.5h3M38 34v2M37 35h2" stroke="#dfe6ff" stroke-width="1.5"/></svg>`,
    cloudy: '<svg viewBox="0 0 48 48"><path d="M33 7a9 9 0 1 0 7 14 7.5 7.5 0 0 1-7-14Z" fill="#dfe6ff" stroke="#aab8e8"/><path d="M14 36h20a7 7 0 0 0 0-14 10 10 0 0 0-19 2 6 6 0 0 0-1 12Z" fill="#cfd8e6" stroke="#8b9ab3"/></svg>',
  };
  let iconKey = '';
  const paintWxIcon = () => {
    if (!wx) return;
    const night = isNight(clock().mins, wx), key = wx.preset + night; if (key === iconKey) return; iconKey = key;
    if (night && NIGHT_ICONS[wx.preset]) clkIco.innerHTML = NIGHT_ICONS[wx.preset];
    else { const ico = document.querySelector(`.wx[data-w="${wx.preset}"] svg`); if (ico) clkIco.replaceChildren(ico.cloneNode(true)); }
  };
  const refreshWx = async () => {
    const w = await fetchWeather(); if (!w) return;
    wx = w; clkWx.hidden = false; paintWxIcon();
    clkWxt.textContent = `${w.tempC != null ? w.tempC + '°C ' : ''}${WX_LABEL[w.preset]}`;
    applyLive();
  };

  // apply saved preferences, then let live mode take over
  api.setNight(prefs.night);
  api.setWeather(prefs.w);
  setLive(prefs.live);
  paint();
  tick(); setInterval(tick, 10000);
  refreshWx(); setInterval(refreshWx, 10 * 60 * 1000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); refreshWx(); } });

  // ---- map (compass button): the whole ocean, the boat, and click-to-pin a course ----
  const mapEl = $('map'), mapSvg = $('map-svg');
  $('map-sub').textContent = `${WORLD.areaSqMi} sq mi of open ocean · Pune's real localities`; if ($('welcome-sub')) $('welcome-sub').textContent = `${WORLD.areaSqMi} square miles of Pune, turned into open ocean`;
  const H = WORLD.half, u = WORLD.side / 100; // u = 1% of the map, for sizing marks
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent = mapSvg) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  mapSvg.setAttribute('viewBox', `${-H - u * 4} ${-H - u * 4} ${WORLD.side + u * 8} ${WORLD.side + u * 8}`);
  { const d = el('defs', {}); const g = el('radialGradient', { id: 'map-sea', cx: '50%', cy: '45%', r: '75%' }, d);
    el('stop', { offset: '0', 'stop-color': '#4cc6f2' }, g); el('stop', { offset: '1', 'stop-color': '#1a78c9' }, g); }
  el('rect', { x: -H, y: -H, width: WORLD.side, height: WORLD.side, rx: u * 3, fill: 'url(#map-sea)' });
  { let d = ''; for (let m = WORLD.mile; m < H; m += WORLD.mile) d += `M${m} ${-H}V${H}M${-m} ${-H}V${H}M${-H} ${m}H${H}M${-H} ${-m}H${H}`;
    el('path', { d, class: 'map-grid', 'stroke-width': u * 0.18, 'data-sw': u * 0.18 });
    el('path', { d: `M0 ${-H}V${H}M${-H} 0H${H}`, class: 'map-axis', 'stroke-width': u * 0.3, 'data-sw': u * 0.3 }); }
  el('rect', { x: -H, y: -H, width: WORLD.side, height: WORLD.side, rx: u * 3, class: 'map-edge', 'stroke-width': u * 0.6, 'data-sw': u * 0.6 });
  // Pune place names (redrawn for the zoom level, see paintGeo)
  const geoG = el('g', { class: 'map-geo' });
  // harbour at the centre
  { const g = el('g', { class: 'map-mark', 'data-x': 0, 'data-y': 0 });
    el('circle', { cx: 0, cy: 0, r: u * 1.6, class: 'map-harbour', 'stroke-width': u * 0.45 }, g);
    el('text', { x: 0, y: u * 5.2, class: 'map-label', 'font-size': u * 3.2 }, g).textContent = 'Harbour'; }
  // Paradise Station island
  { const g = el('g', { transform: `translate(${STATION.x} ${STATION.z})`, class: 'map-station map-mark', 'data-x': STATION.x, 'data-y': STATION.z });
    el('ellipse', { rx: u * 2.4, ry: u * 1.8, class: 'map-island', 'stroke-width': u * 0.4 }, g);
    el('path', { d: `M${-u * 0.3} ${u * 0.6}Q${-u * 0.2} ${-u * 0.6} ${u * 0.4} ${-u * 1.4}M${u * 0.4} ${-u * 1.4}q${-u * 1.4} ${-u * 0.1} ${-u * 1.8} ${u * 0.6}M${u * 0.4} ${-u * 1.4}q${u * 1.4} ${-u * 0.1} ${u * 1.8} ${u * 0.6}`, class: 'map-palm', 'stroke-width': u * 0.45 }, g);
    el('text', { x: 0, y: u * 5.4, class: 'map-label', 'font-size': u * 3 }, g).textContent = 'Paradise Station'; }
  // compass rose and scale bar
  const northG = el('g', {});
  el('path', { d: `M0 ${-u * 5}L${u * 1.8} 0L0 ${-u}L${-u * 1.8} 0Z`, class: 'map-north' }, northG);
  el('text', { x: 0, y: u * 3.6, class: 'map-label', 'font-size': u * 3.2 }, northG).textContent = 'N';
  const scaleG = el('g', {}), scaleP = el('path', { class: 'map-scale', 'stroke-width': u * 0.4 }, scaleG), scaleT = el('text', { y: -u * 2, class: 'map-label', 'font-size': u * 2.8 }, scaleG);
  // hover preview, pinned course (marching, blinking dots) and pin marker
  const ghost = el('circle', { r: u * 1.4, class: 'map-ghost', 'stroke-width': u * 0.35, visibility: 'hidden' });
  const destLine = el('line', { class: 'map-route', 'stroke-width': u * 0.55, 'data-sw': u * 0.55, 'stroke-dasharray': `${u * 0.2} ${u * 1.1}`, 'stroke-linecap': 'round', visibility: 'hidden' });
  const destAnim = el('animate', { attributeName: 'stroke-dashoffset', from: 0, to: -u * 1.3 * 2, dur: '0.9s', repeatCount: 'indefinite' }, destLine);
  el('animate', { attributeName: 'opacity', values: '1;0.3;1', dur: '1.1s', repeatCount: 'indefinite' }, destLine);
  const destM = el('g', { class: 'map-dest', visibility: 'hidden' });
  el('circle', { r: u * 2.6, class: 'map-dest-ring', 'stroke-width': u * 0.3 }, destM);
  el('path', { d: `M0 0C${-u * 0.6} ${-u * 1.6} ${-u * 2} ${-u * 2.6} ${-u * 2} ${-u * 4.2}A${u * 2} ${u * 2} 0 1 1 ${u * 2} ${-u * 4.2}C${u * 2} ${-u * 2.6} ${u * 0.6} ${-u * 1.6} 0 0Z`, class: 'map-pin', 'stroke-width': u * 0.35 }, destM);
  el('circle', { cy: -u * 4.2, r: u * 0.75, class: 'map-pin-dot' }, destM);
  const boatM = el('g', { class: 'map-boat' });
  el('circle', { r: u * 4, class: 'map-pulse' }, boatM);
  const boatArrow = el('path', { d: `M${u * 3} 0L${-u * 2} ${u * 2.2}L${-u * 1} 0L${-u * 2} ${-u * 2.2}Z`, 'stroke-width': u * 0.4 }, boatM);
  const mapPos = $('map-pos');
  // ---- zoom and pan (wheel, pinch, drag, +/-). Zoom levels: 1 Pune region, 2 major neighbourhoods,
  //      3 smaller localities, 4 streets and landmarks ----
  const V0 = WORLD.side + u * 8, VMIN = 1400, view = { cx: 0, cz: 0, w: V0 };
  const mapLevel = () => view.w > 20000 ? 1 : view.w > 9000 ? 2 : view.w > 3600 ? 3 : 4;
  let geoDirty = true, boatXY = [0, 0], destXY = null;
  const applyView = () => {
    view.w = Math.min(V0, Math.max(VMIN, view.w)); const lim = Math.max(0, H + u * 4 - view.w / 2);
    view.cx = Math.max(-lim, Math.min(lim, view.cx)); view.cz = Math.max(-lim, Math.min(lim, view.cz));
    const k = view.w / V0, x0 = view.cx - view.w / 2, y0 = view.cz - view.w / 2;
    mapSvg.setAttribute('viewBox', `${x0} ${y0} ${view.w} ${view.w}`);
    mapSvg.querySelectorAll('[data-sw]').forEach(n => n.setAttribute('stroke-width', n.dataset.sw * k));
    destLine.setAttribute('stroke-dasharray', `${u * 0.2 * k} ${u * 1.1 * k}`); destAnim.setAttribute('to', -u * 1.3 * 2 * k);
    mapSvg.querySelectorAll('.map-mark').forEach(n => n.setAttribute('transform', `translate(${n.dataset.x} ${n.dataset.y}) scale(${k})`));
    ghost.setAttribute('r', u * 1.4 * k); ghost.setAttribute('stroke-width', u * 0.35 * k);
    northG.setAttribute('transform', `translate(${x0 + view.w - u * 8 * k} ${y0 + u * 9 * k}) scale(${k})`);
    // scale bar: a round distance about a fifth of the view
    const steps = [100, 200, 500, WORLD.mile / 2, WORLD.mile, WORLD.mile * 2, WORLD.mile * 5], len = steps.reduce((a, b) => Math.abs(b - view.w * 0.2) < Math.abs(a - view.w * 0.2) ? b : a);
    scaleG.setAttribute('transform', `translate(${x0 + u * 5 * k} ${y0 + view.w - u * 5 * k})`);
    scaleP.setAttribute('d', `M0 ${-u * k}V0H${len}V${-u * k}`); scaleP.setAttribute('stroke-width', u * 0.4 * k);
    scaleT.setAttribute('x', len / 2); scaleT.setAttribute('y', -u * 2 * k); scaleT.setAttribute('font-size', u * 2.8 * k);
    scaleT.textContent = len < 1000 ? `${len} m` : `${+(len / WORLD.mile).toFixed(1)} mi`;
    $('map-zoom-l').textContent = ['', 'Pune', 'Neighbourhoods', 'Localities', 'Streets & places'][mapLevel()];
    placeMarks(); geoDirty = true;
    ensure(x0, y0, x0 + view.w, y0 + view.w, mapLevel() === 4);
  };
  const zoomAt = (f, wx = view.cx, wz = view.cz) => { const w0 = view.w; view.w = Math.min(V0, Math.max(VMIN, view.w * f)); const r = view.w / w0; view.cx = wx + (view.cx - wx) * r; view.cz = wz + (view.cz - wz) * r; applyView(); };
  // the boat and the pin keep their on-screen size at any zoom
  const placeMarks = () => { const k = view.w / V0; boatM.setAttribute('transform', `translate(${boatXY[0]} ${boatXY[1]}) scale(${k})`); if (destXY) destM.setAttribute('transform', `translate(${destXY[0]} ${destXY[1]}) scale(${k})`); };
  // place names, sized in screen pixels, drawn most important first and never overlapping
  const PRI = { region: 0, major: 1, minor: 2, road: 3, poi: 3, society: 4 }, SIZE = [15, 12.5, 10.5, 10, 9.5];
  const CATC = { food: '#ffb870', hotel: '#c9a7ff', mall: '#ff8fc7', fuel: '#ffd36b', health: '#ff8a8a', school: '#8fd0ff', park: '#7ff0c8', road: '#e9f1ff', society: '#bfefff' };
  const paintGeo = () => {
    geoDirty = false; geoG.replaceChildren(); if (!mapOpen) return;
    const L = mapLevel(), px = mapSvg.getBoundingClientRect().width / view.w || 0.02, x0 = view.cx - view.w / 2, y0 = view.cz - view.w / 2;
    const list = L === 1 ? regionList() : [...placeList().filter(p => p.kind === 'major' || L >= 3), ...(L === 4 ? poiList() : [])];
    const items = list.filter(p => p.x > x0 && p.x < x0 + view.w && p.z > y0 && p.z < y0 + view.w).sort((a, b) => PRI[a.kind] - PRI[b.kind]);
    const taken = [[(boatXY[0] - x0) * px - 16, (boatXY[1] - y0) * px - 16, (boatXY[0] - x0) * px + 16, (boatXY[1] - y0) * px + 16]];
    let n = 0;
    for (const p of items) {
      if (n > 140) break;
      const r = PRI[p.kind], fs = SIZE[r], up = r <= 2, text = up ? p.name.toUpperCase() : p.name;
      const w = text.length * fs * (up ? 0.72 + (r === 0 ? 0.18 : 0.08) : 0.56) + (r >= 3 ? 10 : 0), sx = (p.x - x0) * px, sy = (p.z - y0) * px;
      const rc = [sx - w / 2, sy - fs * 1.2, sx + w / 2, sy + fs * 0.5];
      if (taken.some(b => rc[0] < b[2] && rc[2] > b[0] && rc[1] < b[3] && rc[3] > b[1])) continue;
      taken.push(rc); n++;
      const g = el('g', { class: `map-geo-${p.kind}`, transform: `translate(${p.x} ${p.z}) scale(${1 / px})` }, geoG);
      if (r >= 1) el('circle', { cy: fs * 0.25, r: r >= 3 ? 2.4 : 1.8, fill: r >= 3 ? CATC[p.cat] || '#fff' : 'rgba(255,255,255,0.7)' }, g);
      el('text', { y: r >= 1 ? -3 : 0, 'font-size': fs, class: 'map-geo-t' }, g).textContent = text;
    }
  };
  onChange(() => { geoDirty = true; });
  setInterval(() => { if (geoDirty && mapOpen) paintGeo(); }, 250);
  let pinch = null, drag = null, dragged = false; const ptrs = new Map();
  const worldAt = (cx, cy) => { const pt = mapSvg.createSVGPoint(); pt.x = cx; pt.y = cy; return pt.matrixTransform(mapSvg.getScreenCTM().inverse()); };
  mapSvg.addEventListener('wheel', e => { e.preventDefault(); const w = worldAt(e.clientX, e.clientY); zoomAt(Math.pow(1.0018, e.deltaY), w.x, w.y); }, { passive: false });
  mapSvg.addEventListener('pointerdown', e => { ptrs.set(e.pointerId, [e.clientX, e.clientY]); dragged = false;
    if (ptrs.size === 1) drag = { x: e.clientX, y: e.clientY, cx: view.cx, cz: view.cz };
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), w: view.w }; drag = null; } });
  addEventListener('pointermove', e => { if (!ptrs.has(e.pointerId)) return; ptrs.set(e.pointerId, [e.clientX, e.clientY]);
    if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()], m = worldAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), d = Math.max(10, Math.hypot(a[0] - b[0], a[1] - b[1])); zoomAt(pinch.w * pinch.d / d / view.w, m.x, m.y); dragged = true; return; }
    if (drag) { const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!dragged && Math.hypot(dx, dy) < 6) return; dragged = true;
      const k = view.w / mapSvg.getBoundingClientRect().width; view.cx = drag.cx - dx * k; view.cz = drag.cz - dy * k; applyView(); mapSvg.classList.add('panning'); } });
  const ptrUp = e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; if (!ptrs.size) { drag = null; mapSvg.classList.remove('panning'); } };
  addEventListener('pointerup', ptrUp); addEventListener('pointercancel', ptrUp);
  $('map-zin').addEventListener('click', () => zoomAt(0.5)); $('map-zout').addEventListener('click', () => zoomAt(2));
  $('map-zboat').addEventListener('click', () => { view.cx = boatXY[0]; view.cz = boatXY[1]; zoomAt(Math.min(1, 6000 / view.w)); });
  let mapOpen = false, lastFocus = null;
  const setMap = open => {
    if (open === mapOpen) return; mapOpen = open;
    if (open) { lastFocus = document.activeElement; mapEl.hidden = false; requestAnimationFrame(() => { mapEl.classList.add('open'); applyView(); }); $('map-close').focus(); }
    else { mapEl.classList.remove('open'); setTimeout(() => { if (!mapOpen) mapEl.hidden = true; }, 260); if (lastFocus) lastFocus.focus(); }
    document.body.classList.toggle('map-open', open);
  };
  $('map-close').addEventListener('click', () => setMap(false));
  // hover shows the spot's position; click pins a course there
  const tip = $('map-tip'), wrap = mapSvg.parentElement, help = $('map-help');
  if (matchMedia('(pointer: coarse)').matches) help.textContent = 'Tap anywhere on the water to pin a course';
  const toWorld = e => { const pt = mapSvg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const w = pt.matrixTransform(mapSvg.getScreenCTM().inverse()); return Math.abs(w.x) <= H && Math.abs(w.y) <= H ? w : null; };
  const showTip = (e, w, text) => {
    const r = wrap.getBoundingClientRect(); tip.hidden = false; tip.textContent = text;
    tip.style.left = `${e.clientX - r.left}px`; tip.style.top = `${e.clientY - r.top}px`;
    tip.classList.toggle('below', e.clientY - r.top < 56);
    ghost.setAttribute('visibility', 'visible'); ghost.setAttribute('cx', w.x); ghost.setAttribute('cy', w.y);
  };
  const hideTip = () => { tip.hidden = true; ghost.setAttribute('visibility', 'hidden'); };
  const tipText = w => { const z = zoneAt(w.x, w.y); return (z ? z.name + ' · ' : '') + formatPosition(w.x, w.y); };
  mapSvg.addEventListener('pointermove', e => { if (drag && dragged) { hideTip(); return; } const w = toWorld(e); if (w) showTip(e, w, tipText(w)); else hideTip(); });
  mapSvg.addEventListener('pointerleave', hideTip);
  mapSvg.addEventListener('click', e => {
    if (dragged) { dragged = false; return; } // a pan is not a pin
    const w = toWorld(e); if (!w) return;
    if (api.pinCourse(w.x, w.y)) { showTip(e, w, `Pinned · ${tipText(w)}`); if (navigator.vibrate) navigator.vibrate(10); }
    else showTip(e, w, 'Raise the anchor first');
  });
  $('map-unpin').addEventListener('click', () => api.clearCourse());
  const pinRow = $('map-pin-row'), pinPos = $('map-pin'), pinDist = $('map-pin-d');
  mapEl.addEventListener('click', e => { if (e.target === mapEl) setMap(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && mapOpen) setMap(false); });
  const drawMap = (x, z, heading, dest, pos) => {
    boatXY = [x, z]; destXY = dest ? [dest.x, dest.z] : null; placeMarks();
    boatArrow.setAttribute('transform', `rotate(${-heading * 180 / Math.PI})`);
    const vis = dest ? 'visible' : 'hidden'; destM.setAttribute('visibility', vis); destLine.setAttribute('visibility', vis);
    if (dest) { destLine.setAttribute('x1', x); destLine.setAttribute('y1', z); destLine.setAttribute('x2', dest.x); destLine.setAttribute('y2', dest.z);
      pinPos.textContent = formatPosition(dest.x, dest.z); pinDist.textContent = `${(Math.hypot(dest.x - x, dest.z - z) / WORLD.mile).toFixed(1)} mi to go`; }
    pinRow.hidden = !dest; help.hidden = !!dest;
    mapPos.textContent = pos;
  };

  // ---- quick actions (fleet, search, inbox) and the shared sheet ----
  const sheet = $('sheet'), sheetBody = $('sheet-body');
  let sheetOpen = false, sheetFocus = null;
  const openSheet = (title, sub, html) => {
    $('sheet-title').textContent = title; $('sheet-sub').textContent = sub; sheetBody.innerHTML = html;
    if (!sheetOpen) { sheetFocus = document.activeElement; sheet.hidden = false; requestAnimationFrame(() => sheet.classList.add('open')); sheetOpen = true; }
    $('sheet-close').focus();
  };
  const closeSheet = () => { if (!sheetOpen) return; sheetOpen = false; sheet.classList.remove('open'); setTimeout(() => { if (!sheetOpen) sheet.hidden = true; }, 260); if (sheetFocus) sheetFocus.focus(); };
  $('sheet-close').addEventListener('click', closeSheet);
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && sheetOpen) closeSheet(); });
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const fmtMi = m => `${(m / WORLD.mile).toFixed(1)} mi`;
  const TUG = '<svg viewBox="0 0 32 32"><path d="M15 4v14M15 5.5c3.6 3 5.8 6.8 6.5 11.5H15M14 8c-2 2.4-3.4 5.4-3.7 9H14"/><path d="M4 20.5h24l-2.4 3.4a2 2 0 0 1-1.6.8H8a2 2 0 0 1-1.6-.8z"/></svg>';
  // garage / my fleet
  const SEEN = 'sailo:garage-seen'; let seen = false; try { seen = localStorage.getItem(SEEN) === '1'; } catch { /* storage blocked */ }
  $('tb-fleet-dot').hidden = seen;
  const SAIL = '<svg viewBox="0 0 32 32"><path d="M15 3v17M15 4c4.2 3.5 7 8.5 7.6 14H15M14 7c-2.6 3-4.4 6.8-4.8 11H14"/><path d="M4 21.5h24l-2.4 3.4a2 2 0 0 1-1.6.8H8a2 2 0 0 1-1.6-.8z"/></svg>';
  const YACHT = '<svg viewBox="0 0 32 32"><path d="M9 13h9l3 4H7z"/><path d="M12 13V9h5l2 4M19 9V6"/><path d="M3 18h26l-3 5.2a2 2 0 0 1-1.7 1H7.6a2 2 0 0 1-1.7-1z"/></svg>';
  const BOAT_INFO = { tug: { ico: TUG, sub: 'Sturdy harbour tug with a lighthouse' }, sail: { ico: SAIL, sub: 'Sloop with mainsail and jib · sails furl at anchor' }, yacht: { ico: YACHT, sub: 'Flybridge cruiser with radar arch · custom flag' }, dinghy: { ico: SAIL, sub: 'Daysailer with tall mast and genoa · heels under sail' } };
  // fish collection: every species you've caught, with your count and heaviest fish; the rest are silhouettes
  const collectionUI = () => { const fc = api.fishCollection(), got = FISH.filter(f => fc.log[f.id]).length;
    return `<h4>Fish collection · ${got} / ${FISH.length} species</h4><div class="sh-fishes">${FISH.map(f => { const r = fc.log[f.id], st = fc.stars(f);
      return `<div class="sh-fish${r ? '' : ' locked'}" title="${r ? f.name : 'Not caught yet'}"><img src="${fc.img(f.id) || ''}" alt=""><b>${r ? f.name : '???'}</b>
        <span class="sh-fstars">${'★'.repeat(st)}<i>${'★'.repeat(5 - st)}</i></span><small>${r ? `×${r.n} · best ${r.best >= 10 ? r.best.toFixed(1) : r.best.toFixed(2)} kg` : 'Not caught yet'}</small></div>`; }).join('')}</div>`; };
  const openGarage = () => {
    try { localStorage.setItem(SEEN, '1'); } catch { /* storage blocked */ } $('tb-fleet-dot').hidden = true;
    const hold = FISH.reduce((a, f) => a + (ECON.hold[f.id] || 0), 0), boats = api.boats(), active = api.getBoat();
    const card = b => { const st = api.boatStatus(b.id), empty = st.fuel <= 0.05, pct = Math.round(st.fuel / st.cap * 100), on = b.id === active;
      return `<div class="sh-card boat${on ? ' on' : ''}${empty && !on ? ' empty' : ''}"><span class="sh-ico">${BOAT_INFO[b.id].ico}</span><div class="sh-boat"><b>${b.name}</b><small>${BOAT_INFO[b.id].sub}</small>
        <div class="sh-specs"><span title="Fuel"><i class="sh-fuel"><i style="width:${pct}%" class="${pct < 20 ? 'low' : ''}"></i></i>${Math.round(st.fuel)}/${st.cap} L</span><span title="Fish in hold">🐟 ${st.fish}/${st.holdCap}</span><span title="Top speed">⚡ ${st.kn} kn</span></div>
        ${empty ? `<small class="sh-warn">${on ? 'Out of fuel · running on the reserve' : 'No fuel · refuel it at Paradise Station'}</small>` : ''}</div>
        ${on ? '<span class="sh-tag">Sailing</span>' : `<button class="sh-btn sh-pick" data-boat="${b.id}">Sail this boat</button>`}</div>`; };
    const ss = api.sailStyle(), st = ss.style;
    const swatches = (row, label) => `<div class="sh-sw-row"><span>${label}</span><div class="sh-sw">${ss.colours.map(c => `<button class="sh-swatch${st.c[row] === c ? ' on' : ''}" style="background:${c}" data-row="${row}" data-c="${c}" aria-label="${label} ${c}"></button>`).join('')}</div></div>`;
    const styleUI = `<h4>Sail style · Sail Boat</h4>
      <div class="seg3" id="sh-mode">${['classic', 'solid', 'layers'].map(m => `<button data-mode="${m}" class="${st.mode === m ? 'on' : ''}">${{ classic: 'Classic', solid: 'Solid', layers: '3 layers' }[m]}</button>`).join('')}</div>
      ${st.mode === 'solid' ? swatches(0, 'Colour') : st.mode === 'layers' ? swatches(0, 'Top') + swatches(1, 'Middle') + swatches(2, 'Bottom') : ''}
      <div class="sh-img-row"><label class="sh-btn ghost">Add image<input id="sh-img" type="file" accept="image/*" hidden></label>${st.img ? '<button class="sh-btn ghost" id="sh-imgx">Remove image</button>' : ''}<small>Shows pixelated on the mainsail</small></div>`;
    const yf = api.yachtFlag(), fl = yf.flag;
    const flagUI = `<h4>Custom flag · Motor Yacht</h4>
      <div class="seg3 seg2" id="sh-flag-on"><button data-on="1" class="${fl.on ? 'on' : ''}">Flag up</button><button data-on="0" class="${fl.on ? '' : 'on'}">No flag</button></div>
      ${fl.on ? `<div class="sh-sw-row"><span>Colour</span><div class="sh-sw">${yf.colours.map(c => `<button class="sh-swatch sh-fsw${fl.c === c ? ' on' : ''}" style="background:${c}" data-c="${c}" aria-label="Flag ${c}"></button>`).join('')}</div></div>
      <div class="sh-img-row"><label class="sh-btn ghost">Add image<input id="sh-fimg" type="file" accept="image/*" hidden></label>${fl.img ? '<button class="sh-btn ghost" id="sh-fimgx">Remove image</button>' : ''}<small>Shows pixelated on the flag</small></div>` : ''}`;
    const ds = api.dinghySail(), dsl = ds.sail;
    const dinghyUI = `<h4>Sail colour · Dinghy Sailing Boat</h4>
      <div class="sh-sw-row"><div class="sh-sw">${ds.colours.map(c => `<button class="sh-swatch sh-dsw${dsl.c === c ? ' on' : ''}" style="background:${c}" data-c="${c}" aria-label="Sail ${c}"></button>`).join('')}</div></div>
      <div class="sh-img-row"><label class="sh-btn ghost">Add image<input id="sh-dimg" type="file" accept="image/*" hidden></label>${dsl.img ? '<button class="sh-btn ghost" id="sh-dimgx">Remove image</button>' : ''}<small>Shows pixelated on the mainsail</small></div>`;
    openSheet('Garage', `My fleet · ${boats.length} boats`, `
      ${boats.map(card).join('')}
      <div class="sh-msg" id="sh-fleet-msg" hidden></div>
      <div class="sh-stats"><div class="sh-stat"><b>${ECON.coins}</b><span>Coins</span></div><div class="sh-stat"><b>${lastStats.catchN}</b><span>Fish caught</span></div><div class="sh-stat"><b>${lastStats.distNm.toFixed(1)}</b><span>Nautical miles</span></div></div>
      ${collectionUI()}
      ${styleUI}
      ${flagUI}
      ${dinghyUI}`);
    sheetBody.querySelectorAll('.sh-pick').forEach(b => b.addEventListener('click', () => {
      const r = api.setBoat(b.dataset.boat);
      if (r === 'ok') { closeSheet(); paintFleet(); return; }
      const m = $('sh-fleet-msg'); m.hidden = false;
      m.textContent = r === 'nofuel' ? 'That boat has no fuel. Moor at Paradise Station (3.7 mi W, 1.1 mi S), then switch to it there and refuel at the Boathouse.' : 'Raise the anchor and stop fishing first (and wait while mooring).'; }));
    sheetBody.querySelectorAll('#sh-mode [data-mode]').forEach(b => b.addEventListener('click', () => { ss.set({ mode: b.dataset.mode }); openGarage(); }));
    sheetBody.querySelectorAll('.sh-swatch').forEach(b => b.addEventListener('click', () => { const c = [...st.c]; c[+b.dataset.row] = b.dataset.c; ss.set({ c }); openGarage(); }));
    $('sh-imgx')?.addEventListener('click', () => { ss.set({ img: null }); openGarage(); });
    sheetBody.querySelectorAll('.sh-dsw').forEach(b => b.addEventListener('click', () => { ds.set({ c: b.dataset.c }); openGarage(); }));
    $('sh-dimgx')?.addEventListener('click', () => { ds.set({ img: null }); openGarage(); });
    $('sh-dimg')?.addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = () => { const i = new Image(); i.onload = () => { const k = 48 / Math.max(i.width, i.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(i.width * k)); c.height = Math.max(1, Math.round(i.height * k));
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); ds.set({ img: c.toDataURL('image/png') }); openGarage(); }; i.src = rd.result; }; rd.readAsDataURL(f); });
    sheetBody.querySelectorAll('#sh-flag-on [data-on]').forEach(b => b.addEventListener('click', () => { yf.set({ on: b.dataset.on === '1' }); openGarage(); }));
    sheetBody.querySelectorAll('.sh-fsw').forEach(b => b.addEventListener('click', () => { yf.set({ c: b.dataset.c }); openGarage(); }));
    $('sh-fimgx')?.addEventListener('click', () => { yf.set({ img: null }); openGarage(); });
    $('sh-fimg')?.addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = () => { const i = new Image(); i.onload = () => { const k = 40 / Math.max(i.width, i.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(i.width * k)); c.height = Math.max(1, Math.round(i.height * k));
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); yf.set({ img: c.toDataURL('image/png') }); openGarage(); }; i.src = rd.result; }; rd.readAsDataURL(f); });
    $('sh-img').addEventListener('change', e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader();
      rd.onload = () => { const i = new Image(); i.onload = () => { const k = 48 / Math.max(i.width, i.height), c = document.createElement('canvas'); c.width = Math.max(1, Math.round(i.width * k)); c.height = Math.max(1, Math.round(i.height * k));
        c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); ss.set({ img: c.toDataURL('image/png') }); openGarage(); }; i.src = rd.result; }; rd.readAsDataURL(f); });
  };
  const paintFleet = () => { $('tb-fleet-n').textContent = api.boats().length; $('tb-fleet').setAttribute('aria-label', `My fleet: ${api.boats().length} boats`); };
  paintFleet();
  $('tb-fleet').addEventListener('click', openGarage);
  // search: places in Pune Paradise; picking one pins a course there
  const PLACES = [{ name: 'Harbour', sub: 'Where every voyage starts', x: 0, z: 0 }, { name: 'Paradise Station', sub: 'Fish Market · Boathouse · fuel', x: STATION.x, z: STATION.z }];
  const openSearch = () => {
    openSheet('Search', 'Find a place and sail there', '<input class="sh-input" id="sh-q" type="search" placeholder="Search places" autocomplete="off" spellcheck="false"><div id="sh-results" class="sheet-body"></div>');
    const q = $('sh-q'), res = $('sh-results');
    PLACES.length = 2; placeList().sort((a, b) => a.name.localeCompare(b.name)).forEach(p => PLACES.push({ name: p.name, sub: p.group ? `${p.group} Pune` : 'Pune', x: p.x, z: p.z }));
    const paint = () => { const term = q.value.trim().toLowerCase(), list = PLACES.filter(p => !term || p.name.toLowerCase().includes(term)).slice(0, term ? 40 : 12);
      res.innerHTML = list.length ? list.map((p, i) => `<button class="sh-row" data-i="${PLACES.indexOf(p)}"><div><b>${p.name}</b><br><small>${p.sub} · ${formatPosition(p.x, p.z)}</small></div><span class="go">${fmtMi(Math.hypot(p.x - lastStats.x, p.z - lastStats.z))} · Sail</span></button>`).join('') : '<div class="sh-msg">No places match that search.</div>'; };
    q.addEventListener('input', paint);
    // typing must not steer the boat (Escape still closes)
    q.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Escape') closeSheet(); }); q.addEventListener('keyup', e => e.stopPropagation()); paint(); q.focus();
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (!b) return; const p = PLACES[+b.dataset.i];
      if (Math.hypot(p.x - lastStats.x, p.z - lastStats.z) < 40) { closeSheet(); return; }
      if (api.pinCourse(p.x + (p === PLACES[1] ? 70 : 0), p.z + (p === PLACES[1] ? 80 : 0))) closeSheet(); });
  };
  $('tb-search').addEventListener('click', openSearch);
  // inbox
  const openInbox = () => openSheet('Inbox', 'Messages from the harbour', `
    <div class="sh-msg"><time>Today</time><b>Welcome aboard, ${esc(prefs.name)}!</b><br>Steer with the wheel, tap the water to set a course, and tap your tug to fish or drop anchor.</div>
    <div class="sh-msg"><time>Today</time><b>Paradise Station is open</b><br>Sell your catch at the Fish Market and refuel at the Boathouse, 3.7 mi W · 1.1 mi S. Use Search to sail there.</div>`);
  $('tb-inbox').addEventListener('click', openInbox);
  // add friends: share an invite link carrying your captain code
  const openFriends = () => {
    let dev = ''; try { dev = localStorage.getItem('sailo:device') || ''; } catch { /* storage blocked */ }
    const code = (dev.replace(/-/g, '').slice(0, 6) || 'SAILOR').toUpperCase(), link = `${location.origin}${location.pathname}?invite=${code}`;
    openSheet('Add friends', 'Invite a friend to sail Pune Paradise', `
      <div class="sh-msg">Share your invite link. Your friend opens it on their phone or computer and starts sailing.</div>
      <h4>Your captain code</h4><div class="sh-code">${code}</div>
      <button class="sh-btn" id="sh-share">${navigator.share ? 'Share invite link' : 'Copy invite link'}</button>
      ${navigator.share ? '<button class="sh-btn ghost" id="sh-copy">Copy link</button>' : ''}
      <h4>Friends</h4><div class="sh-msg">No friends yet. Once a friend joins with your link, you'll see them here.</div>`);
    const copyBtn = () => $('sh-copy') || $('sh-share');
    const copy = async () => { try { await navigator.clipboard.writeText(link); copyBtn().textContent = 'Link copied'; } catch { copyBtn().textContent = link; } };
    $('sh-copy')?.addEventListener('click', copy);
    $('sh-share').addEventListener('click', async () => { if (navigator.share) { try { await navigator.share({ title: 'Sail with me in Pune Paradise', text: `Join me on the water! Captain code ${code}`, url: link }); } catch { /* cancelled */ } } else copy(); });
  };
  const lastStats = { catchN: 0, distNm: 0, topKn: 0, x: 0, z: 0 };

  // ---- per-frame readouts ----
  const needle = document.querySelector('#dk-compass .needle');
  const spd = $('spd'), gear = $('gear'), arc = $('joy-speed');
  const stCatch = $('st-catch'), stDist = $('st-dist'), stTop = $('st-top'), rankEl = $('acct-rank'), lvl = $('you-lvl');
  const locPos = $('loc-pos'), warn = $('edge-warn');
  let last = { kn: -1, gear: '', c: -1, d: '', top: -1, az: 1e9, pos: '', warn: '' };
  return {
    paint,
    openGarage, openFriends, openProfile: () => setOpen(true),
    update({ x, z, heading, dest, edge, az, kn, gearName, catchN, distNm, topKn }) {
      lastStats.catchN = catchN; lastStats.distNm = distNm; lastStats.topKn = topKn; lastStats.x = x; lastStats.z = z;
      const pos = formatPosition(x, z);
      if (mapOpen) drawMap(x, z, heading, dest, pos);
      if (pos !== last.pos) { locPos.textContent = pos; last.pos = pos; }
      const w = edge < 1 ? `You've reached the edge of ${WORLD.name}` : edge < WORLD.warn ? `Leaving ${WORLD.name} · ${Math.round(edge)} m to the edge` : '';
      if (w !== last.warn) { warn.textContent = w || warn.textContent; warn.classList.toggle('show', !!w); last.warn = w; }
      const deg = Math.round(az * 180 / Math.PI);
      if (deg !== last.az) { needle.style.transform = `rotate(${deg}deg)`; last.az = deg; }
      const k = Math.round(Math.abs(kn) * 10) / 10;
      if (k !== last.kn) { spd.textContent = k.toFixed(1); arc.style.strokeDasharray = `${Math.min(100, Math.abs(kn) / 12 * 100)} 100`; last.kn = k; }
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
