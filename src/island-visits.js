// Visiting the islands (island-signs.js decorates the nearest ones by kind). Sail close to one and a card shows what it is
// and its hours. At a restaurant:
// - Fish order: each restaurant wants certain fish today ("Golden Dragon needs 2 Pomfret, pays 1.5x"); deliver from the
//   hold for that bonus over the market price. One order per restaurant a day (the server checks: econ_order).
// - Dine in: a meal (30 coins) for a 3-minute boost: a quicker boat, or fish that bite twice as fast, by the restaurant.
// Every kind of place visited earns a stamp on the city's trail (six to collect). Passing a shrine, you hear its bell.
// Opening hours are each kind's usual ones (island-kinds.js): closed places can't serve, and their lights are off.
import { KINDS, KIND_IDS, isOpen, hoursText } from './island-kinds.js';
import { h32 } from './market.js';

const NEAR = 45, LEAVE = 75, MEAL = 30, BOOST_S = 180;
const STAMP_KEY = 'sailo:stamps', ORDER_KEY = 'sailo:orders';
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const keep = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } };

/**
 * o.islands()  decorated islands near the boat: [{ name, kind, x, z, r }]
 * o.boat()     { x, z }   o.mins()  minutes since midnight, city time   o.tz  the city's time zone   o.city  its name
 * o.fish       the species in these waters [{ id, name, price, img? }]
 * o.station    { deliver({ shop, fish, n, mult }), held(id), price(id), spend(n, why) }
 * o.note(text) a message on the HUD
 */
