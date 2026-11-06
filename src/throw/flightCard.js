// The moment after a throw: a small sea chart of the two cities (Sailo's Sea Charts look), the paper plane flying a dotted
// gold arc from yours to theirs while the miles count up, then a red postmark thumps on, "Delivered · Mumbai · 75 mi",
// and the streak flame pops +1 when the throw kept it going. Tap anywhere to skip to the end.
import { h } from './ui.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 300, H = 170; // the chart's viewBox
const sm = x => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const svgEl = (tag, attrs = {}, parent) => { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); parent?.appendChild(n); return n; };
let landP = null;
const loadLand = () => (landP ||= Promise.all([import('topojson-client'), import('world-atlas/land-50m.json')])
  .then(([tj, topo]) => { const t = topo.default || topo, f = tj.feature(t, t.objects.land); return (f.features || [f]).flatMap(g => g.geometry.type === 'Polygon' ? [g.geometry.coordinates] : g.geometry.coordinates); })
  .catch(() => []));
/** Starts loading the coastline early (at the throw), so the chart is ready when the plane takes off. */
export const prefetchFlightMap = () => { loadLand(); };

/** opts: from, to ({ latitude, longitude, city }), name, miles, streakBefore, streakNow(): number, night.
 *  Returns { el, done } — done resolves once it has played (or was tapped) and faded out. */
