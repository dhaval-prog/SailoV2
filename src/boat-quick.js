// While fishing (or at anchor): two rings beside the boat, on a curve at its top-right corner,
// for "Stop fishing" and "Raise anchor" (or "Drop anchor"). They follow the boat in any view,
// sit at 50% opacity and light up on hover.

export function initBoatQuick({ THREE, boat, toScreen, state, onFish, onAnchor }) {
  const el = document.createElement('div'); el.id = 'boat-quick'; el.hidden = true;
  el.innerHTML = `<button type="button" id="bq-fish"><img src="/boat/white/go-fishing.svg" alt=""><span></span></button>
    <button type="button" id="bq-anchor"><img src="/boat/white/drop-anchor.svg" alt=""><span></span></button>`;
  document.body.appendChild(el);
  const fishB = el.querySelector('#bq-fish'), anchorB = el.querySelector('#bq-anchor');
  const label = (b, t) => { if (b.dataset.t !== t) { b.dataset.t = t; b.querySelector('span').textContent = t; b.setAttribute('aria-label', t); } };
  fishB.addEventListener('click', e => { e.stopPropagation(); onFish(); });
  anchorB.addEventListener('click', e => { e.stopPropagation(); onAnchor(); });
  ['pointerdown', 'pointerup'].forEach(ev => el.addEventListener(ev, e => e.stopPropagation()));

  // the boat's solid parts on screen (light beams and glows reach far beyond the hull)
  const box = new THREE.Box3(), part = new THREE.Box3(), c = new THREE.Vector3();
  let rect = null, lastT = -1;
  const measure = () => {
    box.makeEmpty(); boat.updateWorldMatrix(true, true);
    boat.traverseVisible(o => { if (!o.isMesh || o.material?.transparent || o.material?.side === THREE.BackSide) return; if (!o.geometry.boundingBox) o.geometry.computeBoundingBox(); part.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld); box.union(part); });
    if (box.isEmpty()) return null; const r = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; i++) { c.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z); const [x, y, z] = toScreen(c); if (z > 1) continue;
      r[0] = Math.min(r[0], x); r[1] = Math.min(r[1], y); r[2] = Math.max(r[2], x); r[3] = Math.max(r[3], y); }
    return r[0] < Infinity ? r : null;
  };

  function update(t) {
    const s = state(), show = s.fishing || s.anchored;
    if (el.hidden === show) el.hidden = !show;
    if (!show) return;
    fishB.hidden = !s.fishing; label(fishB, 'Stop fishing');
    anchorB.hidden = !(s.anchored || s.fishing); label(anchorB, s.anchored ? 'Raise anchor' : 'Drop anchor');
    anchorB.disabled = s.anchorBusy;
    if (t - lastT > 0.05 || !rect) { lastT = t; rect = measure() || rect; }
    if (!rect) return;
    // two rings on a quarter-curve hugging the boat's top-right corner
    const cx = rect[2], cy = rect[1], R = Math.max(46, Math.min(90, (rect[2] - rect[0]) * 0.35));
    const vis = [fishB, anchorB].filter(b => !b.hidden);
    vis.forEach((b, i) => { const a = (vis.length === 1 ? -45 : -70 + i * 50) * Math.PI / 180;
      const x = Math.min(innerWidth - 30, cx + Math.cos(a) * R * 0.55), y = Math.max(30, cy + 18 + Math.sin(a) * R * 0.6 + i * 6);
      b.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`; });
  }
  return { update };
}
