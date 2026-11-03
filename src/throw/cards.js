// The Add Status cards (ports of MySpace's ProfileCard + AddFriendCard): you (city, friends, today's status, "Add status")
// and Add friend (search by name or username, "suggested nearby" with distance and mutual friends, Add / Pending / Friends).
import { h, icon, avatar } from './ui.js';
import { playbackVideo } from './capture.js';

const I = { plus: 'M12 5v14M5 12h14', camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z M12 17a4 4 0 100-8 4 4 0 000 8z',
  search: 'M11 19a8 8 0 100-16 8 8 0 000 16z M21 21l-4.35-4.35', link: 'M9 17H7a5 5 0 010-10h2 M15 7h2a5 5 0 010 10h-2 M8 12h8' };

export function profileCard({ userId, avatarUrl, avatarColor, city, friendCount, status, onViewStatus, onAddStatus }) {
  const sub = [city, `${friendCount} friend${friendCount === 1 ? '' : 's'}`].filter(Boolean).join(' · ');
  const square = status
    ? h('button.t-pc-square.thumb', { type: 'button', 'aria-label': 'View your status', on: { click: onViewStatus } }, status.isVideo ? playbackVideo(status.uri, status.trim) : h('img', { src: status.uri, alt: '' }))
    : h('button.t-pc-square', { type: 'button', 'aria-label': 'Add status', on: { click: onAddStatus } }, icon(I.plus, { size: 18, stroke: 2, color: 'rgba(43,35,28,.28)' }));
  return h('div.t-sticker-card.t-pc',
    h('div.t-pc-head', avatar({ id: userId, name: 'You', avatarUrl, avatarColor, size: 48 }), h('div.t-pc-headtext', h('div.t-pc-name', 'You'), h('div.t-pc-sub', sub))),
    h('div.t-pc-status', square, h('div.t-pc-copy', status ? 'Status posted today. Friends on the map see it for 24 hours.' : 'No status today. Friends on the map see it for 24 hours.')),
    h('div.t-pc-foot', h('button.t-sticker-primary', { type: 'button', 'aria-label': 'Add status', on: { click: onAddStatus } }, icon(I.camera, { size: 15, stroke: 2.2, color: '#fff' }), 'Add status'),
      h('span.t-pc-profile', 'Profile')));
}

/** store: for search / suggestions / requests. onShare: "Share invite link". */
export function addFriendCard(store, { onShare }) {
  const input = h('input.t-af-input', { type: 'search', placeholder: 'Search by name or username', autocapitalize: 'none', autocomplete: 'off', spellcheck: 'false' });
  const label = h('div.t-mono-label', 'SUGGESTED NEARBY'), list = h('div.t-af-list', h('div.t-af-loading', h('span.t-spin')));
  const requested = new Set(); let nearby = null, results = null, timer = 0, q = '';
  const row = r => { const status = r.status ?? (requested.has(r.userId) ? 'pending_sent' : 'none');
    const lab = status === 'accepted' ? 'Friends' : status === 'blocked' ? null : status !== 'none' ? 'Pending' : 'Add';
    const meta = [r.distanceMeters != null ? `${(r.distanceMeters / 1000).toFixed(1)} km` : null, `${r.mutual} mutual`].filter(Boolean).join(' · ');
    return h('div.t-af-row', avatar({ id: r.userId, name: r.name, avatarUrl: r.avatarUrl, size: 40 }), h('div.t-af-body', h('div.t-af-name', r.name), h('div.t-af-meta', meta)),
      lab ? h('button.t-af-add' + (lab !== 'Add' ? '.off' : ''), { type: 'button', disabled: lab !== 'Add', 'aria-label': `${lab} ${r.name}`, on: { click: async () => {
        requested.add(r.userId); paint(); const { error } = await store.sendFriendRequest(r.userId); if (error) { requested.delete(r.userId); paint(); } } } }, lab) : null); };
  function paint() {
    const searching = q.trim().length > 0, rows = searching ? results : nearby;
    label.textContent = searching ? 'RESULTS' : 'SUGGESTED NEARBY';
    list.replaceChildren(...(rows == null ? [h('div.t-af-loading', h('span.t-spin'))] : rows.length ? rows.map(row) : [h('div.t-af-empty', searching ? 'No one matches that search.' : 'No nearby suggestions right now.')]));
  }
  input.addEventListener('input', () => { q = input.value; clearTimeout(timer); results = null; paint(); if (!q.trim()) return;
    const asked = q; timer = setTimeout(async () => { const r = await store.searchProfiles(asked); if (asked === q) { results = r; paint(); } }, 350); });
  store.nearbySuggestions(10).then(r => { nearby = r; paint(); });
  return h('div.t-sticker-card.t-af', h('div.t-af-title', 'Add friend'), h('div.t-af-search', icon(I.search, { size: 16, stroke: 2, color: 'rgba(43,35,28,.28)' }), input), label, list,
    h('button.t-sticker-secondary.t-af-share', { type: 'button', 'aria-label': 'Share invite link', on: { click: onShare } }, icon(I.link, { size: 16, stroke: 2.2, color: '#16210C' }), 'Share invite link'));
}
