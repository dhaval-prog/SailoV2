// Throw's data: a port of MySpace's ThrowContext (and the slice of FriendsContext it needs) to a small store that
// screens subscribe to. It talks to the same Supabase project as the rest of Sailo, with the captain's own Sailo
// session (auth.js), so there's one sign-in for the game and for Throw.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_KEY } from '../supabase.js';
import { currentSession } from '../auth.js';
import { computeNextTrigger } from './alerts-schedule.js';

let client = null;
/** The Supabase client, signed in as the current Sailo captain (tokens come from auth.js, refreshed there). */
export function sb() {
  if (!client) client = createClient(SUPABASE_URL, SUPABASE_KEY, { accessToken: async () => (await currentSession())?.access_token ?? null });
  return client;
}

const warn = (what, error) => { if (error) console.warn(`[Throw] ${what} failed:`, error.message); };
const friendly = m => /load failed|network request failed|failed to fetch/i.test(m) ? "Couldn't reach the server — check your connection and try again." : m;
const wait = ms => new Promise(r => setTimeout(r, ms));
/** UTC calendar date (YYYY-MM-DD), matching the server's current_date: a streak only counts whole days apart. */
const utcDate = off => { const d = new Date(); d.setUTCDate(d.getUTCDate() + off); return d.toISOString().slice(0, 10); };
/** web blobs have no extension: take it from the MIME type first */
export function extFromBlob(name, mime) {
  const m = mime.split('/')[1]?.split('+')[0];
  if (m && /^[a-z0-9]{2,5}$/i.test(m)) return m.toLowerCase() === 'jpeg' ? 'jpg' : m.toLowerCase();
  const x = (name || '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i); return x ? x[1].toLowerCase() : 'jpg';
}
const CACHE = id => `sailo:throw:${id}`;

function toLetter(row, myId, nameFor, avatarFor) {
  const direction = row.sender_id === myId ? 'sent' : 'received', counterpartId = direction === 'sent' ? row.recipient_id : row.sender_id;
  const photoUrls = row.photo_urls ?? (row.photo_url ? [row.photo_url] : []);
  return {
    id: row.id, senderId: row.sender_id, recipientId: row.recipient_id, counterpartId, counterpartName: nameFor(counterpartId), counterpartAvatarUrl: avatarFor(counterpartId),
    direction, messageText: row.message_text, strokes: row.strokes, penColor: row.pen_color, photoUrls,
    photoTrims: photoUrls.map((_, i) => { const s = row.photo_trim_start_ms?.[i], e = row.photo_trim_end_ms?.[i]; return s != null && e != null ? { startMs: s, endMs: e } : null; }),
    senderCity: row.sender_city, senderCountry: row.sender_country, senderLatitude: row.sender_latitude, senderLongitude: row.sender_longitude,
    recipientCity: row.recipient_city, recipientCountry: row.recipient_country, recipientLatitude: row.recipient_latitude, recipientLongitude: row.recipient_longitude,
    distanceMiles: row.distance_miles, status: row.status, createdAt: row.created_at, readAt: row.read_at, repliedToThrowId: row.replied_to_throw_id, hugCount: row.hug_count ?? 0,
    alertSchedule: row.alert_recurrence_type != null ? { recurrence: row.alert_recurrence_type, hour: row.alert_hour ?? 0, minute: row.alert_minute ?? 0, daysOfWeek: row.alert_days_of_week ?? [], dayOfMonth: row.alert_day_of_month ?? 1 } : null,
    alertConfirmed: row.alert_confirmed,
  };
}

/**
 * The Throw store. `state` holds what the screens draw; `on(fn)` calls fn after every change (returns an unsubscribe).
 * Loads from a local cache first (instant reopen), then the server; live via realtime, plus a 15 s poll.
 */
export async function createThrowStore() {
  const session = await currentSession(); if (!session) throw new Error('signed_out');
  const myId = session.user?.id || JSON.parse(atob(session.access_token.split('.')[1])).sub;
  const db = sb(), subs = new Set();
  const S = {
    myId, loading: true, myLocation: null, locationVisibility: 'all', myName: 'Myself', myAvatarUrl: null,
    connections: [], profiles: {}, friendLocations: {}, rows: [], streaks: {}, latestIncoming: null,
    // derived (rebuilt by derive())
    friends: [], letters: [], inbox: [], unreadCount: 0,
  };
  const emit = () => { derive(); subs.forEach(fn => { try { fn(S); } catch (e) { console.error(e); } }); };
  const nameFor = id => S.profiles[id]?.name ?? 'Someone', avatarFor = id => S.profiles[id]?.avatarUrl ?? null;
  function derive() {
    S.friends = S.connections.filter(c => c.status === 'accepted').map(c => { const id = c.requester_id === myId ? c.addressee_id : c.requester_id;
      return { connectionId: c.id, userId: id, name: nameFor(id), username: S.profiles[id]?.username ?? null, avatarUrl: avatarFor(id), avatarColor: S.profiles[id]?.avatarColor ?? null, location: S.friendLocations[id] ?? null }; });
    S.letters = S.rows.map(r => toLetter(r, myId, nameFor, avatarFor));
    S.inbox = S.letters.filter(l => l.direction === 'received');
    S.unreadCount = S.inbox.filter(l => l.status === 'thrown').length;
  }
  try { const c = JSON.parse(localStorage.getItem(CACHE(myId))); if (c) { Object.assign(S, c, { loading: false }); } } catch { /* no cache */ }

  async function loadFriends() {
    const { data, error } = await db.from('friend_connections').select('*').or(`requester_id.eq.${myId},addressee_id.eq.${myId}`).order('created_at', { ascending: false });
    warn('load connections', error); if (!data) return;
    S.connections = data;
    const ids = [...new Set(data.map(c => c.requester_id === myId ? c.addressee_id : c.requester_id))];
    if (ids.length) { const { data: ps, error: e2 } = await db.from('profiles').select('id, full_name, display_name, username, avatar_url, avatar_color').in('id', ids); warn('load profiles', e2);
      (ps || []).forEach(p => { S.profiles[p.id] = { name: (p.full_name || p.display_name || p.username || '').trim() || 'Someone', username: p.username, avatarUrl: p.avatar_url, avatarColor: p.avatar_color }; }); } // (MySpace's name, else the Sailo captain's)
  }

  async function refresh() {
    const [meRes, throwsRes, streakRes, profileRes] = await Promise.all([
      db.from('throw_profiles').select('city,country,latitude,longitude,updated_at,location_visibility').eq('user_id', myId).maybeSingle(),
      db.from('throws').select('*').or(`sender_id.eq.${myId},recipient_id.eq.${myId}`).order('created_at', { ascending: false }),
      db.from('throw_streaks').select('counterpart_id,current_streak,last_throw_date').eq('user_id', myId),
      db.from('profiles').select('full_name,display_name,avatar_url').eq('id', myId).maybeSingle(),
      loadFriends(),
    ]);
    warn('load my location', meRes.error); warn('load throws', throwsRes.error); warn('load streaks', streakRes.error); warn('load my profile', profileRes.error);
    if (meRes.data) { const d = meRes.data; S.myLocation = { city: d.city, country: d.country, latitude: d.latitude, longitude: d.longitude, updatedAt: d.updated_at ?? undefined }; S.locationVisibility = d.location_visibility ?? 'all'; }
    if (profileRes.data) { const p = profileRes.data; S.myName = (p.full_name || p.display_name || '').trim() || 'Myself'; S.myAvatarUrl = p.avatar_url; }
    if (!streakRes.error) { const m = {}; (streakRes.data || []).forEach(r => { m[r.counterpart_id] = r.last_throw_date === utcDate(0) || r.last_throw_date === utcDate(-1) ? r.current_streak : 0; }); S.streaks = m; }
    // a letter deleted on my side stays in the shared row until the other side deletes it too
    if (!throwsRes.error) S.rows = (throwsRes.data || []).filter(r => !(r.sender_id === myId && r.deleted_by_sender) && !(r.recipient_id === myId && r.deleted_by_recipient));
    const fids = S.connections.filter(c => c.status === 'accepted').map(c => c.requester_id === myId ? c.addressee_id : c.requester_id);
    if (fids.length) { const { data: locs, error } = await db.from('throw_profiles').select('user_id,city,country,latitude,longitude,updated_at').in('user_id', fids); warn('load friend locations', error);
      if (!error) { const m = {}; (locs || []).forEach(r => { m[r.user_id] = { city: r.city, country: r.country, latitude: r.latitude, longitude: r.longitude, updatedAt: r.updated_at ?? undefined }; }); S.friendLocations = m; } }
    else S.friendLocations = {};
    S.loading = false;
    try { const { myLocation, locationVisibility, myName, myAvatarUrl, connections, profiles, friendLocations, rows, streaks } = S;
      localStorage.setItem(CACHE(myId), JSON.stringify({ myLocation, locationVisibility, myName, myAvatarUrl, connections, profiles, friendLocations, rows, streaks })); } catch { /* storage full or blocked */ }
    emit();
  }

  let busy = null; const reload = () => (busy ||= refresh().finally(() => { busy = null; }));
  const channel = db.channel(`throws-${myId}-sailo`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'throws', filter: `recipient_id=eq.${myId}` }, p => {
      if (p.new.sender_id !== myId) S.latestIncoming = toLetter(p.new, myId, nameFor, avatarFor); // (not a note to self: that has its own banner)
      reload(); })
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'throws', filter: `recipient_id=eq.${myId}` }, reload)
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'throws', filter: `recipient_id=eq.${myId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'throws', filter: `sender_id=eq.${myId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_connections', filter: `requester_id=eq.${myId}` }, reload)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_connections', filter: `addressee_id=eq.${myId}` }, reload)
    .subscribe();
  const poll = setInterval(reload, 15000);

  const api = {
    state: S, myId, refresh: reload,
    on(fn) { subs.add(fn); return () => subs.delete(fn); },
    dispose() { clearInterval(poll); db.removeChannel(channel); subs.clear(); },
    unreadCountFor: id => S.inbox.filter(l => l.counterpartId === id && l.status === 'thrown').length,
    streakFor: id => S.streaks[id] ?? 0,
    clearLatestIncoming() { S.latestIncoming = null; emit(); },
    async setMyLocation(loc) {
      const attempt = () => db.from('throw_profiles').upsert({ user_id: myId, city: loc.city, country: loc.country, latitude: loc.latitude, longitude: loc.longitude, updated_at: new Date().toISOString() });
      let { error } = await attempt(); // (often the first call of a session: one retry rides out a blip)
      if (error && /load failed|network request failed|failed to fetch/i.test(error.message)) { await wait(1200); ({ error } = await attempt()); }
      if (error) return { error: friendly(error.message) };
      S.myLocation = loc; emit(); return { error: null };
    },
    setLocationVisibility(v) { S.locationVisibility = v; emit(); db.from('throw_profiles').update({ location_visibility: v }).eq('user_id', myId).then(({ error }) => warn('save location visibility', error)); },
    async sendThrow(d) {
      const hasTrim = d.photoTrims?.some(t => t != null) ?? false, a = d.alertSchedule ?? null;
      const { data, error } = await db.rpc('send_throw', {
        p_recipient_id: d.recipientId, p_message_text: d.messageText, p_strokes: d.strokes ?? null, p_pen_color: d.penColor, p_replied_to_throw_id: d.repliedToThrowId ?? null,
        p_photo_urls: d.photoUrls?.length ? d.photoUrls : null,
        p_photo_trim_start_ms: hasTrim ? d.photoUrls.map((_, i) => d.photoTrims?.[i]?.startMs ?? null) : null,
        p_photo_trim_end_ms: hasTrim ? d.photoUrls.map((_, i) => d.photoTrims?.[i]?.endMs ?? null) : null,
        p_alert_recurrence_type: a?.recurrence ?? null, p_alert_days_of_week: a?.recurrence === 'weekly' ? a.daysOfWeek : null, p_alert_day_of_month: a?.recurrence === 'monthly' ? a.dayOfMonth : null,
        p_alert_hour: a?.hour ?? null, p_alert_minute: a?.minute ?? null,
      });
      if (error) return { error: error.message };
      // also shows in MySpace's Chats as an airmail letter card (best effort: the throw itself already worked)
      const conn = S.friends.find(f => f.userId === d.recipientId)?.connectionId;
      if (conn) { const { error: e2 } = await db.from('direct_messages').insert({ connection_id: conn, sender_id: myId, kind: 'letter', text: d.messageText?.trim().slice(0, 60) || 'A letter', attachment_url: data.sender_city || null, throw_id: data.id }); warn('post throw chat message', e2); }
      await reload(); return { error: null, letter: toLetter(data, myId, nameFor, avatarFor) };
    },
    async uploadMedia(blob, bucket = 'throw-media', name = '') {
      try { const type = blob.type || 'image/jpeg', path = `${myId}/${Date.now()}.${extFromBlob(name, type)}`;
        const { error } = await db.storage.from(bucket).upload(path, blob, { contentType: type }); if (error) return { url: null, error: error.message };
        return { url: db.storage.from(bucket).getPublicUrl(path).data.publicUrl, error: null }; }
      catch (e) { return { url: null, error: e?.message || 'Could not upload that.' }; }
    },
    async markRead(id) { const { error } = await db.rpc('mark_throw_read', { p_throw_id: id }); warn('mark_throw_read', error); await reload(); },
    async deleteThrow(id) { const { error } = await db.rpc('delete_throw', { p_throw_id: id }); if (error) return { error: error.message }; await reload(); return { error: null }; },
    async hugThrow(id, count) { const { data, error } = await db.rpc('hug_throw', { p_throw_id: id, p_count: count }); warn('hug_throw', error); return error ? null : data; },
    async confirmThrowAlert(id, schedule) { const { error } = await db.rpc('confirm_throw_alert', { p_throw_id: id, p_next_trigger_at: computeNextTrigger(schedule).toISOString() }); if (error) return { error: error.message }; await reload(); return { error: null }; },
  };
  derive(); reload();
  return api;
}