export function createIslandVisits(o) {
  const el = document.createElement('div'); el.id = 'isle-card'; el.hidden = true; el.setAttribute('role', 'region'); el.setAttribute('aria-label', 'Island');
  document.body.appendChild(el); ['pointerdown', 'click'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));
  let cur = null, boost = null, painted = '', stamps = load(STAMP_KEY, {}), orders = load(ORDER_KEY, {});
  const day = () => new Intl.DateTimeFormat('en-CA', { timeZone: o.tz }).format(new Date()); // (YYYY-MM-DD, the city's date: as the server counts)
  const doneToday = name => (orders.day === day() ? orders.done || [] : []).includes(name);
  const markDone = name => { if (orders.day !== day()) orders = { day: day(), done: [] }; orders.done.push(name); keep(ORDER_KEY, orders); };
  // today's order at a restaurant: the same for every captain (from its name and the date), mostly the commoner fish
  const orderOf = name => { const pool = [...o.fish].sort((a, b) => a.price - b.price), h = h32(name + '|' + day()); if (!pool.length) return null;
    const f = pool[h % Math.max(1, Math.ceil(pool.length * 0.75))], n = f.price >= 30 ? 1 : 1 + ((h >>> 8) % 3), mult = +(1.3 + ((h >>> 16) % 6) * 0.1).toFixed(1);
    return { fish: f, n, mult }; };
  const boostOf = name => (h32('meal|' + name) % 2 ? { type: 'speed', text: '+30% speed' } : { type: 'bite', text: 'fish bite twice as fast' });

  // ---------- a shrine's bell as you pass ----------
  let ac = null; const rung = new Map();
  const audio = () => { if (ac || load('sailo:sound', '') === 'off') return; try { const AC = window.AudioContext || window.webkitAudioContext; ac = AC && new AC(); } catch { /* none */ } };
  addEventListener('pointerdown', audio, { capture: true, once: true });
  const bell = () => { if (!ac || ac.state !== 'running') return; const t = ac.currentTime; [[523, 0.28, 3.2], [1318, 0.12, 2.2], [2093, 0.06, 1.4], [3135, 0.03, 0.9]].forEach(([f, v, d]) => {
    const os = ac.createOscillator(), g = ac.createGain(); os.type = 'sine'; os.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + d);
    os.connect(g).connect(ac.destination); os.start(t); os.stop(t + d + 0.1); }); };

  // ---------- the card ----------
  function paint() {
    if (!cur) { if (!el.hidden) { el.classList.remove('in'); setTimeout(() => { if (!cur) el.hidden = true; }, 220); } painted = ''; return; }
    const k = cur.kind, open = isOpen(k, o.mins()), hrs = hoursText(k, o.mins()), got = KIND_IDS.filter(id => stamps[id]).length;
    let body = '';
    if (k === 'restaurant') {
      const ord = orderOf(cur.name), done = doneToday(cur.name), have = ord ? o.station.held(ord.fish.id) : 0, est = ord ? Math.ceil(ord.n * o.station.price(ord.fish.id) * ord.mult) : 0, b = boostOf(cur.name);
      if (ord) body += `<div class="ic-row"><div><b>Today's order</b><span>${ord.n} × ${esc(ord.fish.name)} · pays ${ord.mult}× (about ${est}c)${done ? '' : ` · ${have} in your hold`}</span></div>
        <button type="button" data-a="deliver" ${done || !open || have < ord.n ? 'disabled' : ''}>${done ? 'Done today ✓' : !open ? 'Closed' : have < ord.n ? `Need ${ord.n - have} more` : 'Deliver'}</button></div>`;
      const active = boost && boost.until > Date.now();
      body += `<div class="ic-row"><div><b>Dine in</b><span>${MEAL}c · ${b.text} for 3 min${active ? ` · ${boost.text} on: ${Math.ceil((boost.until - Date.now()) / 60000)} min left` : ''}</span></div>
        <button type="button" data-a="dine" ${!open || active ? 'disabled' : ''}>${!open ? 'Closed' : active ? 'Enjoying it' : 'Dine in'}</button></div>`;
    } else body += `<p class="ic-line">${{ market: 'Stalls of fruit, cloth and spices along the jetty.', campus: 'Students crossing to class, a bell in the tower.', garden: 'Flower beds and benches under the trees.', shrine: 'Bells and lamps: a quiet stop on the way.', homes: 'A few homes by the water.' }[k] || ''}</p>`;
    const html = `<div class="ic-hd"><span class="ic-kind ${k}">${KINDS[k].label}</span>${hrs ? `<span class="ic-hrs ${open ? 'open' : 'shut'}">${hrs}</span>` : ''}</div>
      <b class="ic-name">${esc(cur.name)}</b>${body}
      <div class="ic-stamps" title="${esc(o.city)} trail"><span>${esc(o.city)} trail · ${got}/${KIND_IDS.length}</span>${KIND_IDS.map(id => `<i class="${stamps[id] ? 'on' : ''}" title="${KINDS[id].stamp}">${KINDS[id].stamp[0]}</i>`).join('')}</div>`;
    if (html === painted) return; painted = html; el.innerHTML = html; if (el.hidden) { el.hidden = false; requestAnimationFrame(() => el.classList.add('in')); }
  }
  el.addEventListener('click', async e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a || !cur) return; const btn = e.target.closest('button'); btn.disabled = true;
    if (a === 'deliver') { const ord = orderOf(cur.name);
      try { const paid = await o.station.deliver({ shop: cur.name, fish: ord.fish.id, n: ord.n, mult: ord.mult }); markDone(cur.name); o.note(`${cur.name} thanks you: +${paid} coins for ${ord.n} ${ord.fish.name}.`); }
      catch (err) { if (/already filled/i.test(err.message)) markDone(cur.name); o.note(err.message); } }
    if (a === 'dine') { const b = boostOf(cur.name);
      if (await o.station.spend(MEAL, 'meal')) { boost = { ...b, until: Date.now() + BOOST_S * 1000 }; o.note(`A meal at ${cur.name}: ${b.text} for 3 minutes.`); } else o.note('Not enough coins for a meal.'); }
    painted = ''; paint(); });

  const stamp = k => { if (stamps[k]) return; stamps[k] = new Date().toISOString(); keep(STAMP_KEY, stamps); const got = KIND_IDS.filter(id => stamps[id]).length;
    o.note(got === KIND_IDS.length ? `Stamp: ${KINDS[k].stamp}. ${o.city} trail complete: all ${got} kinds of place!` : `Stamp: ${KINDS[k].stamp} · ${o.city} trail ${got}/${KIND_IDS.length}`); };

  let t = 0;
  return {
    /** Every frame. */
    update(dt) {
      if ((t -= dt) > 0) return; t = 0.4; const b = o.boat(), list = o.islands();
      let best = null, bd = Infinity; for (const it of list) { const d = Math.hypot(it.x - b.x, it.z - b.z) - it.r; if (d < bd) { bd = d; best = it; } }
      for (const it of list) if (it.kind === 'shrine' && Math.hypot(it.x - b.x, it.z - b.z) - it.r < 80 && Date.now() - (rung.get(it.name) || 0) > 90000) { rung.set(it.name, Date.now()); bell(); }
      if (cur && (!best || best.name !== cur.name || bd > LEAVE)) cur = null;
      if (!cur && best && bd < NEAR) { cur = best; stamp(cur.kind); }
      paint();
    },
    /** The meal's boosts, while they last: how much quicker the boat (x top speed) and the bites (x the wait). */
    speedK: () => (boost && boost.type === 'speed' && boost.until > Date.now() ? 1.3 : 1),
    biteK: () => (boost && boost.type === 'bite' && boost.until > Date.now() ? 2 : 1),
  };
}
