// How other boats move on screen (cpu-fleet.js): a little boat model chases the point where the boat
// should be (a local sailor's schedule, or a real captain's interpolated reports), with momentum:
// it accelerates and brakes gently, can only turn so fast, slows to turn hard, and always moves bow
// first. It runs on a fixed 30 Hz step, separate from drawing, and the drawn pose blends between steps,
// so it looks the same at any frame rate. Far off course (a boat just drawn, a jump) it snaps.
const STEP = 1 / 30, ACC = 1.1, DEC = 1.8, SNAP = 400; // s, m/s², m/s², m
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** A boat's motion, starting at (x, z) facing yaw. */
export function follower(x, z, yaw = 0) {
  const p = { x, z, yaw, v: 0 }, prev = { ...p }; let acc = 0;
  /** Chase (tx, tz), which itself moves at tv m/s on heading ty (null: holding still). */
  function step(tx, tz, tv, ty) {
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    // how fast: keep up with the target and close the gap, brake to stop on it, ease off for a hard turn
    let want = tv > 0.3 ? tv + Math.max(0, d - 4) * 0.35 : Math.sqrt(2 * DEC * Math.max(0, d - 1.2)) * 0.9;
    want = Math.min(want, Math.max(tv * 1.6, 3.5));
    const aim = d > 2 ? Math.atan2(-dz, dx) : ty ?? p.yaw, off = Math.abs(wrap(aim - p.yaw));
    if (off > 1.2) want *= 0.35; else if (off > 0.6) want *= 0.7;
    p.v += Math.max(-DEC * STEP, Math.min(ACC * STEP, want - p.v));
    // where to point: at the target when well behind it, along its course when alongside, else hold
    const head = d > 6 || ty == null ? aim : ty, rate = 0.35 + 0.55 * Math.min(1, p.v / 4); // rad/s: a boat barely turns at rest
    if (d > 2 || ty != null) p.yaw += Math.max(-rate * STEP, Math.min(rate * STEP, wrap(head - p.yaw)));
    p.x += Math.cos(p.yaw) * p.v * STEP; p.z -= Math.sin(p.yaw) * p.v * STEP;
  }
  return {
    /** Advance by dt toward the target; returns the pose to draw { x, z, yaw, v }. */
    update(dt, tx, tz, tv = 0, ty = null) {
      if (Math.hypot(tx - p.x, tz - p.z) > SNAP) { Object.assign(p, { x: tx, z: tz, yaw: ty ?? p.yaw, v: tv }); Object.assign(prev, p); acc = 0; }
      acc += Math.min(dt, 1); // (a tab coming back from the background doesn't fast-forward)
      while (acc >= STEP) { Object.assign(prev, p); step(tx, tz, tv, ty); acc -= STEP; }
      const k = acc / STEP; // blend the last two steps
      return { x: prev.x + (p.x - prev.x) * k, z: prev.z + (p.z - prev.z) * k, yaw: prev.yaw + wrap(p.yaw - prev.yaw) * k, v: prev.v + (p.v - prev.v) * k };
    },
    get state() { return p; },
  };
}
