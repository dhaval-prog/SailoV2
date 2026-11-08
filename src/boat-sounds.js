// The sound of the boat you sail and of the sea round it, made with the Web Audio API (no sound files). Every boat has
// its own voice, louder and higher the faster it goes:
//   Lighthouse Tug  a diesel: a low, steady chug
//   Wooden Tug      an old single-cylinder engine: a slow, knocking putt-putt with a ring of metal
//   Motor Yacht     twin engines: a smooth, rising hum with a turbine whine over it
//   Sail Boat       no engine: wind in the sails, gusting, with the odd creak of the rigging
//   Dinghy          no engine: a lighter, brighter wind, and water slapping the small hull
//   Voyager         a steam engine: a deep hum, the chuff of the stack, and the churn of the two screws
// The sea: a slow swell and waves lapping (more in rough weather), and the rush of water past the hull with the speed.
// Starts with the captain's first touch (browsers don't allow sound before that) and goes quiet while the app is hidden.
// Turned off with localStorage 'sailo:sound' = 'off'.
export function createBoatSounds() {
  let ac = null, out = null, noise = null, voice = null, voiceId = null, sea = null;
  const off = () => { try { return localStorage.getItem('sailo:sound') === 'off'; } catch { return false; } };
  const start = () => { if (ac || off()) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try { ac = new AC(); out = ac.createGain(); out.gain.value = 0; out.connect(ac.destination); out.gain.setTargetAtTime(0.55, ac.currentTime, 0.6);
      const len = ac.sampleRate * 2, b = ac.createBuffer(1, len, ac.sampleRate), d = b.getChannelData(0); let last = 0;
      for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; last = (last + 0.02 * w) / 1.02; d[i] = w * 0.5 + last * 3; } noise = b; // (white with a little brown in it)
      sea = buildSea(); } catch { ac = null; } };
  addEventListener('pointerdown', start, { capture: true }); addEventListener('keydown', start, { capture: true });
  document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend?.(); else ac.resume?.(); });

  // ---------- building blocks ----------
  const gain = (v = 0, to = out) => { const g = ac.createGain(); g.gain.value = v; g.connect(to); return g; };
  const filt = (type, f, q = 0.7, to) => { const n = ac.createBiquadFilter(); n.type = type; n.frequency.value = f; n.Q.value = q; if (to) n.connect(to); return n; };
  const osc = (type, f, to) => { const o = ac.createOscillator(); o.type = type; o.frequency.value = f; o.connect(to); o.start(); return o; };
  const loopNoise = (to, rate = 1) => { const s = ac.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = rate; s.loopStart = Math.random(); s.connect(to); s.start(); return s; };
  const set = (p, v, tc = 0.12) => p.setTargetAtTime(v, ac.currentTime, tc);
  /** A short burst of filtered noise (a knock, a chuff, a splash, a lap). */
  function burst(f, q, vol, dur, type = 'bandpass', to = out, when = 0) {
    const t = ac.currentTime + when, s = ac.createBufferSource(), n = filt(type, f, q), g = ac.createGain(); s.buffer = noise; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.03, dur * 0.2)); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(n).connect(g).connect(to); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  function ping(f, vol, dur, to = out) { const t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain(); o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0005, t + dur); o.connect(g).connect(to); o.start(t); o.stop(t + dur + 0.05); }

  // ---------- the sea ----------
  function buildSea() {
    const swellG = gain(0), swell = filt('lowpass', 420, 0.5, swellG); loopNoise(swell, 0.5);   // the low roar of the swell
    const washG = gain(0), wash = filt('bandpass', 900, 0.6, washG); loopNoise(wash, 1.1);     // water rushing past the hull
    return { swellG, washG, wash, lap: 1.5, t: 0 };
  }
  function seaTick(dt, k, amp) {
    sea.t += dt; const sw = 0.5 + 0.5 * Math.sin(sea.t * 0.55) * Math.sin(sea.t * 0.21 + 1);
    set(sea.swellG.gain, (0.10 + 0.08 * amp) * (0.55 + 0.45 * sw), 0.4);
    set(sea.washG.gain, 0.02 + 0.22 * k * k, 0.2); set(sea.wash.frequency, 650 + 900 * k, 0.3);
    if ((sea.lap -= dt) <= 0) { sea.lap = (1.2 + Math.random() * 2.6) / (0.7 + 0.5 * amp); burst(380 + Math.random() * 500, 0.9, 0.09 + 0.06 * amp, 0.5 + Math.random() * 0.5, 'lowpass'); }
  }

  // ---------- the boats' voices ----------
  const VOICES = {
    tug() { const g = gain(0), lp = filt('lowpass', 260, 1.2, g), am = ac.createGain(); am.connect(lp);
      const o = osc('sawtooth', 42, am), o2 = osc('square', 21, am), lfo = osc('square', 7, gain(0)), depth = ac.createGain(); depth.gain.value = 0.45; lfo.disconnect(); lfo.connect(depth).connect(am.gain); am.gain.value = 0.55;
      return { g, tick(k) { set(o.frequency, 42 + 34 * k); set(o2.frequency, 21 + 17 * k); set(lfo.frequency, 6 + 12 * k); set(lp.frequency, 240 + 420 * k); set(g.gain, 0.16 + 0.22 * k); } }; },
    woodtug() { const g = gain(0), body = filt('lowpass', 180, 1, g); const o = osc('triangle', 33, gain(0.25, body)); let ph = 0;
      return { g, tick(k, dt) { set(o.frequency, 33 + 14 * k); set(g.gain, 0.3 + 0.25 * k);
        ph += dt * (3 + 6.5 * k); while (ph > 1) { ph -= 1; burst(140 + 60 * k, 1.4, 0.35 + 0.25 * k, 0.16, 'lowpass', g); if (Math.random() < 0.5) burst(950, 7, 0.05 + 0.04 * k, 0.12, 'bandpass', g); } } }; },
    yacht() { const g = gain(0), lp = filt('lowpass', 500, 0.9, g), a = osc('sawtooth', 70, lp), b = osc('sawtooth', 71.3, lp), wG = gain(0, g), w = osc('sine', 900, wG);
      return { g, tick(k) { set(a.frequency, 70 + 95 * k); set(b.frequency, 71.3 + 96.5 * k); set(lp.frequency, 420 + 900 * k); set(w.frequency, 900 + 1700 * k); set(wG.gain, 0.012 + 0.03 * k); set(g.gain, 0.08 + 0.16 * k); } }; },
    sail() { const g = gain(0), bp = filt('bandpass', 700, 0.8, g); loopNoise(bp, 0.9); let t = 0, creak = 3;
      return { g, tick(k, dt) { t += dt; const gust = 0.6 + 0.4 * Math.sin(t * 0.7) * Math.sin(t * 0.33 + 2); set(g.gain, (0.03 + 0.16 * k) * gust, 0.3); set(bp.frequency, 500 + 600 * k * gust, 0.3);
        if ((creak -= dt) <= 0) { creak = 3 + Math.random() * 6; if (k > 0.05) { const f = 230 + Math.random() * 120; burst(f, 12, 0.05, 0.35, 'bandpass', g); } } } }; },
    dinghy() { const g = gain(0), bp = filt('bandpass', 1300, 0.9, g); loopNoise(bp, 1.3); let slap = 1, t = 0;
      return { g, tick(k, dt) { t += dt; set(g.gain, (0.025 + 0.12 * k) * (0.7 + 0.3 * Math.sin(t * 1.3)), 0.25); set(bp.frequency, 1000 + 900 * k, 0.3);
        if ((slap -= dt) <= 0) { slap = (0.35 + Math.random() * 0.6) / (0.4 + k); burst(700 + Math.random() * 600, 1.2, 0.05 + 0.1 * k, 0.18, 'bandpass', out); if (Math.random() < 0.08) ping(1900 + Math.random() * 500, 0.02, 0.6, g); } } }; },
    drydock() { const g = gain(0), lp = filt('lowpass', 210, 1.1, g), o = osc('sawtooth', 30, gain(0.35, lp)), o2 = osc('square', 15, gain(0.12, lp)); let ph = 0;
      return { g, tick(k, dt) { set(o.frequency, 30 + 22 * k); set(o2.frequency, 15 + 11 * k); set(lp.frequency, 190 + 300 * k); set(g.gain, 0.24 + 0.22 * k);
        ph += dt * (2.4 + 6 * k); while (ph > 1) { ph -= 1; burst(120 + 70 * k, 1.2, 0.3 + 0.25 * k, 0.14, 'lowpass', g); if (Math.random() < 0.12) burst(1800 + Math.random() * 600, 9, 0.03, 0.08, 'bandpass', g); } } }; }, // (an old diesel's knock, and a rattle now and then)
    voyager() { const g = gain(0), hum = osc('sine', 38, gain(0.5, g)), hum2 = osc('triangle', 57, gain(0.12, g));
      const churnG = gain(0, g), churn = filt('lowpass', 260, 1, churnG); loopNoise(churn, 0.6); let ph = 0, rev = 0;
      return { g, tick(k, dt) { set(hum.frequency, 38 + 16 * k); set(hum2.frequency, 57 + 24 * k); set(g.gain, 0.22 + 0.2 * k); set(churn.frequency, 220 + 380 * k);
        rev += dt * (0.4 + 4 * k) * 3; set(churnG.gain, (0.06 + 0.3 * k) * (0.75 + 0.25 * Math.sin(rev * Math.PI * 2)), 0.03); // (the screws' three flights)
        ph += dt * (1.1 + 4.2 * k); while (ph > 1) { ph -= 1; burst(520 + 260 * k, 0.9, 0.22 + 0.2 * k, 0.32 - 0.12 * k, 'bandpass', g); } } }; }, // (the chuff of the stack)
  };
  function useVoice(id) {
    if (id === voiceId) return; const old = voice; voiceId = id; voice = VOICES[id] ? VOICES[id]() : null;
    if (old) { set(old.g.gain, 0, 0.3); setTimeout(() => old.g.disconnect(), 1500); } // (the old one fades as the new one comes in)
  }

  return {
    /** Every frame: the boat you sail (id), how fast it's going (k, 0…1 of its top speed), the sea's roughness (amp). */
    update(dt, { boat, k = 0, amp = 1, quiet = false }) {
      if (!ac || ac.state !== 'running') { if (ac?.state === 'suspended' && !document.hidden) ac.resume?.(); return; }
      if (off()) { set(out.gain, 0, 0.2); return; } set(out.gain, quiet ? 0.25 : 0.55, 0.5);
      useVoice(boat); voice?.tick(Math.max(0, Math.min(1, k)), dt); seaTick(dt, k, Math.max(0.3, Math.min(2, amp)));
    },
  };
}
