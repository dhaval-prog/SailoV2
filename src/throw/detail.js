// Reading letters. The letter view is a port of MySpace's ThrowLetterDetailScreen: To/From, the route and distance, the
// letter on cream paper, its photos and videos, and Throw Back for a letter you received (marked read when opened).
// MySpace reads received letters in its Chats tab; Sailo has none yet, so a simple list of them opens from the letter's
// inbox button (and from the "sent you a letter" toast).
import { h, avatar, icon } from './ui.js';
import { formatMiles } from './geo.js';

const isVideo = u => /\.(mp4|mov|m4v|webm|3gp)(\?|$)/i.test(u);
const when = iso => { const d = new Date(iso), days = Math.floor((Date.now() - d) / 86400000);
  return days < 1 ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : days < 7 ? d.toLocaleDateString([], { weekday: 'short' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };

export function letterDetail(store, throwId, { onBack, onThrowBack }) {
  const letter = store.state.letters.find(l => l.id === throwId);
  const back = h('button.t-back', { type: 'button', on: { click: onBack } }, letter ? '‹ Back to inbox' : '‹ Back');
  if (!letter) return h('div.t-screen.t-detail', back);
  if (letter.direction === 'received' && letter.status === 'thrown') store.markRead(letter.id);
  const media = url => isVideo(url)
    ? h('video.t-detail-media', { src: url, controls: true, playsinline: true, preload: 'metadata' })
    : h('img.t-detail-media', { src: url, alt: '' });
  const body = h('div.t-detail-card',
    h('div.t-detail-head', letter.direction === 'sent' ? `To ${letter.counterpartName}` : `From ${letter.counterpartName}`),
    h('div.t-detail-route', `${letter.senderCity || '?'} → ${letter.recipientCity || '?'}`),
    h('div.t-detail-dist', formatMiles(letter.distanceMiles || 0)),
    h('div.t-detail-paper', h('div.t-detail-text', letter.messageText || '')),
    letter.photoUrls.length === 1 ? h('div.t-detail-one', media(letter.photoUrls[0])) : null,
    letter.photoUrls.length > 1 ? h('div.t-detail-row', letter.photoUrls.map(media)) : null);
  const foot = letter.direction === 'received'
    ? h('button.t-throwbtn', { type: 'button', on: { click: () => onThrowBack(letter.counterpartId, letter.id) } }, icon('M21 11 2 2l9 19 2-8z', { size: 18, stroke: 2 }), 'Throw Back')
    : h('div.t-detail-sent', `Thrown to ${letter.recipientCity || 'them'}${letter.recipientCountry ? ', ' + letter.recipientCountry : ''}`);
  return h('div.t-screen.t-detail', back, h('div.t-detail-scroll', body, h('div.t-grow'), foot));
}

export function receivedList(store, { onBack, onOpen, focusId }) {
  const S = store.state, letters = S.inbox.filter(l => !focusId || l.counterpartId === focusId);
  const rows = letters.length ? letters.map(l => h('button.t-inbox-row' + (l.status === 'thrown' ? '.unread' : ''), { type: 'button', on: { click: () => onOpen(l.id) } },
    avatar({ id: l.counterpartId, name: l.counterpartName, avatarUrl: l.counterpartAvatarUrl, size: 44 }),
    h('div.t-inbox-main', h('div.t-inbox-name', l.counterpartName), h('div.t-inbox-text', l.messageText || (l.photoUrls.length ? '📷 A letter with photos' : 'A letter'))),
    h('div.t-inbox-side', h('div.t-inbox-when', when(l.createdAt)), l.status === 'thrown' ? h('span.t-inbox-dot') : null)))
    : [h('div.t-inbox-empty', 'No letters yet. When a friend throws you one, it lands here.')];
  const name = focusId ? S.friends.find(f => f.userId === focusId)?.name : null;
  return h('div.t-screen.t-inbox', h('button.t-back', { type: 'button', on: { click: onBack } }, '‹ Back'),
    h('div.t-inbox-title', name ? `Letters from ${name.split(' ')[0]}` : 'Letters for you'),
    focusId ? h('button.t-inbox-all', { type: 'button', on: { click: () => onOpen(null) } }, 'All letters') : null,
    h('div.t-inbox-list', rows));
}
