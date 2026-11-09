// The car you drive (a placeholder, built in code, until the real vehicle models arrive): a rounded little hatchback
// in the game's toy look, with wheels that turn and spin, brake lights and headlights.
// And how it drives: arcade physics (throttle, brake, reverse, steering that tightens at low speed), quicker on
// the road than off it, stopped by buildings and water.

export const CAR = { length: 4.2, width: 1.85, wheelbase: 2.55, top: 24, reverse: 7, accel: 7.5, brake: 16, offRoad: 0.38 }; // (top: m/s ≈ 86 km/h)

export function buildCar({ THREE, color = '#ee3427' }) {
  const g = new THREE.Group(); g.name = 'car';
  const paint = new THREE.MeshStandardMaterial({ name: 'car_paint', color, roughness: 0.45, metalness: 0.15 });
  const dark = new THREE.MeshStandardMaterial({ color: '#1f242b', roughness: 0.8 });
  const glass = new THREE.MeshStandardMaterial({ color: '#9fd3ee', roughness: 0.15, metalness: 0.3 });
  const trim = new THREE.MeshStandardMaterial({ color: '#e9edf0', roughness: 0.5 });
  const head = new THREE.MeshStandardMaterial({ color: '#fff6d8', emissive: new THREE.Color('#fff2c0'), emissiveIntensity: 0.4 });
  const tail = new THREE.MeshStandardMaterial({ color: '#c81e1e', emissive: new THREE.Color('#ff2a1f'), emissiveIntensity: 0.3 });
  const box = (w, h, d, mat, x, y, z, r = 0) => { const geo = new THREE.BoxGeometry(w, h, d, 2, 2, 2); if (r) { const p = geo.attributes.position, v = new THREE.Vector3(); // (soften the corners)
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const k = r, sx = Math.sign(v.x), sy = Math.sign(v.y), sz = Math.sign(v.z), ax = Math.abs(v.x) - (w / 2 - k), ay = Math.abs(v.y) - (h / 2 - k), az = Math.abs(v.z) - (d / 2 - k);
        if (ax > 0 && ay > 0) { const l = Math.hypot(ax, ay) / k; v.x = sx * (w / 2 - k + ax / l); v.y = sy * (h / 2 - k + ay / l); } if (az > 0 && ay > 0) { const l = Math.hypot(az, ay) / k; v.z = sz * (d / 2 - k + az / l); v.y = sy * (h / 2 - k + ay / l); } p.setXYZ(i, v.x, v.y, v.z); } geo.computeVertexNormals(); }
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  // body along +x (the bow, as every boat), cabin set back, bumpers, windows
  box(4.2, 0.62, 1.85, paint, 0, 0.62, 0, 0.22);
  box(2.3, 0.62, 1.62, paint, -0.35, 1.18, 0, 0.2);
  box(0.06, 0.48, 1.5, glass, 0.82, 1.2, 0).rotation.z = -0.5;     // windscreen
  box(0.06, 0.44, 1.48, glass, -1.48, 1.2, 0).rotation.z = 0.35;   // rear window
  [-1, 1].forEach(s => box(1.9, 0.4, 0.04, glass, -0.35, 1.22, s * 0.82));
  box(0.18, 0.26, 1.9, trim, 2.13, 0.45, 0, 0.08); box(0.18, 0.26, 1.9, trim, -2.13, 0.45, 0, 0.08);
  [-1, 1].forEach(s => { box(0.06, 0.16, 0.36, head, 2.12, 0.74, s * 0.62); box(0.06, 0.16, 0.3, tail, -2.12, 0.76, s * 0.64); });
  // wheels: steer at the front, all spin
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18); wheelGeo.rotateX(Math.PI / 2);
  const hubGeo = new THREE.CylinderGeometry(0.17, 0.17, 0.28, 10); hubGeo.rotateX(Math.PI / 2);
  const wheels = [[1.3, 1], [1.3, -1], [-1.25, 1], [-1.25, -1]].map(([x, s]) => { const pivot = new THREE.Group(); pivot.position.set(x, 0.36, s * 0.86); g.add(pivot);
    const spin = new THREE.Group(); pivot.add(spin); const w = new THREE.Mesh(wheelGeo, dark); w.castShadow = true; spin.add(w); spin.add(new THREE.Mesh(hubGeo, trim)); return { pivot, spin, front: x > 0 }; });
  // headlight beams at night
  const beam = new THREE.SpotLight('#fff1c8', 0, 45, 0.5, 0.6, 1.2); beam.position.set(2.2, 0.8, 0); beam.target.position.set(14, 0, 0); g.add(beam, beam.target);
  return {
    group: g,
    /** Every frame: wheels for the speed and steering, lights for the hour and the brakes. */
    pose(v, steer, dt, { night = 0, braking = false } = {}) {
      wheels.forEach(w => { w.spin.rotation.z -= v * dt / 0.36; if (w.front) w.pivot.rotation.y = steer; });
      head.emissiveIntensity = 0.4 + night * 2.2; tail.emissiveIntensity = braking ? 2.4 : 0.3 + night * 0.9; beam.intensity = night * 60;
    },
    paint: c => paint.color.set(c),
  };
}

/** Arcade driving: returns the new speed, heading and position for the inputs.
 *  st: { x, z, yaw, v, steer }; inp: { thr (-1..1), steer (-1..1, + is right) }; env: { road (on a road?) } */
export function driveStep(st, inp, dt, env) {
  const limit = CAR.top * (env.road ? 1 : CAR.offRoad);
  // throttle forward / brake then reverse
  if (inp.thr > 0.02) st.v += (st.v < 0 ? CAR.brake : CAR.accel * (1 - Math.max(0, st.v) / limit * 0.6)) * inp.thr * dt;
  else if (inp.thr < -0.02) st.v -= (st.v > 0.3 ? CAR.brake : CAR.accel * 0.6) * -inp.thr * dt;
  else st.v -= Math.sign(st.v) * Math.min(Math.abs(st.v), (1.4 + Math.abs(st.v) * 0.05) * dt); // (rolling to a stop)
  if (st.v > limit) st.v = Math.max(limit, st.v - CAR.brake * 0.7 * dt); // (off the road: slowed hard)
  st.v = Math.max(-CAR.reverse, st.v);
  // steering: a full lock when slow, a gentler one at speed
  const lock = 0.62 / (1 + Math.abs(st.v) / 9), target = -inp.steer * lock; // (st.steer: + is to the left, as the heading turns)
  st.steer += (target - st.steer) * Math.min(1, dt * 6);
  st.yaw += st.v / CAR.wheelbase * Math.tan(st.steer) * dt;
  const nx = st.x + Math.cos(st.yaw) * st.v * dt, nz = st.z - Math.sin(st.yaw) * st.v * dt;
  return [nx, nz];
}
