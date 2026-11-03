// Posting a status, ports of MySpace's web StoryCaptureScreen, StoryPreviewScreen and StoryTrimScreen:
// - capture: the camera inside the card (getUserMedia), PHOTO / VIDEO (MediaRecorder, 15 s cap with a red progress ring),
//   flip front/back, pick from the library; a long picked video goes to trim. Closing flies the card up into the avatar.
// - preview: Retake, or "Add to status" (the photo flies up into the ring, then posts).
// - trim: drag either edge or the middle to choose up to 15 s (2 s at least); nothing is re-encoded, playback keeps to it.
import { h, icon, Value, interp, E } from './ui.js';

export const MAX_VIDEO_MS = 15000;
const I = { close: 'M6 6l12 12M18 6L6 18', flip: 'M23 4v6h-6 M1 20v-6h6 M3.51 9a9 9 0 0114.85-3.36L23 10 M1 14l4.64 4.36A9 9 0 0020.49 15', gallery: 'M4 8h4l1.6-2.5h4.8L16 8h4v11H4z M12 11.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z', plus: 'M12 5v14M5 12h14' };
const RING = 74 + 16, R = (RING - 3) / 2, CIRC = 2 * Math.PI * R;
const clock = ms => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const videoMime = () => typeof MediaRecorder === 'undefined' ? null : ['video/mp4', 'video/webm;codecs=vp9', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || null;
export const videoDuration = url => new Promise(r => { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => r((v.duration || 0) * 1000); v.onerror = () => r(0); v.src = url; });
/** Flies an element up toward the carousel ring (y on screen), shrinking and fading, then calls done. */
function flyUp(el, targetY, done, tilt = 0) {
  const r = el.getBoundingClientRect(), dist = targetY == null ? 260 : Math.max(140, r.top + r.height / 2 - targetY), v = new Value(0);
  v.on(x => { el.style.transform = `translateY(${x}px) scale(${interp(x, [-dist, 0], [0.12, 1])}) rotate(${interp(x, [-dist, 0], [-tilt, 0])}deg)`; el.style.opacity = interp(x, [-dist, -dist * 0.82, 0], [0, 1, 1]); });
  v.timing(-dist, { duration: 480, easing: E.in }, done);
}

/** opts: onClose, onCaptured(blob, url, 'photo'|'video'), onPickedLongVideo(blob, url, ms), flightTargetY, contact drag handlers. */
export function storyCapture(opts) {
  const mime = videoMime();
  let facing = 'environment', mode = 'photo', recording = false, stream = null, recorder = null, chunks = [], timer = 0, tick = 0, closing = false;
  const video = h('video', { autoplay: true, playsinline: true, muted: true }), canvas = h('canvas', { style: { display: 'none' } });
  const flash = h('div.t-cap-flash'), hint = h('div.t-cap-hint'), file = h('input', { type: 'file', accept: 'image/*,video/*', style: { display: 'none' } });
  const ringProg = h('circle'), ring = h('svg.t-cap-ring', { width: RING, height: RING }, h('circle', { cx: RING / 2, cy: RING / 2, r: R, stroke: 'rgba(255,255,255,.25)', 'stroke-width': 3, fill: 'none' }), ringProg);
  for (const [k, v] of Object.entries({ cx: RING / 2, cy: RING / 2, r: R, stroke: '#FF3B30', 'stroke-width': 3, fill: 'none', 'stroke-dasharray': `${CIRC} ${CIRC}`, 'stroke-linecap': 'round', transform: `rotate(-90 ${RING / 2} ${RING / 2})` })) ringProg.setAttribute(k, v);
  const inner = h('div.t-cap-inner'), outer = h('div.t-cap-outer', inner), shutter = h('button.t-cap-shutter', { type: 'button', 'aria-label': 'Take a photo' }, ring, outer);
  const vBtn = h('button.t-cap-mode', { type: 'button', disabled: !mime }, 'VIDEO'), pBtn = h('button.t-cap-mode.on', { type: 'button' }, 'PHOTO');
  const flip = h('button.t-cap-round.flip', { type: 'button', 'aria-label': 'Flip camera' }, icon(I.flip, { size: 20, stroke: 2, color: '#fff' }));
  const gallery = h('button.t-cap-round', { type: 'button', 'aria-label': 'Choose photo or video from library' }, icon(I.gallery, { size: 22, color: '#fff' }));
  const closeBtn = h('button.t-cap-round.close', { type: 'button', 'aria-label': 'Close camera' }, icon(I.close, { size: 22, stroke: 2.2, color: '#fff' }));
  const el = h('div.t-cap', video, canvas, closeBtn, flip, h('div.t-cap-bottom', gallery, h('div.t-cap-col', shutter, h('div.t-cap-modes', vBtn, pBtn)), h('div.t-cap-round.ghost')), hint, flash, file);
  const err = msg => el.replaceChildren(h('div.t-cap-perm', h('div', msg), h('button.t-cap-permclose', { type: 'button', on: { click: () => opts.onClose() } }, 'Close')));

  async function start() {
    stream?.getTracks().forEach(t => t.stop());
    try { stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: !!mime }); video.srcObject = stream; video.play().catch(() => {}); }
    catch { err('Camera access is needed to post a story.'); }
  }
  const paint = () => { shutter.setAttribute('aria-label', mode === 'photo' ? 'Take a photo' : recording ? 'Stop recording' : 'Record a video');
    outer.classList.toggle('video', mode === 'video'); inner.classList.toggle('video', mode === 'video'); inner.classList.toggle('rec', recording);
    vBtn.classList.toggle('on', mode === 'video'); pBtn.classList.toggle('on', mode === 'photo'); ring.style.display = recording ? '' : 'none';
    flip.style.display = recording ? 'none' : ''; gallery.disabled = recording; hint.style.display = recording ? '' : 'none'; };
  function photo() {
    if (!video.videoWidth) return; flash.style.transition = 'none'; flash.style.opacity = 1; requestAnimationFrame(() => { flash.style.transition = 'opacity .16s ease-out'; flash.style.opacity = 0; });
    canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d').drawImage(video, 0, 0);
    canvas.toBlob(b => b && opts.onCaptured(b, URL.createObjectURL(b), 'photo'), 'image/jpeg', 0.9);
  }
  function record() {
    if (!stream || !mime) return; chunks = []; recorder = new MediaRecorder(stream, { mimeType: mime });
    recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
    recorder.onstop = () => { const b = new Blob(chunks, { type: mime }); opts.onCaptured(b, URL.createObjectURL(b), 'video'); };
    recorder.start(); recording = true; const t0 = Date.now();
    const step = () => { const ms = Math.min(MAX_VIDEO_MS, Date.now() - t0); ringProg.setAttribute('stroke-dashoffset', CIRC * (1 - ms / MAX_VIDEO_MS)); hint.textContent = `${clock(ms)} / ${clock(MAX_VIDEO_MS)} · tap to stop`; if (recording) tick = requestAnimationFrame(step); };
    step(); timer = setTimeout(stop, MAX_VIDEO_MS); paint();
  }
  function stop() { if (!recording) return; recording = false; clearTimeout(timer); cancelAnimationFrame(tick); recorder?.stop(); paint(); }
  shutter.onclick = () => { shutter.animate([{ transform: 'scale(1)' }, { transform: 'scale(.88)' }, { transform: 'scale(1)' }], { duration: 220 }); if (mode === 'photo') photo(); else if (recording) stop(); else record(); };
  vBtn.onclick = () => { if (!recording && mime) { mode = 'video'; paint(); } }; pBtn.onclick = () => { if (!recording) { mode = 'photo'; paint(); } };
  flip.onclick = () => { facing = facing === 'user' ? 'environment' : 'user'; start(); };
  gallery.onclick = () => file.click();
  file.onchange = async () => { const f = file.files[0]; file.value = ''; if (!f) return; const url = URL.createObjectURL(f), isVideo = f.type.startsWith('video/');
    if (isVideo) { const d = await videoDuration(url); if (d > MAX_VIDEO_MS) return opts.onPickedLongVideo(f, url, d); }
    opts.onCaptured(f, url, isVideo ? 'video' : 'photo'); };
  closeBtn.onclick = () => { if (closing) return; closing = true; flyUp(el, opts.flightTargetY, () => opts.onClose()); };
  // a clear sideways flick changes recipient, as on the letter
  let s0 = null, captured = false;
  el.addEventListener('pointerdown', e => { if (!e.target.closest('button')) s0 = { x: e.clientX, y: e.clientY }; });
  const mv = e => { if (!s0) return; const dx = e.clientX - s0.x, dy = e.clientY - s0.y;
    if (captured) return opts.onContactDragOffset?.(-dx / 70);
    if (Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 1.7 && opts.onContactDragOffset) { captured = true; opts.onContactDragStart?.(); opts.onContactDragOffset(-dx / 70); } };
  const up = () => { s0 = null; if (captured) { captured = false; opts.onContactDragEnd?.(); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
  el.animate([{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  paint(); start();
  return { el, destroy() { stop(); stream?.getTracks().forEach(t => t.stop()); removeEventListener('pointermove', mv); removeEventListener('pointerup', up); el.remove(); } };
}

export function storyPreview({ url, mediaType, trim, flightTargetY, onCancel, onConfirm }) {
  const media = mediaType === 'photo' ? h('img', { src: url, alt: '' }) : playbackVideo(url, trim);
  const card = h('div.t-prev-card', media);
  const row = h('div.t-prev-row', h('button.t-prev-retake', { type: 'button', on: { click: onCancel } }, 'Retake'),
    h('button.t-prev-confirm', { type: 'button', 'aria-label': 'Add to status', on: { click: () => { row.remove(); flyUp(card, flightTargetY, onConfirm, 8); } } }, h('span.t-prev-plus', icon(I.plus, { size: 14, stroke: 2.6, color: '#fff' })), 'Add to status'));
  const el = h('div.t-prev', card, row);
  return { el, destroy: () => el.remove() };
}

/** A looping, muted-by-default video that keeps to a trim window (MySpace's AutoplayVideoFill). */
export function playbackVideo(url, trim, { muted = true } = {}) {
  const v = h('video', { src: url, autoplay: true, playsinline: true, loop: !trim, muted });
  v.muted = muted;
  if (trim) { v.addEventListener('loadedmetadata', () => { v.currentTime = trim.startMs / 1000; });
    v.addEventListener('timeupdate', () => { if (v.currentTime * 1000 >= trim.endMs || v.currentTime * 1000 < trim.startMs - 200) { v.currentTime = trim.startMs / 1000; v.play().catch(() => {}); } }); }
  return v;
}

export function storyTrim({ url, durationMs, onCancel, onConfirm }) {
  let s = 0, e = Math.min(MAX_VIDEO_MS, durationMs);
  const v = h('video', { src: url, autoplay: true, playsinline: true });
  v.addEventListener('timeupdate', () => { if (v.currentTime * 1000 >= e || v.currentTime * 1000 < s) v.currentTime = s / 1000; });
  const win = h('div.t-trim-win'), hs = h('div.t-trim-h'), he = h('div.t-trim-h'), line = h('div.t-trim-line', win, hs, he), sub = h('div.t-trim-sub');
  const paint = () => { const l = s / durationMs * 100, w = (e - s) / durationMs * 100; win.style.left = l + '%'; win.style.width = w + '%'; hs.style.left = l + '%'; he.style.left = l + w + '%';
    sub.textContent = `Drag either edge to trim the clip, or drag the middle to move it — ${((e - s) / 1000).toFixed(1)}s selected.`; };
  const drag = (node, kind) => node.addEventListener('pointerdown', ev => { ev.stopPropagation(); node.setPointerCapture(ev.pointerId); const x0 = ev.clientX, S0 = s, E0 = e, perPx = durationMs / line.clientWidth;
    const mv = m => { const d = (m.clientX - x0) * perPx;
      if (kind === 'start') { const n = Math.max(0, Math.min(E0 - 2000, S0 + d)); s = Math.max(n, E0 - MAX_VIDEO_MS); }
      else if (kind === 'end') { const n = Math.min(durationMs, Math.max(S0 + 2000, E0 + d)); e = Math.min(n, S0 + MAX_VIDEO_MS); }
      else { const len = E0 - S0; s = Math.max(0, Math.min(durationMs - len, S0 + d)); e = s + len; }
      paint(); };
    const upH = () => { node.removeEventListener('pointermove', mv); node.removeEventListener('pointerup', upH); v.currentTime = s / 1000; };
    node.addEventListener('pointermove', mv); node.addEventListener('pointerup', upH); });
  drag(win, 'move'); drag(hs, 'start'); drag(he, 'end'); paint();
  const el = h('div.t-trim', h('button.t-cap-round.close', { type: 'button', 'aria-label': 'Cancel', on: { click: onCancel } }, icon(I.close, { size: 22, stroke: 2.2, color: '#fff' })),
    h('div.t-trim-title', 'Choose up to 15 seconds'), sub, h('div.t-trim-video', v), line,
    h('button.t-trim-ok', { type: 'button', on: { click: () => onConfirm({ startMs: Math.round(s), endMs: Math.round(e) }) } }, 'Use this clip'));
  return { el, destroy() { v.pause(); el.remove(); } };
}
