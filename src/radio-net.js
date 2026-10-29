// The radio's saved side (migration ..._sailov2_radio_phase2.sql), over Supabase REST like cloud.js:
// SOS requests, saved messages (voice clips, texts, invites to sail together), blocks and reports.
// Limits (messages an hour, one SOS every 10 minutes, reports a day) are enforced by the database.
import { SUPABASE_URL, SUPABASE_KEY } from './supabase.js';
import { currentSession } from './auth.js';

export class RadioError extends Error { constructor(msg, code) { super(msg); this.code = code; } }
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const s = await currentSession(); if (!s) throw new RadioError('Sign in to use the radio.', 'signed_out');
  let r; try { r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { method, body: body ? JSON.stringify(body) : undefined,
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) } }); }
  catch { throw new RadioError('No signal from the harbour. Check your connection?', 'offline'); }
  if (!r.ok) { const j = await r.json().catch(() => ({})), m = String(j.message || '');
    if (m.startsWith('rate_limited')) throw new RadioError(m.includes('SOS every') ? 'One SOS every 10 minutes. Hang on, help may already be coming.' : m.includes('SOS a day') ? 'That’s the most SOS calls for today.' : 'That’s a lot of messages. Give it a little while.', 'rate_limited');
    if (m.startsWith('blocked') || r.status === 403 || j.code === '42501') throw new RadioError('That captain isn’t taking messages from you.', 'blocked');
    throw new RadioError('The harbour didn’t answer. Try again?', String(r.status)); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}
const me = async () => (await currentSession())?.user?.id;

// ---------- SOS ----------
export const sendSOS = sos => rest('radio_sos?select=id,created_at,expires_at', { method: 'POST', body: sos, prefer: 'return=representation' }).then(r => r[0]);
export const resolveSOS = id => rest(`radio_sos?id=eq.${id}`, { method: 'PATCH', body: { resolved_at: new Date().toISOString() } });
/** Active SOS calls on a chart (newest first, without their voice clips). */
export const activeSOS = chart => rest(`radio_sos?select=id,sender,sender_name,chart,x,z,place,dur,created_at,expires_at,resolved_at&chart=eq.${encodeURIComponent(chart)}&resolved_at=is.null&expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=20`);
export const sosClip = id => rest(`radio_sos?select=clip,mime&id=eq.${id}`).then(r => r[0] || null);

// ---------- messages ----------
export const sendMessage = m => rest('radio_messages?select=id,created_at', { method: 'POST', body: m, prefer: 'return=representation' }).then(r => r[0]);
/** My messages: received (newest first, without clips). */
export const inbox = async () => { const id = await me(); if (!id) return [];
  return rest(`radio_messages?select=id,sender,sender_name,kind,body,dur,chart,x,z,created_at,heard_at&recipient=eq.${id}&expires_at=gt.${new Date().toISOString()}&order=created_at.desc&limit=50`); };
export const messageClip = id => rest(`radio_messages?select=clip,mime&id=eq.${id}`).then(r => r[0] || null);
export const markHeard = id => rest(`radio_messages?id=eq.${id}`, { method: 'PATCH', body: { heard_at: new Date().toISOString() } });
export const deleteMessage = id => rest(`radio_messages?id=eq.${id}`, { method: 'DELETE' });

// ---------- blocks and reports ----------
export const blocks = () => rest('radio_blocks?select=blocked').then(r => r.map(b => b.blocked));
export const block = id => rest('radio_blocks', { method: 'POST', body: { blocked: id }, prefer: 'resolution=ignore-duplicates,return=minimal' });
export const unblock = id => rest(`radio_blocks?blocked=eq.${id}`, { method: 'DELETE' });
export const report = r => rest('radio_reports', { method: 'POST', body: r, prefer: 'return=minimal' });
