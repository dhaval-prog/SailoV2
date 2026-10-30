// Harbour ambience, made with the Web Audio API (no sound files): gulls calling, now and then a crate set down on
// the deck or a creak of rope, around Paradise Station and over fishing spots. Quiet, and only once the captain has
// touched the screen (browsers don't allow sound before that).
export function createHarbourSounds({ nearStation, gullsNear }) {
  let ac = null, master = null, nextGull = 4, nextDock = 8;
  const start = () => { if (ac) return; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return; try { ac = new AC(); master = ac.createGain(); master.gain.value = 0.16; master.connect(ac.destination); } catch { ac = null; } };
  addEventListener('pointerdown', start, { once: true, capture: true }); addEventListener('keydown', start, { once: true, capture: true });
  // a gull: two or three falling, slightly hoarse cries
  function gull(vol) {
    const t0 = ac.currentTime, n = 2 + Math.floor(Math.random() * 2), f0 = 1500 + Math.random() * 500;
    for (let k = 0; k < n; k++) { const t = t0 + k * (0.22 + Math.random() * 0.06), o = ac.createOscillator(), g = ac.createGain(), bp = ac.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(f0 * (1 - k * 0.04), t); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.18);
      bp.type = 'bandpass'; bp.frequency.value = 1700; bp.Q.value = 2.5;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.025); g.gain.exponentialRampToValueAtTime(0.0008, t + 0.2);
      o.connect(bp).connect(g).connect(master); o.start(t); o.stop(t + 0.22); }
  }
  // a dull knock on wood (a crate set down) or a soft creak (a mooring rope)
  function dock(vol) {
    const t = ac.currentTime, len = 0.25, buf = ac.createBuffer(1, ac.sampleRate * len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.03));
    const src = ac.createBufferSource(), lp = ac.createBiquadFilter(), g = ac.createGain(); src.buffer = buf; lp.type = 'lowpass'; lp.frequency.value = Math.random() < 0.5 ? 380 : 900; g.gain.value = vol;
    src.connect(lp).connect(g).connect(master); src.start(t);
  }
  return { update(dt) {
    if (!ac || ac.state !== 'running') { if (ac?.state === 'suspended') ac.resume?.(); return; }
    const st = nearStation(), sp = gullsNear(); // 0…1: how close the harbour is; how many gulls are about
    if ((nextGull -= dt) <= 0) { nextGull = 5 + Math.random() * 10; const v = Math.max(st, Math.min(1, sp / 4)) * 0.6; if (v > 0.05) gull(v); }
    if ((nextDock -= dt) <= 0) { nextDock = 7 + Math.random() * 12; if (st > 0.4) dock(st * 0.5); }
  } };
}
