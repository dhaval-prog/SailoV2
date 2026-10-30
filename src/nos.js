// The NOS button at the helm (on the circle round the wheel, helm-orbit.js), shown once the boat you're sailing has
// NOS. A thin arc round it is the charge left; it glows while boosting and fills back up as it cools down. A tap (or N
// on a keyboard) asks the station for a boost (the server's say, when signed in: station.js) and hands the seconds
// granted to the boat (main.js). Under way only.
import { ECONOMY } from './world-config.js';

export function createNos({ station, orbit, moving, boost, note }) {
  const N = ECONOMY.nos, R = 26, C = 2 * Math.PI * R;
  const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'nos-btn'; btn.setAttribute('aria-label', 'NOS boost'); btn.hidden = true;
  btn.innerHTML = `<svg viewBox="0 0 60 60" aria-hidden="true"><circle class="nb-track" cx="30" cy="30" r="${R}"/><circle class="nb-charge" cx="30" cy="30" r="${R}" pathLength="${C.toFixed(2)}"/>
    <path class="nb-ico" d="M33 13 21 32h8l-3 15 13-20h-8z"/></svg>`;
  document.body.appendChild(btn);
  const charge = btn.querySelector('.nb-charge');
  let until = 0, firing = false;
  // sound: a rising rush of air (Web Audio, no files)
  let ac = null; const whoosh = () => { try { ac ||= new (window.AudioContext || window.webkitAudioContext)(); const t = ac.currentTime, len = 1.2, b = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.min(1, i / (ac.sampleRate * 0.08)) * Math.exp(-i / (ac.sampleRate * 0.55));
    const src = ac.createBufferSource(), bp = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = b; bp.type = 'bandpass'; bp.Q.value = 1.4; bp.frequency.setValueAtTime(500, t); bp.frequency.exponentialRampToValueAtTime(2600, t + 0.9); g.gain.value = 0.18;
    src.connect(bp).connect(g).connect(ac.destination); src.start(t); } catch { /* no audio */ } };
  async function fire() {
    if (firing || Date.now() < until) return;
    if (!moving()) { note('Get under way first: NOS works while you’re moving.'); return; }
    firing = true; btn.classList.add('asking');
    const dur = await station.fireNos(); firing = false; btn.classList.remove('asking');
    if (dur > 0) { until = Date.now() + dur * 1000; boost(dur); whoosh(); if (navigator.vibrate) navigator.vibrate(20); }
    paint();
  }
  btn.addEventListener('click', fire);
  addEventListener('keydown', e => { if ((e.key === 'n' || e.key === 'N') && !e.target.closest?.('input, textarea')) fire(); });
  // (written to only when something changed: writes between the frame's measurements cost a layout)
  const shown = {}, put = (k, v, fn) => { if (shown[k] !== v) { shown[k] = v; fn(v); } };
  function paint() {
    const n = station.nos(); put('hidden', !n.owned, v => { btn.hidden = v; }); if (!n.owned) return;
    const boosting = Date.now() < until, cooling = !boosting && n.readyIn > 0;
    const k = boosting ? (until - Date.now()) / (N.burst * 1000) : n.charge / n.cap; // (while boosting: the burst running out)
    put('k', Math.max(0, k).toFixed(3), v => { charge.style.strokeDasharray = `${(v * C).toFixed(1)} ${C.toFixed(1)}`; });
    put('state', `${boosting}|${cooling}|${n.charge <= 0.05 && !boosting}`, () => { btn.classList.toggle('on', boosting); btn.classList.toggle('cool', cooling); btn.classList.toggle('empty', n.charge <= 0.05 && !boosting); });
    put('label', boosting ? 'NOS boosting' : n.charge <= 0.05 ? 'NOS empty: refill at the Boathouse' : cooling ? 'NOS cooling down' : `NOS boost (${n.charge.toFixed(1)} s left)`, v => btn.setAttribute('aria-label', v));
    const p = orbit.nosAt?.(56); put('at', p ? `${Math.round(p[0] - 28)},${Math.round(p[1] - 28)}` : '', v => { if (!v) { btn.style.visibility = 'hidden'; return; } const [x, y] = v.split(',');
      btn.style.left = `${x}px`; btn.style.top = `${y}px`; btn.style.visibility = ''; });
  }
  addEventListener('sailo:econ', paint); setInterval(paint, 250); paint();
  return { get boosting() { return Date.now() < until; } };
}
