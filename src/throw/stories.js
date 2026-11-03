// Statuses (24 h stories): a port of MySpace's ThrowStoriesContext. Yours and your friends' from the last day, live
// (realtime + a 30 s poll); post (upload to throw-stories, then a row), mark viewed, delete your own.
import { sb, extFromBlob } from './data.js';

const warn = (w, e) => { if (e) console.warn(`[ThrowStories] ${w} failed:`, e.message); };
const toStory = r => ({ id: r.id, userId: r.user_id, mediaUrl: r.media_url, mediaType: r.media_type, trimStartMs: r.trim_start_ms, trimEndMs: r.trim_end_ms, createdAt: r.created_at });

export function createStoriesStore(store) {
  const db = sb(), myId = store.myId, subs = new Set(), CACHE = `sailo:throw-stories:${myId}`;
  let rows = []; try { rows = JSON.parse(localStorage.getItem(CACHE)) || []; } catch { /* none */ }
  const api = { byUser: {}, countFor: id => api.byUser[id]?.length ?? 0, on(fn) { subs.add(fn); return () => subs.delete(fn); } };
  const derive = () => { const m = {}; rows.forEach(r => (m[r.user_id] ??= []).push(toStory(r))); api.byUser = m; subs.forEach(fn => fn()); };
  async function refresh() {
    const ids = [myId, ...store.state.friends.map(f => f.userId)];
    const { data, error } = await db.from('throw_stories').select('*').in('user_id', ids).gt('created_at', new Date(Date.now() - 864e5).toISOString()).order('created_at', { ascending: true });
    warn('load stories', error); if (error) return;
    rows = data || []; try { localStorage.setItem(CACHE, JSON.stringify(rows)); } catch { /* full */ } derive();
  }
  const channel = db.channel(`throw-stories-${myId}-sailo`).on('postgres_changes', { event: '*', schema: 'public', table: 'throw_stories' }, refresh).subscribe();
  const poll = setInterval(refresh, 30000);
  const offStore = store.on(() => { const n = store.state.friends.length; if (n !== api._n) { api._n = n; refresh(); } });
  Object.assign(api, {
    refresh,
    async post(blob, mediaType, trim) {
      try { const type = blob.type || (mediaType === 'video' ? 'video/mp4' : 'image/jpeg'), path = `${myId}/${Date.now()}.${extFromBlob('', type)}`;
        const { error: up } = await db.storage.from('throw-stories').upload(path, blob, { contentType: type }); if (up) return { error: up.message };
        const url = db.storage.from('throw-stories').getPublicUrl(path).data.publicUrl;
        const { error } = await db.from('throw_stories').insert({ user_id: myId, media_url: url, media_type: mediaType, trim_start_ms: trim?.startMs ?? null, trim_end_ms: trim?.endMs ?? null });
        if (error) return { error: error.message }; await refresh(); return { error: null }; }
      catch (e) { return { error: e?.message || 'Could not post that story.' }; }
    },
    async markViewed(id) { const { error } = await db.from('throw_story_views').upsert({ story_id: id, viewer_id: myId }, { onConflict: 'story_id,viewer_id' }); warn('mark viewed', error); },
    async remove(id) { const { error } = await db.from('throw_stories').delete().eq('id', id); if (error) return { error: error.message }; await refresh(); return { error: null }; },
    dispose() { clearInterval(poll); db.removeChannel(channel); offStore(); subs.clear(); },
  });
  derive(); refresh();
  return api;
}
