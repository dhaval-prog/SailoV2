// The weather over Throw's map (port of MySpace's WeatherOverlay.web + WeatherCanvas.web + RainOverlay.web +
// ThrowWeatherContext): the canvas weather engine (sky tint, clouds, sun, lightning, snow, wind), with a rain canvas on
// top for rain and storms (a storm always rains heavy). The weather is either the real weather at your Throw location
// (Open-Meteo, cached 20 minutes, retried no sooner than a minute after a failure) or the one you chose in settings.
import { createWeatherEngine } from './weatherEngine.js';
import { generateRainParticles, RAIN_LAYER_SPEED_MULTIPLIER } from './rainParticles.js';
import { getCurrentWeather, normalizeWeatherCondition } from './weatherService.js';

const CACHE_TTL_MS = 20 * 60 * 1000, RETRY_COOLDOWN_MS = 60 * 1000;
const BASE_LOOP_MS = 2400, ANGLE_DEG = 8, PRESENCE_DURATION_MS = 1400, RAIN_DROP_RGB = '214,226,240';
let autoCache = null, lastAttemptAt = 0; // (shared across openings, like MySpace's context)

/** Resolves the weather to show: { weather, intensity }. */
export async function resolveWeather(prefs, location) {
  if (prefs.weatherMode === 'manual') return { weather: prefs.weatherCondition || 'clear', intensity: prefs.weatherIntensity || 'medium' };
  const fresh = autoCache && Date.now() - autoCache.at < CACHE_TTL_MS && autoCache.key === location?.city;
  if (!fresh && location && Date.now() - lastAttemptAt >= RETRY_COOLDOWN_MS) {
    lastAttemptAt = Date.now();
    const raw = await getCurrentWeather(location.latitude, location.longitude);
    if (raw) autoCache = { at: Date.now(), key: location.city, value: normalizeWeatherCondition(raw) };
  }
  return { weather: autoCache?.value.condition ?? 'clear', intensity: autoCache?.value.intensity ?? 'light' };
}

function rainLayer(canvas) {
  const ctx = canvas.getContext('2d');
  let particles = [], ys = [], presence = 0, target = 0, w = 0, h = 0, raf = 0, last = 0, intensityNow = null;
  const setIntensity = i => { if (i === intensityNow) return; intensityNow = i; particles = generateRainParticles('high', i); ys = particles.map(p => p.phase); };
  const resize = (width, height) => { const dpr = devicePixelRatio || 1; w = width; h = height; canvas.width = Math.max(1, width * dpr); canvas.height = Math.max(1, height * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); };
  const tick = time => {
    raf = requestAnimationFrame(tick);
    if (document.hidden) { last = time; return; }
    const dt = last ? Math.min(48, time - last) : 16; last = time;
    const delta = target - presence; presence += Math.sign(delta) * Math.min(Math.abs(delta), dt / PRESENCE_DURATION_MS);
    ctx.clearRect(0, 0, w, h);
    if (presence <= 0.0005) return;
    const a = ANGLE_DEG * Math.PI / 180, sinA = Math.sin(a), cosA = Math.cos(a), tanA = Math.tan(a);
    ctx.lineCap = 'round';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i], travel = h + p.length * 2;
      const y = ys[i] = ((ys[i] ?? p.phase) + dt / BASE_LOOP_MS * RAIN_LAYER_SPEED_MULTIPLIER[p.layer]) % 1;
      const reveal = presence >= 1 ? 1 : Math.max(0, Math.min(1, (presence - Math.min(p.revealAt, 0.85)) / 0.15));
      if (reveal <= 0) continue;
      const headY = -p.length + y * travel, headX = p.x * w + y * travel * tanA;
      ctx.strokeStyle = `rgba(${RAIN_DROP_RGB},${reveal * p.opacity})`; ctx.lineWidth = p.thickness;
      ctx.beginPath(); ctx.moveTo(headX, headY); ctx.lineTo(headX - p.length * sinA, headY - p.length * cosA); ctx.stroke();
    }
  };
  raf = requestAnimationFrame(tick);
  return { resize, set(active, intensity) { if (active) setIntensity(intensity); target = active ? 1 : 0; }, destroy() { cancelAnimationFrame(raf); } };
}

/** Mounts the weather layers into host (absolutely positioned, no pointer events). */
export function createWeatherOverlay(host, { prefs, store }) {
  const mk = () => { const c = document.createElement('canvas'); c.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none'; host.append(c); return c; };
  const engineCanvas = mk(), rainCanvas = mk();
  const r = host.getBoundingClientRect();
  const engine = createWeatherEngine(engineCanvas, { width: r.width || 390, height: r.height || 844 });
  const rain = rainLayer(rainCanvas); rain.resize(r.width || 390, r.height || 844);
  const ro = new ResizeObserver(([e]) => { engine.resize(e.contentRect.width, e.contentRect.height); rain.resize(e.contentRect.width, e.contentRect.height); });
  ro.observe(host);
  const onVis = () => (document.hidden ? engine.pause() : engine.resume());
  document.addEventListener('visibilitychange', onVis);
  const mq = matchMedia('(prefers-reduced-motion: reduce)'), onMq = () => engine.setReduceMotion(mq.matches);
  mq.addEventListener?.('change', onMq); onMq();
  let alive = true, shown = null;
  async function refresh() {
    engine.setReducedFlashing(!!prefs.reducedFlashing);
    const { weather, intensity } = await resolveWeather(prefs, store.state.myLocation);
    if (!alive || (shown && shown.weather === weather && shown.intensity === intensity)) return;
    shown = { weather, intensity };
    engine.setWeather(weather, intensity);
    const storm = weather === 'thunderstorm';
    rain.set(weather === 'rain' || storm, storm ? 'heavy' : intensity);
  }
  refresh();
  const timer = setInterval(refresh, 60 * 1000);
  return {
    refresh,
    get current() { return shown; },
    destroy() { alive = false; clearInterval(timer); ro.disconnect(); document.removeEventListener('visibilitychange', onVis); mq.removeEventListener?.('change', onMq); engine.destroy(); rain.destroy(); engineCanvas.remove(); rainCanvas.remove(); },
  };
}
