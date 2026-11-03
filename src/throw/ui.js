// Small helpers for Throw's screens: building DOM, icons, avatars, and React Native-style animation (springs with RN's
// friction/tension numbers, timed tweens) so the values ported from MySpace behave the same here.

/** h('div.cls', { attrs, on: { click } , style: {...} }, ...children) */
export function h(tag, props, ...kids) {
  const [name, ...cls] = tag.split('.');
  const el = name === 'svg' || name === 'path' || name === 'circle' ? document.createElementNS('http://www.w3.org/2000/svg', name) : document.createElement(name || 'div');
  if (cls.length) el.setAttribute('class', cls.join(' '));
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'style') typeof v === 'string' ? el.setAttribute('style', v) : Object.assign(el.style, v);
    else if (k === 'class') el.setAttribute('class', (el.getAttribute('class') ? el.getAttribute('class') + ' ' : '') + v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}

/** A stroked 24x24 icon from an SVG path (Feather style, like MySpace's Icon component). */
export const icon = (d, { size = 24, color = 'currentColor', stroke = 1.8, fill = 'none' } = {}) =>
  h('span.t-icon', { style: { width: size + 'px', height: size + 'px' }, html: `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${fill === 'none' ? color : 'none'}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>` });

// ---------- avatars (MySpace's Person: the photo, or initials on a sticker colour picked from the id) ----------
const PERSON_COLORS = ['#C3EA4F', '#EDFDFF', '#FF8A6B', '#FFD23F', '#9EB3FF', '#FFB4C8', '#7FE0A6'];
const SWATCHES = [['#FFD23F', '#111111'], ['#FF4F2E', '#fff'], ['#2B4BFF', '#fff'], ['#111111', '#FFD23F'], ['#FFFFFF', '#111111'], ['#9EB3FF', '#111111'], ['#FFB4C8', '#111111'], ['#7FE0A6', '#111111']];
export const colorFor = id => { let x = 0; for (let i = 0; i < id.length; i++) x = (x * 31 + id.charCodeAt(i)) >>> 0; return PERSON_COLORS[x % PERSON_COLORS.length]; };
export const initialsOf = name => (name || '?').replace(/[^\p{L} ]/gu, '').split(' ').filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
export function avatar({ id, name, avatarUrl, avatarColor, size, font, cls = '' }) {
  const sw = avatarColor != null ? SWATCHES[avatarColor % SWATCHES.length] : null;
  const el = h('div.t-avatar' + (cls ? '.' + cls : ''), { style: { width: size + 'px', height: size + 'px', background: sw?.[0] ?? colorFor(id || name || '?'), color: sw?.[1] ?? '#16210C', fontSize: (font ?? Math.round(size / 3)) + 'px' } });
  if (avatarUrl) { const img = h('img', { src: avatarUrl, alt: '', draggable: 'false' }); img.onerror = () => { img.remove(); el.textContent = initialsOf(name); }; el.append(img); }
  else el.textContent = initialsOf(name);
  return el;
}

// ---------- animation ----------
const now = () => performance.now();
/**
 * An animated number, like React Native's Animated.Value: set(), spring() with RN's friction/tension, timing() with an
 * easing; listeners get every frame's value.
 */
export class Value {
  constructor(v = 0) { this.v = v; this.subs = new Set(); this.raf = 0; }
  get() { return this.v; }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  set(v) { this.stop(); this._emit(v); }
  _emit(v) { this.v = v; this.subs.forEach(fn => fn(v)); }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
  /** RN Animated.spring({ friction, tension }) — same origami conversion RN uses. */
  spring(to, { friction = 7, tension = 40 } = {}, done) {
    this.stop(); const k = (tension - 30) * 3.62 + 194, c = (friction - 8) * 3 + 25; let x = this.v, vel = 0, last = now();
    const step = () => { const t = now(), dt = Math.min(0.032, (t - last) / 1000); last = t;
      for (let i = 0; i < 4; i++) { const a = -k * (x - to) - c * vel; vel += a * dt / 4; x += vel * dt / 4; }
      if (Math.abs(x - to) < 0.0005 && Math.abs(vel) < 0.005) { this.raf = 0; this._emit(to); done?.(); return; }
      this._emit(x); this.raf = requestAnimationFrame(step); };
    this.raf = requestAnimationFrame(step); return this;
  }
  timing(to, { duration = 300, easing = E.inOut } = {}, done) {
    this.stop(); const from = this.v, t0 = now();
    const step = () => { const p = Math.min(1, (now() - t0) / duration); this._emit(from + (to - from) * easing(p));
      if (p < 1) this.raf = requestAnimationFrame(step); else { this.raf = 0; done?.(); } };
    this.raf = requestAnimationFrame(step); return this;
  }
}
export const E = { linear: t => t, out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t, inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), outEase: t => 1 - (1 - t) * (1 - t) };
/** RN's interpolate with clamping: lerp along [inputs] -> [outputs]. */
export function interp(v, ins, outs) {
  if (v <= ins[0]) return outs[0]; if (v >= ins[ins.length - 1]) return outs[outs.length - 1];
  for (let i = 1; i < ins.length; i++) if (v <= ins[i]) { const k = (v - ins[i - 1]) / (ins[i] - ins[i - 1]); return outs[i - 1] + (outs[i] - outs[i - 1]) * k; }
  return outs[outs.length - 1];
}
export const wait = ms => new Promise(r => setTimeout(r, ms));
/** A short buzz on phones that support it (MySpace's tick()). */
export const tick = (strong = false) => { try { navigator.vibrate?.(strong ? 18 : 8); } catch { /* not allowed */ } };
/** Restart a CSS animation class on an element (MySpace's A/B keyframe trick). */
export function replay(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
/** pointer position for mouse or touch events */
export const pt = e => { const t = e.touches?.[0] ?? e.changedTouches?.[0]; return t ? { x: t.clientX, y: t.clientY } : { x: e.clientX, y: e.clientY }; };
