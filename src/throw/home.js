// Throw's home (port of MySpace's ThrowHomeScreen): the world map with friends' pins, the recipient carousel ("Myself"
// first, then friends who've set a location), and the letter. Throwing to a friend sends it and their pin bounces; a
// note to yourself becomes a reminder ("Alert set"). A letter arriving shows "X sent you a letter".
import { h, Value } from './ui.js';
import { createWeatherOverlay } from './weather/overlay.js';
import { createThrowMap, spreadPins, hasMapToken } from './map.js';
import { createCarousel, CAROUSEL_HEIGHT } from './carousel.js';
import { createFoldingLetter } from './letter.js';
import { DEFAULT_ALERT_SCHEDULE } from './schedule.js';
import { formatAlertSchedule } from './alerts-schedule.js';
import { isDaytimeNow } from './solarTime.js';
import { storyCapture, storyPreview, storyTrim } from './capture.js';
import { contactStoryStack } from './storyStack.js';
import { profileCard, addFriendCard } from './cards.js';
import { notificationsPanel } from './notifications.js';

const DELIVERED_HOLD_MS = 1800, DOCK_CLEARANCE = 92;

/**
 * opts: store, alerts, prefs ({ isDay, mapIsDay, showMap }), lockedRecipient ({ friendUserId, repliedToThrowId } | null),
 * focusContactId, onClose (back to the sea), onOpenInbox(contactId?), onOpenLetter(id), onSettings, stories, notifications, note(text).
 */
