// First voyage: a three-step guide for a new captain that teaches the whole loop in a couple of minutes.
//   1. set a course (tap the water, or steer with the wheel)      +10 coins
//   2. catch a fish (tap the tug, Go fishing, hold on the sea)    +15 coins
//   3. sell it at Paradise Station's Fish Market ("Show me" sets a course there)   +25 coins
// Each step finishes by doing it. Skip ends it. Progress is kept in sailo:voyage (saved with the account),
// and returning captains (anyone who has sailed before) never see it.
const KEY = 'sailo:voyage';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* storage blocked */ } };

const touch = matchMedia('(pointer: coarse)').matches;
const STEPS = [
  { title: 'Set a course', text: touch ? 'Tap anywhere on the water, or push the wheel’s lever up to sail.' : 'Click anywhere on the water, or push the wheel’s lever up to sail.', coins: 10 },
  { title: 'Catch a fish', text: 'Tap your tug, choose Go fishing, then hold on the sea to cast. Strike when it bites!', coins: 15 },
  { title: 'Sell it at Paradise Station', text: 'Keep a fish, sail into port and sell it at the Fish Market.', coins: 25, showMe: true },
];

/** Starts the guide for a new captain. `isNew`: nothing has been sailed yet on this account / device. */
export function initFirstVoyage({ isNew, addCoins, holdCount, pinStation, onToast }) {
  let v = read();
  if (!v) { if (!isNew) { write({ done: true }); return { update() {} }; } v = { step: 0 }; write(v); }
  if (v.done) return { update() {} };

  const el = document.createElement('div'); el.id = 'voyage'; el.setAttribute('role', 'status');
  el.innerHTML = `<small><span class="vg-k">First voyage</span> · <span class="vg-n"></span></small><b class="vg-t"></b><p class="vg-p"></p>
    <div class="vg-row"><span class="vg-dots"><i></i><i></i><i></i></span><span class="vg-btns"><button type="button" class="vg-show">Show me</button><button type="button" class="vg-skip">Skip</button></span></div>
    <span class="vg-reward" aria-hidden="true"></span>`;
  document.body.appendChild(el);
  const $ = s => el.querySelector(s);
  ['pointerdown', 'pointerup', 'click'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));

  const paint = () => { const s = STEPS[v.step];
    $('.vg-n').textContent = `${v.step + 1} / ${STEPS.length}`; $('.vg-t').textContent = s.title;
    $('.vg-p').textContent = s.showMe && !holdCount() ? 'Catch another fish and keep it, then sail to Paradise Station and sell it at the Fish Market.' : s.text;
    $('.vg-show').hidden = !s.showMe;
    el.querySelectorAll('.vg-dots i').forEach((d, i) => { d.classList.toggle('on', i === v.step); d.classList.toggle('done', i < v.step); });
    el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); };
  const finish = (skipped = false) => { v = { done: true }; write(v); clearInterval(hint);
    if (skipped) { el.classList.add('out'); setTimeout(() => el.remove(), 400); return; }
    $('.vg-n').textContent = 'Complete'; $('.vg-t').textContent = 'You’re a real captain now'; $('.vg-p').textContent = 'Explore any city, find rarer fish and buy new boats in the Garage.';
    $('.vg-row').hidden = true; el.classList.add('win'); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 400); }, 5000); };
  const next = () => { const s = STEPS[v.step]; addCoins(s.coins); onToast?.(`${s.title} · +${s.coins} coins`);
    const r = $('.vg-reward'); r.textContent = `+${s.coins}c`; r.classList.remove('go'); void r.offsetWidth; r.classList.add('go');
    if (v.step + 1 >= STEPS.length) { finish(); return; } v = { step: v.step + 1 }; write(v); setTimeout(paint, 700); };

  $('.vg-skip').addEventListener('click', () => finish(true));
  $('.vg-show').addEventListener('click', () => pinStation());
  addEventListener('sailo:sold', () => { if (!v.done && v.step === 2) next(); });
  const hint = setInterval(() => { if (!v.done && STEPS[v.step]?.showMe) paint.call(null); }, 6000); // (refreshes the step 3 text when a fish is kept)
  paint();

  let base = null; // what the world looked like when this step began
  return {
    /** Called every frame with the sailing state. */
    update({ courseOn, dist, catchN }) {
      if (v.done) return;
      if (!base || base.step !== v.step) base = { step: v.step, dist, catchN };
      if (v.step === 0 && (courseOn || dist - base.dist > 25)) next();
      else if (v.step === 1 && catchN > base.catchN) next();
    },
  };
}
