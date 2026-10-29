// The icons around the steering wheel sit on a circle about it, measured from where the wheel actually is
// (any size, any screen):
// - desktop and iPad: the radio and the anchor round the wheel's left half (radio upper-left, anchor lower-left);
// - phones: every icon at the bottom, the radio and anchor on the left, the top view and the helm ring on the right.
// On phones the two view buttons move out of the side column into a layer of their own while they orbit the wheel,
// and go back when the screen is wide again. Angles are in degrees, counter-clockwise from the right.
const ORBIT = {
  wide: { radio: 152, anchor: 208 },
  phone: { radio: 148, anchor: 208, top: 32, chase: 335 },
};
const GAP = 12; // px between the wheel's rim and an icon

export function initHelmOrbit() {
  const joy = document.getElementById('joy'), anchor = document.getElementById('helm-anchor'), dock = document.getElementById('dock');
  const topB = dock.querySelector('[data-v="top"]'), chaseB = dock.querySelector('.dk-helm'), dockAfter = dock.querySelector('.dk-moreg');
  const phone = matchMedia('(max-width: 720px), (max-height: 520px)');
  const layer = document.createElement('div'); layer.id = 'helm-orbit'; document.body.appendChild(layer);
  const rad = d => d * Math.PI / 180;

  // phones: the view buttons join the orbit; wider screens: back in the side column, in their places
  function home() {
    if (phone.matches) { if (topB.parentElement !== layer) layer.append(topB, chaseB); }
    else if (topB.parentElement !== dock) { dock.insertBefore(topB, dockAfter); dock.insertBefore(chaseB, dockAfter); topB.style.cssText = chaseB.style.cssText = ''; }
  }
  // the wheel's centre and radius on screen, and the scale the helm is drawn at
  function wheel() { const r = joy.getBoundingClientRect(); if (!r.width) return null; return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, R: r.width / 2, k: r.width / joy.offsetWidth }; }
  function place() {
    home(); const b = document.body.classList;
    if (b.contains('anchored') || b.contains('fishing') || b.contains('stn-bar-on') || b.contains('boat-sel') || b.contains('stn-docked')) return; // (the helm is away: keep the last layout)
    const w = wheel(); if (!w) return;
    const A = phone.matches ? ORBIT.phone : ORBIT.wide;
    // the anchor lives inside the wheel's box (it scales with the helm): place it in that box's own units
    const s = joy.offsetWidth, ar = anchor.offsetWidth / 2, Ra = s / 2 + GAP / w.k + ar;
    Object.assign(anchor.style, { left: `${(s / 2 + Ra * Math.cos(rad(A.anchor)) - ar).toFixed(1)}px`, top: `${(s / 2 - Ra * Math.sin(rad(A.anchor)) - ar).toFixed(1)}px`, right: 'auto', margin: '0' });
    // the radio button (the radio places itself through this hook) and, on phones, the two view buttons
    const at = (el, deg, size) => { const R = w.R + GAP + size / 2; return [w.cx + R * Math.cos(rad(deg)), w.cy - R * Math.sin(rad(deg))]; };
    api.radioAt = size => at(null, A.radio, size);
    if (phone.matches) [[topB, A.top], [chaseB, A.chase]].forEach(([b, deg]) => { const size = b.offsetWidth, [x, y] = at(b, deg, size);
      b.style.cssText = `position:fixed;left:${(x - size / 2).toFixed(1)}px;top:${(y - size / 2).toFixed(1)}px;margin:0`; });
  }
  const api = { place, radioAt: null };
  phone.addEventListener?.('change', () => setTimeout(place, 50));
  addEventListener('resize', () => setTimeout(place, 200));
  setTimeout(place, 0); setInterval(place, 500); // (the helm eases in and out; keep up with it)
  return api;
}
