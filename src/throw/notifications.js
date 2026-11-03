// Notifications (ports of MySpace's NotificationsContext + NotificationsPanel): your latest 100, live; the panel filters
// Statuses / Requests / Chats / Throws, groups Today / Earlier, accepts or declines friend requests in place, and marks
// read (one by tap, or all). Tapping a row opens what it's about: a letter, or a friend's status on the carousel.
import { h, icon, avatar } from './ui.js';
import { sb } from './data.js';

const warn = (w, e) => { if (e) console.warn(`[Notifications] ${w} failed:`, e.message); };
export function createNotifications(store) {
  const db = sb(), myId = store.myId, subs = new Set();
  const api = { list: [], unreadCount: 0, on(fn) { subs.add(fn); return () => subs.delete(fn); } };
  const emit = () => { api.unreadCount = api.list.filter(n => !n.read).length; subs.forEach(fn => fn()); };
  async function refresh() {
    const { data, error } = await db.from('notifications').select('id,category,title,body,created_at,read,entity_type,entity_id,related_user_id').eq('user_id', myId).order('created_at', { ascending: false }).limit(100);
    warn('load', error); if (error) return;
    api.list = (data || []).map(n => ({ id: n.id, category: n.category, title: n.title, body: n.body || '', createdAt: n.created_at, read: n.read, entityType: n.entity_type, entityId: n.entity_id, relatedUserId: n.related_user_id }));
    emit();
  }
  const channel = db.channel(`notifications-${myId}-sailo`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${myId}` }, refresh).subscribe();
  Object.assign(api, {
    refresh,
    acknowledge(id) { const n = api.list.find(x => x.id === id); if (!n || n.read) return; n.read = true; emit(); db.from('notifications').update({ read: true }).eq('id', id).then(({ error }) => warn('mark read', error)); },
    clearAll() { api.list.forEach(n => { n.read = true; }); emit(); db.from('notifications').update({ read: true }).eq('user_id', myId).eq('read', false).then(({ error }) => warn('mark all read', error)); },
    dispose() { db.removeChannel(channel); subs.clear(); },
  });
  refresh();
  return api;
}

const FILTERS = [['status_posted', 'Statuses'], ['friend_requests', 'Requests'], ['chat_message', 'Chats'], ['throw', 'Throws']];
const ICONS = { plus: 'M12 5v14M5 12h14', plane: 'M22 2L11 13 M22 2L15 22L11 13L2 9L22 2Z', chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  cloud: 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z', photo: 'M19 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V5a2 2 0 00-2-2z M8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3z M21 15l-5-5L5 21' };
const BADGE = { friend_requests: ['#3DD16B', ICONS.plus], throw: ['#111111', ICONS.plane], chat_message: ['#C9A227', ICONS.chat], status_posted: ['#3D7BFF', ICONS.cloud] };
const timeLabel = iso => { const then = new Date(iso), now = new Date(), mins = Math.max(0, Math.round((now - then) / 60000)); if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60); if (hrs < 24) return `${hrs}h`; const y = new Date(now); y.setDate(now.getDate() - 1); return then.toDateString() === y.toDateString() ? 'Yesterday' : `${Math.round(hrs / 24)}d`; };
const isToday = iso => new Date(iso).toDateString() === new Date().toDateString();

/** onNavigate({ throwId } | { focusContactId } | { message }) */
export function notificationsPanel(notes, store, { onNavigate }) {
  let filter = 'status_posted';
  const root = h('div.t-sticker-card.t-np');
  const target = n => n.entityType === 'throw' && n.entityId ? { throwId: n.entityId } : n.entityType === 'story' && n.entityId ? { focusContactId: n.entityId }
    : n.entityType === 'connection' ? { message: 'Chats and requests are in MySpace for now.' } : n.entityType === 'card' ? { message: 'That’s in MySpace’s Pocket.' } : {};
  function who(id) { if (!id) return null; const f = store.state.friends.find(x => x.userId === id) || null; const p = store.state.profiles[id];
    return f ? { name: f.name, avatarUrl: f.avatarUrl, avatarColor: f.avatarColor } : p ? { name: p.name, avatarUrl: p.avatarUrl, avatarColor: p.avatarColor } : null; }
  function row(n) {
    const [bg, d] = BADGE[n.category] ?? BADGE.throw, a = who(n.relatedUserId);
    // (MySpace's database titles these with full_name only, "Someone" for a Sailo captain without one: use the name we know)
    n = { ...n, title: n.title === 'Someone' && a?.name && a.name !== 'Someone' ? a.name : n.title };
    const pending = n.category === 'friend_requests' && store.state.connections.some(c => c.id === n.entityId && c.status === 'pending' && c.addressee_id === store.myId);
    const [phrase, preview] = n.category === 'chat_message' ? n.body.split('\n') : [n.body, null];
    const el = h('div.t-np-row', { role: 'button', tabindex: '0', 'aria-label': `${n.title} ${n.body}` },
      h('div.t-np-av', avatar({ id: n.relatedUserId ?? n.id, name: a?.name ?? n.title, avatarUrl: a?.avatarUrl, avatarColor: a?.avatarColor, size: 44 }), h('span.t-np-badge', { style: { background: bg } }, icon(d, { size: 11, stroke: 2.4, color: '#fff' }))),
      h('div.t-np-body', h('div.t-np-line', h('b', n.title), ' ' + (phrase || '')), preview ? h('div.t-np-preview', preview) : null, h('div.t-np-time', timeLabel(n.createdAt)),
        pending ? h('div.t-np-actions',
          h('button.t-np-accept', { type: 'button', 'aria-label': `Accept ${n.title}`, on: { click: e => { e.stopPropagation(); store.respondFriendRequest(n.entityId, true); notes.acknowledge(n.id); } } }, 'Accept'),
          h('button.t-np-decline', { type: 'button', 'aria-label': `Decline ${n.title}`, on: { click: e => { e.stopPropagation(); store.respondFriendRequest(n.entityId, false); notes.acknowledge(n.id); } } }, 'Decline')) : null),
      n.category === 'status_posted' ? h('div.t-np-thumb', icon(ICONS.photo, { size: 15, color: 'rgba(22,33,12,.4)' }), h('span', 'photo')) : null,
      !n.read ? h('span.t-np-dot') : null);
    el.addEventListener('click', () => { notes.acknowledge(n.id); onNavigate(target(n)); });
    return el;
  }
  function paint() {
    const list = notes.list.filter(n => FILTERS.some(f => f[0] === n.category) && n.category === filter), today = list.filter(n => isToday(n.createdAt)), earlier = list.filter(n => !isToday(n.createdAt));
    root.replaceChildren(...[
      notes.unreadCount > 0 ? h('div.t-np-head', h('button.t-np-all', { type: 'button', on: { click: () => notes.clearAll() } }, 'Mark all read')) : null,
      h('div.t-np-filters', FILTERS.map(([id, label]) => h('button.t-np-pill' + (id === filter ? '.on' : ''), { type: 'button', on: { click: () => { filter = id; paint(); } } }, label))),
      h('div.t-np-list', list.length === 0 ? h('div.t-np-empty', "You're all caught up.") : [today.length ? h('div.t-mono-label.t-np-sec', 'TODAY') : null, today.map(row), earlier.length ? h('div.t-mono-label.t-np-sec', 'EARLIER') : null, earlier.map(row)]),
    ].filter(Boolean));
  }
  const off = notes.on(paint), offS = store.on(paint);
  root._dispose = () => { off(); offS(); }; // (home calls it when the panel closes)
  paint();
  return root;
}
