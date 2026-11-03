// The paper letter (port of MySpace's FoldingLetter + LetterCanvas). Pull down anywhere on the paper to fold it into a
// plane (reversible: let go before it settles to keep writing; the mouse wheel folds too). Once folded, swipe up from
// the middle to throw; the same swipe from either side edge unfolds it. A clear sideways flick changes the recipient
// (open paper: left = next; folded: drag banks the plane and moves the selection live). Gesture numbers are MySpace's.
import { h, icon, Value, interp, E, tick, replay } from './ui.js';
import { createPlaneStage } from './planeStage.js';
import { scheduleHeader, bottomSheet, DEFAULT_ALERT_SCHEDULE } from './schedule.js';
import { throwNightColor } from './tokens.js';
import paperTexture from './paper-texture.jpg';

export const INK_BLUE = '#4A55B0';
const FOLD_DRAG_DISTANCE = 150, LAUNCH_THRESHOLD = 64, LAUNCH_VELOCITY = 0.5, FOLD_CAPTURE_DY = 14, FOLD_CAPTURE_RATIO = 1.7;
const CONTACT_FLICK_CAPTURE_DX = 20, CONTACT_FLICK_CAPTURE_RATIO = 1.7, THROW_CENTER_ZONE = 0.5, MAX_BANK_DX = 90;
export const CONTACT_DRAG_SPACING = 70;
const LIFTOFF_MS = 1500, THROW_LOCK_MIN_DY = 20, THROW_LOCK_RATIO = 1.5, WHEEL_FOLD_DISTANCE = 500, WHEEL_SETTLE_MS = 180;
const ROW_ICON = 60, ROW_GAP = 14, ROW_HPAD = 12, ROW_SAFETY = 8, ROW_CONTENT_W = ROW_ICON * 4 + ROW_GAP * 3;
const LETTER_MAX_VIDEO_MS = 15000;
const I = {
  photo: 'M4 8h4l1.6-2.5h4.8L16 8h4v11H4z M12 11.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  mic: 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3z M6 11a6 6 0 0 0 12 0 M12 19v3 M9.5 22h5',
  stop: 'M6 6h12v12H6z', bell: 'M6 8a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6.5H4c.5-1 2-2.5 2-6.5z M9.5 18.5a2.5 2.5 0 0 0 5 0',
  inbox: 'M3 11h5l1.8 2.8h4.4L16 11h5 M3 11V5h18v6 M3 11v7a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-7', x: 'M6 6l12 12M18 6L6 18', play: 'M8 5v14l11-7z',
  award: 'M12 15a7 7 0 1 0 0-14 7 7 0 0 0 0 14z M8.21 13.89 7 23l5-3 5 3-1.21-9.12', up: 'M12 19V5 M6 11l6-6 6 6',
};

/** The ink prompt that writes itself in while the paper is blank, cycling through prompts with the recipient's name. */
function inkPrompt(name, color) {
  const first = (name || 'them').trim().split(/\s+/)[0];
  const prompts = name === 'Me' || name === 'You' ? ['Note to self…', 'Remind yourself of something nice', 'What do you want to remember?']
    : [`Tell ${first} about your day…`, 'What made you smile today?', `Something only ${first} would get…`, 'Write something for your loved one'];
  const shown = h('span'), rest = h('span', { style: { opacity: 0 } }), el = h('div.t-prompt', { style: { color } }, shown, rest);
  let idx = 0, n = 0, timer = 0;
  const step = () => { const t = prompts[idx % prompts.length]; shown.textContent = t.slice(0, n); rest.textContent = t.slice(n);
    if (n < t.length) { n++; timer = setTimeout(step, 38); } else timer = setTimeout(() => { idx++; n = 0; step(); }, 2800); };
  step(); el._stop = () => clearTimeout(timer);
  return el;
}

