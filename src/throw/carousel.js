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
  function render() {
    strip.replaceChildren(); items = [];
    const slot = (i, avatarEl, name, sub, selected, onTap) => {
      const el = h('div.t-car-item', { 'data-i': i },
        h('div.t-car-avwrap', selected ? h('div.t-pulse' + (S.isNight ? '.night' : '')) : null, avatarEl),
        h('div.t-car-name' + (selected ? '.sel' : '') + (S.isNight ? '.night' : ''), name),
        h('div.t-car-city' + (S.isNight ? '.night' : ''), sub || ' '));
      el._tap = onTap; strip.append(el); items.push({ el, i });
    };
    if (onOpenNotifications) slot(-2, h('div.t-slot-btn' + (S.isNotificationsSelected ? '.sel' : ''), h('span.t-slot-ico.bell'), badge(S.notificationsUnread)), 'Notifications', '', S.isNotificationsSelected, onOpenNotifications);
    if (onAddStory) slot(-1, h('div.t-slot-btn' + (S.isAddStorySelected ? '.sel' : ''), h('span.t-slot-ico.plus')), 'Add Status', '', S.isAddStorySelected, onAddStory);
    S.friends.forEach((f, i) => {
      const sel = i === S.selectedIndex && !S.isAddStorySelected && !S.isNotificationsSelected, stories = S.storyCountFor(f.userId);
      const av = h('div.t-car-av', stories > 0 ? h('div.t-storyring', { style: { '--n': stories } }) : null,
        avatar({ id: f.userId, name: f.name, avatarUrl: f.avatarUrl, avatarColor: f.avatarColor, size: AVATAR_SIZE, cls: sel ? (S.isNight ? 'sel-night' : 'sel') : '' }), badge(S.unreadCountFor(f.userId)));
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
      const prevRest = resting(); S = { ...S, ...next }; render();
      if (!dragging && liveOffset == null && Math.round(offset.get()) !== resting()) offset.spring(resting(), SPRING);
      else if (prevRest !== resting() && !dragging && liveOffset == null) offset.spring(resting(), SPRING);
    },
    /** A recipient-switching drag elsewhere (the letter's own flick): the strip tracks it 1:1; null hands back to the spring. */
    setLiveOffset(v) { liveOffset = v; if (v == null) offset.spring(resting(), SPRING); else offset.set(Math.max(minDrag(), Math.min(maxIndex(), v))); },
    jump() { offset.set(resting()); },
  };
}
