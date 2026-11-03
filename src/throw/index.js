// Throw inside Sailo: opened from the paper-plane button at the helm, full screen over the sea, with the captain's own
// Sailo sign-in. A port of MySpace's ThrowScreen navigator: location setup first (if you've never set one), then home;
// a letter view and the list of received letters on top. This module (and three.js / Mapbox with it) only loads when
// Throw is first opened.
import './throw.css';
import { h } from './ui.js';
import { loadThrowFonts } from './fonts.js';
import { createThrowStore } from './data.js';
import { startThrowAlerts } from './alerts.js';
import { createStoriesStore } from './stories.js';
import { createNotifications } from './notifications.js';
import { createThrowHome } from './home.js';
import { locationSetup } from './location.js';
import { letterDetail, receivedList } from './detail.js';
import { loadPrefs, throwSettings } from './settings.js';

let open = null;

/** Opens Throw. ctx: { note(text) } for messages over the game. Resolves once it's showing. */
export async function openThrow(ctx = {}) {
  if (open) return;
  const root = h('div.t-root', h('div.t-loading', h('span.t-spin')));
  // keys typed in Throw (a letter, a city search) mustn't reach the game behind it (WASD steers the boat)
  ['keydown', 'keyup', 'keypress'].forEach(t => root.addEventListener(t, e => { if (e.key !== 'Escape') e.stopPropagation(); }));
  document.body.append(root); document.body.classList.add('throw-open');
  const cover = covered => dispatchEvent(new CustomEvent('sailo:cover', { detail: { covered } }));
  setTimeout(() => { if (open) cover(true); }, 300); // (after the slide-in, so the sea is still there behind it)
  requestAnimationFrame(() => root.classList.add('in'));
  let keyHandler = null;
  const close = () => { if (!open) return; const o = open; open = null; if (keyHandler) removeEventListener('keydown', keyHandler); root.classList.remove('in'); document.body.classList.remove('throw-open'); cover(false);
    setTimeout(() => { o.screen?.destroy?.(); o.stories?.dispose(); o.notifications?.dispose(); o.store?.dispose(); root.remove(); }, 260); };
  open = { root, close };
  let store;
  try { [store] = await Promise.all([createThrowStore(), loadThrowFonts()]); }
  catch (e) { close(); ctx.note?.(e?.message === 'signed_out' ? 'Sign in to throw letters.' : 'Throw couldn’t open. Check your connection?'); return; }
  if (!open) { store.dispose(); return; }
  open.store = store;
  const alerts = startThrowAlerts(store.myId), stories = createStoriesStore(store), notifications = createNotifications(store);
  open.stories = stories; open.notifications = notifications;
  const prefs = await loadPrefs(store.myId);
  keyHandler = e => { if (e.key === 'Escape' && !document.querySelector('.t-sheet-wrap')) nav.back(); };
  addEventListener('keydown', keyHandler);

  const show = el => { open.screen?.destroy?.(); open.screen = el.destroy ? el : { el, destroy: () => el.remove() }; root.replaceChildren(open.screen.el); };
  const nav = {
    home(extra = {}) {
      if (!store.state.myLocation && !store.state.loading) return nav.location('setup');
      show(createThrowHome({ store, alerts, prefs, stories, notifications, note: ctx.note, ...extra, onClose: close, onOpenInbox: id => nav.inbox(id), onOpenLetter: id => nav.letter(id), onSettings: () => nav.settings(), onThrownBack: () => nav.home() }));
      nav.back = close;
    },
    location(mode) { const back = mode === 'edit' ? () => nav.settings() : close; show(locationSetup(store, { mode, onDone: () => (mode === 'edit' ? nav.settings() : nav.home()), onBack: back })); nav.back = back; },
    settings() { show(throwSettings(store, prefs, { onBack: () => nav.home(), onEditLocation: () => nav.location('edit') })); nav.back = () => nav.home(); },
    inbox(focusId) { show(receivedList(store, { focusId, onBack: () => nav.home(), onOpen: id => (id ? nav.letter(id, () => nav.inbox(focusId)) : nav.inbox()) })); nav.back = () => nav.home(); },
    letter(id, back = () => nav.inbox()) { show(letterDetail(store, id, { onBack: back, onThrowBack: (friendUserId, repliedToThrowId) => nav.home({ lockedRecipient: { friendUserId, repliedToThrowId } }) })); nav.back = back; },
    back: close,
  };
  // wait for the first load when there's no cached copy (so a first-timer gets location setup, not an empty map)
  if (store.state.loading) await new Promise(r => { const off = store.on(() => { if (!store.state.loading) { off(); r(); } }); });
  if (!open) return;
  nav.home();
}

export const closeThrow = () => open?.close();
export const throwIsOpen = () => !!open;
