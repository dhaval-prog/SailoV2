// HUD wiring: account/settings panel (top right), camera dock (bottom right)
// and the per-frame readouts (compass, speed, stats). The scene hands in
// callbacks; this module only touches the DOM.

import { WORLD, formatPosition } from './world.js';

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
  const prefs = { name: saved.name || 'Captain', night: !!saved.night, w: saved.w || 'clear' };

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
  tod.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { prefs.night = b.dataset.t === 'night'; api.setNight(prefs.night); save(prefs); paint(); }));
  document.querySelectorAll('.wx').forEach(b => b.addEventListener('click', () => { prefs.w = b.dataset.w; api.setWeather(prefs.w); save(prefs); paint(); }));
  document.querySelectorAll('[data-export]').forEach(b => b.addEventListener('click', () => api.exportModel(b.dataset.export)));
  if (matchMedia('(pointer: coarse)').matches) document.querySelector('.acct-panel .export').hidden = true;

  // ---- camera dock ----
  const dock = $('dock');
  dock.querySelectorAll('button').forEach(b => b.addEventListener('pointerdown', e => ripple(b, e)));
  dock.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', () => { api.setView(b.dataset.v); paint(); }));
  dock.querySelectorAll('[data-z]').forEach(b => b.addEventListener('click', () => api.zoomBy(b.dataset.z === 'in' ? 0.7 : 1.45)));
  $('dk-compass').addEventListener('click', () => api.faceNorth());
  const center = $('dk-center');
  center.addEventListener('click', () => { api.recenter(); center.classList.remove('pulse'); void center.offsetWidth; center.classList.add('pulse'); });
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

  // apply saved preferences
  api.setNight(prefs.night);
  api.setWeather(prefs.w);
  paint();

  // ---- map: tap the location chip to see the whole ocean and where the boat is ----
  const mapEl = $('map'), mapSvg = $('map-svg'), locBtn = $('loc');
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
  const destM = el('g', { class: 'map-dest', visibility: 'hidden' });
  el('circle', { r: u * 1.3, 'stroke-width': u * 0.4 }, destM);
  const destLine = el('line', { class: 'map-route', 'stroke-width': u * 0.4, 'stroke-dasharray': `${u} ${u}`, visibility: 'hidden' });
  mapSvg.insertBefore(destLine, destM);
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
  locBtn.addEventListener('click', () => setMap(true));
  $('map-close').addEventListener('click', () => setMap(false));
  mapEl.addEventListener('click', e => { if (e.target === mapEl) setMap(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && mapOpen) setMap(false); });
  const drawMap = (x, z, heading, dest, pos) => {
    boatM.setAttribute('transform', `translate(${x} ${z})`);
    boatArrow.setAttribute('transform', `rotate(${-heading * 180 / Math.PI})`);
    const vis = dest ? 'visible' : 'hidden'; destM.setAttribute('visibility', vis); destLine.setAttribute('visibility', vis);
    if (dest) { destM.setAttribute('transform', `translate(${dest.x} ${dest.z})`); destLine.setAttribute('x1', x); destLine.setAttribute('y1', z); destLine.setAttribute('x2', dest.x); destLine.setAttribute('y2', dest.z); }
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
