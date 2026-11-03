// The reminder picker (ports of MySpace's AlertScheduleHeader + WheelPicker) and the bottom sheet it slides up in
// (BottomSheet: white, 32px top corners, a drag handle, swipe down or tap outside to close).
import { h, icon } from './ui.js';
import { WEEKDAY_LABELS } from './alerts-schedule.js';

export const WHEEL_ITEM = 34, WHEEL_H = WHEEL_ITEM * 5;
const PAD = (WHEEL_H - WHEEL_ITEM) / 2;
const RECURRENCE = [['once', 'Never'], ['everyday', 'Every Day'], ['weekly', 'Weekly'], ['monthly', 'Monthly']];
const HOURS = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')), MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));
export const DEFAULT_ALERT_SCHEDULE = () => ({ recurrence: 'once', hour: 9, minute: 0, daysOfWeek: [], dayOfMonth: 1 });

/** A scroll-snapping wheel; the centred row is the value (rows fade and shrink away from it). */
function wheel(items, index, onChange, width, label) {
  const col = h('div.t-wheel', { style: { width: width + 'px' }, role: 'listbox', 'aria-label': label });
  const inner = h('div', { style: { padding: `${PAD}px 0` } });
  const rows = items.map((t, i) => { const r = h('div.t-wheel-row', { role: 'option', 'aria-label': `${label} ${t}` }, t); r.onclick = () => { col.scrollTo({ top: i * WHEEL_ITEM, behavior: 'smooth' }); if (i !== cur) { cur = i; onChange(i); } }; return r; });
  inner.append(...rows); col.append(inner);
  let cur = index, timer = 0;
  const paint = () => { const y = col.scrollTop; rows.forEach((r, i) => { const d = Math.abs(y - i * WHEEL_ITEM) / WHEEL_ITEM;
    r.style.opacity = d <= 1 ? 1 - 0.45 * d : d <= 2 ? 0.55 - 0.3 * (d - 1) : 0.25; r.style.transform = `scale(${d <= 1 ? 1 - 0.14 * d : 0.86})`; }); };
  col.addEventListener('scroll', () => { paint(); clearTimeout(timer); timer = setTimeout(() => { const i = Math.max(0, Math.min(items.length - 1, Math.round(col.scrollTop / WHEEL_ITEM)));
    col.scrollTo({ top: i * WHEEL_ITEM, behavior: 'smooth' }); if (i !== cur) { cur = i; onChange(i); } }, 120); });
  requestAnimationFrame(() => { col.scrollTop = index * WHEEL_ITEM; paint(); });
  return col;
}

/** The time wheels (hour : minute AM/PM), Repeat (Never / Every Day / Weekly + days / Monthly + day). */
export function scheduleHeader(schedule, onChange) {
  let s = { ...schedule, daysOfWeek: [...schedule.daysOfWeek] }, repeatOpen = false;
  const root = h('div.t-sched');
  const set = patch => { s = { ...s, ...patch }; onChange(s); };
  function render() {
    const h12 = ((s.hour + 11) % 12) + 1, pm = s.hour >= 12;
    root.replaceChildren(...[
      h('div.t-sched-wheels', h('div.t-sched-band'),
        wheel(HOURS, h12 - 1, i => set({ hour: ((i + 1) % 12) + (s.hour >= 12 ? 12 : 0) }), 44, 'Hour'),
        h('span.t-sched-colon', ':'),
        wheel(MINUTES, s.minute, i => set({ minute: i }), 44, 'Minute'),
        wheel(['AM', 'PM'], pm ? 1 : 0, i => set({ hour: ((((s.hour + 11) % 12) + 1) % 12) + (i === 1 ? 12 : 0) }), 50, 'Period')),
      h('button.t-sched-repeat', { type: 'button', on: { click: () => { repeatOpen = !repeatOpen; render(); } } },
        h('span.t-sched-repeat-l', 'Repeat'), h('span.t-sched-repeat-r', RECURRENCE.find(r => r[0] === s.recurrence)[1], icon('M9 6l6 6-6 6', { size: 13, stroke: 2, color: 'rgba(43,35,28,.42)' }))),
      repeatOpen ? h('div.t-sched-opts', RECURRENCE.map(([id, label]) => h('button.t-sched-opt' + (s.recurrence === id ? '.sel' : ''), { type: 'button', on: { click: () => { repeatOpen = false; set({ recurrence: id }); render(); } } },
        label, s.recurrence === id ? h('span', '✓') : null))) : null,
      s.recurrence === 'weekly' ? h('div.t-sched-days', WEEKDAY_LABELS.map((l, i) => h('button.t-sched-day' + (s.daysOfWeek.includes(i) ? '.sel' : ''), { type: 'button', 'aria-label': l,
        on: { click: () => { set({ daysOfWeek: s.daysOfWeek.includes(i) ? s.daysOfWeek.filter(d => d !== i) : [...s.daysOfWeek, i] }); render(); } } }, l[0]))) : null,
      s.recurrence === 'monthly' ? h('div.t-sched-month', h('span', 'Day of month'),
        h('button.t-step', { type: 'button', 'aria-label': 'Decrease day of month', on: { click: () => { set({ dayOfMonth: Math.max(1, s.dayOfMonth - 1) }); render(); } } }, '−'),
        h('b', String(s.dayOfMonth)),
        h('button.t-step', { type: 'button', 'aria-label': 'Increase day of month', on: { click: () => { set({ dayOfMonth: Math.min(31, s.dayOfMonth + 1) }); render(); } } }, '+')) : null].filter(Boolean)); // (replaceChildren would write a null as the text "null")
  }
  render();
  return root;
}

/** A bottom sheet over everything: slides up (420 ms ease-out), closes by tapping outside or dragging the header down. */
export function bottomSheet(host, { title, body, onClose }) {
  const sheet = h('div.t-sheet', h('div.t-sheet-head', h('div.t-sheet-handle'), title ? h('div.t-sheet-title', title) : null), body);
  const scrim = h('div.t-sheet-scrim'), root = h('div.t-sheet-wrap', scrim, sheet);
  host.append(root); requestAnimationFrame(() => root.classList.add('open'));
  let closed = false;
  const close = (silent) => { if (closed) return; closed = true; root.classList.remove('open'); setTimeout(() => root.remove(), 280); if (!silent) onClose?.(); };
  scrim.onclick = () => close();
  const head = sheet.querySelector('.t-sheet-head'); let y0 = null, t0 = 0, dy = 0;
  head.addEventListener('pointerdown', e => { y0 = e.clientY; t0 = performance.now(); dy = 0; head.setPointerCapture(e.pointerId); sheet.style.transition = 'none'; });
  head.addEventListener('pointermove', e => { if (y0 == null) return; dy = Math.max(0, e.clientY - y0); sheet.style.transform = `translateY(${dy}px)`; });
  const up = () => { if (y0 == null) return; y0 = null; sheet.style.transition = ''; const v = dy / Math.max(1, performance.now() - t0);
    if (dy > 90 || v > 0.6) close(); else sheet.style.transform = ''; };
  head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up);
  return { close: () => close(true), el: root };
}
