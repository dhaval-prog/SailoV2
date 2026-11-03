// Watching a contact's statuses (port of MySpace's ContactStoryStack): the photos drop out of their avatar into the
// card as a tilted stack (most recent on top, 190 ms apart); swipe the top one up to send it back into the avatar;
// your own: long-press (450 ms) then drag down onto the bin to delete (deleted for real once you leave the stack).
// Videos play within their trim window, with a clock and a mute toggle.
import { h, icon, Value, interp } from './ui.js';
import { playbackVideo } from './capture.js';

const AVATAR = 64, CORNER_FULL = 28, CORNER_CIRCLE = AVATAR / 2, TILT = [0, -3, 2.5, -2], X_STEP = 5, Y_STEP = -11, SCALE_STEP = 0.04, MAX_K = 3;
const stackEase = t => cubicBezier(0.2, 0.9, 0.25, 1.05, t), returnEase = t => cubicBezier(0.5, 0, 0.2, 1, t), commitEase = t => cubicBezier(0.5, 0, 0.8, 0.4, t);
const RETURN_MAX = 300, RETURN_SCALE_MIN = 0.75, RETURN_DIST = 80, RETURN_VEL = 0.5, LONG_PRESS = 450, SLOP = 10;
const ARM_SCALE = 0.965, DRAG_SCALE_MIN = 0.765, DRAG_RATIO = DRAG_SCALE_MIN / ARM_SCALE, DRAG_RANGE = 190, DRAG_MIN_OP = 0.65, DEL_DIST = 100, DEL_VEL = 0.5;
const I = { trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 10.5v6.5M13.5 10.5v6.5', vol: 'M11 5L6 9H2v6h4l5 4V5z M15.5 8.5a5 5 0 0 1 0 7 M18.5 5.5a9 9 0 0 1 0 13', mute: 'M11 5L6 9H2v6h4l5 4V5z M22.5 9.5l-6 6 M16.5 9.5l6 6' };
function cubicBezier(x1, y1, x2, y2, t) { // (CSS cubic-bezier easing, solved for x)
  let lo = 0, hi = 1, x; for (let i = 0; i < 24; i++) { const m = (lo + hi) / 2, mx = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m; if (mx < t) lo = m; else hi = m; x = m; }
  return 3 * (1 - x) * (1 - x) * x * y1 + 3 * (1 - x) * x * x * y2 + x * x * x;
}
const target = k => ({ x: k * X_STEP, y: k * Y_STEP, rot: TILT[Math.min(k, TILT.length - 1)] ?? 0, sc: 1 - k * SCALE_STEP });
const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** opts: stories, contactName, isNight, isOwn, flightTarget () => {x, y} (the avatar on screen), onViewed(id), onDelete(id),
 *  onAvatarCount(n), onPulseAvatar(), onEmptied(). Returns { el, drop(), update(stories), destroy() }. */
export function contactStoryStack(opts) {
  let stories = opts.stories, muted = false;
  const loc = new Map(stories.map(s => [s.id, 'avatar'])), order = [], cards = new Map(), pendingDelete = new Set(), timers = [];
  const root = h('div.t-stack'), emptyEl = h('div.t-stack-empty'), delEl = h('div.t-stack-del');
  root.append(emptyEl, delEl);
  const rect = () => root.getBoundingClientRect();
  const avatarCount = () => stories.filter(s => (loc.get(s.id) ?? 'avatar') === 'avatar').length;
  const binned = () => stories.filter(s => loc.get(s.id) === 'bin').length;

  function card(id) {
    let c = cards.get(id); if (c) return c;
    const story = stories.find(s => s.id === id); if (!story) return null;
    const el = h('div.t-stack-card'), dim = h('div.t-stack-dim');
    if (story.mediaType === 'photo') el.append(h('img', { src: story.mediaUrl, alt: '', draggable: 'false' }));
    else { const trim = story.trimStartMs != null ? { startMs: story.trimStartMs, endMs: story.trimEndMs } : null; const v = playbackVideo(story.mediaUrl, trim, { muted: true }); const clk = h('div.t-stack-clock');
      v.addEventListener('timeupdate', () => { const s0 = trim?.startMs ?? 0, d = (trim ? trim.endMs - trim.startMs : (v.duration || 0) * 1000); if (d > 0) clk.textContent = `${clock(v.currentTime * 1000 - s0)} / ${clock(d)}`; });
      const mb = h('button.t-stack-mute', { type: 'button', 'aria-label': 'Unmute' }); const paintMute = () => { mb.replaceChildren(icon(muted ? I.mute : I.vol, { size: 16, stroke: 2, color: '#fff' })); mb.setAttribute('aria-label', muted ? 'Unmute' : 'Mute'); };
      mb.addEventListener('pointerdown', e => e.stopPropagation()); mb.onclick = () => { muted = !muted; cards.forEach(x => x.video && (x.video.muted = x !== cards.get(order[0]) || muted)); paintMute(); };
      el.append(v, clk, mb); paintMute(); c = { video: v, clk, mb }; }
    el.append(dim);
    c = { ...(c || {}), el, dim, box: new Value(1), sx: new Value(0), sy: new Value(0), rot: new Value(0), sc: new Value(1), dragY: new Value(0), arm: new Value(1), commit: new Value(1), dimV: new Value(0), op: new Value(1) };
    const paint = () => {
      const r = rect(), W = r.width || 300, H = r.height || 260, t = c.box.get(), av = opts.flightTarget?.() ?? { x: r.left + W / 2, y: r.top + H / 2 };
      const w = interp(t, [0, 1], [AVATAR, W]), hh = interp(t, [0, 1], [AVATAR, H]), cx = interp(t, [0, 1], [av.x - r.left, W / 2]), cy = interp(t, [0, 1], [av.y - r.top, H / 2]);
      const lift = interp(c.dragY.get(), [-RETURN_MAX, 0], [1, 0]), dragSc = interp(c.dragY.get(), [0, DRAG_RANGE], [1, DRAG_RATIO]), dragOp = interp(c.dragY.get(), [0, DRAG_RANGE], [1, DRAG_MIN_OP]);
      const scale = c.sc.get() * c.arm.get() * c.commit.get() * dragSc * interp(lift, [0, 1], [1, RETURN_SCALE_MIN]);
      Object.assign(el.style, { left: cx - w / 2 + 'px', top: cy - hh / 2 + 'px', width: w + 'px', height: hh + 'px', borderRadius: interp(t, [0, 1], [CORNER_CIRCLE, CORNER_FULL]) + lift * 60 + 'px',
        opacity: c.op.get() * dragOp, transform: `translate(${c.sx.get()}px, ${c.sy.get() + c.dragY.get()}px) rotate(${c.rot.get() + interp(lift, [0, 1], [0, -4])}deg) scale(${scale})` });
      dim.style.opacity = c.dimV.get();
    };
    ['box', 'sx', 'sy', 'rot', 'sc', 'dragY', 'arm', 'commit', 'dimV', 'op'].forEach(k => c[k].on(paint)); c.paint = paint;
    cards.set(id, c); return c;
  }
  const settle = (id, idx, ms = 380) => { const c = card(id), t = target(Math.min(MAX_K, idx)); c.sx.timing(t.x, { duration: ms, easing: stackEase }); c.sy.timing(t.y, { duration: ms, easing: stackEase }); c.rot.timing(t.rot, { duration: ms, easing: stackEase }); c.sc.timing(t.sc, { duration: ms, easing: stackEase }); };
  function render() {
    // the top card is the first in order; it's drawn last
    [...order].reverse().forEach((id, i, arr) => { const c = card(id); if (!c) return; root.append(c.el); c.el.style.pointerEvents = id === order[0] ? 'auto' : 'none';
      if (c.video) c.video.muted = id !== order[0] || muted; c.mb && (c.mb.style.display = id === order[0] ? '' : 'none'); c.clk && (c.clk.style.display = id === order[0] ? '' : 'none'); void arr; });
    root.append(delEl);
    const first = (opts.contactName || '').split(' ')[0] || opts.contactName;
    emptyEl.style.display = order.length ? 'none' : '';
    emptyEl.replaceChildren(h('div.t-stack-empty-text' + (opts.isNight ? '.night' : ''), avatarCount() > 0 ? `Tap ${first}'s status to open` : binned() > 0 ? 'Status deleted' : 'No status yet'),
      avatarCount() === 0 && binned() > 0 ? h('button.t-stack-restore', { type: 'button', on: { click: restore } }, 'Bring them back') : '');
    opts.onAvatarCount?.(avatarCount());
  }
  function restore() { stories.filter(s => loc.get(s.id) === 'bin').forEach(s => { pendingDelete.delete(s.id); loc.set(s.id, 'avatar'); }); opts.onPulseAvatar?.(); render(); }
  /** Tap on the avatar: whatever's still in it drops into the card, staggered. */
  function drop() {
    const toDrop = [...stories].reverse().filter(s => (loc.get(s.id) ?? 'avatar') === 'avatar');
    toDrop.forEach((s, n) => timers.push(setTimeout(() => {
      loc.set(s.id, 'letter'); order.push(s.id); const c = card(s.id), t = target(Math.min(MAX_K, order.length - 1));
      c.box.set(0); c.sx.set(0); c.sy.set(0); c.rot.set(0); c.sc.set(1); c.dragY.set(0); c.arm.set(1); c.commit.set(1); c.dimV.set(0); c.op.set(0);
      // (the newest lands under the ones already there: re-order so the first dropped stays on top)
      render(); const D = 560;
      c.box.timing(1, { duration: D, easing: stackEase }); c.sx.timing(t.x, { duration: D, easing: stackEase }); c.sy.timing(t.y, { duration: D, easing: stackEase }); c.rot.timing(t.rot, { duration: D, easing: stackEase }); c.sc.timing(t.sc, { duration: D, easing: stackEase }); c.op.timing(1, { duration: 200 });
      opts.onViewed?.(s.id); opts.onPulseAvatar?.();
    }, n * 190)));
  }
  function remove(id, to) { cards.get(id)?.el.remove(); cards.delete(id); loc.set(id, to); const i = order.indexOf(id); if (i >= 0) order.splice(i, 1); order.forEach((o, k) => settle(o, k)); render(); if (!order.length) opts.onEmptied?.(); }
  function returnToAvatar(id) { const c = card(id); c.dragY.timing(0, { duration: 460, easing: returnEase }); c.box.timing(0, { duration: 460, easing: returnEase }, () => { remove(id, 'avatar'); opts.onPulseAvatar?.(); });
    setTimeout(() => c.op.timing(0, { duration: 160 }), 300); }

  // ---- delete target ----
  let armed = null, hot = false;
  const paintDel = () => { delEl.style.display = armed ? '' : 'none'; if (!armed) return; const r = rect(); delEl.style.left = r.width / 2 - 46 + 'px'; delEl.style.top = r.height / 2 - 46 + 'px';
    delEl.replaceChildren(h('div.t-stack-ring'), h('div.t-stack-disc' + (hot ? '.hot' : ''), icon(I.trash, { size: 30, stroke: 2, color: hot ? '#2B231C' : '#fff' })), h('div.t-stack-dellabel', hot ? 'RELEASE TO DELETE' : 'DRAG DOWN TO DELETE')); };
  const arm = id => { const c = card(id); armed = id; hot = false; c.arm.timing(ARM_SCALE, { duration: 220 }); c.dimV.timing(1, { duration: 180 }); paintDel(); };
  const resetDel = id => { const c = card(id); armed = null; hot = false; c.arm.timing(1, { duration: 200 }); c.dimV.timing(0, { duration: 150 }); c.dragY.spring(0, { friction: 8, tension: 60 }); paintDel(); };
  const commitDel = (id, dy) => { const c = card(id); armed = null; hot = false; paintDel();
    c.dragY.timing(dy + 240, { duration: 320, easing: commitEase }); c.commit.timing(0.2 / DRAG_SCALE_MIN, { duration: 320, easing: commitEase }); c.op.timing(0, { duration: 320, easing: commitEase }, () => { pendingDelete.add(id); remove(id, 'bin'); }); };

  // ---- gestures on the top card ----
  let gs = 'idle', gid = null, start = null, last = null, vel = 0, raw = 0, lp = 0;
  root.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; gid = order[0]; if (!gid) return; gs = 'idle'; start = { x: e.clientX, y: e.clientY }; last = { y: e.clientY, t: performance.now() }; vel = 0; raw = 0;
    root.setPointerCapture(e.pointerId); clearTimeout(lp); if (opts.isOwn) lp = setTimeout(() => { if (gid) { gs = 'armed'; arm(gid); } }, LONG_PRESS); });
  root.addEventListener('pointermove', e => { if (!gid) return; const c = card(gid), t = performance.now(); if (t > last.t) vel = (e.clientY - last.y) / (t - last.t); last = { y: e.clientY, t };
    const dx = e.clientX - start.x; raw = e.clientY - start.y;
    if (gs === 'idle') { if (raw < -SLOP) { clearTimeout(lp); gs = 'lift'; } else if (Math.abs(dx) > SLOP || Math.abs(raw) > SLOP) { clearTimeout(lp); gs = 'cancelled'; } }
    if (gs === 'lift') return c.dragY.set(Math.min(0, raw));
    if (gs !== 'armed' && gs !== 'drag') return;
    const dy = Math.max(0, raw); if (dy > 4 && gs === 'armed') gs = 'drag';
    if (gs === 'drag') { c.dragY.set(dy); const nh = dy > DEL_DIST; if (nh !== hot) { hot = nh; paintDel(); } } });
  const end = () => { clearTimeout(lp); const id = gid, st = gs; gid = null; gs = 'idle'; if (!id) return;
    if (st === 'lift') { if (Math.min(0, raw) < -RETURN_DIST || vel < -RETURN_VEL) returnToAvatar(id); else card(id).dragY.spring(0, { friction: 8, tension: 60 }); return; }
    if (st === 'armed') return resetDel(id);
    if (st === 'drag') { const dy = Math.max(0, raw); if (dy > DEL_DIST || vel > DEL_VEL) commitDel(id, dy); else resetDel(id); } };
  root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end);
  const ro = new ResizeObserver(() => cards.forEach(c => c.paint())); ro.observe(root);
  render(); paintDel();

  return {
    el: root, drop,
    update(next) { stories = next; const ids = new Set(next.map(s => s.id)); ids.forEach(id => { if (!loc.has(id)) loc.set(id, 'avatar'); }); [...loc.keys()].forEach(id => { if (!ids.has(id)) { loc.delete(id); const i = order.indexOf(id); if (i >= 0) { order.splice(i, 1); cards.get(id)?.el.remove(); cards.delete(id); } } }); render(); },
    destroy() { timers.forEach(clearTimeout); clearTimeout(lp); ro.disconnect(); pendingDelete.forEach(id => opts.onDelete?.(id)); cards.forEach(c => c.video?.pause()); root.remove(); },
  };
}
