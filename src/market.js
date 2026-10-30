// The Fish Market's prices (settings: MARKET in world-config.js). A species' price is its base price × a multiplier
// that moves with the time of day (each species has its own busy hour) and the day's demand (a smooth drift from one
// half-hour to the next). It's worked out from the clock and the species alone, so every captain sees the same price at
// the same moment; nothing random happens per device or per frame.
import { MARKET as M } from './world-config.js';
import { clock } from './live.js';

export const h32 = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); return (h ^ (h >>> 15)) >>> 0; };
const noise = (id, k) => h32(`mkt:${id}:${k}`) / 4294967296 * 2 - 1; // -1…1, fixed per species and half-hour
const smooth = u => u * u * (3 - 2 * u);
// the chart's local hour at a moment (formatting dates is slow: remembered per minute)
const hours = new Map(); const hourAt = ms => { const k = Math.floor(ms / 60000); let h = hours.get(k); if (h == null) { if (hours.size > 50) hours.clear(); h = clock(new Date(k * 60000)).mins / 60; hours.set(k, h); } return h + (ms - k * 60000) / 3600000; };

/** The multiplier on a species' base price at a moment (ms). */
export function marketMult(f, ms = Date.now()) {
  const P = M.period * 1000, k = Math.floor(ms / P), u = smooth((ms - k * P) / P);
  const demand = noise(f.id, k) * (1 - u) + noise(f.id, k + 1) * u;
  const hour = hourAt(ms), busy = h32('busy:' + f.id) % 24; // (the hour its demand peaks)
  const daily = Math.cos((hour - busy) / 24 * Math.PI * 2);
  return Math.min(M.max, Math.max(M.min, 1 + M.swing * demand + M.daily * daily));
}
/** What one fish of this species sells for now, in coins. */
export const priceOf = (f, ms = Date.now()) => Math.max(1, Math.round(f.price * marketMult(f, ms)));
/** 'up', 'down' or 'flat', against a while ago. */
export function trendOf(f, ms = Date.now()) { const d = marketMult(f, ms) / marketMult(f, ms - M.trendOver * 1000) - 1; return d > M.trendStep ? 'up' : d < -M.trendStep ? 'down' : 'flat'; }
const partOfDay = (ms = Date.now()) => { const h = hourAt(ms); return h >= 20 || h < 5 ? 'tonight' : h >= 17 ? 'this evening' : h >= 12 ? 'this afternoon' : 'this morning'; };
const short = f => f.name.replace(/\s*\(.*\)$/, '').replace(/^(Yellowfin|Atlantic|European|Silver)\s+/, '');
/** The market's news: the biggest mover among these species ('Tuna is selling high tonight!'), or ''. */
export function headline(fish, ms = Date.now()) {
  let best = null; fish.forEach(f => { const m = marketMult(f, ms); if (!best || Math.abs(m - 1) > Math.abs(best.m - 1)) best = { f, m }; });
  if (!best) return '';
  const { f, m } = best, t = trendOf(f, ms), when = partOfDay(ms);
  if (m >= M.high) return t === 'up' ? `${short(f)} is in high demand at Paradise Station.` : `${short(f)} is selling high ${when}!`;
  if (m <= M.low) return `${short(f)} prices have dropped ${when}.`;
  if (m >= 1.12) return `${short(f)} is selling well ${when}.`;
  return '';
}
/** A one-line ticker: 'Tuna 52c ▲ · Mackerel 7c ▼ · …' (the biggest movers first). */
export function ticker(fish, ms = Date.now(), n = 6) {
  return fish.map(f => ({ f, m: marketMult(f, ms) })).sort((a, b) => Math.abs(b.m - 1) - Math.abs(a.m - 1)).slice(0, n)
    .map(({ f }) => `${short(f)} ${priceOf(f, ms)}c ${{ up: '▲', down: '▼', flat: '•' }[trendOf(f, ms)]}`).join('   ·   ');
}
/** Calls note(text) when a species' price becomes news (at most once every MARKET.notifyEvery seconds). */
export function watchMarket(fish, note) {
  let last = 0; const band = new Map(fish.map(f => [f.id, bandOf(f)]));
  function bandOf(f) { const m = marketMult(f); return m >= M.high ? 'high' : m <= M.low ? 'low' : ''; }
  setInterval(() => { let news = false; fish.forEach(f => { const b = bandOf(f); if (b && b !== band.get(f.id)) news = true; band.set(f.id, b); });
    if (news && Date.now() - last > M.notifyEvery * 1000) { const h = headline(fish); if (h) { last = Date.now(); note(h); } } }, 60000);
}
