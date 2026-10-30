// Painted desert rocks, in the style of the reference sheets: angular faceted pillars, flat-topped buttes with an
// overhanging slab, arches with a window, balanced hoodoos, leaning slab piles and boulder clusters, with rubble
// round the foot. Warm sunlit tops, red-orange sides and cool blue-purple shade, baked into the vertex colours.
// Every rock is built from its own seed (its place on the map), so it looks the same on every device and no two big
// rocks are alike; the kind is picked to suit its size.
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// palettes: top (sunlit flats), lit side, side, shade (cool)
const PALETTES = [
  ['#f4ae72', '#e27b52', '#c35b45', '#6c5a8c'], // desert orange
  ['#f6a48e', '#e2715f', '#c65a5c', '#5f5f97'], // salmon
  ['#eb8ea4', '#cb5d7c', '#a9496b', '#5a4a82'], // gully magenta
  ['#f7d2c6', '#e6a69b', '#cc8a8f', '#7d78a2'], // pale stream
  ['#f2b470', '#da824f', '#b6593b', '#6b5579'], // terracotta
];
const SUN = [0.45, 0.75, 0.35], SL = Math.hypot(...SUN); SUN.forEach((v, i) => { SUN[i] = v / SL; });

export function rockBuilder(THREE) {
  const V = THREE.Vector3, M4 = THREE.Matrix4, Q = THREE.Quaternion, E = THREE.Euler;
  const pal = PALETTES.map(p => p.map(c => new THREE.Color(c)));
  const tmpC = new THREE.Color();

  // an irregular prism: a lumpy polygon at the foot, a smaller (or bigger) one at the top, chamfered round the top edge
  function prism(rng, { sides = 5 + Math.floor(rng() * 3), r0 = 1, r1 = 0.8, h = 1, jag = 0.25, lean = [0, 0], cham = 0.12 } = {}) {
    const a0 = rng() * Math.PI * 2, ring = Array.from({ length: sides }, (_, i) => { const a = a0 + (i + (rng() - 0.5) * 0.5) / sides * Math.PI * 2, k = 1 - jag / 2 + rng() * jag; return [Math.cos(a) * k, Math.sin(a) * k]; });
    const lvl = [[0, r0, 0, 0], [h * (1 - cham), r1, lean[0] * (1 - cham), lean[1] * (1 - cham)], [h, r1 * (1 - cham * 1.6), lean[0], lean[1]]];
    const pts = lvl.map(([y, r, ox, oz]) => ring.map(([x, z]) => new V(x * r + ox, y, z * r + oz)));
    const pos = [], tri = (a, b, c) => pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let l = 0; l < 2; l++) for (let i = 0; i < sides; i++) { const j = (i + 1) % sides, a = pts[l][i], b = pts[l][j], c = pts[l + 1][j], d = pts[l + 1][i]; tri(a, c, b); tri(a, d, c); }
    const top = pts[2], tc = top.reduce((s, p) => s.add(p), new V()).multiplyScalar(1 / sides); for (let i = 0; i < sides; i++) tri(tc, top[(i + 1) % sides], top[i]);
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); return outward(g);
  }
  // a boulder: a jittered low-poly ball, flattened a little
  function boulder(rng, s = 1) { const g = new THREE.IcosahedronGeometry(1, 0).toNonIndexed(), p = g.attributes.position, seen = new Map();
    for (let i = 0; i < p.count; i++) { const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`; if (!seen.has(k)) seen.set(k, 0.8 + rng() * 0.4); const m = seen.get(k) * s; p.setXYZ(i, p.getX(i) * m, p.getY(i) * m * 0.8 + s * 0.55, p.getZ(i) * m); }
    return outward(g); }
  // an arch: an upright slab with a window through it
  function arch(rng, w, h, t) {
    const sh = new THREE.Shape(), n = 7, out = Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2 + rng() * 0.3; return [Math.cos(a) * w / 2 * (0.85 + rng() * 0.25), h / 2 + Math.sin(a) * h / 2 * (0.88 + rng() * 0.2)]; });
    out.forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y)); sh.closePath();
    const hole = new THREE.Path(), hw = w * (0.18 + rng() * 0.12), hh = h * (0.22 + rng() * 0.14), hy = h * (0.42 + rng() * 0.12);
    [[-hw, hy - hh], [hw * 0.8, hy - hh * 1.1], [hw, hy + hh * 0.6], [0, hy + hh], [-hw * 1.1, hy + hh * 0.5]].forEach(([x, y], i) => i ? hole.lineTo(x, y) : hole.moveTo(x, y)); hole.closePath(); sh.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.08, bevelSize: t * 0.08, bevelSegments: 1, curveSegments: 1 }); g.translate(0, 0, -t / 2);
    return g.index ? g.toNonIndexed() : g;
  }
  // every triangle facing away from its part's middle (so the shading and the ink outline read right)
  function outward(g) { const p = g.attributes.position, c = new V(), a = new V(), b = new V(), d = new V(), n = new V(), m = new V();
    for (let i = 0; i < p.count; i++) c.add(a.fromBufferAttribute(p, i)); c.multiplyScalar(1 / p.count);
    for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); d.fromBufferAttribute(p, i + 2);
      n.subVectors(b, a).cross(m.subVectors(d, a)); m.copy(a).add(b).add(d).multiplyScalar(1 / 3).sub(c);
      if (n.dot(m) < 0) { p.setXYZ(i + 1, d.x, d.y, d.z); p.setXYZ(i + 2, b.x, b.y, b.z); } }
    return g; }
  const place = (g, x, y, z, ry = 0, rx = 0, rz = 0, s = 1) => { g.applyMatrix4(new M4().compose(new V(x, y, z), new Q().setFromEuler(new E(rx, ry, rz)), new V(s, s, s))); return g; };
  const strip = g => { Object.keys(g.attributes).forEach(k => { if (k !== 'position') g.deleteAttribute(k); }); g.morphAttributes = {}; g.clearGroups(); return g; };

  // the kinds (x, z: centre; r: footprint radius; h: height; all metres)
  const rubble = (rng, parts, r, n, s) => { for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, d = r * (0.55 + rng() * 0.4); parts.push(place(boulder(rng, s * (0.5 + rng() * 0.6)), Math.cos(a) * d, -0.2, Math.sin(a) * d, rng() * 6)); } };
  const KINDS = {
    spires(rng, r, h, parts) { const n = 1 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, d = i ? r * (0.35 + rng() * 0.3) : r * 0.1 * rng(), hh = h * (i ? 0.35 + rng() * 0.4 : 0.85 + rng() * 0.15), rr = r * (i ? 0.18 + rng() * 0.12 : 0.3 + rng() * 0.12);
        parts.push(place(prism(rng, { r0: rr, r1: rr * (0.6 + rng() * 0.35), h: hh, lean: [(rng() - 0.5) * rr * 0.8, (rng() - 0.5) * rr * 0.8], jag: 0.35 }), Math.cos(a) * d, -0.6, Math.sin(a) * d, rng() * 6));
        if (!i && rng() < 0.6) parts.push(place(prism(rng, { sides: 4 + Math.floor(rng() * 2), r0: rr * 0.9, r1: rr * 1.05, h: hh * 0.18, jag: 0.3 }), Math.cos(a) * d + (rng() - 0.5) * rr * 0.4, hh - 0.6, Math.sin(a) * d, rng() * 6, (rng() - 0.5) * 0.25, (rng() - 0.5) * 0.25)); }
      rubble(rng, parts, r, 3 + Math.floor(rng() * 4), r * 0.16); },
    butte(rng, r, h, parts) { const hh = h * (0.55 + rng() * 0.25), rr = r * (0.7 + rng() * 0.15);
      parts.push(place(prism(rng, { r0: rr, r1: rr * 0.85, h: hh, jag: 0.3, sides: 6 + Math.floor(rng() * 3) }), 0, -0.6, 0, rng() * 6));
      parts.push(place(prism(rng, { r0: rr * 1.02, r1: rr * 1.1, h: hh * 0.22, jag: 0.25, cham: 0.2 }), (rng() - 0.5) * rr * 0.2, hh - 0.6, (rng() - 0.5) * rr * 0.2, rng() * 6, (rng() - 0.5) * 0.12, (rng() - 0.5) * 0.12));
      rubble(rng, parts, r, 4 + Math.floor(rng() * 4), r * 0.14); },
    arch(rng, r, h, parts) { const w = r * 1.4, hh = h * (0.8 + rng() * 0.2); parts.push(place(arch(rng, w, hh, r * (0.35 + rng() * 0.15)), 0, -0.6, 0, rng() * 6)); rubble(rng, parts, r, 3 + Math.floor(rng() * 3), r * 0.14); },
    hoodoo(rng, r, h, parts) { const rr = r * (0.28 + rng() * 0.1), nh = h * (0.6 + rng() * 0.2);
      parts.push(place(prism(rng, { r0: rr * 1.6, r1: rr * 0.65, h: nh, jag: 0.4 }), 0, -0.6, 0, rng() * 6));
      parts.push(place(prism(rng, { r0: rr * 1.8, r1: rr * 2.2, h: h * 0.22, jag: 0.3, sides: 5 }), (rng() - 0.5) * rr, nh - 0.8, (rng() - 0.5) * rr, rng() * 6, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3));
      rubble(rng, parts, r, 2 + Math.floor(rng() * 3), r * 0.15); },
    slabs(rng, r, h, parts) { const n = 2 + Math.floor(rng() * 2), ry = rng() * Math.PI;
      for (let i = 0; i < n; i++) { const len = r * (1.1 + rng() * 0.5), th = h * (0.25 + rng() * 0.2), g = prism(rng, { sides: 4, r0: 1, r1: 0.92, h: 1, jag: 0.2, cham: 0.15 });
        g.scale(len * 0.5, th, r * (0.25 + rng() * 0.15)); parts.push(place(g, (rng() - 0.5) * r * 0.4, -0.5 + i * th * 0.5, (i - n / 2) * r * 0.32, ry + (rng() - 0.5) * 0.4, 0, 0.25 + rng() * 0.35)); }
      parts.push(place(boulder(rng, r * (0.3 + rng() * 0.1)), r * 0.55, -0.3, r * 0.3, rng() * 6)); rubble(rng, parts, r, 3, r * 0.13); },
    boulders(rng, r, h, parts) { const n = 2 + Math.floor(rng() * 3);
      for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, d = i ? r * (0.3 + rng() * 0.35) : 0, s = (i ? 0.35 + rng() * 0.25 : 0.55 + rng() * 0.15) * Math.min(r, h * 0.9);
        parts.push(place(boulder(rng, s), Math.cos(a) * d, -0.4, Math.sin(a) * d, rng() * 6)); } },
    stump(rng, r, h, parts) { parts.push(place(prism(rng, { r0: r * 0.55, r1: r * 0.42, h: h, jag: 0.35, lean: [(rng() - 0.5) * r * 0.3, (rng() - 0.5) * r * 0.3] }), 0, -0.6, 0, rng() * 6));
      if (rng() < 0.5) parts.push(place(prism(rng, { sides: 4, r0: r * 0.42, r1: r * 0.48, h: h * 0.2, jag: 0.3 }), 0, h - 0.6, 0, rng() * 6, (rng() - 0.5) * 0.3, (rng() - 0.5) * 0.3)); rubble(rng, parts, r, 2, r * 0.2); },
  };
  const BIG = ['spires', 'spires', 'spires', 'butte', 'arch', 'hoodoo', 'hoodoo', 'slabs'], MID = ['boulders', 'stump', 'stump', 'stump', 'boulders', 'slabs', 'hoodoo', 'spires']; // (pillars most of all, as in the sheets)

  /** One rock as geometry in world space (vertex colours baked), with each vertex knowing its rock (aRock: x, z, r). */
  function build(rock) {
    let n = Math.floor(rock.x * 7.31 + rock.z * 3.17) % 2147483646; if (n <= 0) n += 2147483646;
    const rng = () => (n = (n * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 3; i++) rng();
    const big = rock.r >= 13.5, kinds = big ? BIG : MID, kind = kinds[Math.floor(rng() * kinds.length)], parts = [];
    KINDS[kind](rng, rock.r, rock.h, parts);
    const Mx = new M4().makeTranslation(rock.x, rock.y0, rock.z).multiply(new M4().makeRotationY(rock.a)), c0 = new V();
    parts.forEach(p => { strip(p).applyMatrix4(Mx); const pp = p.attributes.position, ap = new Float32Array(pp.count * 3); c0.set(0, 0, 0);
      for (let i = 0; i < pp.count; i++) { c0.x += pp.getX(i); c0.y += pp.getY(i); c0.z += pp.getZ(i); } c0.multiplyScalar(1 / pp.count);
      for (let i = 0; i < pp.count; i++) ap.set([c0.x, c0.y, c0.z], i * 3); p.setAttribute('aPart', new THREE.BufferAttribute(ap, 3)); }); // (each part's middle: the outline grows round it)
    const g = mergeGeometries(parts, false); parts.forEach(p => p.dispose());
    // colours: by facing (sun, up), with soft strata bands up the sides
    const P = pal[Math.floor(rng() * pal.length)], p = g.attributes.position, cols = new Float32Array(p.count * 3), aR = new Float32Array(p.count * 3), a = new V(), b = new V(), c = new V(), nrm = new V();
    const band = 1.4 + rng() * 1.2, off = rng() * 3;
    for (let i = 0; i < p.count; i += 3) { a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2); nrm.subVectors(b, a).cross(c.clone().sub(a)).normalize();
      const sun = nrm.x * SUN[0] + nrm.y * SUN[1] + nrm.z * SUN[2], y = (a.y + b.y + c.y) / 3 - rock.y0;
      tmpC.copy(nrm.y > 0.78 ? P[0] : sun > 0.38 ? P[1] : sun > 0.02 ? P[2] : P[3]); // (turned from the sun: the cool blue-purple shade of the sheets)
      if (nrm.y < 0.78 && Math.floor((y + off) / band) % 2) tmpC.multiplyScalar(0.92); // (strata)
      if (y < 0.5) tmpC.lerp(P[3], 0.35); // (wet at the waterline)
      for (let k = 0; k < 3; k++) { cols.set([tmpC.r, tmpC.g, tmpC.b], (i + k) * 3); aR.set([rock.x, rock.z, rock.r], (i + k) * 3); } }
    g.setAttribute('color', new THREE.BufferAttribute(cols, 3)); g.setAttribute('aRock', new THREE.BufferAttribute(aR, 3));
    return g;
  }
  return { build, kinds: Object.keys(KINDS) };
}
