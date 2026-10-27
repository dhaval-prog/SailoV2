// Remembers where the tug was so the next visit starts there.
// Each browser gets a random device id (kept in localStorage); the position is
// saved to Supabase through two RPC functions keyed by that id, and also kept
// locally so a reload works offline. Whichever copy is newer wins.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dfytxscebupuqwehsojc.supabase.co';
// publishable key: safe to ship in the client; the table itself is locked and only reachable via the RPCs
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZsAQV4mbCnCOiSwwZFRb4A_PeUgwGdO';
const DEVICE_KEY = 'sailo:device', LOCAL_KEY = 'sailo:pos';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

let device = null;
const deviceId = () => {
  if (device) return device;
  try { device = localStorage.getItem(DEVICE_KEY); } catch { /* storage blocked */ }
  if (!device) { device = uuid(); try { localStorage.setItem(DEVICE_KEY, device); } catch { /* storage blocked */ } }
  return device;
};

const rpc = (name, body, { keepalive = false, timeout = 4000 } = {}) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', keepalive, signal: ctl.signal,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.status === 204 ? null : r.json(); })
    .finally(() => clearTimeout(t));
};

const valid = p => p && Number.isFinite(p.x) && Number.isFinite(p.z) && Number.isFinite(p.heading);

/** The locally saved position, available instantly (no network). */
export const localPosition = () => { try { const p = JSON.parse(localStorage.getItem(LOCAL_KEY)); return valid(p) ? p : null; } catch { return null; } };

/** Last saved position ({ x, z, heading, t }) or null for a first visit. */
export async function loadPosition() {
  const local = localPosition();
  let remote = null;
  try {
    const rows = await rpc('get_boat_position', { p_device: deviceId() }, { timeout: 2500 });
    const r = rows && rows[0];
    if (r && valid(r)) remote = { x: r.x, z: r.z, heading: r.heading, t: Date.parse(r.updated_at) || 0 };
  } catch { /* offline or blocked: fall back to the local copy */ }
  if (local && remote) return (local.t || 0) > remote.t ? local : remote;
  return remote || local;
}

/** Save the position locally and to Supabase. Use keepalive when the page is closing. */
export function savePosition({ x, z, heading }, { keepalive = false } = {}) {
  const p = { x, z, heading, t: Date.now() };
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
  return rpc('save_boat_position', { p_device: deviceId(), p_x: x, p_z: z, p_heading: heading }, { keepalive }).catch(() => {});
}
