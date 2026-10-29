// The harbour's social life with the local sailors (cpu-captains.js, drawn by cpu-fleet.js):
// - the Harbour board (top bar): today's feed of catches, sales and comings and goings, and the week's records;
// - a ticker on the scene for what happens near you (and the harbour's big catches);
// - waves and replies: captains near you wave, cheer your catches, and wave back from their card;
// - real captains online (online.js): their card, waves both ways, and their catches near you on the ticker.
// Everything but the live captains is Pune Paradise only (cpu: false elsewhere).
// The feed and records come from the same seeded schedules, so every account sees the same harbour.
import { captain, harbourFeed, harbourRecords, placeNear, fishNameOf } from './cpu-captains.js';
import { captainCard, liveCard } from './cpu-card.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const kgs = kg => kg >= 10 ? kg.toFixed(1) : kg.toFixed(2);
const first = c => c.name.split(' ')[0];
const pick = (a, r = Math.random()) => a[Math.floor(r * a.length)];
const ago = ms => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? 'now' : m < 60 ? `${m} min ago` : `${Math.floor(m / 60)} h ago`; };
const BIG_KG = 6; // a catch this heavy makes the harbour ticker wherever it happens

// what each captain says: a greeting as you pass, a reply when you wave, and a cheer for your catch
const VOICE = {
  arjun: { hi: ['Morning, {you}.', 'Steady as she goes.'], wave: ['Ahoy, {you}. The Rohu bite early near Kharadi.', 'Good to see you out, {you}.'], cheer: ['Well landed.', 'That’s a proper fish.'] },
  priya: { hi: ['Ahoy, {you}! Lovely breeze.', 'Follow the birds!'], wave: ['Ahoy, {you}! Watch for the birds, the fish are under them.', 'Hi {you}! Off on a long loop, come along.'], cheer: ['Ooh, nice one!', 'Beautiful catch!'] },
  ravi: { hi: ['Coming through!', 'Fast lane, {you}!'], wave: ['Yo {you}! Sell while the price is good.', 'Can’t stop, money to make!'], cheer: ['Cha-ching!', 'That’ll sell well!'] },
  meera: { hi: ['Peaceful today, isn’t it?', 'Hello, {you}.'], wave: ['Hello, {you}. Be patient, they always come.', 'Namaste, {you}. Calm water near the shore today.'], cheer: ['Lovely, well done.', 'Patience pays!'] },
  sameer: { hi: ['Lamp’s on, {you}.', 'Good night for Murrel.'], wave: ['Evening, {you}. The Murrel bite best after dark.', 'Keep your lamp lit out there.'], cheer: ['Good one in the dark!', 'Night fish, nice.'] },
  ananya: { hi: ['Hiii {you}!', 'Look how many I got!'], wave: ['Hi {you}!! I caught SO many Tilapia today!', 'Hey! Isha and I are fishing over here!'], cheer: ['Wow, amazing!!', 'Whoa, show me!'] },
  vikram: { hi: ['…', 'Mind my spot.'], wave: ['Hm. Small fish aren’t worth the time, {you}.', 'Go far if you want a trophy.'], cheer: ['Not bad.', 'Decent.'] },
  fatima: { hi: ['Room for one more?', 'Hey {you}, mind if I join?'], wave: ['Hey {you}! Mind if I fish beside you?', 'Hi! Everyone’s friendlier on the water.'], cheer: ['Yay, great catch!', 'Nicely done, {you}!'] },
  rohan: { hi: ['See you at the station!', 'Morning, {you}!'], wave: ['Ahoy {you}! Fish Market’s paying fair today.', 'Hey! I’m always round the station, say hi.'], cheer: ['Sell that at the station!', 'Good haul!'] },
  sneha: { hi: ['Finally on the water!', 'Hi {you}!'], wave: ['Hi {you}! Weekends are for sailing.', 'Hey! Squeezing in a quick trip.'], cheer: ['Nice one!', 'Great catch, {you}!'] },
  kabir: { hi: ['Out of my way.', 'Faster, {you}.'], wave: ['I’ll beat Vikram’s record this week. Watch.', 'Fishing where the big ones are, {you}.'], cheer: ['I’ll beat that.', 'Mine was bigger.'] },
  isha: { hi: ['Oh, hi…', 'H-hello.'], wave: ['Oh! Hi {you}… I’m with Ananya.', 'Hi… nice boat.'], cheer: ['Wow…', 'That’s really good.'] },
  dev: { hi: ['Quick trip between calls!', 'Hey {you}.'], wave: ['Hey {you}! Ten minutes till my next meeting.', 'Sneaking out for a quick one.'], cheer: ['Efficient!', 'Nice, quick work.'] },
  nisha: { hi: ['Seen anything new?', 'Hello, {you}!'], wave: ['Hi {you}! Found a new species yet? I’m collecting them all.', 'Hello! Rare fish out by the far spots.'], cheer: ['Ooh, which species?', 'Add it to the log!'] },
  aditya: { hi: ['Race you!', 'Whoosh!'], wave: ['Race you to the buoy, {you}!', 'Speed is life!'], cheer: ['Quick one!', 'Fast catch!'] },
  zoya: { hi: ['Evening, {you}.', 'Quiet water tonight.'], wave: ['Evening, {you}. Sameer and I sail till late.', 'The stars are out, it’s lovely.'], cheer: ['Lovely catch.', 'Well done, {you}.'] },
  harsh: { hi: ['Big hold, big day!', 'Ahoy, {you}!'], wave: ['Ahoy {you}! Fill the hold before you sell, saves trips.', 'Good day for a big haul!'], cheer: ['Great haul!', 'That’s the spirit!'] },
  kavya: { hi: ['Golden light today.', 'Hi {you}.'], wave: ['Hi {you}! The lighthouse at sunset is the best view.', 'Just drifting and taking photos.'], cheer: ['Ooh, let me get a photo!', 'Picture-perfect catch.'] },
  omkar: { hi: ['Arey {you}! Kaise ho?', 'Ahoy, friend!'], wave: ['Arey {you}! Arjun and I fish at dawn, come by.', 'Lazy afternoon, perfect for fishing.'], cheer: ['Waah, superb!', 'Arey wah, nice!'] },
  riya: { hi: ['Who knows where I’m going!', 'Hey {you}!'], wave: ['Hey {you}! No plan today, just vibes.', 'Somewhere new every day!'], cheer: ['Yesss!', 'Lucky!'] },
};
const line = (c, k, you) => pick((VOICE[c.id] || VOICE.priya)[k]).replace('{you}', you);

