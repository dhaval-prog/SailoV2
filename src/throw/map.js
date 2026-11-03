// The real world map behind Throw (port of MySpace's ThrowMapImpl.web): Mapbox GL JS on the Standard style (3D buildings,
// day/night via its lightPreset), with sticker pins (avatar teardrop + name tag) drawn as DOM over the canvas and moved
// on every pan/zoom. The camera always jumps instantly (an animated pan interrupted by a second focus left it stranded).
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { h, avatar } from './ui.js';

// Sailo's public Mapbox token (VITE_MAPBOX_TOKEN, set at build time, the same one its sea labels use). Without one, Throw
// shows its glass backdrop instead of the map (see hasMapToken / home.js).
export const hasMapToken = !!import.meta.env.VITE_MAPBOX_TOKEN;
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN || '';
const STYLE = import.meta.env.VITE_MAPBOX_STYLE_URL || 'mapbox://styles/mapbox/standard';
const DEFAULT = { center: [73.939097, 18.520358], zoom: 16.26, bearing: -9.6, pitch: 76.5 };
const FOCUS_PADDING_BOTTOM = 100; // (puts the focused pin a little above the middle, clear of the ready plane)
const PIN = 40, PIN_SEL = 50, tipOffset = s => s * 1.207;

export function createThrowMap(container) {
  const canvasWrap = h('div.t-map-canvas'), pinLayer = h('div.t-pins');
  container.append(canvasWrap, pinLayer);
  const map = new mapboxgl.Map({ container: canvasWrap, style: STYLE, ...DEFAULT, attributionControl: false });
  map.addControl(new mapboxgl.AttributionControl({ compact: true }));
  let target = null, pins = [], isDay = true, ready = false;
  const reveal = () => { if (!ready) { ready = true; canvasWrap.classList.add('on'); } };
  const fallback = setTimeout(reveal, 2200);
  map.once('idle', () => { clearTimeout(fallback); reveal(); });
  const applyTarget = () => { if (!target) return;
    map.jumpTo({ center: [target.longitude, target.latitude], zoom: DEFAULT.zoom, pitch: DEFAULT.pitch, bearing: DEFAULT.bearing, padding: { top: 0, bottom: FOCUS_PADDING_BOTTOM, left: 0, right: 0 } }); };
  const applyLight = () => { try { map.setConfigProperty('basemap', 'lightPreset', isDay ? 'day' : 'night'); } catch { /* a style without the basemap import keeps its own default */ } };
  map.on('style.load', () => { try { map.style?.setTransition?.({ duration: 0, delay: 0 }); applyLight(); } catch (e) { console.error('[ThrowMap]', e); } place(); });
  map.on('move', () => place()); map.on('zoom', () => place());
  const ro = new ResizeObserver(() => { map.resize(); applyTarget(); place(); }); ro.observe(container);

  // ---- pins (MySpace's LocationPin: a teardrop with the avatar, an ink outline and hard shadow, and a name tag) ----
  let pinEls = new Map();
  function renderPins() {
    const keep = new Set();
    pins.forEach(p => { keep.add(p.id); let el = pinEls.get(p.id);
      const sig = `${p.selected}|${p.dimmed}|${p.label}|${p.avatarUrl}|${p.isSelf}|${!!p.onPress}`;
      if (!el || el.dataset.sig !== sig) { el?.remove(); el = buildPin(p); el.dataset.sig = sig; pinLayer.append(el); pinEls.set(p.id, el); }
      if (p.bounceKey && el.dataset.bounce !== String(p.bounceKey)) { el.dataset.bounce = String(p.bounceKey); const s = el.querySelector('.t-pin-stack'); s.classList.remove('bounce'); void s.offsetWidth; s.classList.add('bounce'); }
      el._p = p; });
    for (const [id, el] of pinEls) if (!keep.has(id)) { el.remove(); pinEls.delete(id); }
    place();
  }
  function buildPin(p) {
    const size = p.selected ? PIN_SEL : PIN, inner = size - 10;
    const drop = h('div.t-pin-drop', { style: { width: size + 'px', height: size + 'px', borderRadius: `${size / 2}px ${size / 2}px ${size / 2}px 4px`, boxShadow: p.selected ? '4px 4px 0 #16210C' : '2px 2px 0 #16210C' } },
      h('div.t-pin-face', { style: { width: inner + 'px', height: inner + 'px' } }, avatar({ id: p.id, name: p.fullName || p.label, avatarUrl: p.avatarUrl, avatarColor: p.avatarColor, size: inner, font: Math.round(inner * 0.36) })));
    const tag = h('div.t-pin-tag' + (p.isSelf || p.selected ? '.on' : ''), { style: { marginTop: Math.round(size * 0.21) + 3 + 'px' } }, p.isSelf ? 'YOU' : p.label.toUpperCase());
    const el = h('div.t-pin' + (p.dimmed ? '.dim' : ''), { style: { zIndex: p.selected ? 2 : 1 } }, h('div.t-pin-stack', drop, tag));
    el._size = size;
    if (p.onPress) { el.classList.add('tap'); el.addEventListener('click', e => { e.stopPropagation(); el._p?.onPress?.(); }); }
    return el;
  }
  function place() { pinEls.forEach(el => { const p = el._p; if (!p) return; const pt = map.project([p.longitude, p.latitude]);
    el.style.transform = `translate(${(pt.x - 45).toFixed(1)}px, ${(pt.y - tipOffset(el._size)).toFixed(1)}px)`; }); }

  return {
    map,
    setFocus(loc) { const k = loc ? `${loc.latitude.toFixed(3)},${loc.longitude.toFixed(3)}` : ''; if (k === this._fk) return; this._fk = k; target = loc; applyTarget(); },
    setPins(list) { pins = list; renderPins(); },
    setDay(day) { if (day === isDay) return; isDay = day; if (map.isStyleLoaded()) applyLight(); },
    destroy() { clearTimeout(fallback); ro.disconnect(); map.remove(); container.replaceChildren(); },
  };
}

// two people in the same place would draw one pin exactly over the other: MySpace's own fan-out
export { spreadCoincidentPins as spreadPins } from './mapProjection.js';
