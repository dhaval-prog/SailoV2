// While fishing (or at anchor): two rings beside the boat, on a slant above its top-right corner,
// for "Stop fishing" and "Raise anchor" (or "Drop anchor"). They follow the boat in any view,
// sit at 50% opacity and light up on hover.

export function initBoatQuick({ THREE, boat, toScreen, state, onFish, onAnchor }) {
  const el = document.createElement('div'); el.id = 'boat-quick'; el.hidden = true;
  // each ring has a white icon and a navy one: the navy one shows on the filled (active) ring
  el.innerHTML = `<button type="button" id="bq-fish"><img class="w" src="/boat/white/go-fishing.svg" alt=""><img class="n" src="/boat/navy/go-fishing.svg" alt=""><span></span></button>
    <button type="button" id="bq-anchor"><img class="w" src="/boat/white/drop-anchor.svg" alt=""><img class="n" src="/boat/navy/drop-anchor.svg" alt=""><span></span></button>`;
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
    fishB.classList.toggle('on', s.fishing); anchorB.classList.toggle('on', s.anchored); // fishing / at anchor: the ring fills white
    if (t - lastT > 0.05 || !rect) { lastT = t; rect = measure() || rect; }
    if (!rect) return;
    // two rings stacked on a slant above the boat's top-right corner, with a gap between them
    const cx = rect[2], cy = rect[1] + Math.min(40, (rect[3] - rect[1]) * 0.15);
    const vis = [fishB, anchorB].filter(b => !b.hidden), at = vis.length === 1 ? [[26, -30]] : [[10, -78], [52, -22]];
    // near a screen edge the pair moves as one, so the slant and the gap hold
    const ox = Math.min(0, innerWidth - 110 - (cx + Math.max(...at.map(a => a[0])))), oy = Math.max(0, 120 - (cy + Math.min(...at.map(a => a[1])))); // clear of the top bar and the dock
    vis.forEach((b, i) => { const x = cx + at[i][0] + ox, y = cy + at[i][1] + oy;
      b.style.left = x.toFixed(1) + 'px'; b.style.top = y.toFixed(1) + 'px'; });
  }
  return { update };
}