/** The streak flame (tap it 4 times for hearts) and the points badge that rolls up like a counter. */
const STREAK_SEEN = new Map();
function stickerBadges(streak, points, key, label) {
  const row = h('div.t-badges');
  if (streak > 0) {
    const flame = h('button.t-badge.sun', { type: 'button', 'aria-label': `${streak} day throw streak with ${label}` }, h('span.t-flame'), h('b', String(streak)));
    const prev = STREAK_SEEN.get(key); STREAK_SEEN.set(key, streak);
    if (prev !== undefined && streak > prev) { const p = h('span.t-rise.plus', '+1'); flame.append(p); setTimeout(() => p.remove(), 1300); }
    let taps = [];
    flame.onclick = e => { e.stopPropagation(); const now = Date.now(); taps = [...taps.filter(t => now - t < 2500), now]; tick();
      if (taps.length >= 4) { taps = []; tick(true); [0, 1, 2].forEach(i => { const hrt = h('span.t-rise', { style: { left: 2 + i * 12 + 'px', animationDelay: i * 0.12 + 's' } }, '💖'); flame.append(hrt); setTimeout(() => hrt.remove(), 1500); }); } };
    row.append(flame);
  }
  const num = h('b', '0');
  row.append(h('div.t-badge.white', { 'aria-label': `${points} leaderboard points with ${label}` }, icon(I.award, { size: 12, stroke: 2.2, color: '#16210C' }), num));
  const t0 = performance.now(); const roll = () => { const p = Math.min(1, (performance.now() - t0) / 700); num.textContent = Math.round(points * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(roll); };
  requestAnimationFrame(roll);
  return row;
}

/**
 * props: recipientName, streak, points, hideBadges, isNight, throwLabel, unreadCount, alertSchedule + onAlertScheduleChange
 * (self-reminder only), and callbacks onThrow(content) → { error }, onLaunched, onContactDragStart/Offset/End, onFoldProgress,
 * onReminderPeekChange, onOpenInbox, onError(text). Returns { el, update(props), openReminder(), clearReminderDraft(), destroy() }.
 */
export function createFoldingLetter(sheetHost, props) {
  let P = { throwLabel: 'Swipe up to throw', unreadCount: 0, ...props };
  let phase = 'writing', text = '', interim = '', media = [], error = null, reminderState = 'closed', reminderShown = false, reminderConfirmed = false, friendAlert = null;
  let paperSize = { width: 0, height: 0 }, baked = false, stageFailed = false, sheet = null;
  const selfMode = () => !!P.alertSchedule && !!P.onAlertScheduleChange;
  const hasContent = () => text.trim().length > 0 || media.length > 0;
  const progress = new Value(0), liftY = new Value(0), liftOpacity = new Value(1);

  // ---------- DOM ----------
  const textarea = h('textarea.t-letter-text', { 'aria-label': `Write a letter to ${P.recipientName}`, spellcheck: 'true' });
  const texture = h('img.t-letter-tex', { src: paperTexture, alt: '', draggable: 'false' });
  const promptHost = h('div'), canvasLayer = h('div.t-letter-canvas', texture, textarea, promptHost);
  const stampHost = h('div.t-fill.t-nopoint'), badgeHost = h('div.t-fill.t-nopoint'), stripHost = h('div.t-strip'), border = h('div.t-paper-border');
  const flash = h('div.t-flash');
  const bottomRow = h('div.t-brow'), clip = h('div.t-paper-clip', border, canvasLayer, flash, stampHost, badgeHost, stripHost, bottomRow);
  const stageBox = h('div.t-stage'), liftBox = h('div.t-lift', stageBox), wiggleBox = h('div.t-fill', liftBox), trail = h('div.t-trail');
  const stageLayer = h('div.t-stage-layer', wiggleBox, trail);
  const paper = h('div.t-paper', clip, stageLayer);
  const shakeBox = h('div.t-paper-anim', paper), floatBox = h('div.t-paper-float', shakeBox), sheetBox = h('div.t-paper-sheet.slapA', floatBox);
  const arrow = h('div.t-ready-arrow', icon(I.up, { size: 22, stroke: 2.6 })), hint = h('div.t-ready-hint'), errEl = h('div.t-letter-error');
  const fileIn = h('input', { type: 'file', accept: 'image/*,video/*', multiple: true, style: { display: 'none' } });
  const el = h('div.t-letter', sheetBox, arrow, hint, errEl, fileIn);
  textarea.style.color = P.isNight ? throwNightColor.ink : INK_BLUE;
  const stage = createPlaneStage(stageBox, { onError: e => { console.warn('[Throw] 3D plane unavailable, using a flat glyph:', e); stageFailed = true; stageBox.replaceChildren(h('div.t-plane-fallback', icon('M21 11 2 2l9 19 2-8z', { size: 64, stroke: 1.6, color: '#A85A3C' }))); } });

  // ---------- render ----------
  function renderPrompt() { promptHost.firstChild?._stop?.(); promptHost.replaceChildren();
    if (!text && !interim) promptHost.append(inkPrompt(P.hideBadges ? 'Me' : P.recipientName, P.isNight ? throwNightColor.placeholder : INK_BLUE)); }
  function renderStampBadges() {
    stampHost.replaceChildren(media.length === 0 ? h('div.t-stamp' + (P.isNight ? '.night' : ''), P.hideBadges ? 'NOTE TO SELF' : `TO: ${P.recipientName.trim().split(/\s+/)[0].toUpperCase()}`) : '');
    badgeHost.replaceChildren(P.hideBadges ? '' : stickerBadges(P.streak, P.points, P.recipientName, P.recipientName));
    badgeHost.classList.toggle('t-nopoint', phase !== 'writing');
  }
  function renderStrip() {
    stripHost.replaceChildren(...media.map((m, i) => {
      const remove = () => { media = media.filter((_, j) => j !== i); URL.revokeObjectURL(m.uri); renderAll(); };
      const frame = h('div.t-polaroid-frame', m.isVideo ? h('div.t-polaroid-video', h('video', { src: m.uri, muted: true, autoplay: true, loop: true, playsinline: true }), h('span.t-polaroid-play', icon(I.play, { size: 8, fill: '#FBF6EC' }))) : h('img', { src: m.uri, alt: '' }));
      const card = h('div.t-polaroid', { style: { '--tilt': (i % 2 ? 6 : -5) + 'deg' }, 'aria-label': `Attached ${m.isVideo ? 'video' : 'photo'} — drag up to remove` }, frame,
        h('div.t-polaroid-tape'), h('button.t-polaroid-x', { type: 'button', 'aria-label': m.isVideo ? 'Remove video' : 'Remove photo', on: { click: e => { e.stopPropagation(); remove(); } } }, icon(I.x, { size: 11, stroke: 2.6, color: '#FBF6EC' })));
      // peel off with an upward drag
      let y0 = null; card.addEventListener('pointerdown', e => { e.stopPropagation(); y0 = e.clientY; card.setPointerCapture(e.pointerId); });
      card.addEventListener('pointermove', e => { if (y0 == null) return; const dy = Math.min(0, e.clientY - y0); card.style.transform = `translateY(${dy}px) rotate(calc(var(--tilt) + ${dy / 8}deg))`; });
      card.addEventListener('pointerup', e => { if (y0 == null) return; const dy = e.clientY - y0; y0 = null; if (dy < -45) { tick(); card.classList.add('gone'); setTimeout(remove, 260); } else card.style.transform = ''; });
      return card;
    }));
    stripHost.style.display = media.length ? '' : 'none';
  }
  function roundBtn(d, label, onClick, { active = false, extra = null } = {}) {
    return h('button.t-rbtn' + (active ? '.active' : ''), { type: 'button', 'aria-label': label, on: { click: e => { e.stopPropagation(); tick(); onClick(e); } } }, icon(d, { size: 25 * rowScale(), stroke: 1.8, color: active ? '#FFFFFF' : '#16210C' }), extra);
  }
  const rowScale = () => paperSize.width <= 0 ? 1 : Math.max(0.6, Math.min(1, (paperSize.width - ROW_HPAD * 2 - ROW_SAFETY) / ROW_CONTENT_W));
  function renderRow() {
    const s = rowScale(), bellOn = selfMode() ? reminderConfirmed : friendAlert !== null;
    bottomRow.style.gap = ROW_GAP * s + 'px'; bottomRow.style.setProperty('--btn', ROW_ICON * s + 'px');
    bottomRow.replaceChildren(...[
      roundBtn(I.photo, 'Add a photo', () => fileIn.click()),
      voice.recording ? h('button.t-rbtn.mic-on', { type: 'button', 'aria-label': 'Stop recording', on: { click: e => { e.stopPropagation(); voice.stop(); } } }, h('span.t-micring'), icon(I.stop, { size: 22 * s, stroke: 1.8, color: '#FFFFFF' }))
        : roundBtn(I.mic, 'Speak your letter', () => voice.start()),
      roundBtn(I.bell, !selfMode() && friendAlert !== null ? 'Remove reminder' : 'Set reminder time', onBell, { active: bellOn }),
      P.onOpenInbox ? roundBtn(I.inbox, 'Inbox', () => P.onOpenInbox(), { extra: P.unreadCount > 0 ? h('span.t-rbtn-badge', String(P.unreadCount)) : null }) : null].filter(Boolean));
  }
  function renderHints() {
    const gated = (selfMode() || friendAlert !== null) && !reminderConfirmed;
    arrow.style.display = phase === 'ready' && hasContent() && !gated ? '' : 'none';
    hint.style.display = phase === 'ready' || voice.recording ? '' : 'none';
    hint.textContent = voice.recording && phase !== 'ready' ? 'Listening…' : !hasContent() ? 'Write something first' : gated ? 'Set a reminder time first' : P.throwLabel;
    errEl.textContent = error || voice.error || ''; errEl.style.display = error || voice.error ? '' : 'none';
    el.classList.toggle('night', !!P.isNight);
    floatBox.classList.toggle('floating', phase === 'writing');
    wiggleBox.classList.toggle('wiggling', phase === 'ready');
    canvasLayer.style.pointerEvents = phase === 'writing' ? '' : 'none';
    bottomRow.style.pointerEvents = phase === 'writing' ? '' : 'none';
    trail.style.display = phase === 'throwing' ? '' : 'none';
  }
  function renderAll() { renderPrompt(); renderStampBadges(); renderStrip(); renderRow(); renderHints(); reminderEffect(); }

  // ---------- fold progress drives the paper/plane crossfade and the stage ----------
  const paintProgress = v => { const c = interp(v, [0, 0.2], [1, 0]);
    for (const n of [canvasLayer, stampHost, badgeHost, stripHost, border]) n.style.opacity = c;
    bottomRow.style.opacity = c; bottomRow.style.transform = `translateY(${interp(c, [0, 1], [16, 0])}px)`;
    stageLayer.style.opacity = interp(v, [0, 0.2], [0, 1]); stage.seek(v); P.onFoldProgress?.(v); };
  progress.on(paintProgress);
  const paintLift = () => { liftBox.style.transform = `translateY(${liftY.get()}px)`; liftBox.style.opacity = liftOpacity.get();
    trail.style.opacity = liftOpacity.get(); trail.style.transform = `translateY(${liftY.get() * 0.5}px) scaleY(${interp(liftY.get(), [-1000, 0], [6, 0])})`; };
  liftY.on(paintLift); liftOpacity.on(paintLift);

  const setPhase = p => { if (phase === p) return; phase = p; renderHints(); renderStampBadges(); reminderEffect(); };
  function rebake() { const firstPhoto = media.find(m => !m.isVideo)?.uri ?? null;
    stage.setContent({ messageText: text.trim() || null, strokes: null, photoUri: firstPhoto, penColor: P.isNight ? throwNightColor.ink : INK_BLUE, isNight: !!P.isNight }, paperSize); }
  function applyFold(next) { progress.set(next); if (phase !== 'folding' && next > 0) setPhase('folding');
    if (!baked && next > 0) { baked = true; rebake(); } }
  function settleFold(target) { progress.spring(target, { friction: 9, tension: 55 }, () => { setPhase(target === 1 ? 'ready' : 'writing'); if (target === 1) stage.holdReady(); if (target === 0) baked = false; anchor = null; }); }
  function unfoldSmoothly() { progress.timing(0, { duration: 900, easing: E.inOut }, () => { setPhase('writing'); baked = false; anchor = null; }); }
  function springLiftBack() { stage.setReadyBank(0); liftY.spring(0, { friction: 7, tension: 50 }); liftOpacity.spring(1, { friction: 7, tension: 50 }); }
  async function launch() {
    error = null; setPhase('throwing');
    const liftOff = new Promise(r => { liftY.timing(-window.innerHeight, { duration: LIFTOFF_MS, easing: E.out }); liftOpacity.timing(0, { duration: LIFTOFF_MS, easing: E.in }, r); });
    const [{ error: err }] = await Promise.all([P.onThrow({ messageText: text.trim() || null, strokes: null, penColor: P.isNight ? throwNightColor.ink : INK_BLUE,
      media: media.map(m => ({ blob: m.blob, name: m.name, isVideo: m.isVideo, uri: m.uri })), photoTrims: media.map(m => m.trim ?? null), alertSchedule: selfMode() ? null : friendAlert }), liftOff]);
    if (err) { error = err; setPhase('ready'); stage.seek(1); stage.holdReady(); springLiftBack(); renderHints(); }
    else P.onLaunched?.();
  }

  // ---------- reminders (the bell; a self-reminder's sheet pops up the first time the fold completes) ----------
  function reminderEffect() {
    if (!selfMode()) return; // (a letter to a friend opens its sheet only from the bell)
    if (phase !== 'ready' || !hasContent()) return setReminder('closed');
    if (!reminderShown) { reminderShown = true; setReminder('open'); } else if (reminderState !== 'open') setReminder('peek');
  }
  function setReminder(s) {
    if (s === reminderState && !(s === 'open' && !sheet)) return;
    reminderState = s; P.onReminderPeekChange?.(s === 'peek');
    if (s === 'open' && !sheet) {
      const body = h('div', scheduleHeader(selfMode() ? P.alertSchedule : friendAlert ?? DEFAULT_ALERT_SCHEDULE(), v => { if (selfMode()) P.onAlertScheduleChange(v); else friendAlert = v; }),
        h('button.t-sheet-done', { type: 'button', on: { click: () => { reminderConfirmed = true; tick(true); sheet?.close(); sheet = null; reminderState = 'peek'; P.onReminderPeekChange?.(selfMode()); comesBack(); renderRow(); renderHints();
          const ding = h('div.t-popstamp', 'DING!'); bottomRow.children[2]?.append(ding); setTimeout(() => ding.remove(), 1900); } } }, 'Done'));
      sheet = bottomSheet(sheetHost, { title: 'Reminder', body, onClose: () => { sheet = null; reminderState = 'peek'; P.onReminderPeekChange?.(selfMode()); comesBack(); } });
    } else if (s !== 'open' && sheet) { sheet.close(); sheet = null; }
  }
  const comesBack = () => { sheetBox.className = 't-paper-sheet'; replay(sheetBox, 'back'); };
  function onBell() {
    if (selfMode()) return setReminder('open');
    if (friendAlert !== null) { friendAlert = null; reminderConfirmed = false; setReminder('closed'); renderRow(); renderHints(); return; }
    friendAlert = DEFAULT_ALERT_SCHEDULE(); renderRow(); setReminder('open');
  }

  // ---------- writing ----------
  textarea.addEventListener('input', () => { if (interim) return; text = textarea.value; renderPrompt(); renderHints(); reminderEffect(); });
  textarea.addEventListener('focus', () => replay(shakeBox, 'wobble'));
  fileIn.addEventListener('change', async () => {
    const files = [...fileIn.files]; fileIn.value = '';
    for (const f of files) { const isVideo = f.type.startsWith('video/'), uri = URL.createObjectURL(f); let trim = null;
      if (isVideo) { const d = await videoDuration(uri); if (d > LETTER_MAX_VIDEO_MS) trim = { startMs: 0, endMs: LETTER_MAX_VIDEO_MS }; } // (played back within its first 15 s, as MySpace's trim does)
      media.push({ uri, blob: f, name: f.name, isVideo, trim }); }
    if (files.length) { replay(flash, 'on'); tick(); renderAll(); }
  });
  const videoDuration = uri => new Promise(r => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => r((v.duration || 0) * 1000); v.onerror = () => r(0); v.src = uri; });

  // voice-to-text (the Web Speech API, as MySpace's web build): interim words show on the paper as they're spoken
  const voice = { recording: false, error: null, rec: null,
    start() { const SR = window.SpeechRecognition || window.webkitSpeechRecognition; if (!SR) { this.error = 'Voice typing isn’t available in this browser.'; renderHints(); return; }
      const r = new SR(); r.continuous = true; r.interimResults = true; r.lang = navigator.language || 'en-US'; this.rec = r; this.error = null;
      r.onresult = e => { let fin = '', mid = ''; for (let i = e.resultIndex; i < e.results.length; i++) (e.results[i].isFinal ? (fin += e.results[i][0].transcript) : (mid += e.results[i][0].transcript));
        if (fin) { const t = text.replace(/\s+$/, ''); text = t ? `${t} ${fin.trim()}` : fin.trim(); }
        interim = mid; textarea.value = interim ? `${text}${text && !/\s$/.test(text) ? ' ' : ''}${interim}` : text; renderPrompt(); renderHints(); };
      r.onerror = e => { if (e.error !== 'aborted' && e.error !== 'no-speech') this.error = e.error === 'not-allowed' ? 'Allow the microphone to speak your letter.' : 'Voice typing stopped.'; };
      r.onend = () => { this.recording = false; interim = ''; textarea.value = text; renderRow(); renderHints(); };
      try { r.start(); this.recording = true; } catch { this.recording = false; } renderRow(); renderHints(); },
    stop() { try { this.rec?.stop(); } catch { /* already stopped */ } },
  };

  // ---------- gestures (pointer events; MySpace's web build tracks these with raw DOM listeners too) ----------
  let rawStart = null, anchor = null, contactCaptured = false, readyActive = false, readyZone = 'center', throwLocked = false, rStart = null, lastMove = null, vy = 0;
  paper.addEventListener('pointerdown', e => {
    if (P.disabled || e.button > 0) return;
    if (phase === 'writing') { rawStart = { x: e.clientX, y: e.clientY }; return; }
    if (phase === 'ready') {
      liftY.set(0); readyActive = true; throwLocked = false; rStart = { x: e.clientX, y: e.clientY }; lastMove = { y: e.clientY, t: performance.now() }; vy = 0;
      const r = paper.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, m = (1 - THROW_CENTER_ZONE) / 2;
      readyZone = x >= m && x <= 1 - m ? 'center' : 'side'; if (readyZone === 'center') P.onContactDragStart?.();
      paper.setPointerCapture(e.pointerId);
    }
  });
  const onMove = e => {
    if (anchor) { applyFold(Math.max(0, Math.min(1, anchor.progress + (e.clientY - anchor.y) / FOLD_DRAG_DISTANCE))); return; }
    if (readyActive) {
      const dx = e.clientX - rStart.x, dy = e.clientY - rStart.y, t = performance.now(); if (t > lastMove.t) vy = (e.clientY - lastMove.y) / (t - lastMove.t); lastMove = { y: e.clientY, t };
      if (readyZone === 'side') { applyFold(Math.max(0, Math.min(1, 1 + dy / FOLD_DRAG_DISTANCE))); return; }
      if (!throwLocked && Math.abs(dy) >= THROW_LOCK_MIN_DY && Math.abs(dy) > Math.abs(dx) * THROW_LOCK_RATIO) throwLocked = true;
      liftY.set(Math.min(0, dy));
      if (throwLocked) stage.setReadyBank(0); else { stage.setReadyBank(dx / MAX_BANK_DX); P.onContactDragOffset?.(dx / CONTACT_DRAG_SPACING); }
      return;
    }
    if (!rawStart || phase !== 'writing') return;
    const dx = e.clientX - rawStart.x, dy = e.clientY - rawStart.y;
    if (contactCaptured) { P.onContactDragOffset?.(-dx / CONTACT_DRAG_SPACING); return; }
    if (dy > FOLD_CAPTURE_DY && dy > Math.abs(dx) * FOLD_CAPTURE_RATIO) { const next = Math.max(0, Math.min(1, dy / FOLD_DRAG_DISTANCE)); anchor = { y: e.clientY, progress: next }; textarea.blur(); window.getSelection?.()?.removeAllRanges(); applyFold(next); return; }
    if (Math.abs(dx) > CONTACT_FLICK_CAPTURE_DX && Math.abs(dx) > Math.abs(dy) * CONTACT_FLICK_CAPTURE_RATIO && P.onContactDragOffset) { contactCaptured = true; textarea.blur(); P.onContactDragStart?.(); P.onContactDragOffset(-dx / CONTACT_DRAG_SPACING); }
  };
  const onUp = e => {
    rawStart = null;
    if (contactCaptured) { contactCaptured = false; P.onContactDragEnd?.(); }
    if (anchor) { anchor = null; if (phase === 'folding') settleFold(progress.get() >= 0.5 ? 1 : 0); return; }
    if (readyActive) {
      readyActive = false; stage.setReadyBank(0);
      if (readyZone === 'center') P.onContactDragEnd?.();
      if (readyZone === 'side') { settleFold(progress.get() >= 0.5 ? 1 : 0); return; }
      const dy = (e?.clientY ?? rStart.y) - rStart.y, swipedUp = dy <= -LAUNCH_THRESHOLD || vy <= -LAUNCH_VELOCITY;
      const gateOk = !(selfMode() || friendAlert !== null) || reminderConfirmed;
      if (swipedUp && hasContent() && gateOk) launch();
      else { springLiftBack(); if (swipedUp && hasContent() && !gateOk) setReminder('open'); }
    }
  };
  window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
  // the mouse wheel / trackpad folds and unfolds too (not over the text itself, so a long letter still scrolls)
  let wheelTimer = 0;
  const onWheel = e => {
    if (P.disabled || phase === 'throwing' || e.target.closest('textarea')) return;
    if (phase === 'writing' && e.deltaY <= 0) return;
    e.preventDefault(); applyFold(Math.max(0, Math.min(1, progress.get() + e.deltaY / WHEEL_FOLD_DISTANCE)));
    clearTimeout(wheelTimer); wheelTimer = setTimeout(() => { if (phase === 'folding') settleFold(progress.get() >= 0.5 ? 1 : 0); }, WHEEL_SETTLE_MS);
  };
  el.addEventListener('wheel', onWheel, { passive: false });

  const ro = new ResizeObserver(() => { const r = paper.getBoundingClientRect(); const next = { width: r.width, height: r.height };
    if (Math.abs(next.width - paperSize.width) > 0.5 || Math.abs(next.height - paperSize.height) > 0.5) { paperSize = next; renderRow(); } });
  ro.observe(paper);
  renderAll(); paintProgress(0); paintLift();

  return {
    el,
    update(next) {
      const prev = P; P = { ...P, ...next };
      const who = prev.recipientName !== P.recipientName || prev.hideBadges !== P.hideBadges, night = prev.isNight !== P.isNight;
      textarea.setAttribute('aria-label', `Write a letter to ${P.recipientName}`);
      if (prev.recipientName !== P.recipientName) { sheetBox.className = 't-paper-sheet'; replay(sheetBox, 'swap'); }
      if (night) { textarea.style.color = P.isNight ? throwNightColor.ink : INK_BLUE; if (baked) rebake(); }
      // (only what changed is redrawn: redrawing restarts the ink prompt and the counters)
      if (who || night) renderPrompt();
      if (who || night || prev.streak !== P.streak || prev.points !== P.points) renderStampBadges();
      if (night || prev.unreadCount !== P.unreadCount || !!prev.alertSchedule !== !!P.alertSchedule || prev.alertSchedule !== P.alertSchedule) renderRow();
      renderHints(); reminderEffect();
    },
    openReminder: () => setReminder('open'),
    clearReminderDraft() { text = ''; interim = ''; textarea.value = ''; media = []; reminderShown = false; reminderConfirmed = false; setReminder('closed'); unfoldSmoothly(); renderAll(); },
    destroy() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      ro.disconnect(); clearTimeout(wheelTimer); voice.stop(); sheet?.close(); stage.dispose(); promptHost.firstChild?._stop?.(); progress.stop(); liftY.stop(); liftOpacity.stop(); el.remove(); },
  };
}
