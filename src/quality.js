// Adaptive quality: the frame rate is watched, and on a phone that can't keep up the picture gets a little lighter, a
// step at a time, until it runs smoothly: fewer pixels first (phones draw at 2-3x their screen's points, and 1.5x looks
// almost the same), then no shadows and rocks and corals drawn less far. A device with room to spare steps back up.
// The level is remembered, so the next visit starts where this one settled.
const KEY = 'sailo:quality';
export function createQuality({ renderer, resize, setShadows, setRange }) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const LEVELS = [{ pr: dpr, shadows: true, range: 1 }, { pr: Math.min(dpr, 1.5), shadows: true, range: 1 }, { pr: Math.min(dpr, 1.25), shadows: false, range: 0.75 }, { pr: 1, shadows: false, range: 0.6 }];
  let level = 0; try { level = Math.max(0, Math.min(LEVELS.length - 1, +localStorage.getItem(KEY) || 0)); } catch { /* storage blocked */ }
  const apply = () => { const L = LEVELS[level]; renderer.setPixelRatio(L.pr); resize(); setShadows(L.shadows); setRange(L.range); try { localStorage.setItem(KEY, String(level)); } catch { /* storage blocked */ } };
  apply();
  let n = 0, sum = 0, since = 0, good = 0, warm = 3, last = 0; // (seconds measured; seconds of headroom in a row; seconds to settle at the start)
  return {
    /** Every frame (timed here, by the wall clock). */
    frame() { const now = performance.now(), dt = last ? (now - last) / 1000 : 0; last = now; if (document.hidden || dt <= 0 || dt > 2) return; n++; sum += dt; since += dt; if (since < 2) return;
      const fps = n / sum; n = 0; sum = 0; const span = since; since = 0;
      if (warm > 0) { warm -= span; return; }
      if (fps < 42 && level < LEVELS.length - 1) { level++; good = 0; apply(); }
      else if (fps > 57) { good += span; if (good > 20 && level > 0) { level--; good = 0; apply(); } } else good = 0; },
    get level() { return level; },
  };
}
