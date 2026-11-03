// The floating avatar carousel over the map (port of MySpace's RecipientCarousel): the centred avatar is who the letter
// is to; the others shrink and fade with distance. Swipe or tap to change it. Clamped at the ends.
// Slots -2 (Notifications) and -1 (Add Status) are drawn when their handlers are given.
import { h, avatar, Value, interp } from './ui.js';

const ITEM_SPACING = 92, AVATAR_SIZE = 64, PULSE = AVATAR_SIZE + 16;
export const CAROUSEL_HEIGHT = 130;
const SPRING = { friction: 8, tension: 60 };

export function createCarousel({ onChangeIndex, onOpenStory, onAddStory, onOpenNotifications }) {
  const strip = h('div.t-car-strip'), wrap = h('div.t-car', strip);
  const offset = new Value(0);
  let S = { friends: [], selectedIndex: 0, disabled: false, isNight: false, unreadCountFor: () => 0, storyCountFor: () => 0, isAddStorySelected: false, isNotificationsSelected: false, notificationsUnread: 0 };
  let items = [], dragging = false, liveOffset = null;
  const maxIndex = () => Math.max(0, S.friends.length - 1);
  const minDrag = () => (onOpenNotifications ? -2 : onAddStory ? -1 : 0);
  const resting = () => (S.isNotificationsSelected ? -2 : S.isAddStorySelected ? -1 : Math.min(S.selectedIndex, maxIndex()));

  function layout(v) {
    const span = Math.max(1, maxIndex());
    items.forEach(({ el, i }) => {
      const tx = interp(v, [0, span], [i * ITEM_SPACING, (i - span) * ITEM_SPACING]);
      const sc = interp(v, [i - 2, i - 1, i, i + 1, i + 2], [0.68, 0.82, 1, 0.82, 0.68]);
      el.style.transform = `translateX(${tx.toFixed(1)}px) scale(${sc.toFixed(3)})`;
      el.style.opacity = interp(v, [i - 2, i - 1, i, i + 1, i + 2], [0.4, 0.68, 1, 0.68, 0.4]).toFixed(3);
    });
  }
  offset.on(layout);

  function badge(n) { return n > 0 ? h('div.t-car-badge', String(n)) : null; }
  const slotBtn = (kind, sel, count) => h('div.t-slot-btn' + (sel ? '.sel' : ''), h('span.t-slot-ico.' + kind), kind === 'bell' && count > 0 ? h('span.t-slot-badge', count > 9 ? '9+' : String(count)) : null, kind === 'plus' ? h('span.t-slot-plus') : null);
  // MySpace's StoryRing: a wavy blue ring around an avatar with a story, its shape drifting (three sine harmonics)
  function storyRing() { const pad = 4 + 2.8 + 8 + 2, size = AVATAR_SIZE + pad * 2;
    const svg = h('svg', { width: size, height: size, class: 't-storyring' }), path = h('path'); path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#3D7BFF'); path.setAttribute('stroke-linejoin', 'round');
    svg.style.cssText = `position:absolute;left:${-pad}px;top:${-pad}px;pointer-events:none`; svg.append(path); rings.add({ path, size }); return svg; }
  const rings = new Set(); let ringT = 0;
  const HARM = [[3, 0.5, 0, 0.5], [5, -0.8, 1.7, 0.3], [2, 0.3, 3.4, 0.2]];
  const ringTimer = setInterval(() => { ringT += 0.05; for (const r of rings) { if (!r.path.isConnected) { rings.delete(r); continue; }
    const c = r.size / 2, minR = AVATAR_SIZE / 2 + 4 + 2.8 / 2, depth = 6 + 2 * Math.sin(0.2 * ringT + 0.5); let d = '';
    for (let i = 0; i <= 64; i++) { const th = i / 64 * Math.PI * 2; let n = 0; for (const [k, sp, ph, w] of HARM) n += w * Math.sin(k * th + sp * ringT + ph);
      const rr = minR + (n + 1) / 2 * depth; d += `${i ? 'L' : 'M'}${(c + rr * Math.cos(th)).toFixed(2)} ${(c + rr * Math.sin(th)).toFixed(2)}`; }
    r.path.setAttribute('d', d + 'Z'); r.path.setAttribute('stroke-width', (2.3 + 0.5 * Math.sin(0.35 * ringT + 0.7)).toFixed(2)); } }, 50);
  function render() {
    strip.replaceChildren(); items = [];
    const slot = (i, avatarEl, name, sub, selected, onTap) => {
      const el = h('div.t-car-item', { 'data-i': i },
        h('div.t-car-avwrap', selected ? h('div.t-pulse' + (S.isNight ? '.night' : '')) : null, avatarEl),
        h('div.t-car-name' + (selected ? '.sel' : '') + (S.isNight ? '.night' : ''), name),
        h('div.t-car-city' + (S.isNight ? '.night' : ''), sub || ' '));
      el._tap = onTap; strip.append(el); items.push({ el, i });
    };
    if (onOpenNotifications) slot(-2, slotBtn('bell', S.isNotificationsSelected, S.notificationsUnread), 'Notifications', '', S.isNotificationsSelected, onOpenNotifications);
    if (onAddStory) slot(-1, slotBtn('plus', S.isAddStorySelected), 'Add Status', '', S.isAddStorySelected, onAddStory);
    S.friends.forEach((f, i) => {
      const sel = i === S.selectedIndex && !S.isAddStorySelected && !S.isNotificationsSelected, stories = S.storyCountFor(f.userId);
      const openCount = sel && S.storyModeAvatarCount !== undefined ? S.storyModeAvatarCount : undefined;
      const av = h('div.t-car-av' + (sel ? '.selav' : ''), stories > 0 ? storyRing() : null,
        avatar({ id: f.userId, name: f.name, avatarUrl: f.avatarUrl, avatarColor: f.avatarColor, size: AVATAR_SIZE, cls: sel ? (S.isNight ? 'sel-night' : 'sel') : '' }),
        openCount !== undefined ? h('div.t-countring' + (openCount > 0 ? '.on' : '')) : null,
        badge(openCount !== undefined ? openCount : S.unreadCountFor(f.userId)));
      slot(i, av, f.name.split(' ')[0], f.location?.city, sel, () => {
        if (sel && onOpenStory && stories > 0) { onOpenStory(f.userId); return; }
        snapTo(i);
      });
    });
    wrap.classList.toggle('night', S.isNight);
    layout(offset.get());
  }
  const snapTo = i => { const c = Math.max(0, Math.min(maxIndex(), i)); offset.spring(c, SPRING);
    if (c !== S.selectedIndex || S.isAddStorySelected || S.isNotificationsSelected) onChangeIndex(c); };

  // drag the strip itself (and taps)
  let start = null, base = 0, moved = false;
  wrap.addEventListener('pointerdown', e => { if (S.disabled || S.friends.length < 1) return; start = e.clientX; base = offset.get(); moved = false; wrap.setPointerCapture(e.pointerId); });
  wrap.addEventListener('pointermove', e => { if (start == null) return; const dx = e.clientX - start;
    if (!moved && Math.abs(dx) > 6) { moved = true; dragging = true; offset.stop(); }
    if (moved) offset.set(Math.max(minDrag(), Math.min(maxIndex(), base - dx / ITEM_SPACING))); });
  const end = e => { if (start == null) return; const dx = e.clientX - start; start = null;
    if (!moved) { const it = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.t-car-item'); it?._tap?.(); return; } // (pointer capture retargets the event to the strip)
    dragging = false; const n = Math.max(minDrag(), Math.min(maxIndex(), Math.round(base - dx / ITEM_SPACING)));
    if (n === -2 && onOpenNotifications) { offset.spring(-2, SPRING); onOpenNotifications(); return; }
    if (n === -1 && onAddStory) { offset.spring(-1, SPRING); onAddStory(); return; }
    offset.spring(n, SPRING); if (n !== S.selectedIndex || S.isAddStorySelected || S.isNotificationsSelected) onChangeIndex(n); };
  wrap.addEventListener('pointerup', end); wrap.addEventListener('pointercancel', end);

  return {
    el: wrap,
    update(next) {
      const prevRest = resting(), prevPulse = S.storyModePulse; S = { ...S, ...next }; render();
      if (S.storyModePulse && S.storyModePulse !== prevPulse) strip.querySelector('.t-car-av.selav')?.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 360 });
      if (!dragging && liveOffset == null && Math.round(offset.get()) !== resting()) offset.spring(resting(), SPRING);
      else if (prevRest !== resting() && !dragging && liveOffset == null) offset.spring(resting(), SPRING);
    },
    /** A recipient-switching drag elsewhere (the letter's own flick): the strip tracks it 1:1; null hands back to the spring. */
    setLiveOffset(v) { liveOffset = v; if (v == null) offset.spring(resting(), SPRING); else offset.set(Math.max(minDrag(), Math.min(maxIndex(), v))); },
    jump() { offset.set(resting()); },
    destroy() { clearInterval(ringTimer); },
  };
}
