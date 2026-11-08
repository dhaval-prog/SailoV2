// A sea route round the islands: the way a captain would steer from here to there without running aground. Straight
// when the water is clear; otherwise a path found on a grid over the area (A*), then pulled tight into a few straight
// legs. The autopilot sails it leg by leg (main.js) and the map draws it (hud.js). Only the islands known so far count
// (the map's and the terrain's): one not loaded yet is met when it's met.

/** Does the segment a→b pass within R of (cx, cz)? */
function nearSeg(ax, az, bx, bz, cx, cz, R) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz; let t = L2 ? ((cx - ax) * dx + (cz - az) * dz) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const px = ax + dx * t - cx, pz = az + dz * t - cz; return px * px + pz * pz < R * R;
}

/**
 * The legs from `from` to `to` ({x, z}) round these islands ([{x, z, r}]), keeping `pad` metres off their shores.
 * Returns the turning points after `from`, ending with `to`: [{x, z}, …].
 */
export function planRoute(from, to, islands, pad = 14) {
  // searched in a box round both ends, a wider one if there's no way round inside it
  for (const M of [300, 1000, 2600]) { const r = plan(from, to, islands, pad, M); if (r) return r; }
  return [{ x: to.x, z: to.z }]; // (no way round that's known: straight, and the boat stops at the shore)
}
function plan(from, to, islands, pad, M) {
  const hit = (a, b, list) => list.some(it => nearSeg(a.x, a.z, b.x, b.z, it.x, it.z, it.r + pad));
  const x0 = Math.min(from.x, to.x) - M, x1 = Math.max(from.x, to.x) + M, z0 = Math.min(from.z, to.z) - M, z1 = Math.max(from.z, to.z) + M;
  const near = islands.filter(it => it.x + it.r > x0 && it.x - it.r < x1 && it.z + it.r > z0 && it.z - it.r < z1);
  if (!hit(from, to, near)) return [{ x: to.x, z: to.z }];
  // the grid: cells small enough to thread between islands, few enough to search quickly
  const S = Math.max(6, Math.sqrt((x1 - x0) * (z1 - z0) / 140000)), W = Math.ceil((x1 - x0) / S), H = Math.ceil((z1 - z0) / S);
  const blocked = new Uint8Array(W * H);
  for (const it of near) { const R = it.r + pad, ci = Math.floor((it.x - x0) / S), cj = Math.floor((it.z - z0) / S), n = Math.ceil(R / S) + 1;
    for (let j = Math.max(0, cj - n); j <= Math.min(H - 1, cj + n); j++) for (let i = Math.max(0, ci - n); i <= Math.min(W - 1, ci + n); i++) {
      const cx = x0 + (i + 0.5) * S - it.x, cz = z0 + (j + 0.5) * S - it.z; if (cx * cx + cz * cz < R * R) blocked[j * W + i] = 1; } }
  const cell = p => [Math.max(0, Math.min(W - 1, Math.floor((p.x - x0) / S))), Math.max(0, Math.min(H - 1, Math.floor((p.z - z0) / S)))];
  const [si, sj] = cell(from), [ti, tj] = cell(to), start = sj * W + si, goal = tj * W + ti;
  blocked[start] = 0; blocked[goal] = 0; // (a boat tied up close in, or a pin on a beach, still gets a way out or in)
  // A* (8 ways), with a binary heap
  const g = new Float32Array(W * H).fill(Infinity), came = new Int32Array(W * H).fill(-1), shut = new Uint8Array(W * H);
  const heap = [], f = new Float32Array(W * H);
  const push = n => { heap.push(n); let k = heap.length - 1; while (k) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[n]) break; heap[k] = heap[p]; k = p; } heap[k] = n; };
  const pop = () => { const top = heap[0], last = heap.pop(), N = heap.length; if (N) { let k = 0;
    for (;;) { const a = 2 * k + 1, b = a + 1; let m = -1, fm = f[last]; if (a < N && f[heap[a]] < fm) { m = a; fm = f[heap[a]]; } if (b < N && f[heap[b]] < fm) m = b; if (m < 0) break; heap[k] = heap[m]; k = m; }
    heap[k] = last; } return top; };
  const hEst = n => { const i = n % W, j = (n / W) | 0, dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (Math.max(dx, dz) + 0.414 * Math.min(dx, dz)); };
  g[start] = 0; f[start] = hEst(start); push(start);
  const STEPS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
  let found = false, guard = 0;
  while (heap.length && guard++ < W * H) { const n = pop(); if (n === goal) { found = true; break; } if (shut[n]) continue; shut[n] = 1;
    const i = n % W, j = (n / W) | 0;
    for (const [di, dj, c] of STEPS) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= W || b >= H) continue; const m = b * W + a; if (blocked[m] || shut[m]) continue;
      if (di && dj && (blocked[j * W + a] || blocked[b * W + i])) continue; // (no squeezing through a corner)
      const ng = g[n] + c; if (ng < g[m]) { g[m] = ng; came[m] = n; f[m] = ng + hEst(m); push(m); } } }
  if (!found) return null;
  const cells = []; for (let n = goal; n !== -1 && n !== start; n = came[n]) cells.push(n); cells.reverse();
  const pts = cells.map(n => ({ x: x0 + (n % W + 0.5) * S, z: z0 + (((n / W) | 0) + 0.5) * S })); pts[pts.length - 1] = { x: to.x, z: to.z };
  // pulled tight: from each turning point, straight on to the farthest point still in clear water
  const out = []; let anchor = from, k = 0;
  while (k < pts.length) { let j = k; while (j + 1 < pts.length && !hit(anchor, pts[j + 1], near)) j++; out.push(pts[j]); anchor = pts[j]; k = j + 1; }
  return out;
}

/** The length of a route, from `from` through its legs. */
export const routeLength = (from, legs) => { let L = 0, a = from; for (const b of legs) { L += Math.hypot(b.x - a.x, b.z - a.z); a = b; } return L; };
