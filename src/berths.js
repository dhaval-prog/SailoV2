// Who holds each berth at Paradise Station, and booking one (migration ..._sailov2_berth_bookings.sql):
// - real captains' bookings live in the database (one captain per berth, guaranteed there); they're read every
//   15 s and at once when someone books or leaves (a nudge over the live channel);
// - the local sailors' berths come from their shared schedule (cpu-captains.js), the same on every device.
// Your own booking: reserved when you pick a berth, occupied (renewed every minute) once moored, releasing as you
// cast off, freed once you're clear, and freed too if you close the game. A booking whose captain goes quiet
// expires by itself, so a berth is never stuck.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase.js';
import { currentSession } from './auth.js';
import { berthsHeld } from './cpu-captains.js';

export function createBerths({ chartId, online, playerName, fleet, cpu }) {
  let bookings = new Map(), mine = null, beat = 0, lastRead = 0;
  const rest = async (path, { method = 'GET', body, keepalive = false } = {}) => {
    const s = await currentSession(); if (!s) throw Object.assign(new Error('signed out'), { code: 'signed_out' });
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, keepalive, body: body ? JSON.stringify(body) : undefined,
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.message || String(r.status)), { code: String(j.message || r.status) }); }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  async function refresh() {
    lastRead = Date.now();
    try { const rows = await rest(`berth_bookings?select=berth,user_id,captain,state,expires_at&chart=eq.${encodeURIComponent(chartId)}&expires_at=gt.${new Date().toISOString()}`);
      bookings = new Map(rows.map(r => [r.berth, r])); }
    catch { /* offline: keep what we knew */ }
    push();
  }
  const meId = () => online?.me;
  // tell the fleet which berths real captains hold, so a local sailor due at one waits offshore
  const push = () => fleet?.setBooked?.(new Map([...bookings].map(([b, r]) => [b, r.captain])));
  const nudge = () => online?.radio('berth', {});

  /** Who holds berth i now: { by: 'you' | 'captain' | 'local', name } or null. */
  function info(i) {
    const r = bookings.get(i);
    if (r && Date.parse(r.expires_at) > Date.now()) return { by: r.user_id === meId() ? 'you' : 'captain', name: r.captain, state: r.state };
    if (cpu) { const c = berthsHeld().get(i); if (c) return { by: 'local', name: c.name }; }
    return null;
  }
  /** Book berth i before sailing in: { ok, offline?, msg? }. */
  async function book(i) {
    const held = info(i); if (held && held.by !== 'you') return { ok: false, msg: held.by === 'local' ? `${held.name.split(' ')[0]} is moored at that berth.` : `${held.name} has that berth.` };
    try { const r = await rest('rpc/book_berth', { method: 'POST', body: { p_chart: chartId, p_berth: i, p_captain: String(playerName() || 'Captain').slice(0, 18) } });
      if (mine && mine.berth !== i) bookings.delete(mine.berth);
      mine = { berth: i }; bookings.set(i, r); renew('reserved'); push(); nudge(); return { ok: true }; }
    catch (e) {
      if (e.code === 'berth_taken') { await refresh(); const h = info(i); return { ok: false, msg: `${h?.name || 'Another captain'} just took that berth. Pick another?` }; }
      if (e.code === 'signed_out' || e instanceof TypeError) return { ok: true, offline: true }; // (no signal: moor anyway; nobody else can see this harbour)
      return { ok: false, msg: 'The harbour master didn’t answer. Try again?' };
    }
  }
  // while sailing in or moored, the booking is renewed every minute (a slow device can take a while to moor)
  function renew(s) { clearInterval(beat); if (s !== 'reserved' && s !== 'occupied') return; const b = mine?.berth;
    beat = setInterval(() => { if (mine?.berth === b) rest('rpc/berth_state', { method: 'POST', body: { p_chart: chartId, p_berth: b, p_state: s } }).catch(() => {}); }, 60000); }
  /** Your booking moves on: 'occupied' (moored), 'releasing' (casting off) or 'free' (clear of the pier). */
  async function state(s) {
    if (!mine) return; const b = mine.berth; renew(s);
    try { await rest('rpc/berth_state', { method: 'POST', body: { p_chart: chartId, p_berth: b, p_state: s } }); } catch { /* it expires by itself */ }
    if (s === 'free') { mine = null; bookings.delete(b); }
    else { const r = bookings.get(b); if (r) r.state = s; }
    push(); nudge();
  }
  // closing the game frees the berth (and if that doesn't get through, the booking expires)
  addEventListener('pagehide', () => { if (!mine) return; const s = JSON.parse(localStorage.getItem('sailo:session') || 'null');
    if (s?.access_token) fetch(`${SUPABASE_URL}/rest/v1/rpc/berth_state`, { method: 'POST', keepalive: true, body: JSON.stringify({ p_chart: chartId, p_berth: mine.berth, p_state: 'free' }),
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } }).catch(() => {}); });

  refresh();
  return {
    info, book, state, refresh,
    /** A nudge from another captain (online.js radio:berth): read the bookings again. */
    heard: () => { if (Date.now() - lastRead > 800) refresh(); },
    /** Every frame; reads the bookings every 15 s. */
    update: () => { if (Date.now() - lastRead > 15000) refresh(); },
    get mine() { return mine?.berth ?? null; },
  };
}
