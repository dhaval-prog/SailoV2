// Throw's home (port of MySpace's ThrowHomeScreen): the world map with friends' pins, the recipient carousel ("Myself"
// first, then friends who've set a location), and the letter. Throwing to a friend sends it and their pin bounces; a
// note to yourself becomes a reminder ("Alert set"). A letter arriving shows "X sent you a letter".
import { h, Value } from './ui.js';
import { createThrowMap, spreadPins, hasMapToken } from './map.js';
import { createCarousel, CAROUSEL_HEIGHT } from './carousel.js';
import { createFoldingLetter } from './letter.js';
import { DEFAULT_ALERT_SCHEDULE } from './schedule.js';
import { formatAlertSchedule } from './alerts-schedule.js';
import { isDaytimeNow } from './solarTime.js';

const DELIVERED_HOLD_MS = 1800, DOCK_CLEARANCE = 92;

/**
 * opts: store, alerts, prefs ({ isDay, mapIsDay, showMap }), lockedRecipient ({ friendUserId, repliedToThrowId } | null),
 * focusContactId, onClose (back to the sea), onOpenInbox(contactId?), onOpenLetter(id), onSettings.
 */
export function createThrowHome(opts) {
  const { store, alerts, prefs } = opts;
  const S = store.state, myId = store.myId;
  const root = h('div.t-home'), mapArea = h('div.t-map-area'), sheetHost = h('div.t-sheet-host');
  const glass = h('div.t-glass-backdrop.fill' + (prefs.mapIsDay ? '' : '.night'));
  const mapBox = h('div.t-map');
  root.append(mapArea, sheetHost);
  const showMap = prefs.showMap && hasMapToken; // (no Mapbox token in this build: the glass backdrop stands in, as MySpace's own map-off setting)
  mapArea.append(showMap ? mapBox : glass);
  const map = showMap ? createThrowMap(mapBox) : null;
  map?.setDay(prefs.mapIsDay);

  let selectedFriendId = opts.lockedRecipient?.friendUserId ?? opts.focusContactId ?? null, initialized = false;
  let alertSchedule = DEFAULT_ALERT_SCHEDULE(), selfComposeLocked = false, reminderPeeking = false, flight = null, landed = null, pending = null, flightRun = 0;
  let dragBase = 0;
  const chrome = new Value(1);

  // ---------- derived ----------
  const selfEntry = () => (S.myLocation ? { userId: myId, name: S.myName, avatarUrl: S.myAvatarUrl, location: S.myLocation } : null);
  const people = () => { const withLoc = S.friends.filter(f => f.location); const me = selfEntry(); return me ? [me, ...withLoc] : withLoc; };
  const selected = () => people().find(f => f.userId === selectedFriendId) ?? null;
  const selectedIndex = () => Math.max(0, people().findIndex(f => f.userId === selectedFriendId));
  const isSelf = () => !!selected() && selected().userId === myId;
  const selfLocked = () => isSelf() && selfComposeLocked;

  // ---------- pieces ----------
  const recipientOverlay = h('div.t-recipients');
  const carousel = createCarousel({ onChangeIndex: i => { selectedFriendId = people()[i]?.userId ?? null; sync(); } });
  const replyLine = h('div.t-replyline');
  recipientOverlay.append(opts.lockedRecipient ? replyLine : carousel.el);
  const toastWrap = h('div.t-toastwrap', { style: { top: `calc(var(--t-safe-t) + ${16 + CAROUSEL_HEIGHT + 16}px)` } });
  const letterCard = h('div.t-lettercard'), peekWrap = h('div.t-peek'), flightWrap = h('div.t-flightwrap');
  const dock = h('div.t-dock',
    h('button.t-dock-back', { type: 'button', 'aria-label': 'Back to the sea', on: { click: opts.onClose } }, h('span.t-dock-back-ico'), 'Sea'),
    h('button.t-dock-fab', { type: 'button', 'aria-label': 'Throw settings', on: { click: opts.onSettings } }, h('span.t-dock-gear')));
  mapArea.append(recipientOverlay, toastWrap, letterCard, peekWrap, flightWrap);
  root.append(dock);
  chrome.on(v => { dock.style.opacity = v; dock.style.transform = `translateY(${(1 - v) * DOCK_CLEARANCE}px)`; dock.style.pointerEvents = v < 0.5 ? 'none' : '';
    letterCard.style.bottom = `calc(var(--t-safe-b) + ${16 + v * DOCK_CLEARANCE}px)`; });

  // ---------- the letter ----------
  let letter = null;
  const dragHandlers = () => (opts.lockedRecipient || selfLocked() ? {} : {
    onContactDragStart: () => { dragBase = selectedIndex(); carousel.setLiveOffset(dragBase); },
    onContactDragOffset: steps => { const n = people().length; if (!n) return;
      const raw = Math.max(dragBase - 1, Math.min(dragBase + 1, dragBase + steps)); carousel.setLiveOffset(Math.max(0, Math.min(n - 1, raw)));
      const next = people()[Math.max(0, Math.min(n - 1, Math.round(raw)))]; if (next && next.userId !== selectedFriendId) { selectedFriendId = next.userId; sync(); } },
    onContactDragEnd: () => carousel.setLiveOffset(null),
  });
  const letterProps = () => { const f = selected(), self = isSelf();
    return { recipientName: f?.name ?? '', streak: f && !self ? store.streakFor(f.userId) : 0, points: 0, hideBadges: self, isNight: !prefs.isDay,
      throwLabel: self ? 'Swipe up to set alert' : opts.lockedRecipient ? 'Swipe up to throw back' : 'Swipe up to throw',
      unreadCount: S.unreadCount, alertSchedule: self ? alertSchedule : undefined, onAlertScheduleChange: self ? v => { alertSchedule = v; selfComposeLocked = true; sync(); } : undefined,
      onReminderPeekChange: self ? p => { reminderPeeking = p; renderPeek(); } : undefined,
      onThrow: handleThrow, onLaunched: handleLaunched, onFoldProgress: v => chrome.set(1 - v), onOpenInbox: () => opts.onOpenInbox(f && !self ? f.userId : undefined),
      ...dragHandlers() }; };
  function mountLetter() { letter?.destroy(); letter = createFoldingLetter(sheetHost, letterProps()); letterCard.replaceChildren(letter.el); }

  async function handleThrow(content) {
    const f = selected(); if (!f) return { error: 'Pick someone to throw to first.' };
    if (isSelf()) {
      if (!content.messageText?.trim()) return { error: 'Write your reminder first.' };
      const { error } = await alerts.createAlert(alertSchedule, { messageText: content.messageText, strokes: null, penColor: content.penColor });
      if (error) return { error };
      pending = { counterpartId: myId, isAlert: true, summary: formatAlertSchedule(alertSchedule) };
      alertSchedule = DEFAULT_ALERT_SCHEDULE(); selfComposeLocked = false; return { error: null };
    }
    const photoUrls = [], photoTrims = [];
    for (let i = 0; i < content.media.length; i++) { const m = content.media[i]; const up = await store.uploadMedia(m.blob, 'throw-media', m.name);
      if (up.error) return { error: up.error }; photoUrls.push(up.url); photoTrims.push(content.photoTrims[i] ?? null); }
    const { error, letter: sent } = await store.sendThrow({ recipientId: f.userId, messageText: content.messageText, strokes: null, penColor: content.penColor, photoUrls, photoTrims, repliedToThrowId: opts.lockedRecipient?.repliedToThrowId, alertSchedule: content.alertSchedule });
    if (error || !sent) return { error: error ?? 'Could not send — try again.' };
    pending = { counterpartId: sent.counterpartId, isAlert: false }; return { error: null };
  }
  async function handleLaunched() {
    const p = pending; pending = null; if (!p) return; const run = ++flightRun;
    landed = { id: p.counterpartId, n: (landed?.n ?? 0) + 1 }; flight = p; letter?.destroy(); letter = null; letterCard.replaceChildren(); reminderPeeking = false; renderPeek(); renderPins();
    flightWrap.replaceChildren(p.isAlert ? h('div.t-flight', h('div.t-flight-title', 'Alert set'), h('div.t-flight-body', p.summary)) : '');
    recipientOverlay.style.display = 'none';
    await new Promise(r => setTimeout(r, DELIVERED_HOLD_MS)); if (run !== flightRun) return;
    flight = null; flightWrap.replaceChildren(); recipientOverlay.style.display = ''; chrome.set(1);
    if (opts.lockedRecipient) { opts.onThrownBack?.(); return; } // (a throw back goes back to where it came from)
    mountLetter(); sync();
  }

  // ---------- the self-reminder peek strip ----------
  function renderPeek() {
    peekWrap.replaceChildren(); if (flight || !isSelf() || !reminderPeeking) return;
    const btn = h('button.t-peek-btn', { type: 'button', 'aria-label': 'Show reminder settings' }, 'Reminder');
    let y0 = null; btn.addEventListener('pointerdown', e => { y0 = e.clientY; }); btn.addEventListener('pointerup', e => { const dy = e.clientY - (y0 ?? e.clientY); y0 = null; if (Math.abs(dy) < 10 || dy < -24) letter?.openReminder(); });
    peekWrap.append(btn, h('button.t-peek-x', { type: 'button', 'aria-label': 'Clear reminder', on: { click: () => { letter?.clearReminderDraft(); alertSchedule = DEFAULT_ALERT_SCHEDULE(); selfComposeLocked = false; reminderPeeking = false; sync(); } } }, '✕'));
  }

  // ---------- toast ----------
  let toastTimer = 0;
  function renderToast() {
    const L = S.latestIncoming; toastWrap.replaceChildren();
    if (!L || flight) return;
    toastWrap.append(h('button.t-toast', { type: 'button', 'aria-label': `${L.counterpartName} sent you a letter`, on: { click: () => { store.clearLatestIncoming(); opts.onOpenLetter(L.id); } } },
      h('span.t-toast-plane'), h('span.t-toast-text', `${L.counterpartName} sent you a letter`)));
    clearTimeout(toastTimer); toastTimer = setTimeout(() => store.clearLatestIncoming(), 5000);
  }

  // ---------- map pins ----------
  function renderPins() {
    if (!map) return; const list = people(), sel = selectedFriendId;
    map.setPins(spreadPins(list.map(f => { const self = f.userId === myId, isSel = f.userId === sel;
      return { id: f.userId, latitude: f.location.latitude, longitude: f.location.longitude, label: self ? 'You' : f.name.split(' ')[0], avatarUrl: f.avatarUrl, avatarColor: f.avatarColor, fullName: f.name,
        bounceKey: landed?.id === f.userId ? landed.n : undefined, isSelf: self, selected: isSel, dimmed: !isSel && list.length > 1,
        onPress: opts.lockedRecipient || selfLocked() ? undefined : () => { selectedFriendId = f.userId; sync(); } }; })));
    map.setFocus(selected()?.location ?? S.myLocation ?? null);
  }

  // ---------- sync everything with the store ----------
  let lastLetterKey = '';
  function sync() {
    const list = people();
    if (!initialized && list.length) { initialized = true; const want = opts.lockedRecipient?.friendUserId ?? opts.focusContactId;
      selectedFriendId = (want && list.find(f => f.userId === want) ? want : list[0].userId); }
    if (selectedFriendId && !list.find(f => f.userId === selectedFriendId) && list.length) selectedFriendId = list[0].userId;
    if (!isSelf() && reminderPeeking) { reminderPeeking = false; }
    const f = selected();
    if (opts.lockedRecipient) replyLine.textContent = f ? `Throwing back to ${f.name}` : '';
    else carousel.update({ friends: list, selectedIndex: selectedIndex(), disabled: selfLocked(), isNight: !prefs.mapIsDay, unreadCountFor: store.unreadCountFor });
    renderPins(); renderToast(); renderPeek();
    if (!flight && f) { if (!letter) mountLetter(); else letter.update(letterProps()); }
    const key = `${f?.userId}`; if (key !== lastLetterKey) lastLetterKey = key;
  }
  const off = store.on(sync);
  sync(); carousel.jump();

  // day/night follows the clock in 'auto' (rechecked every minute, as MySpace does)
  const clock = setInterval(() => { const day = isDaytimeNow(); let changed = false;
    if (prefs.mode === 'auto' && prefs.isDay !== day) { prefs.isDay = day; changed = true; }
    if (prefs.mapMode === 'auto' && prefs.mapIsDay !== day) { prefs.mapIsDay = day; map?.setDay(day); changed = true; }
    if (changed) sync(); }, 60000);

  return { el: root, destroy() { off(); clearInterval(clock); clearTimeout(toastTimer); letter?.destroy(); map?.destroy(); root.remove(); } };
}
