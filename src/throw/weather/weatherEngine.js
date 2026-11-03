import { sunConfigForHour } from "./sunConfig.js";
function createWeatherEngine(canvas, opts) {
  const state = { condition: "clear", intensity: "medium", reducedFlashing: false, reduceMotion: false };
  let raf = 0, alive = true;
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, HZ = 0;
  const DPR = Math.min(opts.maxDpr ?? 2, (typeof devicePixelRatio !== "undefined" ? devicePixelRatio : 1) || 1);
  function resize(w, h) {
    W = w;
    H = h;
    HZ = Math.round(h * (opts.horizon ?? 0.18));
    canvas.width = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  resize(opts.width, opts.height);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const persp = (y) => 0.45 + 0.75 * clamp((y - HZ) / (H - HZ), 0, 1);
  let now = performance.now();
  const L = { stars: 0, clouds: 0, dark: 0, dim: 0, rain: 0, snow: 0, wind: 0, light: 0, fog: 0, sun: 0 };
  const T = { ...L };
  let rainSpeed = 1, windBase = 0.3;
  let sunCfg = sunConfigForHour((/* @__PURE__ */ new Date()).getHours());
  function setTargets(c, i) {
    const k = { light: 0.42, medium: 0.72, heavy: 1 }[i];
    Object.keys(T).forEach((x) => T[x] = 0);
    if (c === "clear") {
      T.stars = 1;
      windBase = 0.15;
    }
    if (c === "cloudy") {
      T.clouds = 0.62;
      T.dim = 0.11;
      T.stars = 0.2;
      windBase = 0.25;
    }
    if (c === "rain") {
      T.clouds = 0.58;
      T.dim = 0.15 + 0.07 * k;
      T.fog = k;
      windBase = 0.3;
    }
    if (c === "thunderstorm") {
      T.clouds = 1;
      T.dark = 1;
      T.dim = 0.52;
      T.fog = 1;
      T.wind = 0.35 + 0.25 * k;
      T.light = 1;
      windBase = 0.75;
    }
    if (c === "lightning") {
      T.clouds = 0.95;
      T.dark = 1;
      T.dim = 0.46;
      T.light = 1;
      windBase = 0.3;
    }
    if (c === "wind") {
      T.wind = k;
      T.clouds = 0.35;
      T.stars = 0.55;
      windBase = 0.5 + 0.5 * k;
    }
    if (c === "snow") {
      T.clouds = 0.6;
      T.dim = 0.16;
      T.snow = k;
      T.stars = 0.1;
      windBase = 0.2;
    }
    if (c === "sunny") {
      T.sun = 1;
      windBase = 0.2;
      sunCfg = sunConfigForHour((/* @__PURE__ */ new Date()).getHours());
    }
    rainSpeed = c === "thunderstorm" ? 1.35 : 1;
  }
  const gust = (t) => {
    const s = t / 1e3;
    return 0.5 + 0.28 * Math.sin(s * 0.53) + 0.14 * Math.sin(s * 1.37 + 1.3) + 0.08 * Math.sin(s * 3.1 + 0.4);
  };
  function cloudMask() {
    const c = document.createElement("canvas");
    c.width = 640;
    c.height = 320;
    const g = c.getContext("2d");
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random());
      const x = 320 + Math.cos(a) * d * 240, y = 180 + Math.sin(a) * d * 70 - (1 - d) * 40, r = rnd(34, 96) * (1 - d * 0.5);
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, "rgba(255,255,255,.2)");
      gr.addColorStop(0.55, "rgba(255,255,255,.09)");
      gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, 7);
      g.fill();
    }
    return c;
  }
  function tint(m, top, bot) {
    const c = document.createElement("canvas");
    c.width = m.width;
    c.height = m.height;
    const g = c.getContext("2d");
    g.drawImage(m, 0, 0);
    g.globalCompositeOperation = "source-in";
    const lg = g.createLinearGradient(0, 70, 0, 290);
    lg.addColorStop(0, top);
    lg.addColorStop(1, bot);
    g.fillStyle = lg;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  const SPR = [...Array(6)].map(() => {
    const m = cloudMask();
    return {
      lt: tint(m, "#b4bdd3", "#465170"),
      dk: tint(m, "#5c6480", "#141824"),
      lit: tint(m, "#f2f5ff", "#a6b6e6"),
      sh: tint(m, "rgba(0,0,8,1)", "rgba(0,0,8,1)")
    };
  });
  function dot(r0, soft) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(r0, "rgba(255,255,255," + (soft ? 0.5 : 0.95) + ")");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    return c;
  }
  const FLAKE = dot(0.35, false), BOKEH = dot(0.7, true);
  const clouds = [...Array(18)].map((_, i) => {
    const y = rnd(-80, H - 40);
    return { x: rnd(-300, W + 100), y, s: (0.55 + 1.1 * clamp((y + 80) / H, 0, 1)) * rnd(0.8, 1.2), spr: i % 6, a: rnd(0.55, 0.95), v: rnd(0.6, 1.4), ph: rnd(0, 6) };
  });
  const RMAX = 1100;
  const drops = [...Array(RMAX)].map(() => ({ x: rnd(-120, W + 120), y: rnd(-H, H), z: Math.pow(Math.random(), 1.6) }));
  const splashes = [];
  const lens = [];
  const SMAX = 520;
  const flakes = [...Array(SMAX)].map(() => ({ x: rnd(-40, W + 40), y: rnd(-H, H), z: Math.pow(Math.random(), 1.4), ph: rnd(0, 6.28), f: rnd(0.6, 1.6) }));
  const streaks = [...Array(46)].map(() => newStreak(true));
  function newStreak(init) {
    return { x: init ? rnd(-200, W + 300) : rnd(-400, -60), y: rnd(HZ - 60, H), len: rnd(90, 280), v: rnd(420, 820), amp: rnd(4, 16), ph: rnd(0, 6), w: rnd(0.6, 1.4), a: rnd(0.08, 0.22) };
  }
  const LEAF_C = ["#7a6f47", "#5b6a3c", "#8b6a3e", "#4d5a36", "#9a8252"];
  const leaves = [...Array(34)].map(() => newLeaf(true));
  function newLeaf(init) {
    const y = rnd(HZ, H);
    return { x: init ? rnd(-40, W) : rnd(-120, -20), y, s: persp(y) * rnd(5, 9), r: rnd(0, 6.28), vr: rnd(-5, 5), fl: rnd(0, 6.28), vf: rnd(3, 8), c: LEAF_C[Math.random() * 5 | 0], v: rnd(0.7, 1.3), ph: rnd(0, 6) };
  }
  const dust = [...Array(160)].map(() => ({ x: rnd(0, W), y: rnd(HZ - 40, H), v: rnd(0.6, 1.6), z: Math.random() }));
  const stars = [...Array(140)].map(() => ({ x: rnd(0, W), y: rnd(0, HZ + 40) * Math.random() + rnd(0, 20), r: Math.random() < 0.1 ? rnd(1, 1.6) : rnd(0.35, 0.9), tw: rnd(0.6, 2.4), ph: rnd(0, 6.28) }));
  const motes = [...Array(34)].map(() => ({ x: rnd(0, W), y: rnd(HZ, H), vx: rnd(-6, 6), vy: rnd(-8, -2), ph: rnd(0, 6.28), r: rnd(0.8, 1.8) }));
  let shoot = null, nextShoot = now + rnd(2500, 6e3);
  const sunMotes = [...Array(10)].map(() => ({ x: rnd(0, W), y: rnd(HZ, H * 0.7), vx: rnd(-4, 4), vy: rnd(-3, 3), ph: rnd(0, 6.28), r: rnd(0.7, 1.5) }));
  const FULL = { pre: 0.1, main: 0.55, sec: 0.22 }, RED = { pre: 0.04, main: 0.16, sec: 0.07 };
  let strike = null, nextStrike = now + 900, F = 0;
  function boltPath(ax, ay, bx, by, disp, it) {
    let p = [[ax, ay], [bx, by]];
    for (let i = 0; i < it; i++) {
      const n = [];
      for (let j = 0; j < p.length - 1; j++) {
        const [x1, y1] = p[j], [x2, y2] = p[j + 1];
        n.push(p[j]);
        n.push([(x1 + x2) / 2 + rnd(-1, 1) * disp, (y1 + y2) / 2 + rnd(-0.25, 0.25) * disp]);
      }
      n.push(p[p.length - 1]);
      p = n;
      disp *= 0.56;
    }
    return p;
  }
  function makeStrike() {
    const seq = state.reducedFlashing ? RED : FULL;
    const steps = [[90, seq.pre], [70, 0], [70, seq.main], [90, seq.main * 0.35], [160, 0], [70, seq.sec], [70, seq.sec * 0.3], [220, 0]];
    const isStorm = state.condition === "thunderstorm";
    const bolt = Math.random() < (isStorm ? 0.6 : 0.5);
    const sx = rnd(40, W - 40), gy = rnd(0.46, 0.8) * H;
    const s = { t0: now, steps, cx: sx, cy: rnd(80, H * 0.45), bolt: null, gx: 0, gy: 0 };
    if (bolt) {
      const main = boltPath(sx, -30, sx + rnd(-90, 90), gy, 95, 7);
      const br = [];
      const nb = 2 + (Math.random() * 4 | 0);
      for (let i = 0; i < nb; i++) {
        const idx = 8 + (Math.random() * (main.length * 0.7) | 0);
        const [px, py] = main[Math.min(idx, main.length - 1)];
        br.push(boltPath(px, py, px + rnd(-140, 140), py + rnd(70, 220), 38, 6));
      }
      s.bolt = { main, br };
      s.gx = main[main.length - 1][0];
      s.gy = gy;
    }
    return s;
  }
  function flashAt(s, t) {
    let e = t - s.t0, v = 0;
    for (const [d, to] of s.steps) {
      if (e <= d) return v + (to - v) * (e / d);
      e -= d;
      v = to;
    }
    return -1;
  }
  function strokePath(p) {
    ctx.beginPath();
    ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }
  function frame(t) {
    if (!alive) return;
    const dt = Math.min(0.05, (t - now) / 1e3);
    now = t;
    for (const k in L) L[k] += (T[k] - L[k]) * Math.min(1, dt * (T[k] > L[k] ? 0.9 : 1.2));
    const G = gust(t);
    const wind = clamp(windBase * (0.55 + 0.9 * G), 0, 1.4);
    ctx.clearRect(0, 0, W, H);
    if (L.dim > 5e-3) {
      ctx.fillStyle = `rgba(5,8,16,${L.dim})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (L.stars > 0.01) {
      const a = L.stars;
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const s of stars) {
        const tw = 0.55 + 0.45 * Math.sin(t / 1e3 * s.tw + s.ph);
        const fade = clamp(1 - (s.y - HZ + 20) / 80, 0, 1);
        ctx.globalAlpha = a * tw * fade * (s.r > 1 ? 0.95 : 0.7);
        ctx.drawImage(FLAKE, s.x - s.r * 2, s.y - s.r * 2, s.r * 4, s.r * 4);
      }
      ctx.globalAlpha = 1;
      const sx = W * 0.5 + Math.sin(t / 9e3) * 120, sy = H * 0.55 + Math.cos(t / 11e3) * 90;
      let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 300);
      g.addColorStop(0, `rgba(140,165,230,${0.07 * a})`);
      g.addColorStop(1, "rgba(140,165,230,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      if (!shoot && t > nextShoot && a > 0.6) {
        shoot = { x: rnd(40, W - 80), y: rnd(10, HZ - 40), t0: t, vx: rnd(260, 380), vy: rnd(70, 120) };
      }
      if (shoot) {
        const e = (t - shoot.t0) / 1e3;
        if (e > 0.9) {
          shoot = null;
          nextShoot = t + rnd(5e3, 12e3);
        } else {
          const px = shoot.x + shoot.vx * e, py = shoot.y + shoot.vy * e, al = Math.sin(Math.PI * e / 0.9) * a;
          const lg = ctx.createLinearGradient(px, py, px - shoot.vx * 0.28, py - shoot.vy * 0.28);
          lg.addColorStop(0, `rgba(255,255,255,${al})`);
          lg.addColorStop(1, "rgba(255,255,255,0)");
          ctx.strokeStyle = lg;
          ctx.lineWidth = 1.4;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px - shoot.vx * 0.28, py - shoot.vy * 0.28);
          ctx.stroke();
        }
      }
      for (const m of motes) {
        m.x += (m.vx + Math.sin(t / 1400 + m.ph) * 6) * dt;
        m.y += m.vy * dt;
        if (m.y < HZ - 20) {
          m.y = H + 10;
          m.x = rnd(0, W);
        }
        if (m.x < -10) m.x = W + 10;
        if (m.x > W + 10) m.x = -10;
        const tw = 0.5 + 0.5 * Math.sin(t / 700 + m.ph);
        ctx.globalAlpha = a * 0.45 * tw;
        const r = m.r * persp(m.y) * 3;
        ctx.drawImage(BOKEH, m.x - r, m.y - r, r * 2, r * 2);
      }
      ctx.restore();
    }
    if (L.sun > 0.01) {
      const a = L.sun, sc = sunCfg, rm = state.reduceMotion;
      const sx = W * 0.84, sy = H * (0.28 - sc.elevation * 0.16) + 20;
      const warm = sc.warmth > 0.7 ? "255,214,150" : sc.warmth > 0.45 ? "255,222,170" : "255,236,200";
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 170 * sc.glowRadius);
      g.addColorStop(0, `rgba(${warm},${0.26 * a * sc.intensity})`);
      g.addColorStop(1, `rgba(${warm},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(sx - 220, sy - 220, 440, 440);
      const rayBreathe = rm ? 0.85 : 0.75 + 0.25 * Math.sin(t / 9e3);
      for (let i = 0; i < 2; i++) {
        const ra = (sc.angle + 140 + i * 22) * Math.PI / 180, len = 240 * sc.glowRadius;
        const ex = sx + Math.cos(ra) * len, ey = sy + Math.sin(ra) * len;
        const lg = ctx.createLinearGradient(sx, sy, ex, ey);
        lg.addColorStop(0, `rgba(${warm},${0.05 * a * sc.intensity * rayBreathe})`);
        lg.addColorStop(1, `rgba(${warm},0)`);
        ctx.strokeStyle = lg;
        ctx.lineWidth = 64;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      }
      const wx = rm ? W * 0.5 : W * 0.5 + Math.sin(t / 12e3) * 80, wy = rm ? H * 0.5 : H * 0.5 + Math.cos(t / 14e3) * 60;
      g = ctx.createRadialGradient(wx, wy, 0, wx, wy, 340);
      g.addColorStop(0, `rgba(${warm},${0.045 * a * sc.intensity})`);
      g.addColorStop(1, `rgba(${warm},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = "source-over";
      g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 13);
      g.addColorStop(0, `rgba(255,250,235,${a})`);
      g.addColorStop(0.7, `rgba(255,232,190,${a * 0.9})`);
      g.addColorStop(1, "rgba(255,220,170,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(sx, sy, 13, 0, 7);
      ctx.fill();
      ctx.globalCompositeOperation = "lighter";
      for (const m of sunMotes) {
        if (!rm) {
          m.x += (m.vx + Math.sin(t / 1600 + m.ph) * 4) * dt;
          m.y += m.vy * dt;
          if (m.y < HZ - 20 || m.y > H * 0.72) {
            m.y = rnd(HZ, H * 0.7);
            m.x = rnd(0, W);
          }
          if (m.x < -10) m.x = W + 10;
          if (m.x > W + 10) m.x = -10;
        }
        const tw = rm ? 0.75 : 0.5 + 0.5 * Math.sin(t / 900 + m.ph);
        ctx.globalAlpha = a * 0.3 * tw * sc.intensity;
        const r = m.r * persp(m.y) * 2.4;
        ctx.drawImage(BOKEH, m.x - r, m.y - r, r * 2, r * 2);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    if (L.light > 0.3 && T.light > 0) {
      if (!strike && t > nextStrike) {
        strike = makeStrike();
        nextStrike = t + rnd(3e3, 12e3);
      }
    }
    F = 0;
    if (strike) {
      const f = flashAt(strike, t);
      if (f < 0) strike = null;
      else F = f;
    }
    if (L.clouds > 0.01) {
      const cs = (6 + wind * 34) * (T.wind > 0 && !T.light ? 1.6 : 1);
      for (const c of clouds) {
        c.x += cs * c.v * c.s * dt;
        const w = 640 * c.s;
        if (c.x > W + 40) {
          c.x = -w - rnd(0, 200);
        }
      }
      ctx.save();
      for (const c of clouds) {
        if (c.y < HZ - 40) continue;
        const w = 640 * c.s, h = 320 * c.s * 0.7;
        ctx.globalAlpha = L.clouds * c.a * 0.28 * (1 - L.dark * 0.5);
        ctx.drawImage(SPR[c.spr].sh, c.x + 26 * c.s, c.y + 50 * c.s, w, h);
      }
      ctx.restore();
      ctx.save();
      for (const c of clouds) {
        const sp = SPR[c.spr], m = 1 + 0.025 * Math.sin(t / 4e3 + c.ph), w = 640 * c.s * m, h = 320 * c.s * (2 - m) * 0.72;
        const al = L.clouds * c.a;
        if (L.dark < 0.99) {
          ctx.globalAlpha = al * (1 - L.dark) * 0.82;
          ctx.drawImage(sp.lt, c.x, c.y, w, h);
        }
        if (L.dark > 0.01) {
          ctx.globalAlpha = al * L.dark * 0.95;
          ctx.drawImage(sp.dk, c.x, c.y, w, h);
        }
        if (F > 5e-3 && strike) {
          const d = Math.hypot(c.x + w / 2 - strike.cx, c.y + h / 2 - strike.cy);
          const k = clamp(1 - d / 420, 0, 1) * 0.7 + 0.3;
          ctx.globalAlpha = Math.min(1, F * 1.7 * k) * al;
          ctx.drawImage(sp.lit, c.x, c.y, w, h);
        }
      }
      ctx.restore();
    }
    if (F > 5e-3 && strike) {
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const r = 260;
      const g = ctx.createRadialGradient(strike.cx, strike.cy, 0, strike.cx, strike.cy, r);
      g.addColorStop(0, `rgba(205,215,255,${F * 0.9})`);
      g.addColorStop(1, "rgba(205,215,255,0)");
      ctx.fillStyle = g;
      ctx.fillRect(strike.cx - r, strike.cy - r, r * 2, r * 2);
      ctx.restore();
    }
    const lean = Math.tan((T.light && T.rain ? 12 + 10 * G : 4 + wind * 10) * Math.PI / 180);
    if (L.rain > 5e-3) {
      const n = Math.floor(RMAX * L.rain);
      ctx.save();
      ctx.lineCap = "round";
      const bins = [[], [], []];
      for (let i = 0; i < n; i++) {
        const d = drops[i];
        const v = (820 + d.z * 1500) * rainSpeed;
        d.y += v * dt;
        d.x += v * dt * lean;
        if (d.y > H + 40) {
          d.y = rnd(-160, -20);
          d.x = rnd(-160, W + 60);
        }
        bins[d.z < 0.35 ? 0 : d.z < 0.75 ? 1 : 2].push(d);
      }
      const st = [[0.6, 0.13, 10], [1, 0.22, 20], [1.5, 0.34, 34]];
      bins.forEach((b, bi) => {
        const [lw, al, len] = st[bi];
        ctx.lineWidth = lw;
        ctx.strokeStyle = `rgba(${190 + F * 60},${205 + F * 50},${235 + F * 20},${al * Math.min(1, L.rain * 1.4) + F * 0.4})`;
        ctx.beginPath();
        for (const d of b) {
          const l = len * (0.7 + d.z * 0.6) * rainSpeed;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - l * lean, d.y - l);
        }
        ctx.stroke();
      });
      let spawn = L.rain * 110 * dt;
      while (spawn > 0) {
        if (Math.random() < spawn) {
          const y = rnd(HZ + 30, H);
          splashes.push({ x: rnd(0, W), y, t0: t, s: persp(y) });
        }
        spawn -= 1;
      }
      ctx.strokeStyle = "rgba(210,222,245,1)";
      ctx.fillStyle = "rgba(215,226,248,1)";
      for (let i = splashes.length - 1; i >= 0; i--) {
        const p = splashes[i], e = (t - p.t0) / 380;
        if (e > 1) {
          splashes.splice(i, 1);
          continue;
        }
        const r = (2 + e * 9) * p.s;
        ctx.globalAlpha = (1 - e) * 0.5 * Math.min(1, L.rain * 1.5);
        ctx.lineWidth = 0.8 * p.s;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, r, r * 0.38, 0, 0, 7);
        ctx.stroke();
        if (e < 0.6) {
          for (let k = 0; k < 3; k++) {
            const a = -Math.PI * (0.2 + 0.3 * k), dd = (4 + e * 12) * p.s;
            ctx.beginPath();
            ctx.arc(p.x + Math.cos(a) * dd, p.y + Math.sin(a) * dd * 0.9 - e * (1 - e) * 18 * p.s, 0.9 * p.s, 0, 7);
            ctx.fill();
          }
        }
      }
      ctx.restore();
    }
    if (L.snow > 5e-3) {
      const n = Math.floor(SMAX * L.snow), sl = wind * 40 + 14;
      ctx.save();
      for (let i = 0; i < n; i++) {
        const f = flakes[i];
        const v = 24 + f.z * 78;
        f.y += v * dt * f.f;
        f.x += (Math.sin(t / 1e3 * f.f + f.ph) * (10 + f.z * 22) + sl) * dt;
        if (f.y > H + 20) {
          f.y = rnd(-60, -10);
          f.x = rnd(-60, W);
        }
        if (f.x > W + 30) f.x = -30;
        if (f.z > 0.88) {
          const r = 6 + f.z * 9;
          ctx.globalAlpha = 0.16 * L.snow * 1.4;
          ctx.drawImage(BOKEH, f.x - r, f.y - r, r * 2, r * 2);
        } else {
          const r = 0.8 + f.z * 2.8;
          ctx.globalAlpha = (0.35 + f.z * 0.6) * Math.min(1, L.snow * 1.5);
          ctx.drawImage(FLAKE, f.x - r, f.y - r, r * 2, r * 2);
        }
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      let g = ctx.createLinearGradient(0, HZ, 0, H);
      g.addColorStop(0, "rgba(200,212,238,0)");
      g.addColorStop(1, `rgba(200,212,238,${0.12 * L.snow})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, HZ, W, H - HZ);
      g = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.72);
      g.addColorStop(0, "rgba(225,235,255,0)");
      g.addColorStop(1, `rgba(225,235,255,${0.22 * L.snow})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (L.wind > 5e-3) {
      const a = L.wind, sp = 0.5 + G * 1.1;
      ctx.save();
      ctx.lineCap = "round";
      for (let i = 0; i < Math.floor(dust.length * a); i++) {
        const d = dust[i];
        d.x += (180 + d.z * 380) * sp * d.v * dt;
        d.y += Math.sin(t / 600 + i) * 12 * dt;
        if (d.x > W + 10) {
          d.x = -10;
          d.y = rnd(HZ - 40, H);
        }
        ctx.fillStyle = `rgba(225,230,245,${(0.12 + d.z * 0.28) * a})`;
        const r = (0.5 + d.z * 0.9) * persp(d.y);
        ctx.fillRect(d.x, d.y, r * 2.4, r);
      }
      const ns = Math.floor(streaks.length * a);
      for (let i = 0; i < ns; i++) {
        const s = streaks[i];
        s.x += s.v * sp * dt;
        s.ph += dt * 2;
        if (s.x - s.len > W + 20) streaks[i] = newStreak(false);
        const hx = s.x, tx = s.x - s.len;
        const lg = ctx.createLinearGradient(tx, 0, hx, 0);
        lg.addColorStop(0, "rgba(220,228,250,0)");
        lg.addColorStop(0.7, `rgba(220,228,250,${s.a * a * (0.6 + G * 0.6)})`);
        lg.addColorStop(1, "rgba(220,228,250,0)");
        ctx.strokeStyle = lg;
        ctx.lineWidth = s.w * persp(s.y);
        ctx.beginPath();
        for (let k = 0; k <= 12; k++) {
          const u = k / 12, x = tx + u * s.len, y = s.y + Math.sin(s.ph + u * 3.2) * s.amp * (0.5 + u);
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      }
      const nl = Math.floor(leaves.length * a);
      for (let i = 0; i < nl; i++) {
        const l = leaves[i];
        l.x += (160 + 260 * sp) * l.v * dt * (l.s / 7);
        l.y += (Math.sin(t / 500 + l.ph) * 40 + 18) * dt;
        l.r += l.vr * dt * sp;
        l.fl += l.vf * dt;
        if (l.x > W + 40 || l.y > H + 30) leaves[i] = newLeaf(false);
        ctx.save();
        ctx.translate(l.x, l.y);
        ctx.rotate(l.r);
        ctx.scale(1, Math.cos(l.fl));
        ctx.globalAlpha = 0.9 * Math.min(1, a * 1.4);
        ctx.fillStyle = l.c;
        ctx.beginPath();
        ctx.moveTo(-l.s, 0);
        ctx.quadraticCurveTo(0, -l.s * 0.62, l.s, 0);
        ctx.quadraticCurveTo(0, l.s * 0.62, -l.s, 0);
        ctx.fill();
        ctx.strokeStyle = "rgba(20,18,10,.45)";
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(-l.s * 1.2, 0);
        ctx.lineTo(l.s * 0.9, 0);
        ctx.stroke();
        ctx.restore();
      }
      ctx.restore();
    }
    if (strike && strike.bolt) {
      const e = t - strike.t0;
      if (e < 560) {
        const on = e < 160 ? 1 : e < 300 ? 0.35 : e < 380 ? 0.9 : clamp(1 - (e - 380) / 180, 0, 1);
        const cap = state.reducedFlashing ? 0.35 : 1;
        const al = on * cap * (0.85 + Math.random() * 0.15);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
        const g = ctx.createRadialGradient(strike.gx, strike.gy, 0, strike.gx, strike.gy, 160);
        g.addColorStop(0, `rgba(190,205,255,${0.35 * al})`);
        g.addColorStop(1, "rgba(190,205,255,0)");
        ctx.fillStyle = g;
        ctx.fillRect(strike.gx - 160, strike.gy - 160, 320, 320);
        ctx.shadowColor = "rgba(150,175,255,1)";
        ctx.shadowBlur = 28;
        ctx.strokeStyle = `rgba(170,190,255,${0.55 * al})`;
        ctx.lineWidth = 6;
        strokePath(strike.bolt.main);
        ctx.lineWidth = 2.4;
        strike.bolt.br.forEach((b) => strokePath(b));
        ctx.shadowBlur = 8;
        ctx.strokeStyle = `rgba(255,255,255,${al})`;
        ctx.lineWidth = 1.8;
        strokePath(strike.bolt.main);
        ctx.lineWidth = 0.9;
        ctx.strokeStyle = `rgba(235,240,255,${al * 0.8})`;
        strike.bolt.br.forEach((b) => strokePath(b));
        ctx.restore();
      }
    }
    if (F > 2e-3) {
      ctx.fillStyle = `rgba(232,238,255,${F})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (L.fog > 0.01) {
      const g = ctx.createLinearGradient(0, H * 0.35, 0, H);
      g.addColorStop(0, "rgba(120,135,170,0)");
      g.addColorStop(1, `rgba(120,135,170,${0.16 * L.fog})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    const lensTarget = Math.floor(22 * L.rain);
    if (lens.length < lensTarget && Math.random() < dt * 6 * L.rain) lens.push({ x: rnd(10, W - 10), y: rnd(10, H - 10), r: rnd(2.5, 7.5), vy: 0, t0: t, a: 0, slide: Math.random() < 0.35, trail: [] });
    for (let i = lens.length - 1; i >= 0; i--) {
      const d = lens[i];
      d.a = Math.min(1, d.a + dt * 3);
      if (d.slide && d.r > 4.5) {
        d.vy = Math.min(90, d.vy + dt * (Math.random() < 0.1 ? 300 : 40));
        d.y += d.vy * dt;
        d.x += Math.sin(d.y * 0.05) * 0.3;
        if (Math.random() < dt * 14) d.trail.push({ x: d.x, y: d.y - d.r, r: rnd(0.8, 1.6) });
      }
      const life = (t - d.t0) / 1e3;
      const fade = lensTarget === 0 || life > 14 ? Math.max(0, d.a - dt * 1.5) : d.a;
      d.a = fade;
      if (d.a <= 0 || d.y > H + 20) {
        lens.splice(i, 1);
        continue;
      }
      ctx.save();
      ctx.globalAlpha = d.a;
      for (const p of d.trail) {
        ctx.fillStyle = "rgba(220,230,250,.22)";
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 7);
        ctx.fill();
      }
      let g = ctx.createRadialGradient(d.x - d.r * 0.25, d.y - d.r * 0.3, 0, d.x, d.y, d.r);
      g.addColorStop(0, "rgba(200,215,245,.06)");
      g.addColorStop(0.7, "rgba(10,14,28,.14)");
      g.addColorStop(1, "rgba(0,0,0,.34)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.r, d.r * 1.08, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = `rgba(230,238,255,${0.28 + F})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.r * 0.82, Math.PI * 0.15, Math.PI * 0.85);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.75 + F * 0.25})`;
      ctx.beginPath();
      ctx.arc(d.x - d.r * 0.36, d.y - d.r * 0.42, Math.max(0.6, d.r * 0.16), 0, 7);
      ctx.fill();
      ctx.restore();
    }
    if (L.dark > 0.01) {
      const g = ctx.createRadialGradient(W / 2, H * 0.45, H * 0.25, W / 2, H * 0.45, H * 0.7);
      g.addColorStop(0, "rgba(0,0,0,0)");
      g.addColorStop(1, `rgba(0,0,6,${0.45 * L.dark * (1 - F)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    raf = requestAnimationFrame(frame);
  }
  function apply() {
    setTargets(state.condition, state.intensity);
    if (state.condition === "thunderstorm" || state.condition === "lightning") nextStrike = now + 900;
  }
  apply();
  Object.assign(L, T);
  raf = requestAnimationFrame(frame);
  return {
    setWeather(c, i) {
      const changed = c !== state.condition;
      state.condition = c;
      state.intensity = i;
      setTargets(c, i);
      if (changed && (c === "thunderstorm" || c === "lightning")) nextStrike = now + 900;
    },
    setReducedFlashing(v) {
      state.reducedFlashing = v;
    },
    setReduceMotion(v) {
      state.reduceMotion = v;
      if (v) {
        T.light = 0;
      } else setTargets(state.condition, state.intensity);
    },
    resize,
    pause() {
      cancelAnimationFrame(raf);
      raf = 0;
    },
    resume() {
      if (!raf && alive) {
        now = performance.now();
        raf = requestAnimationFrame(frame);
      }
    },
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      raf = 0;
      ctx.clearRect(0, 0, W, H);
    }
  };
}
export {
  createWeatherEngine
};
