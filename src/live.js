// Live time and weather for the active chart's city: the clock runs on that city's time zone,
// and the sky follows its current weather and daylight from Open-Meteo (free, no key).
// A newly picked city may not know its time zone yet: Open-Meteo reports it (timezone=auto)
// and the chart remembers it.
import { CHART, rememberTz } from './chart.js';

export const PLACE = { name: CHART.city, lat: CHART.lat, lon: CHART.lng, get tz() { return CHART.tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } };
const URL = `https://api.open-meteo.com/v1/forecast?latitude=${PLACE.lat}&longitude=${PLACE.lon}&current=temperature_2m,weather_code,is_day&daily=sunrise,sunset&forecast_days=1&timezone=auto`;

// WMO weather codes -> the scene's presets
export const presetFor = code =>
  code <= 1 ? 'clear' : code <= 3 ? 'cloudy' : code === 45 || code === 48 ? 'fog'
  : (code >= 71 && code <= 77) || code === 85 || code === 86 ? 'snow'
  : code >= 95 ? 'storm' : 'rain';

let fmt = null;
const formatters = () => { const tz = PLACE.tz; if (fmt?.tz === tz) return fmt; let o;
  try { o = { timeZone: tz }; new Intl.DateTimeFormat('en', o); } catch { o = {}; }
  return (fmt = { tz, time: new Intl.DateTimeFormat('en-IN', { ...o, hour: 'numeric', minute: '2-digit', hour12: true }), date: new Intl.DateTimeFormat('en-IN', { ...o, weekday: 'short', day: 'numeric', month: 'short' }),
    hour: new Intl.DateTimeFormat('en-GB', { ...o, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }) }); };

/** The city's local time as display strings, plus minutes since midnight. */
export const clock = (d = new Date()) => {
  const f = formatters(), [h, m] = f.hour.format(d).split(':').map(Number);
  return { time: f.time.format(d).toUpperCase(), date: f.date.format(d), mins: h * 60 + m };
};

/** Current weather in the chart's city: { preset, tempC, isDay, sunrise, sunset } (sunrise/sunset in minutes), or null when offline. */
export async function fetchWeather() {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(URL, { signal: ctl.signal });
    if (!r.ok) return null;
    const j = await r.json(), c = j.current || {}; rememberTz(j.timezone);
    const toMins = s => { const m = /T(\d\d):(\d\d)/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : null; };
    return {
      preset: presetFor(Number(c.weather_code) || 0),
      tempC: Number.isFinite(c.temperature_2m) ? Math.round(c.temperature_2m) : null,
      isDay: c.is_day !== 0,
      sunrise: toMins(j.daily?.sunrise?.[0]), sunset: toMins(j.daily?.sunset?.[0]),
    };
  } catch { return null; } finally { clearTimeout(t); }
}

/** Is it night in the city right now? Uses today's sunrise/sunset when known, else 6:30 am – 6:30 pm. */
export const isNight = (mins, wx) => {
  const rise = wx?.sunrise ?? 390, set = wx?.sunset ?? 1110;
  return mins < rise || mins >= set;
};
