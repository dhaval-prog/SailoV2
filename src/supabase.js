// Supabase access shared by the save system and start-up: the device id and RPC calls.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://dfytxscebupuqwehsojc.supabase.co';
// publishable key: safe to ship in the client; the table itself is locked and only reachable via the RPCs
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_ZsAQV4mbCnCOiSwwZFRb4A_PeUgwGdO';
const DEVICE_KEY = 'sailo:device';

const uuid = () => (crypto.randomUUID ? crypto.randomUUID()
  : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, c => (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16)));

let device = null;
export const deviceId = () => {
  if (device) return device;
  try { device = localStorage.getItem(DEVICE_KEY); } catch { /* storage blocked */ }
  if (!device) { device = uuid(); try { localStorage.setItem(DEVICE_KEY, device); } catch { /* storage blocked */ } }
  return device;
};

export const rpc = (name, body, { keepalive = false, timeout = 4000 } = {}) => {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), timeout);
  return fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', keepalive, signal: ctl.signal,
    headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => { if (!r.ok) throw new Error(`${name}: ${r.status}`); return r.status === 204 ? null : r.json(); })
    .finally(() => clearTimeout(t));
};

