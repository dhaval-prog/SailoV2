// Fish seen beneath the sea: dark silhouettes of the species that actually live where the boat is (the same odds as
// a catch here), drifting under the surface round the boat. Small fish come in shoals, big ones alone; they dart off
// if the boat comes close, and fade away behind it. Only a sight: they never add a fish or change the odds.
// Each shape is the species' own picture (station.js), turned into a silhouette.

/**
 * @param o.species () => [{ f, w }]   the fish that live here, with their odds (f: FISH entry, with kg)
 * @param o.image (id, cb) => url       the species' picture (now, or later through cb)
 * @param o.getBoat () => ({ x, z, vel })
 * @param o.active () => bool           at sea (not moored)
 */
export function createFishShadows({ THREE, scene, WL, wave = () => 0, getBoat, species, image, active }) {
  const N = 18, geo = new THREE.PlaneGeometry(1, 0.45); geo.rotateX(-Math.PI / 2);
  const shapes = new Map(); // species id → silhouette texture
  // until its picture is ready: a plain fish shape
  const plain = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 58; const x = c.getContext('2d'); x.fillStyle = '#fff';
    x.beginPath(); x.ellipse(56, 29, 46, 17, 0, 0, Math.PI * 2); x.fill(); x.beginPath(); x.moveTo(14, 29); x.lineTo(0, 10); x.lineTo(4, 29); x.lineTo(0, 48); x.closePath(); x.fill();
    return new THREE.CanvasTexture(c); })();
  function shapeOf(f) {
    if (shapes.has(f.id)) return shapes.get(f.id);
    const tex = { t: plain }; shapes.set(f.id, tex);
    const use = url => { if (!url) return; const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = 128; c.height = 58; const x = c.getContext('2d');
      const k = Math.min(c.width / img.width, c.height / img.height); x.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
      x.globalCompositeOperation = 'source-in'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); tex.t = new THREE.CanvasTexture(c); pool.forEach(p => { if (p.f === f) p.m.material.map = tex.t; }); }; img.src = url; };
    use(image(f.id, use)); return tex;
  }
  const pool = Array.from({ length: N }, () => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: plain, color: '#021630', transparent: true, opacity: 0, depthWrite: false }));
    m.renderOrder = -1; m.visible = false; scene.add(m); return { m, f: null, x: 0, z: 0, yaw: 0, sp: 0, life: 0, max: 0, o: 0, ph: 0, flee: 0 }; });

  const pick = list => { const tot = list.reduce((a, s) => a + s.w, 0); let r = Math.random() * tot; for (const s of list) if ((r -= s.w) <= 0) return s.f; return list[0]?.f; };
  const lenOf = f => 1.4 + 1.2 * Math.cbrt(f.kg || 0.5); // metres (larger than life, so they read from the deck)
  let spawnT = 0;
  function shoal(b) {
    const list = species(); if (!list.length) return; const f = pick(list); if (!f) return;
    const free = pool.filter(p => !p.f); if (!free.length) return;
    const n = Math.min(free.length, (f.kg || 1) < 1.5 ? 3 + Math.floor(Math.random() * 5) : (f.kg || 1) < 12 ? 1 + Math.floor(Math.random() * 3) : 1);
    const ahead = Math.random() < 0.75, a = ahead ? -(b.yaw || 0) + (Math.random() - 0.5) * 2.4 : Math.random() * Math.PI * 2, d = 9 + Math.random() * 24, cx = b.x + Math.cos(a) * d, cz = b.z + Math.sin(a) * d, // (mostly ahead, where they're seen)
      yaw = Math.random() * Math.PI * 2, L = lenOf(f), tex = shapeOf(f);
    free.slice(0, n).forEach((p, i) => { Object.assign(p, { f, x: cx + (Math.random() - 0.5) * L * 4, z: cz + (Math.random() - 0.5) * L * 4, yaw: yaw + (Math.random() - 0.5) * 0.4,
      sp: 0.5 + Math.random() * 0.6, life: 0, max: 14 + Math.random() * 16, o: 0.62 + Math.random() * 0.2, ph: Math.random() * 6.28, flee: 0 });
      p.m.material.map = tex.t; p.m.scale.set(L, 1, L); p.m.visible = true; });
  }
  return {
    update(t, dt) {
      const b = getBoat(), on = active();
      if (on && (spawnT -= dt) < 0) { spawnT = 1.5 + Math.random() * 2; if (pool.filter(p => p.f).length < N - 3) shoal(b); }
      pool.forEach(p => { if (!p.f) return; p.life += dt;
        const dx = p.x - b.x, dz = p.z - b.z, d = Math.hypot(dx, dz);
        if (d < 11 && !p.flee) { p.flee = 2.5; p.yaw = Math.atan2(dz, dx); } // (the boat's too close: away)
        if (p.flee > 0) p.flee = Math.max(0, p.flee - dt);
        p.yaw += Math.sin(t * 0.7 + p.ph) * dt * 0.35; const sp = p.sp * (p.flee ? 4 : 1);
        p.x += Math.cos(p.yaw) * sp * dt; p.z += Math.sin(p.yaw) * sp * dt;
        const fade = Math.min(1, p.life / 2, (p.max - p.life) / 2), gone = !on || p.life > p.max || d > 75;
        p.m.material.opacity = Math.max(0, p.o * (gone ? 0 : fade));
        p.m.position.set(p.x, WL + wave(p.x, p.z, t) + 0.05, p.z); // (just under the surface as the swell lifts it) p.m.rotation.y = -p.yaw + Math.sin(t * (p.flee ? 14 : 5) + p.ph) * 0.08; // (a little wiggle as it swims)
        if (gone || fade <= 0 && p.life > 1) { p.f = null; p.m.visible = false; } });
    },
    get swimming() { return pool.filter(p => p.f).map(p => p.f.id); },
  };
}
