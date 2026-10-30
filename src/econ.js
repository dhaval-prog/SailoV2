// The server-checked economy (migration …_sailov2_economy.sql): for a signed-in captain, coins, each boat's fuel, fish
// hold and NOS, and wooden planks live in the database and change only through its functions, which check every
// purchase, sale, refuel and catch. Each call returns the whole economy, which the game then shows.
// Off-line or signed out there's no server: station.js keeps the old on-device economy for that.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase.js';
import { currentSession } from './auth.js';

const NICE = {
  not_enough_coins: 'Not enough coins.', not_docked: 'Moor at the pier first.', hold_full: 'The hold is full.', tank_full: 'The tank is already full.',
  too_soon: 'One moment…', nothing_to_sell: 'The crate is empty.', not_in_hold: 'Those fish aren’t in the hold any more.',
  no_nos: 'This boat has no NOS.', already_owned: 'This boat already has NOS.', nos_full: 'The NOS tank is full.', nos_cooling: 'NOS is cooling down.', nos_empty: 'NOS is empty: refill it at the Boathouse.',
  signed_out: 'Sign in to keep your coins and catch.',
  no_cannon: 'This boat has no cannon.', no_balls: 'Out of cannonballs: buy more at the Boathouse.', reloading: 'Reloading…', rack_full: 'The rack is full.',
  safe_harbour: 'Paradise Station is a safe harbour: no cannon fire here.', out_of_range: 'Out of range.', where_are_you: 'Hold on: finding your position…',
  wrecked: 'Your boat is wrecked.', hull_fine: 'The hull is sound.', missed: 'Missed!', already_wrecked: 'Already sunk.', not_yourself: 'Not your own boat!', too_late: 'Missed!',
  wreck_gone: 'The wreck has gone down.', own_wreck: 'That’s your own wreck: someone else gets to salvage it.', too_far: 'Come closer to reach it.', nothing_left: 'Nothing left to take.',
  plank_gone: 'The plank drifted off.', no_such_plank: 'The plank drifted off.', plank_taken: 'Someone got to that plank first.', not_enough_planks: 'You don’t have that many planks.',
};
export class EconError extends Error { constructor(code) { super(NICE[code] || 'The harbour didn’t answer. Try again?'); this.code = code; } }

/** Call one of the economy functions. Resolves with the economy (and any extras: paid, boost, …). */
export async function econ(fn, args = {}) {
  const s = await currentSession(); if (!s) throw new EconError('signed_out');
  let r; try { r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args),
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } }); }
  catch { throw new EconError('offline'); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new EconError(String(j.message || r.status).split(/\s/)[0]); }
  const st = await r.json().catch(() => null);
  if (!st || typeof st.coins !== 'number' || typeof st.boats !== 'object') throw new EconError('bad_reply'); // (anything else isn't an economy)
  return st;
}
/** Signed in (so the server keeps the economy)? */
export const serverEconomy = async () => !!(await currentSession());
/** As the page closes: fire one call without waiting (fuel burnt on the way, for instance). */
export function econBeacon(fn, args) { let s; try { s = JSON.parse(localStorage.getItem('sailo:session')); } catch { return; } if (!s?.access_token) return;
  fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', keepalive: true, body: JSON.stringify(args),
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } }).catch(() => {}); }
/** Call any of the server's functions (combat.js) and return its answer as it is. */
export async function rpc(fn, args = {}) {
  const s = await currentSession(); if (!s) throw new EconError('signed_out');
  let r; try { r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args),
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' } }); }
  catch { throw new EconError('offline'); }
  if (!r.ok) { const j = await r.json().catch(() => ({})); throw new EconError(String(j.message || r.status).split(/\s/)[0]); }
  return r.json().catch(() => null);
}
