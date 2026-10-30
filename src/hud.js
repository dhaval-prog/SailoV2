// HUD wiring: account/settings panel (top right), camera dock (bottom right)
// and the per-frame readouts (compass, speed, stats). The scene hands in
// callbacks; this module only touches the DOM.

import { WORLD, formatPosition } from './world.js';
import { PLACE, clock, fetchWeather, isNight } from './live.js';
import { STATION, STATIONS, S as ECON, FISH, REGION, localOdds, fishWhere } from './station.js';
import { currentSession, signOut } from './auth.js';
import { beforeSignOut, lastSaved } from './cloud.js';
import { regionList, placeList, poiList, ensure, zoneAt, onChange, groupLabel } from './geo.js';
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
    tod.classList.toggle('night', st.night);
    tod.querySelectorAll('[data-t]').forEach(b => b.setAttribute('aria-checked', String((b.dataset.t === 'night') === st.night)));
    document.querySelectorAll('.wx').forEach(b => b.setAttribute('aria-checked', String(b.dataset.w === st.w)));
    document.querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === st.view)); // (on phones they orbit the wheel, outside the dock)
    document.body.classList.toggle('view-top', st.view === 'top');
  };
  // picking a time of day or weather by hand switches live mode off
  tod.querySelectorAll('[data-t]').forEach(b => b.addEventListener('click', () => { prefs.night = b.dataset.t === 'night'; setLive(false); api.setNight(prefs.night); save(prefs); paint(); }));
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
    if (wx) api.setWeather(wx.preset);
    paint();
  };
  function setLive(on) {
    prefs.live = on; liveSw.setAttribute('aria-checked', String(on)); document.body.classList.toggle('live', on); save(prefs);
    if (on) applyLive();
  }
  liveSw.addEventListener('click', () => { setLive(!prefs.live); if (!prefs.live) { api.setNight(prefs.night); api.setWeather(prefs.w); paint(); } });
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
  api.setNight(prefs.night);
  api.setWeather(prefs.w);
  setLive(prefs.live);
  paint();
  tick(); setInterval(tick, 10000);
  refreshWx(); setInterval(refreshWx, 10 * 60 * 1000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { tick(); refreshWx(); } });

  // ---- map (compass button): the whole ocean, the boat, and click-to-pin a course ----
  const mapEl = $('map'), mapSvg = $('map-svg');
  // the active city's names everywhere the page mentions it
  $('map-title').textContent = WORLD.name; $('map-sub').textContent = `${WORLD.areaSqMi} sq mi of open ocean · ${WORLD.city}'s real localities`;
  document.querySelector('#loc .loc-text b').textContent = WORLD.name; document.querySelector('#welcome b').textContent = WORLD.name;
  if ($('welcome-sub')) $('welcome-sub').textContent = `${WORLD.areaSqMi} square miles of ${WORLD.city}, turned into open ocean`;
  { const r = document.querySelector('.rank'); if (r?.lastChild?.nodeType === 3) r.lastChild.textContent = ` Lighthouse Tug · ${WORLD.name}`; }
  { const l = document.querySelector('.live-sub'); if (l) l.textContent = `Follows the real sky over ${WORLD.city}`; }
  document.title = `Sailo · ${WORLD.name}`;
  // change city: pick another and the page reloads into it (your spot in each city is remembered)
  // the world map: every city chart; fly to one (coins) to sail it. Your spot in each city is remembered.
  let worldOpen = false;
  const openWorld = async () => { if (worldOpen) return; worldOpen = true; setMap(false); const { openWorldMap } = await import('./worldmap.js');
    const wm = openWorldMap({ current: CHART, coins: () => api.coins(), settled: () => api.settled?.(), travel: (c, fare) => { if (!api.spend(fare, 'sea-plane')) return false; setChart(c); return true; } });
    const t = setInterval(() => { if (!document.querySelector('.wm')) { clearInterval(t); worldOpen = false; } }, 500); void wm; };
  $('map-change').addEventListener('click', openWorld);
  $('tb-world')?.addEventListener('click', openWorld);
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
  // rocks met so far (terrain.js), faint, so a route through the channels can be planned
  const rocksG = el('g', { class: 'map-rocks' }); let rocksDrawn = 0;
  const paintRocks = () => { const all = api.rocks?.() || []; if (all.length === rocksDrawn) return; rocksDrawn = all.length; rocksG.innerHTML = '';
    all.forEach(r => el('circle', { cx: r.x.toFixed(0), cy: r.z.toFixed(0), r: Math.max(r.r, 9).toFixed(0), class: 'map-rock' }, rocksG)); };
  // harbour at the centre
  { const g = el('g', { class: 'map-mark', 'data-x': 0, 'data-y': 0 });
    el('circle', { cx: 0, cy: 0, r: u * 1.6, class: 'map-harbour', 'stroke-width': u * 0.45 }, g);
    el('text', { x: 0, y: u * 5.2, class: 'map-label', 'font-size': u * 3.2 }, g).textContent = 'Harbour'; }
  // Paradise Stations: the home port, and one in every major neighbourhood (more arrive as other cities' maps load)
  const drawn = new Set(), drawStation = st => { if (drawn.has(st.id)) return; drawn.add(st.id); const home = st.id === 'home';
    const g = el('g', { transform: `translate(${st.x} ${st.z})`, class: 'map-station map-mark' + (home ? '' : ' map-station-n'), 'data-x': st.x, 'data-y': st.z });
    el('ellipse', { rx: u * 2.4, ry: u * 1.8, class: 'map-island', 'stroke-width': u * 0.4 }, g);
    el('path', { d: `M${-u * 0.3} ${u * 0.6}Q${-u * 0.2} ${-u * 0.6} ${u * 0.4} ${-u * 1.4}M${u * 0.4} ${-u * 1.4}q${-u * 1.4} ${-u * 0.1} ${-u * 1.8} ${u * 0.6}M${u * 0.4} ${-u * 1.4}q${u * 1.4} ${-u * 0.1} ${u * 1.8} ${u * 0.6}`, class: 'map-palm', 'stroke-width': u * 0.45 }, g);
    if (home) el('text', { x: 0, y: u * 5.4, class: 'map-label', 'font-size': u * 3 }, g).textContent = 'Paradise Station';
    if (home && st.at) el('text', { x: 0, y: u * 8.4, class: 'map-label map-label-sub', 'font-size': u * 2.3 }, g).textContent = `at ${st.at}`; }; // (a neighbourhood's station sits on its name)
  STATIONS.forEach(drawStation); addEventListener('sailo:stations', () => STATIONS.forEach(drawStation));
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
  // everyone else out on the water: local sailors and real captains online (setOthers)
  const othersG = el('g', { class: 'map-others' }), others = new Map(); let othersFn = null, othersPick = null, othersT = 0;
  // SOS calls (radio-help.js): pulsing red markers with expanding rings
  const sosG = el('g', { class: 'map-sos-g' }), sosM = new Map(); let sosFn = null, sosPick = null;
  const paintSOS = () => { const list = sosFn ? sosFn() : [], ids = new Set(), k = view.w / V0;
    list.forEach(s => { ids.add(s.id); let g = sosM.get(s.id);
      if (!g) { g = el('g', { class: `map-sos${s.mine ? ' mine' : ''}`, 'data-id': s.id }, sosG);
        [0, 1].forEach(i => { const c = el('circle', { r: u * 1.6, class: 'map-sos-wave', 'stroke-width': u * 0.4 }, g);
          el('animate', { attributeName: 'r', from: u * 1.6, to: u * 7, dur: '2s', begin: `${i}s`, repeatCount: 'indefinite' }, c); el('animate', { attributeName: 'opacity', from: 0.9, to: 0, dur: '2s', begin: `${i}s`, repeatCount: 'indefinite' }, c); });
        el('circle', { r: u * 1.7, class: 'map-sos-dot', 'stroke-width': u * 0.4 }, g);
        el('text', { y: u * 0.95, class: 'map-sos-x', 'font-size': u * 2 }, g).textContent = '!';
        el('text', { y: -u * 3.4, class: 'map-sos-t', 'font-size': u * 2.6 }, g).textContent = s.mine ? 'Your SOS' : `SOS · ${s.name.split(' ')[0]}`;
        sosM.set(s.id, g); }
      g.setAttribute('transform', `translate(${s.x} ${s.z}) scale(${k})`); });
    sosM.forEach((g, id) => { if (!ids.has(id)) { g.remove(); sosM.delete(id); } }); };
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
    scaleT.textContent = len < 500 ? `${len} m` : len === WORLD.mile / 2 ? '½ mi' : len === 500 ? '500 m' : `${+(len / WORLD.mile).toFixed(1)} mi`;
    $('map-zoom-l').textContent = ['', WORLD.city, 'Neighbourhoods', 'Localities', 'Streets & places'][mapLevel()];
    placeMarks(); geoDirty = true;
    ensure(x0, y0, x0 + view.w, y0 + view.w, mapLevel() === 4);
  };
  const zoomAt = (f, wx = view.cx, wz = view.cz) => { const w0 = view.w; view.w = Math.min(V0, Math.max(VMIN, view.w * f)); const r = view.w / w0; view.cx = wx + (view.cx - wx) * r; view.cz = wz + (view.cz - wz) * r; applyView(); };
  // the boat and the pin keep their on-screen size at any zoom
  const placeOthers = () => { const k = view.w / V0, named = mapLevel() >= 2; others.forEach(o => { o.g.setAttribute('transform', `translate(${o.x} ${o.z}) scale(${k})`); o.a.setAttribute('transform', `rotate(${-o.yaw * 180 / Math.PI})`); o.t.setAttribute('visibility', named || o.live ? 'visible' : 'hidden'); }); };
  const paintOthers = () => {
    const list = othersFn ? othersFn() : [], ids = new Set();
    list.forEach(p => { ids.add(p.c.id); let o = others.get(p.c.id);
      if (!o) { const g = el('g', { class: `map-other${p.c.live ? ' live' : ''}`, 'data-id': p.c.id }, othersG);
        if (p.c.live) el('circle', { r: u * 2.9, class: 'map-other-ring', 'stroke-width': u * 0.4 }, g);
        const a = el('path', { d: `M${u * 2.2} 0L${-u * 1.5} ${u * 1.6}L${-u * 0.7} 0L${-u * 1.5} ${-u * 1.6}Z`, 'stroke-width': u * 0.35, fill: p.c.colours.sail || p.c.colours.hull || p.c.colours.flag || '#ffffff' }, g);
        const t = el('text', { y: -u * 3.4, class: 'map-other-t', 'font-size': u * 2.6 }, g); t.textContent = p.c.name.split(' ')[0];
        o = { g, a, t, live: !!p.c.live }; others.set(p.c.id, o); }
      Object.assign(o, { c: p.c, x: p.x, z: p.z, yaw: p.yaw || 0, status: p.status }); });
    others.forEach((o, id) => { if (!ids.has(id)) { o.g.remove(); others.delete(id); } });
    placeOthers();
    const live = list.filter(p => p.c.live).length, cpu = list.length - live, row = $('map-others-row');
    if (row) { row.hidden = !list.length; $('map-others').textContent = [cpu ? `${cpu} local sailor${cpu === 1 ? '' : 's'} out` : '', live ? `${live} captain${live === 1 ? '' : 's'} online` : ''].filter(Boolean).join(' · '); }
  };
  const placeMarks = () => { placeOthers(); const k = view.w / V0; boatM.setAttribute('transform', `translate(${boatXY[0]} ${boatXY[1]}) scale(${k})`); if (destXY) destM.setAttribute('transform', `translate(${destXY[0]} ${destXY[1]}) scale(${k})`); };
  // place names, sized in screen pixels, drawn most important first and never overlapping
  const PRI = { region: 0, major: 1, minor: 2, road: 3, poi: 3, society: 4 }, SIZE = [15, 12.5, 10.5, 10, 9.5];
  const CATC = { food: '#ffb870', hotel: '#c9a7ff', mall: '#ff8fc7', fuel: '#ffd36b', health: '#ff8a8a', school: '#8fd0ff', park: '#7ff0c8', road: '#e9f1ff', society: '#bfefff' };
  const paintGeo = () => {
    geoDirty = false; geoG.replaceChildren(); if (!mapOpen) return;
    const L = mapLevel(), px = mapSvg.getBoundingClientRect().width / view.w || 0.02, x0 = view.cx - view.w / 2, y0 = view.cz - view.w / 2;
    const list = L === 1 ? regionList() : [...placeList().filter(p => p.kind === 'major' || L >= 3), ...(L === 4 ? poiList() : [])];
    const items = list.filter(p => p.x > x0 && p.x < x0 + view.w && p.z > y0 && p.z < y0 + view.w).sort((a, b) => PRI[a.kind] - PRI[b.kind]);
    const S = view.w * px; // map size in pixels; keep names clear of the boat, the zoom buttons, the scale bar and the north arrow
    const taken = [[(boatXY[0] - x0) * px - 16, (boatXY[1] - y0) * px - 16, (boatXY[0] - x0) * px + 16, (boatXY[1] - y0) * px + 16], [S - 210, S - 50, S, S], [0, S - 42, 110, S], [S - 50, 0, S, 70], [0, 0, 56, 56]];
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
  $('map-zin').addEventListener('click', () => zoomAt(0.5)); $('map-zout').addEventListener('click', () => { if (view.w >= V0 - 1) openWorld(); else zoomAt(2); });
  $('map-zboat').addEventListener('click', () => { view.cx = boatXY[0]; view.cz = boatXY[1]; zoomAt(Math.min(1, 6000 / view.w)); });
  let mapOpen = false, lastFocus = null;
  const setMap = open => {
    if (open === mapOpen) return; mapOpen = open;
    if (open) { paintRocks(); lastFocus = document.activeElement; mapEl.hidden = false; requestAnimationFrame(() => { mapEl.classList.add('open'); applyView(); }); $('map-close').focus(); }
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
  const otherAt = e => others.get(e.target.closest?.('.map-other')?.dataset.id);
  mapSvg.addEventListener('pointermove', e => { if (drag && dragged) { hideTip(); return; } const o = otherAt(e), w = toWorld(e);
    if (o && w) showTip(e, w, `${o.c.name} · ${o.status}`); else if (w) showTip(e, w, tipText(w)); else hideTip(); });
  mapSvg.addEventListener('pointerleave', hideTip);
  mapSvg.addEventListener('click', e => {
    if (dragged) { dragged = false; return; } // a pan is not a pin
    const sg = e.target.closest?.('.map-sos'); if (sg && sosPick) { setMap(false); sosPick(sg.dataset.id); return; } // an SOS: its card
    const o = otherAt(e); if (o && othersPick) { setMap(false); othersPick(o.c); return; } // a boat: their card
    const w = toWorld(e); if (!w) return;
    if (api.pinCourse(w.x, w.y)) { showTip(e, w, `Pinned · ${tipText(w)}`); if (navigator.vibrate) navigator.vibrate(10); }
    else showTip(e, w, 'Raise the anchor first');
  });
  $('map-unpin').addEventListener('click', () => api.clearCourse());
  const pinRow = $('map-pin-row'), pinPos = $('map-pin'), pinDist = $('map-pin-d');
  mapEl.addEventListener('click', e => { if (e.target === mapEl) setMap(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && mapOpen) setMap(false); });
  const drawMap = (x, z, heading, dest, pos) => {
    boatXY = [x, z]; destXY = dest ? [dest.x, dest.z] : null;
    if (performance.now() > othersT) { othersT = performance.now() + 250; paintOthers(); paintSOS(); }
    placeMarks();
    boatArrow.setAttribute('transform', `rotate(${-heading * 180 / Math.PI})`);
    const vis = dest ? 'visible' : 'hidden'; destM.setAttribute('visibility', vis); destLine.setAttribute('visibility', vis);
    if (dest) { destLine.setAttribute('x1', x); destLine.setAttribute('y1', z); destLine.setAttribute('x2', dest.x); destLine.setAttribute('y2', dest.z);
      pinPos.textContent = formatPosition(dest.x, dest.z); pinDist.textContent = `${(Math.hypot(dest.x - x, dest.z - z) / WORLD.mile).toFixed(1)} mi to go`; }
    pinRow.hidden = !dest; help.hidden = !!dest;
    const zn = zoneAt(x, z), here = zn ? `${zn.name} · ${pos}` : pos; if (mapPos.textContent !== here) mapPos.textContent = here;
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
    /** SOS calls on the map: list() => [{ id, x, z, name, mine }]; pick(id) when one is tapped. */
    setSOS: (list, pick) => { sosFn = list; sosPick = pick; },
    update({ x, z, heading, dest, edge, az, kn, gearName, catchN, distNm, topKn }) {
      lastStats.catchN = catchN; lastStats.distNm = distNm; lastStats.topKn = topKn; lastStats.x = x; lastStats.z = z;
      const pos = formatPosition(x, z);
      if (mapOpen) drawMap(x, z, heading, dest, pos);
      if (pos !== last.pos) { locPos.textContent = pos; last.pos = pos; }
      const w = edge < 1 ? `You've reached the edge of ${WORLD.name}` : edge < WORLD.warn ? `Leaving ${WORLD.name} · ${Math.round(edge)} m to the edge` : '';
      if (w !== last.warn) { warn.textContent = w || warn.textContent; warn.classList.toggle('show', !!w); last.warn = w; }
      const deg = Math.round(az * 180 / Math.PI);
      if (deg !== last.az) { needle.style.transform = north.style.transform = `rotate(${deg}deg)`; last.az = deg; }
      const k = Math.round(Math.abs(kn) * 10) / 10;
      if (k !== last.kn) { spd.textContent = k.toFixed(1); arc.style.strokeDasharray = `${Math.min(100, Math.abs(kn) / 12 * 100)} 100`; last.kn = k; }
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