/** A row of the feed, as text (the ticker) and as a board row. */
const text = e => {
  const n = first(e.c), at = placeNear(e.p[0], e.p[1]);
  if (e.kind === 'catch') return `${n} landed a ${kgs(e.kg)} kg ${fishNameOf(e.fish)} near ${at}`;
  if (e.kind === 'sell') return `${n} sold ${e.n} fish for ${e.coins} coins at Paradise Station`;
  if (e.kind === 'out') return `${n} set out from ${e.c.home}`;
  return `${n} is heading home to ${e.c.home}`;
};

export function createHarbour({ hud, fleet, online, cpu = true, playerPos, playerName }) {
  const $ = id => document.getElementById(id);
  const you = () => (playerName() || 'Captain').split(' ')[0];

  // ---- the captain's card, with a Wave button ----
  function openCaptain(c) {
    if (c.live) return openLive(c);
    const k = captainCard(c); hud.openPanel(k.title, k.sub, k.html, 'captain');
    const b = document.querySelector('#sheet-body .cp-wave button'), reply = document.querySelector('#sheet-body .cp-reply');
    b?.addEventListener('click', () => { b.disabled = true; b.textContent = 'Waved'; setTimeout(() => {
      const said = line(c, 'wave', you()); reply.innerHTML = `<b>${esc(first(c))}</b> waves back: “${esc(said)}”`; reply.hidden = false; fleet.say(c.id, said, 7000); }, 900 + Math.random() * 900); });
  }

  // a real captain's card: a wave goes to them for real
  function openLive(c) {
    const st = online?.list().find(p => 'u:' + p.id === c.id)?.st, k = liveCard(c, st); hud.openPanel(k.title, k.sub, k.html, 'captain');
    const b = document.querySelector('#sheet-body .cp-wave button'), reply = document.querySelector('#sheet-body .cp-reply');
    b?.addEventListener('click', () => { online?.wave(c.uid); b.disabled = true; b.textContent = 'Waved'; reply.textContent = `You waved at ${first(c)}. They’ll see it over your boat.`; reply.hidden = false; });
  }

  // ---- the Harbour board ----
  const btn = $('tb-board'), mBtn = $('hm-board'); btn.hidden = !cpu; if (mBtn) mBtn.hidden = !cpu;
  function openBoard(tab = 'live') {
    const feed = harbourFeed(Date.now(), 40), rec = harbourRecords(Date.now(), 7), out = fleet.out(), people = online?.count() || 0;
    const rows = feed.map((e, i) => `<button type="button" class="hb-row k-${e.kind}" style="--n:${Math.min(i, 12)}" data-c="${e.c.id}"><i class="cp-sw" style="background:${e.c.colours.sail || e.c.colours.hull}"></i><span>${esc(text(e))}</span><time>${ago(e.ms)}</time></button>`).join('')
      || '<p class="hb-empty">The harbour is quiet. The first boats head out before dawn.</p>';
    let best = null; try { const log = JSON.parse(localStorage.getItem('sailo:fishlog') || '{}'); Object.entries(log).forEach(([id, r]) => { if (!best || r.best > best.kg) best = { id, kg: r.best }; }); } catch { /* storage blocked */ }
    const podium = (list, val) => list.map((r, i) => `<button type="button" class="hb-rec" data-c="${r.c.id}"><em>${i + 1}</em><span><b>${esc(r.c.name)}</b><small>${val(r)}</small></span></button>`).join('');
    hud.openPanel('Harbour board', `${people ? `${people} captain${people === 1 ? '' : 's'} online · ` : ''}${out} local sailor${out === 1 ? '' : 's'} out now · Pune Paradise`, `
      <div class="gf-tabs hb-tabs" role="tablist"><button type="button" role="tab" data-tab="live">Today</button><button type="button" role="tab" data-tab="rec">Records</button></div>
      <div class="hb-pane" data-pane="live">${rows}</div>
      <div class="hb-pane" data-pane="rec">
        <section class="cp-sec"><h4>Biggest fish · this week</h4>${podium(rec.biggest, r => `${kgs(r.kg)} kg ${esc(fishNameOf(r.fish))}`)}
          ${best ? `<p class="cp-dim">Your best ever: ${kgs(best.kg)} kg ${esc(fishNameOf(best.id))}</p>` : ''}</section>
        <section class="cp-sec"><h4>Most fish · this week</h4>${podium(rec.most, r => `${r.n} fish`)}</section>
        <section class="cp-sec"><h4>Most coins · this week</h4>${podium(rec.richest, r => `${r.coins} coins`)}</section>
      </div>
      <p class="cp-note">Local sailors are Sailo’s harbour regulars: computer captains who sail Pune Paradise every day. Tap a name to see their card.</p>`, 'board');
    const body = $('sheet-body');
    const show = t => { body.querySelectorAll('[data-tab]').forEach(b => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); }); body.querySelectorAll('[data-pane]').forEach(p => { p.hidden = p.dataset.pane !== t; }); };
    body.querySelector('.hb-tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) show(b.dataset.tab); });
    body.addEventListener('click', e => { const r = e.target.closest('[data-c]'); if (r) openCaptain(captain(r.dataset.c)); });
    show(tab);
  }
  btn.addEventListener('click', () => openBoard());

  // ---- the ticker: what happens near you, and the harbour's big catches ----
  const tk = document.createElement('button'); tk.type = 'button'; tk.id = 'hb-ticker'; tk.innerHTML = '<i></i><span></span>'; document.body.appendChild(tk);
  tk.addEventListener('click', () => { tk.classList.remove('show'); openBoard(); });
  let seen = Date.now(), tickT = 0, hideT = 0, lastShown = 0; const queue = [];
  const flash = (txt, colour) => { tk.querySelector('i').style.background = colour; tk.querySelector('span').textContent = txt;
    tk.classList.remove('show'); void tk.offsetWidth; tk.classList.add('show'); clearTimeout(hideT); hideT = setTimeout(() => tk.classList.remove('show'), 7000); };
  function tick() {
    if (!cpu) return;
    const now = Date.now(), me = playerPos();
    harbourFeed(now, 30).filter(e => e.ms > seen).reverse().forEach(e => {
      const d = Math.hypot(e.p[0] - me.x, e.p[1] - me.z), near = d < 3000;
      if ((e.kind === 'catch' && (near || e.kg >= BIG_KG)) || (e.kind === 'sell' && e.coins >= 150) || (near && e.kind !== 'sell')) queue.push(e); });
    seen = now; queue.splice(0, Math.max(0, queue.length - 3)); // (only the latest few are worth saying)
    if (queue.length && now - lastShown > 25000 && !document.querySelector('#sheet.open')) {
      const e = queue.pop(); queue.length = 0; lastShown = now; flash(text(e), e.c.colours.sail || e.c.colours.hull);
    }
  }

  // ---- waves: a captain who comes near greets you (once in a while), and cheers your catches ----
  const greeted = new Map();
  function greet() {
    const now = Date.now(); const n = fleet.near().find(q => !q.c.live && q.d < 220 && now - (greeted.get(q.c.id) || 0) > 20 * 60000);
    if (n && fleet.say(n.c.id, '👋 ' + line(n.c, 'hi', you()))) greeted.set(n.c.id, now);
  }
  addEventListener('sailo:caught', e => {
    online?.caught(e.detail?.fish, e.detail?.kg);
    const n = fleet.near().filter(q => q.d < 700 && !q.c.live); if (!n.length) return;
    const c = pick(n).c, big = e.detail?.record;
    setTimeout(() => fleet.say(c.id, big ? (e.detail.isNew ? 'A new species? Lucky you!' : 'A new record, well done!') : line(c, 'cheer', you())), 1400 + Math.random() * 1200);
  });

  // a real captain waved at you, or landed a fish near you
  function waved(p) { const said = fleet.say('u:' + p.id, '👋 Waving at you!', 7000); hud.note(`${p.name} waved at you${said ? '' : ' from across the water'}. Tap their boat to wave back.`, 6000); }
  function caughtBy(p, d) {
    const L = p.last, me = playerPos(); if (!L || Math.hypot(L.x - me.x, L.z - me.z) > 3000) return;
    const what = `${d.kg ? kgs(d.kg) + ' kg ' : ''}${fishNameOf(d.fish)}`; fleet.say('u:' + p.id, `🎣 ${what}!`, 5000);
    flash(`${p.name.split(' ')[0]} landed a ${what} nearby`, p.colours.sail || p.colours.hull || p.colours.flag || '#6EE7C5'); lastShown = Date.now();
  }

  /** Called every frame; the checks run about once a second. */
  function update() { const now = Date.now(); if (now < tickT) return; tickT = now + 1000; tick(); greet(); }
  return { update, openCaptain, openBoard, waved, caughtBy, _rewind: min => { seen -= min * 60000; lastShown = 0; } }; // (_rewind: tests replay the last minutes)
}
