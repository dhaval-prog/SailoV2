// Captain accounts: Supabase Auth over its REST API (no client library, like supabase.js).
// Email + password sign-up / sign-in, password reset and Google sign-in (a redirect).
// The session (access + refresh token) is kept on this device and refreshed when it expires.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase.js';

const KEY = 'sailo:session', GUEST = 'sailo:guest'; // (GUEST: the old 'sail as a guest' flag, cleared when seen)
const store = { get: k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage blocked */ } } };

/** A sign-in problem with a captain-friendly message. */
export class AuthError extends Error { constructor(msg, code) { super(msg); this.code = code; } }

async function call(path, { method = 'POST', body, token } = {}) {
  let r; try { r = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, { method, headers: { apikey: SUPABASE_KEY, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new AuthError('No signal from the harbour. Check your connection?', 'offline'); }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AuthError(friendly(j, r.status), j.error_code || j.code || String(r.status));
  return j;
}
const friendly = (j, status) => { const c = j.error_code || j.code || '', m = (j.msg || j.message || j.error_description || '').toLowerCase();
  if (c === 'invalid_credentials' || m.includes('invalid login')) return 'That email and password don’t match.';
  if (c === 'email_not_confirmed' || m.includes('not confirmed')) return 'Confirm your email first: check your inbox for the link.';
  if (c === 'user_already_exists' || m.includes('already registered')) return 'That email already has a tug. Sign in instead?';
  if (c === 'weak_password' || m.includes('password should')) return 'Fuel up: that password is too weak.';
  if (c === 'over_email_send_rate_limit' || c === 'over_request_rate_limit' || status === 429) return 'Too many tries. Give it a minute and try again.';
  if (c === 'validation_failed' || m.includes('invalid format') || m.includes('unable to validate email')) return 'That email won’t float. Check it?';
  if (c === 'signup_disabled') return 'New crews aren’t being signed up right now.';
  return 'The harbour didn’t answer. Try again?'; };

const keep = j => { const s = { access_token: j.access_token, refresh_token: j.refresh_token, expires_at: j.expires_at || Math.floor(Date.now() / 1000) + (j.expires_in || 3600), user: j.user };
  store.set(KEY, s); store.set(GUEST, null); return s; };

/** The captain's name: what they chose at sign-up, their Google name, or their email's first part. */
export const captainName = user => { const md = user?.user_metadata || {}; const n = md.captain || md.full_name || md.name || (user?.email || '').split('@')[0].replace(/[._-]+/g, ' ');
  return (n || 'Captain').trim().replace(/^./, c => c.toUpperCase()).slice(0, 18); };

/** The signed-in captain (refreshing the token if it has run out), or null. */
export async function currentSession() {
  const s = store.get(KEY); if (!s?.refresh_token) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s;
  try { return keep(await call('token?grant_type=refresh_token', { body: { refresh_token: s.refresh_token } })); }
  catch (e) { if (e.code === 'offline') return s; store.set(KEY, null); return null; } // offline: keep sailing on the old session
}

export const signIn = async (email, password) => keep(await call('token?grant_type=password', { body: { email, password } }));
/** Returns { session } when signed straight in, or { confirm: true } when the email must be confirmed first. */
export async function signUp(email, password, captain) {
  const j = await call(`signup?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { body: { email, password, data: { captain } } });
  if (j.access_token) return { session: keep(j) };
  if (j.identities && !j.identities.length) throw new AuthError('That email already has a tug. Sign in instead?', 'user_already_exists'); // (returned as a fake user when confirmation is on)
  return { confirm: true };
}
/** Send the sign-up confirmation email again. */
export const resendConfirm = email => call(`resend?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { body: { type: 'signup', email } });
export const sendReset = email => call(`recover?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { body: { email } });
export async function setPassword(session, password) { await call('user', { method: 'PUT', token: session.access_token, body: { password } }); }
/** Google (and later Apple) sign-in: leave for the provider; we come back with the tokens in the URL. */
export function oauth(provider) { location.href = `${SUPABASE_URL}/auth/v1/authorize?provider=${provider}&redirect_to=${encodeURIComponent(location.origin + location.pathname)}`; }
export async function signOut() { const s = store.get(KEY); store.set(KEY, null); store.set(GUEST, null); if (s) call('logout', { token: s.access_token }).catch(() => {}); }

/** Coming back from Google, an email confirmation or a password-reset link: tokens arrive in the URL hash.
 *  Returns { session, recovery } (recovery: the captain followed a reset link and needs a new password), or { error } or null. */
export async function fromRedirect() {
  const h = new URLSearchParams(location.hash.slice(1)), q = new URLSearchParams(location.search);
  const clean = () => history.replaceState(null, '', location.pathname);
  const err = h.get('error_description') || q.get('error_description');
  if (err) { clean(); return { error: err.includes('expired') ? 'That link has expired. Ask for a new one?' : 'That sign-in didn’t work. Try again?' }; }
  if (!h.get('access_token')) return null;
  clean();
  const token = h.get('access_token'); let user = null; try { user = await call('user', { method: 'GET', token }); } catch { /* keep the tokens; the user loads later */ }
  const session = keep({ access_token: token, refresh_token: h.get('refresh_token'), expires_at: +h.get('expires_at') || 0, expires_in: +h.get('expires_in') || 3600, user });
  return { session, recovery: h.get('type') === 'recovery' };
}
