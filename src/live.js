// Live time and weather for Pune: the clock runs on Pune time (Asia/Kolkata), and
// the sky follows Pune's current weather and daylight from Open-Meteo (free, no key).

export const PLACE = { name: 'Pune', lat: 18.52, lon: 73.86, tz: 'Asia/Kolkata' };
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&forecast_days=1&timezone=${encodeURIComponent(PLACE.tz)}`;

// WMO weather codes -> the scene's presets
export const presetFor = code =>
  code <= 1 ? 'clear' : code <= 3 ? 'cloudy' : code === 45 || code === 48 ? 'fog'
  : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow'
  : code >= 95 ? 'storm' : 'rain';

const fmtTime = new Intl.DateTimeFormat('en-IN', { timeZone: PLACE.tz, hour: 'numeric', minute: '2-digit', hour12: true });
const fmtDate = new Intl.DateTimeFormat('en-IN', { timeZone: PLACE.tz, weekday: 'short', day: 'numeric', month: 'short' });
const fmtHour = new Intl.DateTimeFormat('en-GB', { timeZone: PLACE.tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

/** Pune time as display strings, plus minutes since midnight. */
export const clock = (d = new Date()) => {
  const [h, m] = fmtHour.format(d).split(':').map(Number);
  return { time: fmtTime.format(d).toUpperCase(), date: fmtDate.format(d), mins: h * 60 + m };
};

/** Current Pune weather: { preset, tempC, isDay, sunrise, sunset } (sunrise/sunset in minutes), or null when offline. */
export async function fetchWeather() {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(URL, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json(), c = j.current || {};
    const toMins = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
    return {
      preset: presetFor(Number(c.weather_code) || 0),
      tempC: Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) : null,
      isDay: c.is_day !== 0,
      sunrise: toMins(j.daily?.sunrise?.[0]), sunset: toMins(j.daily?.sunset?.[0]),
    };
  } catch { return null; } finally { clearTimeout(t); }
}

/** Is it night in Pune right now? Uses today's sunrise/sunset when known, else 6:30 am – 6:30 pm. */
export const isNight = (mins, wx) => {
  const rise = wx?.sunrise ?? 390, set = wx?.sunset ?? 1110;
  return mins < rise || mins >= set;
};
