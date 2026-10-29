// Live captains: real players on the same chart see each other's boats. Supabase Realtime over its
// websocket (Phoenix protocol, no client library, like auth.js), on a private channel per chart
// ("sailo:<chart id>") that only signed-in captains can join (migration ..._sailov2_live_captains.sql):
// - presence: who is on the water (name, boat, colours, rank);
// - broadcasts: positions (every second while moving, every 5 s at rest), waves, and catches.
// Nothing is stored; when a captain closes the game they leave the channel and their boat goes.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase.js';

const session = () => { try { return JSON.parse(localStorage.getItem('sailo:session')); } catch { return null; } };
const STALE = 20000; // ms without news before a boat is dropped
const SEND_MS = 500, DELAY = SEND_MS + 350; // positions go out twice a second while moving; others are drawn this far behind real time

/**
 * @param chartId the chart everyone shares (one channel each)
 * @param me () => { x, z, yaw, kn, kind, boat, colours, name, rank, catches }
 * @param on { wave(p), caught(p, detail), radio(kind, p, payload), change() }
 * @param positions false for a channel that only carries the radio (the worldwide one)
 */
export function createOnline({ chartId, me, on = {}, positions = true }) {
  const s0 = session(); if (!s0?.user?.id) return null; // (signed-in captains only)
  const uid = s0.user.id, topic = `realtime:sailo:${chartId}`, players = new Map(); // id -> { id, name, boat, colours, rank, catches, last: {x,z,yaw,kn,kind,t}, seen }
  let ws = null, ref = 0, joined = false, retry = 1000, hb = 0, tokenT = 0, posT = 0, sent = null, closed = false;
  const send = (event, payload, t = topic) => { if (ws?.readyState === 1) ws.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref) })); };
  const profile = () => { const m = me(); return { id: uid, name: m.name, boat: m.boat, colours: m.colours, rank: m.rank, catches: m.catches }; };

  function connect() {
    if (closed) return; const s = session(); if (!s?.access_token) return;
    ws = new WebSocket(`${SUPABASE_URL.replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${SUPABASE_KEY}&vsn=1.0.0`);
    ws.onopen = () => { retry = 1000; send('phx_join', { config: { broadcast: { self: false }, presence: { key: uid }, private: true }, access_token: s.access_token });
      clearInterval(hb); hb = setInterval(() => send('heartbeat', {}, 'phoenix'), 25000); };
    ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch { return; } if (m.topic !== topic) return;
      if (m.event === 'phx_reply' && m.payload?.status === 'ok' && !joined) { joined = true; track(); sent = null; posT = 0; }
      else if (m.event === 'phx_reply' && m.payload?.status === 'error') { joined = false; }
      else if (m.event === 'presence_state') Object.entries(m.payload || {}).forEach(([k, v]) => meet(k, v.metas?.[0]));
      else if (m.event === 'presence_diff') { Object.entries(m.payload?.joins || {}).forEach(([k, v]) => meet(k, v.metas?.[0])); Object.keys(m.payload?.leaves || {}).forEach(k => { if (players.delete(k)) on.change?.(); }); }
      else if (m.event === 'broadcast') hear(m.payload?.event, m.payload?.payload || {});
      else if (m.event === 'phx_error' || m.event === 'phx_close') { joined = false; } };
    ws.onclose = () => { joined = false; clearInterval(hb); if (!closed) setTimeout(connect, retry = Math.min(30000, retry * 2)); };
    ws.onerror = () => { /* onclose follows */ };
  }
  const clean = v => ({ name: String(v?.name || 'Captain').slice(0, 18), boat: ['tug', 'sail', 'yacht', 'dinghy'].includes(v?.boat) ? v.boat : 'tug',
    colours: v?.colours && typeof v.colours === 'object' ? Object.fromEntries(Object.entries(v.colours).filter(([, c]) => /^#[0-9a-f]{3,8}$/i.test(c)).slice(0, 4)) : {},
    rank: String(v?.rank || '').slice(0, 24), catches: Math.max(0, +v?.catches || 0) });
  function meet(id, meta) { if (!meta || id === uid) return; if (!players.has(id)) { sent = null; posT = 0; } // (a newcomer: show them where I am now)
    const p = players.get(id) || { id, last: null, seen: Date.now() }; Object.assign(p, clean(meta)); players.set(id, p); on.change?.(); }
  function hear(event, d) {
    const id = d.id; if (!id || id === uid) return; let p = players.get(id);
    if (event === 'pos') { if (!p) { p = { id, last: null }; players.set(id, p); Object.assign(p, clean(d)); on.change?.(); }
      const n = v => Number.isFinite(+v) ? +v : 0;
      // a timestamped report into the buffer: the sender's clock, mapped to ours by the smallest delay seen so far
      // (network jitter then doesn't shake the boat); reports that arrive out of order are dropped
      const now = Date.now(), ts = Number.isFinite(+d.ts) ? +d.ts : now, lag = now - ts;
      p.off = p.off == null || lag < p.off ? lag : p.off + (lag - p.off) * 0.02;
      const s = { x: n(d.x), z: n(d.z), yaw: n(d.yaw), kn: n(d.kn), kind: ['sail', 'fish', 'anchor', 'dock'].includes(d.kind) ? d.kind : 'sail', nos: !!d.nos, t: ts + p.off }; // (nos: boosting)
      p.buf = p.buf || []; if (p.buf.length && s.t <= p.buf[p.buf.length - 1].t) return;
      p.buf.push(s); if (p.buf.length > 12) p.buf.shift(); p.last = s; p.seen = now; }
    else if (event === 'wave' && d.to === uid && p) on.wave?.(p);
    else if (event === 'caught' && p) on.caught?.(p, { fish: String(d.fish || ''), kg: Math.max(0, +d.kg || 0) });
    else if (String(event).startsWith('radio:') && (!d.to || d.to === uid)) on.radio?.(event.slice(6), p || { id, ...clean(d), last: null }, d); // (radio.js)
  }
  const track = () => send('presence', { type: 'presence', event: 'track', payload: profile() });

  /** Every frame: send my position when it changes (at most once a second), refresh the token now and then. */
  function update() {
    const now = Date.now(); if (!joined) return;
    if (positions && now > posT) { const m = me(), moved = !sent || Math.hypot(m.x - sent.x, m.z - sent.z) > 0.8 || Math.abs(m.yaw - sent.yaw) > 0.02 || m.kind !== sent.kind || !!m.nos !== !!sent.nos;
      if (moved || now - sent.t > 5000) { sent = { x: m.x, z: m.z, yaw: m.yaw, kind: m.kind, nos: !!m.nos, t: now };
        send('broadcast', { type: 'broadcast', event: 'pos', payload: { ...profile(), x: +m.x.toFixed(2), z: +m.z.toFixed(2), yaw: +m.yaw.toFixed(3), kn: +m.kn.toFixed(1), kind: m.kind, ...(m.nos ? { nos: 1 } : {}), ts: now } }); }
      posT = now + SEND_MS; }
    if (now > tokenT) { tokenT = now + 5 * 60000; const s = session(); if (s?.access_token) send('access_token', { access_token: s.access_token }); }
    players.forEach((p, k) => { if (now - (p.seen || 0) > STALE && p.last) { players.delete(k); on.change?.(); } });
  }
  /** The captains on the water now, with where their boat should be drawn: their reports played back a moment
   *  behind real time, blended between the two around that moment (past the newest one, carried on along its
   *  course for up to 1.5 s, then held). */
  function list() {
    const now = Date.now(), rt = now - DELAY, out = [], wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    players.forEach(p => { const b = p.buf; if (!b?.length) return; let st;
      const i = b.findIndex(s => s.t > rt);
      if (i > 0) { const a = b[i - 1], c = b[i], k = (rt - a.t) / (c.t - a.t);
        st = { x: a.x + (c.x - a.x) * k, z: a.z + (c.z - a.z) * k, yaw: a.yaw + wrap(c.yaw - a.yaw) * k, kind: k < 0.5 ? a.kind : c.kind, nos: k < 0.5 ? a.nos : c.nos, speed: Math.hypot(c.x - a.x, c.z - a.z) / Math.max(0.05, (c.t - a.t) / 1000) }; }
      else { const L = i === 0 ? b[0] : b[b.length - 1], dt = i === 0 ? 0 : Math.min(1.5, (rt - L.t) / 1000), v = L.kind === 'sail' ? L.kn * 0.5144 : 0;
        st = { x: L.x + Math.cos(L.yaw) * v * dt, z: L.z - Math.sin(L.yaw) * v * dt, yaw: L.yaw, kind: L.kind, nos: L.nos && dt < 1, speed: v }; }
      out.push({ ...p, st }); });
    return out;
  }
  connect();
  addEventListener('pagehide', () => { closed = true; try { ws?.close(); } catch { /* closing */ } });
  return {
    update, list, count: () => [...players.values()].filter(p => p.last).length, people: () => players.size,
    wave: id => send('broadcast', { type: 'broadcast', event: 'wave', payload: { id: uid, to: id } }),
    /** A radio message (radio.js): to everyone on this channel, or one captain (payload.to). */
    radio: (kind, payload) => send('broadcast', { type: 'broadcast', event: 'radio:' + kind, payload: { ...payload, id: uid, name: me().name } }),
    me: uid,
    caught: (fish, kg) => send('broadcast', { type: 'broadcast', event: 'caught', payload: { id: uid, fish, kg } }),
    track,
  };
}