export function flightCard({ from, to, name, miles = 0, streakBefore = 0, streakNow, night }) {
  const first = (name || 'them').trim().split(/\s+/)[0], toCity = to?.city || '', fromCity = from?.city || '';
  const hasRoute = !!(from && to && miles >= 0.5);
  const chart = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 't-fc-chart', 'aria-hidden': 'true' });
  const counter = h('div.t-fc-miles', '0 mi');
  const stamp = h('div.t-fc-stamp', h('span.t-fc-stamp-a', 'Delivered'), h('span.t-fc-stamp-b', (toCity || first).toUpperCase()),
    h('span.t-fc-stamp-c', `${hasRoute ? `${Math.round(miles).toLocaleString('en')} MI · ` : ''}${new Date().toLocaleDateString('en', { day: 'numeric', month: 'short' }).toUpperCase()}`));
  const streak = h('div.t-fc-streak');
  const card = h('div.t-fc-card', { role: 'status', 'aria-live': 'polite', 'aria-label': `Letter to ${first} delivered${toCity ? ' in ' + toCity : ''}` },
    h('div.t-fc-head', h('div.t-fc-title', `To ${first}`), h('div.t-fc-sub', hasRoute ? `${fromCity} → ${toCity}` : toCity || 'Sent')),
    hasRoute ? h('div.t-fc-map', chart, counter) : null, stamp, streak);
  const el = h('div.t-fc' + (night ? '.night' : ''), card);

  // ---- the chart: both cities framed, cream land on a teal sea, a 1° grid ----
  let A = null, B = null, arc = null, plane = null, L = 1; const mapBox = card.querySelector('.t-fc-map');
  const draw = polys => {
    const lat0 = (from.latitude + to.latitude) / 2, c = Math.cos(lat0 * Math.PI / 180), lng0 = (from.longitude + to.longitude) / 2;
    const dx = Math.abs(from.longitude - to.longitude) * c, dy = Math.abs(from.latitude - to.latitude);
    const span = Math.max(2.5, dx * 1.7, dy * 1.7 * W / H), k = W / span; // (map units per degree)
    const P = (lng, lat) => [W / 2 + (lng - lng0) * c * k, H / 2 - (lat - lat0) * k];
    const defs = svgEl('defs', {}, chart), g = svgEl('radialGradient', { id: 't-fc-sea', cx: '50%', cy: '45%', r: '75%' }, defs);
    svgEl('stop', { offset: '0', class: 't-fc-sea1' }, g); svgEl('stop', { offset: '1', class: 't-fc-sea2' }, g);
    svgEl('rect', { width: W, height: H, fill: 'url(#t-fc-sea)' }, chart);
    const step = span > 40 ? 10 : span > 12 ? 5 : 1; let gd = '';
    for (let lng = Math.ceil((lng0 - span / c) / step) * step; lng < lng0 + span / c; lng += step) { const x = P(lng, lat0)[0]; gd += `M${x.toFixed(1)} 0V${H}`; }
    for (let lat = Math.ceil((lat0 - span) / step) * step; lat < lat0 + span; lat += step) { const y = P(lng0, lat)[1]; gd += `M0 ${y.toFixed(1)}H${W}`; }
    svgEl('path', { d: gd, class: 't-fc-grid' }, chart);
    // only the coastlines near the view (the rest of the world is skipped)
    const lo = lng0 - span / c * 0.8, hi = lng0 + span / c * 0.8, bo = lat0 - span * 0.8, to2 = lat0 + span * 0.8; let ld = '';
    for (const poly of polys) { const ring = poly[0]; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9; for (const [a, b] of ring) { if (a < x0) x0 = a; if (a > x1) x1 = a; if (b < y0) y0 = b; if (b > y1) y1 = b; }
      if (x1 < lo || x0 > hi || y1 < bo || y0 > to2) continue;
      for (const r of poly) ld += r.map(([a, b], i) => { const [x, y] = P(a, b); return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1); }).join('') + 'Z'; }
    svgEl('path', { d: ld, class: 't-fc-land' }, chart);
    // the route: a dotted gold arc bowing upward, revealed as the plane flies it
    A = P(from.longitude, from.latitude); B = P(to.longitude, to.latitude);
    const mx = (A[0] + B[0]) / 2, my = (A[1] + B[1]) / 2, len = Math.hypot(B[0] - A[0], B[1] - A[1]); let nx = -(B[1] - A[1]) / len, ny = (B[0] - A[0]) / len; if (ny > 0) { nx = -nx; ny = -ny; }
    const d = `M${A[0].toFixed(1)} ${A[1].toFixed(1)}Q${(mx + nx * len * 0.3).toFixed(1)} ${(my + ny * len * 0.3).toFixed(1)} ${B[0].toFixed(1)} ${B[1].toFixed(1)}`;
    const mask = svgEl('mask', { id: 't-fc-reveal' }, defs); arc = svgEl('path', { d, class: 't-fc-mask' }, mask);
    svgEl('path', { d, class: 't-fc-arc', mask: 'url(#t-fc-reveal)' }, chart); L = arc.getTotalLength?.() || len * 1.1;
    arc.style.strokeDasharray = `${L}`; arc.style.strokeDashoffset = `${L}`;
    const dot = (p, cls) => svgEl('circle', { cx: p[0], cy: p[1], r: 5, class: cls }, chart); dot(A, 't-fc-from'); dot(B, 't-fc-to');
    const tag = (p, text, cls) => { const g2 = svgEl('g', { transform: `translate(${p[0]} ${p[1]})`, class: 't-fc-tag ' + cls }, chart); const w = text.length * 6 + 16, below = p[1] < H - 32;
      svgEl('rect', { x: -w / 2, y: below ? 9 : -31, width: w, height: 20, rx: 10 }, g2); svgEl('text', { y: below ? 23 : -17 }, g2).textContent = text; };
    if (fromCity) tag(A, fromCity, 'from'); if (toCity) tag(B, toCity, 'to');
    plane = svgEl('g', { class: 't-fc-plane' }, chart); svgEl('path', { d: 'M9 0L-7 -6L-4 0L-7 6Z M-4 0L-1 2' }, plane);
    placePlane(0);
  };
  const placePlane = e => { if (!arc || !plane) return; const at = Math.max(0.001, Math.min(L - 0.001, e * L)), p = arc.getPointAtLength(at), q = arc.getPointAtLength(Math.min(L, at + 1));
    plane.setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${(Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI).toFixed(1)})`);
    arc.style.strokeDashoffset = `${(L * (1 - e)).toFixed(1)}`; };

  // ---- the timeline ----
  const FLY = hasRoute ? 2200 : 0, STAMP = FLY + 250, END = STAMP + (streakNow ? 1900 : 1500);
  let t0 = 0, stamped = false, streaked = false, finished = false, raf = 0, resolve;
  const done = new Promise(r => { resolve = r; });
  const doStamp = () => { if (stamped) return; stamped = true;
    if (B && mapBox) { // stamped right where the plane landed (kept inside the card)
      const x = mapBox.offsetLeft + B[0] / W * mapBox.offsetWidth, y = mapBox.offsetTop + B[1] / H * mapBox.offsetHeight, cw = card.offsetWidth;
      Object.assign(stamp.style, { left: `${Math.max(56, Math.min(cw - 56, x))}px`, top: `${Math.max(56, y)}px`, right: 'auto', bottom: 'auto', margin: '-56px 0 0 -56px' }); }
    stamp.classList.add('on'); card.classList.add('thump'); try { navigator.vibrate?.(18); } catch { /* not allowed */ } };
  const doStreak = () => { if (streaked) return; streaked = true; const now = streakNow?.() ?? 0; if (now > streakBefore) { streak.replaceChildren(h('span.t-fc-flame', '🔥'), h('b', `${now} day${now === 1 ? '' : 's'}`), h('span.t-fc-plus', '+1')); streak.classList.add('on'); } };
  const finish = () => { if (finished) return; finished = true; cancelAnimationFrame(raf); el.classList.remove('in'); setTimeout(() => { el.remove(); resolve(); }, 320); };
  const frame = now => { if (!t0) t0 = now; const t = now - t0;
    if (hasRoute) { const e = sm(t / FLY); placePlane(e); counter.textContent = `${Math.round(miles * e).toLocaleString('en')} mi`; }
    if (t >= STAMP) doStamp(); if (t >= STAMP + 450) doStreak(); if (t >= END) { finish(); return; }
    raf = requestAnimationFrame(frame); };
  el.addEventListener('click', () => { if (hasRoute) { placePlane(1); counter.textContent = `${Math.round(miles).toLocaleString('en')} mi`; } doStamp(); doStreak(); setTimeout(finish, 500); });
  requestAnimationFrame(() => el.classList.add('in'));
  (hasRoute ? Promise.race([loadLand(), new Promise(r => setTimeout(() => r([]), 900))]).then(polys => { draw(polys); }) : Promise.resolve())
    .then(() => { raf = requestAnimationFrame(frame); });
  return { el, done };
}
