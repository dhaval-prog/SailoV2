// HUD wiring: account/settings panel (top right), camera dock (bottom right)
// and the per-frame readouts (compass, speed, stats). The scene hands in
// callbacks; this module only touches the DOM.

import { WORLD, formatPosition } from './world.js';
import { PLACE, clock, fetchWeather, isNight } from './live.js';

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
  const H = WORLD.half, u = WORLD.side / 100; // u = 1% of the map, for sizing marks
  const NS = 'http://www.w3.org/2000/svg';
  const el = (tag, attrs, parent = mapSvg) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent.appendChild(n); return n; };
  mapSvg.setAttribute('viewBox', `${-H - u * 4} ${-H - u * 4} ${WORLD.side + u * 8} ${WORLD.side + u * 8}`);
  { const d = el('defs', {}); const g = el('radialGradient', { id: 'map-sea', cx: '50%', cy: '45%', r: '75%' }, d);
    el('stop', { offset: '0', 'stop-color': '#4cc6f2' }, g); el('stop', { offset: '1', 'stop-color': '#1a78c9' }, g); }
  el('rect', { x: -H, y: -H, width: WORLD.side, height: WORLD.side, rx: u * 3, fill: 'url(#map-sea)' });
  { let d = ''; for (let m = WORLD.mile; m < H; m += WORLD.mile) d += `M${m} ${-H}V${H}M${-m} ${-H}V${H}M${-H} ${m}H${H}M${-H} ${-m}H${H}`;
    el('path', { d, class: 'map-grid', 'stroke-width': u * 0.18 });
    el('path', { d: `M0 ${-H}V${H}M${-H} 0H${H}`, class: 'map-axis', 'stroke-width': u * 0.3 }); }
  el('rect', { x: -H, y: -H, width: WORLD.side, height: WORLD.side, rx: u * 3, class: 'map-edge', 'stroke-width': u * 0.6 });
  // harbour at the centre
  el('circle', { cx: 0, cy: 0, r: u * 1.6, class: 'map-harbour', 'stroke-width': u * 0.45 });
  el('text', { x: 0, y: u * 5.2, class: 'map-label', 'font-size': u * 3.2 }).textContent = 'Harbour';
  // compass rose and scale bar
  { const g = el('g', { transform: `translate(${H - u * 8} ${-H + u * 9})` });
    el('path', { d: `M0 ${-u * 5}L${u * 1.8} 0L0 ${-u}L${-u * 1.8} 0Z`, class: 'map-north' }, g);
    el('text', { x: 0, y: u * 3.6, class: 'map-label', 'font-size': u * 3.2 }, g).textContent = 'N'; }
  { const g = el('g', { transform: `translate(${-H + u * 5} ${H - u * 5})` });
    el('path', { d: `M0 ${-u}V0H${WORLD.mile * 2}V${-u}`, class: 'map-scale', 'stroke-width': u * 0.4 }, g);
    el('text', { x: WORLD.mile, y: -u * 2, class: 'map-label', 'font-size': u * 2.8 }, g).textContent = '2 mi'; }
  // hover preview, pinned course (marching, blinking dots) and pin marker
  const ghost = el('circle', { r: u * 1.4, class: 'map-ghost', 'stroke-width': u * 0.35, visibility: 'hidden' });
  const destLine = el('line', { class: 'map-route', 'stroke-width': u * 0.55, 'stroke-dasharray': `${u * 0.2} ${u * 1.1}`, 'stroke-linecap': 'round', visibility: 'hidden' });
  el('animate', { attributeName: 'stroke-dashoffset', from: 0, to: -u * 1.3 * 2, dur: '0.9s', repeatCount: 'indefinite' }, destLine);
  el('animate', { attributeName: 'opacity', values: '1;0.3;1', dur: '1.1s', repeatCount: 'indefinite' }, destLine);
  const destM = el('g', { class: 'map-dest', visibility: 'hidden' });
  el('circle', { r: u * 2.6, class: 'map-dest-ring', 'stroke-width': u * 0.3 }, destM);
  el('path', { d: `M0 0C${-u * 0.6} ${-u * 1.6} ${-u * 2} ${-u * 2.6} ${-u * 2} ${-u * 4.2}A${u * 2} ${u * 2} 0 1 1 ${u * 2} ${-u * 4.2}C${u * 2} ${-u * 2.6} ${u * 0.6} ${-u * 1.6} 0 0Z`, class: 'map-pin', 'stroke-width': u * 0.35 }, destM);
  el('circle', { cy: -u * 4.2, r: u * 0.75, class: 'map-pin-dot' }, destM);
  const boatM = el('g', { class: 'map-boat' });
  el('circle', { r: u * 4, class: 'map-pulse' }, boatM);
  const boatArrow = el('path', { d: `M${u * 3} 0L${-u * 2} ${u * 2.2}L${-u * 1} 0L${-u * 2} ${-u * 2.2}Z`, 'stroke-width': u * 0.4 }, boatM);
  const mapPos = $('map-pos');
  let mapOpen = false, lastFocus = null;
  const setMap = open => {
    if (open === mapOpen) return; mapOpen = open;
    if (open) { lastFocus = document.activeElement; mapEl.hidden = false; requestAnimationFrame(() => mapEl.classList.add('open')); $('map-close').focus(); }
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
  mapSvg.addEventListener('pointermove', e => { const w = toWorld(e); if (w) showTip(e, w, formatPosition(w.x, w.y)); else hideTip(); });
  mapSvg.addEventListener('pointerleave', hideTip);
  mapSvg.addEventListener('click', e => {
    const w = toWorld(e); if (!w) return;
    if (api.pinCourse(w.x, w.y)) { showTip(e, w, `Pinned · ${formatPosition(w.x, w.y)}`); if (navigator.vibrate) navigator.vibrate(10); }
    else showTip(e, w, 'Raise the anchor first');
  });
  $('map-unpin').addEventListener('click', () => api.clearCourse());
  const pinRow = $('map-pin-row'), pinPos = $('map-pin'), pinDist = $('map-pin-d');
  mapEl.addEventListener('click', e => { if (e.target === mapEl) setMap(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && mapOpen) setMap(false); });
  const drawMap = (x, z, heading, dest, pos) => {
    boatM.setAttribute('transform', `translate(${x} ${z})`);
    boatArrow.setAttribute('transform', `rotate(${-heading * 180 / Math.PI})`);
    const vis = dest ? 'visible' : 'hidden'; destM.setAttribute('visibility', vis); destLine.setAttribute('visibility', vis);
    if (dest) { destM.setAttribute('transform', `translate(${dest.x} ${dest.z})`); destLine.setAttribute('x1', x); destLine.setAttribute('y1', z); destLine.setAttribute('x2', dest.x); destLine.setAttribute('y2', dest.z);
      pinPos.textContent = formatPosition(dest.x, dest.z); pinDist.textContent = `${(Math.hypot(dest.x - x, dest.z - z) / WORLD.mile).toFixed(1)} mi to go`; }
    pinRow.hidden = !dest; help.hidden = !!dest;
    mapPos.textContent = pos;
  };

  // ---- per-frame readouts ----
  const needle = document.querySelector('#dk-compass .needle');
  const spd = $('spd'), gear = $('gear'), arc = $('joy-speed');
  const stCatch = $('st-catch'), stDist = $('st-dist'), stTop = $('st-top'), rankEl = $('acct-rank'), lvl = $('you-lvl');
  const locPos = $('loc-pos'), warn = $('edge-warn');
  let last = { kn: -1, gear: '', c: -1, d: '', top: -1, az: 1e9, pos: '', warn: '' };
  return {
    paint,
    update({ x, z, heading, dest, edge, az, kn, gearName, catchN, distNm, topKn }) {
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