export function createThrowHome(opts) {
  const { store, alerts, prefs, stories, notifications } = opts;
  const S = store.state, myId = store.myId;
  const root = h('div.t-home'), mapArea = h('div.t-map-area'), sheetHost = h('div.t-sheet-host');
  const glass = h('div.t-glass-backdrop.fill' + (prefs.mapIsDay ? '' : '.night'));
  const mapBox = h('div.t-map');
  root.append(mapArea, sheetHost);
  const showMap = prefs.showMap && hasMapToken; // (no Mapbox token in this build: the glass backdrop stands in, as MySpace's own map-off setting)
  mapArea.append(showMap ? mapBox : glass);
  const map = showMap ? createThrowMap(mapBox) : null;
  map?.setDay(prefs.mapIsDay);
  // weather over the map, not part of it (MySpace only shows it with the map background on)
  const wxHost = h('div.t-wx-layer'); if (showMap) mapArea.append(wxHost);
  const weather = showMap ? createWeatherOverlay(wxHost, { prefs, store }) : null;

  let selectedFriendId = opts.lockedRecipient?.friendUserId ?? opts.focusContactId ?? null, initialized = false;
  let alertSchedule = DEFAULT_ALERT_SCHEDULE(), selfComposeLocked = false, reminderPeeking = false, flight = null, landed = null, pending = null, flightRun = 0;
  let dragBase = 0, virtualHandled = null;
  // what the letter card shows instead of the letter (MySpace's storyFlow / storyView / Notifications slot)
  let storyFlow = null, storyView = null, notificationsOpen = false, cardContent = null, overlay = null, trimModal = null;
  const isCards = () => storyFlow?.name === 'cards', isCapture = () => storyFlow?.name === 'capture', isPreview = () => storyFlow?.name === 'preview';
  const isAddStorySelected = () => storyView?.viaAddSlot === true || isCapture() || isPreview() || isCards();
  const storyTargetY = () => { const r = recipientOverlay.getBoundingClientRect(); return r.top + CAROUSEL_HEIGHT / 2; };
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
  const carousel = createCarousel({
    onChangeIndex: i => { storyView = null; storyFlow = null; notificationsOpen = false; selectedFriendId = people()[i]?.userId ?? null; sync(); },
    onOpenStory: id => openStory(id),
    onAddStory: () => { notificationsOpen = false; storyView = null; storyFlow = { name: 'cards' }; sync(); },
    onOpenNotifications: () => { notificationsOpen = !notificationsOpen; if (notificationsOpen) { storyView = null; storyFlow = null; } sync(); },
  });
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
    onContactDragStart: () => { dragBase = notificationsOpen ? -2 : isCards() ? -1 : selectedIndex(); virtualHandled = notificationsOpen ? -2 : isCards() ? -1 : null; carousel.setLiveOffset(dragBase); },
    onContactDragOffset: steps => { const n = people().length; if (!n) return;
      // one flick moves at most one slot; -1 is Add Status and -2 Notifications, left of "Myself"
      const raw = Math.max(dragBase - 1, Math.min(dragBase + 1, dragBase + steps)); carousel.setLiveOffset(Math.max(-2, Math.min(n - 1, raw)));
      const idx = Math.max(-2, Math.min(n - 1, Math.round(raw)));
      if (idx === -2) { if (virtualHandled !== -2) { virtualHandled = -2; storyView = null; storyFlow = null; notificationsOpen = true; sync(); } return; }
      if (idx === -1) { if (virtualHandled !== -1) { virtualHandled = -1; notificationsOpen = false; storyView = null; selectedFriendId = myId; storyFlow = { name: 'cards' }; sync(); } return; }
      const wasVirtual = virtualHandled !== null || storyView || storyFlow || notificationsOpen; virtualHandled = null;
      const next = people()[idx]; if (next && (next.userId !== selectedFriendId || wasVirtual)) { storyView = null; storyFlow = null; notificationsOpen = false; selectedFriendId = next.userId; sync(); } },
    onContactDragEnd: () => carousel.setLiveOffset(null),
  });
  const letterProps = () => { const f = selected(), self = isSelf();
    return { recipientName: f?.name ?? '', streak: f && !self ? store.streakFor(f.userId) : 0, points: f && !self ? store.pointsFor(f.userId) : 0, hideBadges: self, isNight: !prefs.isDay,
      throwLabel: self ? 'Swipe up to set alert' : opts.lockedRecipient ? 'Swipe up to throw back' : 'Swipe up to throw',
      unreadCount: S.unreadCount, alertSchedule: self ? alertSchedule : undefined, onAlertScheduleChange: self ? v => { alertSchedule = v; selfComposeLocked = true; sync(); } : undefined,
      onReminderPeekChange: self ? p => { reminderPeeking = p; renderPeek(); } : undefined,
      onThrow: handleThrow, onLaunched: handleLaunched, onFoldProgress: v => chrome.set(1 - v), onOpenInbox: () => opts.onOpenInbox(f && !self ? f.userId : undefined),
      ...dragHandlers() }; };
  function mountLetter() { letter?.destroy(); letter = createFoldingLetter(sheetHost, letterProps()); letterCard.replaceChildren(letter.el); cardContent = null; }

  // ---------- statuses ----------
  function openStory(userId) { if ((stories.byUser[userId]?.length ?? 0) === 0) return;
    if (storyView?.userId === userId && cardContent?.drop) { cardContent.drop(); return; } // (tapping the open avatar again drops what's left in it)
    storyView = { userId, viaAddSlot: false }; sync(); cardContent?.drop?.(); }
  let avatarCount, pulse = 0;
  function renderCardContent() {
    // the letter stays mounted (hidden) under a status, so a half-written letter survives a look at someone's status
    const mode = isCapture() ? 'capture' : isPreview() ? 'preview' : storyView && storyView.userId === selectedFriendId ? 'story:' + storyView.userId : 'letter';
    if ((cardContent?.mode ?? 'letter') === mode) return;
    cardContent?.destroy(); cardContent = null; avatarCount = undefined;
    if (mode === 'letter') { if (letter) { letter.el.style.display = ''; letter.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 }); } return; }
    if (letter) letter.el.style.display = 'none';
    const drag = dragHandlers();
    if (mode === 'capture') cardContent = storyCapture({ flightTargetY: storyTargetY(), ...drag,
      onClose: () => { storyFlow = { name: 'cards' }; sync(); },
      onCaptured: (blob, url, mediaType) => { storyFlow = { name: 'preview', blob, url, mediaType }; sync(); },
      onPickedLongVideo: (blob, url, durationMs) => { storyFlow = { name: 'trim', blob, url, durationMs }; sync(); } });
    else if (mode === 'preview') { const f = storyFlow; cardContent = storyPreview({ url: f.url, mediaType: f.mediaType, trim: f.trim, flightTargetY: storyTargetY(),
      onCancel: () => { storyFlow = { name: 'capture' }; sync(); },
      onConfirm: async () => { storyFlow = null; sync(); const { error } = await stories.post(f.blob, f.mediaType, f.trim); if (error) opts.note?.(error); } }); }
    else { const uid = storyView.userId, fr = people().find(p => p.userId === uid);
      cardContent = contactStoryStack({ stories: stories.byUser[uid] ?? [], contactName: fr?.name ?? '', isNight: !prefs.isDay, isOwn: uid === myId,
        flightTarget: () => ({ x: innerWidth / 2, y: storyTargetY() }), onViewed: id => stories.markViewed(id), onDelete: id => stories.remove(id),
        onAvatarCount: n => { if (n !== avatarCount) { avatarCount = n; carousel.update({ storyModeAvatarCount: n }); } }, onPulseAvatar: () => carousel.update({ storyModePulse: ++pulse }),
        onEmptied: () => { storyView = null; sync(); } }); }
    cardContent.mode = mode; letterCard.append(cardContent.el);
    cardContent.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300 });
  }
  // the Add Status cards and the Notifications panel take the letter card's place (above the dock)
  function renderOverlay() {
    const want = notificationsOpen ? 'notifications' : isCards() ? 'cards' : null;
    if ((overlay?.kind ?? null) === want) return; overlay?.el.querySelector('.t-np')?._dispose?.(); overlay?.el.remove(); overlay = null;
    letterCard.style.display = want ? 'none' : '';
    if (!want) return;
    let el;
    if (want === 'cards') { const mine = stories.byUser[myId], latest = mine?.[mine.length - 1];
      el = h('div.t-cards', profileCard({ userId: myId, avatarUrl: S.myAvatarUrl, avatarColor: S.myAvatarColor, city: S.myLocation?.city, friendCount: S.friends.length,
        status: latest ? { uri: latest.mediaUrl, isVideo: latest.mediaType === 'video', trim: latest.trimStartMs != null ? { startMs: latest.trimStartMs, endMs: latest.trimEndMs } : null } : null,
        onViewStatus: () => { storyFlow = null; storyView = { userId: myId, viaAddSlot: true }; selectedFriendId = myId; sync(); cardContent?.drop?.(); },
        onAddStatus: () => { storyFlow = { name: 'capture' }; sync(); } }), addFriendCard(store, { onShare: shareInvite })); }
    else el = h('div.t-cards', notificationsPanel(notifications, store, { onNavigate: handleNotificationTarget }));
    flickToSwitch(el); overlay = { kind: want, el }; mapArea.append(el);
  }
  // flicking sideways on the cards / panel reaches the next slot, as on the letter
  function flickToSwitch(el) { const d = dragHandlers(); if (!d.onContactDragOffset) return; let s0 = null, cap = false;
    el.addEventListener('pointerdown', e => { s0 = { x: e.clientX, y: e.clientY }; cap = false; });
    el.addEventListener('pointermove', e => { if (!s0) return; const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
      if (!cap && Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.7) { cap = true; d.onContactDragStart(); } if (cap) d.onContactDragOffset(-dx / 70); });
    const up = () => { s0 = null; if (cap) { cap = false; d.onContactDragEnd(); } }; el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up); }
  function renderTrim() {
    const want = storyFlow?.name === 'trim'; if (!!trimModal === want) return;
    if (!want) { trimModal.destroy(); trimModal = null; return; }
    const f = storyFlow; trimModal = storyTrim({ url: f.url, durationMs: f.durationMs, onCancel: () => { storyFlow = { name: 'capture' }; sync(); },
      onConfirm: trim => { storyFlow = { name: 'preview', blob: f.blob, url: f.url, mediaType: 'video', trim }; sync(); } });
    root.append(trimModal.el);
  }
  async function shareInvite() {
    const code = S.myFriendCode, text = code ? `Add me as a friend on Sailo & MySpace — my friend code is ${code}` : 'Add me as a friend on Sailo & MySpace!';
    try { if (navigator.share) { await navigator.share({ text }); return; } } catch { /* cancelled */ }
    try { await navigator.clipboard.writeText(text); opts.note?.(code ? `Friend code ${code} copied.` : 'Invite copied.'); } catch { opts.note?.(code ? `Your friend code is ${code}` : 'Couldn’t share.'); }
  }
  function handleNotificationTarget(t) {
    notificationsOpen = false;
    if (t.throwId) return opts.onOpenLetter(t.throwId);
    if (t.focusContactId) { storyView = null; storyFlow = null; selectedFriendId = t.focusContactId; sync(); return; }
    sync(); if (t.message) opts.note?.(t.message);
  }


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
    landed = { id: p.counterpartId, n: (landed?.n ?? 0) + 1 }; flight = p; letter?.destroy(); letter = null; cardContent?.destroy(); cardContent = null; letterCard.replaceChildren(); reminderPeeking = false; renderPeek(); renderPins();
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
    else carousel.update({ friends: list, selectedIndex: selectedIndex(), disabled: selfLocked() || isCapture() || isPreview(), isNight: !prefs.mapIsDay, unreadCountFor: store.unreadCountFor,
      storyCountFor: stories.countFor, isAddStorySelected: isAddStorySelected(), isNotificationsSelected: notificationsOpen, notificationsUnread: notifications.unreadCount,
      storyModeAvatarCount: storyView && storyView.userId === selectedFriendId ? avatarCount : undefined });
    renderPins(); renderToast(); renderPeek();
    if (!flight && f) { if (!letter) mountLetter(); else letter.update(letterProps()); renderCardContent(); }
    renderOverlay(); renderTrim();
    const key = `${f?.userId}`; if (key !== lastLetterKey) lastLetterKey = key;
  }
  const off = store.on(sync), offStories = stories.on(sync), offNotes = notifications.on(sync);
  sync(); carousel.jump();

  // day/night follows the clock in 'auto' (rechecked every minute, as MySpace does)
  const clock = setInterval(() => { const day = isDaytimeNow(); let changed = false;
    if (prefs.mode === 'auto' && prefs.isDay !== day) { prefs.isDay = day; changed = true; }
    if (prefs.mapMode === 'auto' && prefs.mapIsDay !== day) { prefs.mapIsDay = day; map?.setDay(day); changed = true; }
    if (changed) sync(); }, 60000);

  return { el: root, destroy() { off(); offStories(); offNotes(); carousel.destroy(); cardContent?.destroy(); trimModal?.destroy(); overlay?.el.querySelector('.t-np')?._dispose?.(); overlay?.el.remove(); clearInterval(clock); clearTimeout(toastTimer); letter?.destroy(); weather?.destroy(); map?.destroy(); root.remove(); } };
}
