// Game progress per captain account: coins, boats and their fuel / hold, the fish collection, the
// current boat, positions per city, visited cities, settings and boat colours. The game keeps these
// in localStorage as always; for a signed-in captain this module mirrors them to their row in
// player_progress (Supabase, row-level security: only they can read or write it).
//   - start-up (before anything reads them): pull the account's save into this device
//   - while playing: push changes every few seconds, and when the page closes
//   - newest save wins between devices; guest progress on this device carries into the account the
//     first time it signs in here; another account's progress is never handed to the next captain
import { SUPABASE_URL, SUPABASE_KEY } from './supabase.js';
import { currentSession, captainName } from './auth.js';

const META = 'sailo:sync'; // { owner: user id, syncedAt: server time of the last pull / push, localT: last local change }
const FIXED = ['sailo:economy', 'sailo:fishlog', 'sailo:boat', 'sailo:chart', 'sailo:charts', 'sailo:home', 'sailo:pos', 'sailo:settings',
  'sailo:garage-seen', 'sailo:inbox-seen', 'sailo-hint-seen', 'sailboat.sail', 'daysailer.sail', 'motoryacht.flag'];
const isProgress = k => FIXED.includes(k) || k.startsWith('sailo:pos@'); // (positions per city)

const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* storage blocked */ } },
  keys: () => { try { return Object.keys(localStorage); } catch { return []; } } };
const meta = () => { try { return JSON.parse(ls.get(META)) || {}; } catch { return {}; } };
const setMeta = m => ls.set(META, JSON.stringify(m));
/** This device's progress as one object. */
const snapshot = () => { const d = {}; ls.keys().filter(isProgress).sort().forEach(k => { d[k] = ls.get(k); }); return d; };
/** Replace this device's progress with a save (null: start afresh). */
const apply = data => { ls.keys().filter(isProgress).forEach(k => ls.set(k, null)); Object.entries(data || {}).forEach(([k, v]) => { if (isProgress(k) && typeof v === 'string') ls.set(k, v); }); };

let user = null, lastSent = '', timer = 0;
/** True when progress follows a signed-in account (the device-keyed position lookups step aside). */
export const isAccount = () => !!user;

const rest = async (path, { method = 'GET', body, keepalive = false, prefer } = {}) => {
  const s = await currentSession(); if (!s) throw new Error('signed out');
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, keepalive, body: body ? JSON.stringify(body) : undefined,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) } });
  if (!r.ok) throw new Error(`progress ${r.status}`); return r.status === 204 ? null : r.json();
};
const pull = async () => { const rows = await rest(`player_progress?select=data,updated_at&user_id=eq.${user.id}`); return rows[0] || null; };
async function push({ keepalive = false } = {}) {
  if (!user) return; const data = snapshot(), json = JSON.stringify(data); if (json === lastSent) return;
  const m = meta(); if (m.owner === user.id) setMeta({ ...m, localT: Date.now() });
  try { const rows = await rest('player_progress?on_conflict=user_id', { method: 'POST', keepalive, body: { user_id: user.id, data }, prefer: 'resolution=merge-duplicates,return=representation' });
    lastSent = json; setMeta({ owner: user.id, syncedAt: rows?.[0]?.updated_at || new Date().toISOString(), localT: Date.now() }); }
  catch { /* offline: tried again on the next tick */ }
}

/** At start-up, before the game reads its saves: bring this device up to date with the account. */
export async function syncOnStart() {
  const s = await currentSession(); user = s?.user?.id ? s.user : null; if (!user) return;
  const m = meta(); let remote = null;
  try { remote = await pull(); } catch { if (m.owner && m.owner !== user.id) apply(null); setMeta({ ...m, owner: user.id }); return; } // offline: play on (but never on someone else's save)
  const remoteT = remote ? Date.parse(remote.updated_at) || 0 : 0;
  if (m.owner !== user.id) {
    if (remote) apply(remote.data);           // this account's own save
    else if (m.owner) apply(null);            // a fresh account after someone else's: start afresh
    // (else: guest progress on this device carries into the new account)
  } else if (remote && remoteT > (Date.parse(m.syncedAt) || 0) && remoteT > (m.localT || 0)) apply(remote.data); // saved on another device since
  { let st = {}; try { st = JSON.parse(ls.get('sailo:settings')) || {}; } catch { /* unreadable: start a new one */ } // a fresh start still knows the captain's name
    if (!st.name) { st.name = captainName(user); ls.set('sailo:settings', JSON.stringify(st)); } }
  setMeta({ owner: user.id, syncedAt: remote?.updated_at || m.syncedAt, localT: m.localT || 0 });
  if (remote && JSON.stringify(snapshot()) === JSON.stringify(remote.data)) lastSent = JSON.stringify(remote.data);
  await push();
}

/** While playing: save changes every few seconds and when the page is hidden or closed. */
export function startAutoSave() {
  if (!user || timer) return;
  timer = setInterval(() => push(), 8000);
  addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') push({ keepalive: true }); });
  addEventListener('pagehide', () => push({ keepalive: true }));
}

/** Signing out: save one last time, then clear this device so the next captain starts clean. */
export async function beforeSignOut() {
  if (!user) return; const m = meta(); await push();
  if (JSON.stringify(snapshot()) === lastSent) { apply(null); ls.set(META, null); } else setMeta({ ...m, owner: user.id }); // unsaved (offline): keep it here for them
  user = null; clearInterval(timer); timer = 0;
}
