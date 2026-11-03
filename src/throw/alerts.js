// Self-reminders (port of MySpace's ThrowAlertsContext + FullScreenAlertOverlay): your own reminders live in
// throw_alerts; when one is due (checked every 5 s, as MySpace's web build does) a full-screen paper shows it: Snooze
// 5 min, or drag it left/right to crumple it away (a one-off is deleted, a repeating one moves to its next time).
// Runs whenever the captain is signed in, out at sea too, not just while Throw is open.
import { sb } from './data.js';
import { computeNextTrigger } from './alerts-schedule.js';
import { h, Value, interp, E } from './ui.js';
import { loadThrowFonts } from './fonts.js';
import './throw.css'; // (the reminder can show out at sea, before Throw itself has ever been opened)

const warn = (w, e) => { if (e) console.warn(`[ThrowAlerts] ${w} failed:`, e.message); };
const toAlert = r => ({ id: r.id, messageText: r.message_text, recurrence: r.recurrence_type, hour: r.hour, minute: r.minute, daysOfWeek: r.days_of_week ?? [], dayOfMonth: r.day_of_month, nextTriggerAt: r.next_trigger_at });

let started = null;
/** Starts watching your reminders (once). Returns { createAlert(schedule, content), refresh }. */
export function startThrowAlerts(myId) {
  if (started) return started;
  loadThrowFonts();
  const db = sb(); let alerts = [], due = null, overlay = null;
  async function refresh() {
    const { data, error } = await db.from('throw_alerts').select('*').eq('user_id', myId).eq('active', true).order('next_trigger_at', { ascending: true });
    warn('load alerts', error); if (!error) alerts = (data || []).map(toAlert);
  }
  db.channel(`throw_alerts-${myId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'throw_alerts', filter: `user_id=eq.${myId}` }, refresh).subscribe();
  setInterval(refresh, 30000);
  setInterval(() => { if (due) return; const now = Date.now(); const d = alerts.find(a => new Date(a.nextTriggerAt).getTime() <= now); if (d) show(d); }, 5000);
  refresh();

  async function rescheduleAfterFire(a) {
    if (a.recurrence === 'once') { const { error } = await db.from('throw_alerts').delete().eq('id', a.id); warn('delete alert', error); return refresh(); }
    const next = computeNextTrigger({ recurrence: a.recurrence, hour: a.hour, minute: a.minute, daysOfWeek: a.daysOfWeek, dayOfMonth: a.dayOfMonth ?? 1 }, new Date(Date.now() + 60000));
    const { error } = await db.from('throw_alerts').update({ next_trigger_at: next.toISOString(), updated_at: new Date().toISOString() }).eq('id', a.id); warn('reschedule alert', error); refresh();
  }
  async function snooze(a) { const { error } = await db.from('throw_alerts').update({ next_trigger_at: new Date(Date.now() + 5 * 60000).toISOString(), updated_at: new Date().toISOString() }).eq('id', a.id); warn('snooze alert', error); refresh(); }

  function show(a) {
    due = a;
    const materialize = new Value(0), tx = new Value(0), crumple = new Value(0);
    const paper = h('div.t-alert-paper', h('div.t-alert-msg', a.messageText),
      h('div.t-alert-actions', h('button.t-alert-snooze', { type: 'button', 'aria-label': 'Snooze 5 minutes', on: { click: () => { close(); snooze(a); } } }, 'Snooze 5 min'), h('div.t-alert-hint', 'Scroll left or right to crumple it away')));
    const backdrop = h('div.t-alert-backdrop');
    overlay = h('div.t-alert', backdrop, paper); document.body.append(overlay);
    const paint = () => { const m = materialize.get(), x = tx.get(); backdrop.style.opacity = m; paper.style.opacity = m;
      paper.style.transform = `translateX(${x}px) scale(${interp(m, [0, 1], [0.7, 1]) * interp(crumple.get(), [0, 1], [1, 0.45])}) rotate(${interp(x, [-500, 0, 500], [-24, 0, 24])}deg)`; };
    [materialize, tx, crumple].forEach(v => v.on(paint));
    materialize.spring(1, { friction: 8, tension: 40 });
    let x0 = null, t0 = 0, dismissing = false;
    const away = dir => { if (dismissing) return; dismissing = true; tx.timing(dir * 700, { duration: 420, easing: E.in }); crumple.timing(1, { duration: 420, easing: E.out }, () => { close(); rescheduleAfterFire(a); }); };
    paper.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; x0 = e.clientX; t0 = performance.now(); paper.setPointerCapture(e.pointerId); });
    paper.addEventListener('pointermove', e => { if (x0 == null || dismissing) return; const dx = e.clientX - x0; tx.set(dx); crumple.set(Math.min(1, Math.abs(dx) / 260)); });
    paper.addEventListener('pointerup', e => { if (x0 == null) return; const dx = e.clientX - x0, v = Math.abs(dx) / Math.max(1, performance.now() - t0); x0 = null;
      if (Math.abs(dx) >= 90 || v >= 0.5) away(dx >= 0 ? 1 : -1); else { tx.spring(0, { friction: 7, tension: 60 }); crumple.spring(0, { friction: 7, tension: 60 }); } });
    paper.addEventListener('wheel', e => { if (Math.abs(e.deltaX) > 30) away(e.deltaX > 0 ? 1 : -1); }, { passive: true });
  }
  function close() { overlay?.remove(); overlay = null; due = null; }

  started = {
    refresh,
    async createAlert(schedule, content) {
      const next = computeNextTrigger(schedule);
      const { error } = await db.from('throw_alerts').insert({ user_id: myId, message_text: content.messageText, strokes: content.strokes ?? null, pen_color: content.penColor,
        recurrence_type: schedule.recurrence, days_of_week: schedule.recurrence === 'weekly' ? schedule.daysOfWeek : null, day_of_month: schedule.recurrence === 'monthly' ? schedule.dayOfMonth : null,
        hour: schedule.hour, minute: schedule.minute, next_trigger_at: next.toISOString() });
      if (error) return { error: error.message };
      await refresh(); return { error: null };
    },
  };
  return started;
}
