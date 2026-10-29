// The boat's marine radio (Naked HUD): it powers on when you start sailing and lives behind a small
// floating button (and "Radio" in the boat menu). Three modes, switched like a real set's channels:
// - MARINE: push-to-talk with captains in range on four channels (Local 5 km, Regional 25 km,
//   Long range 100 km, Global). The local sailors chatter on it too, and sometimes answer you.
// - DIRECT: talk to one captain (a real one online, or a local sailor, who answers in text).
// - MUSIC: Spotify, still to come (it needs Sailo's own Spotify app).
// Voices travel as short clips over the live channel (online.js): hold the mic, let go, and the clip
// goes out; nothing is stored. Hearing and sending voices is opt-in, the mic is asked for only on the
// first press, and any captain can be muted. Radio-style sound (band-pass, grit, static, clicks and
// beeps) is made with the Web Audio API.
import { stateAt, placeNear, fishNameOf, ROSTER } from './cpu-captains.js';
import { voiceLine } from './harbour-board.js';

const KEY = 'sailo:radio';
const CH = [
  { n: 16, name: 'Harbour', label: 'Local · 5 km', range: 5000 },
  { n: 68, name: 'Bay', label: 'Regional · 25 km', range: 25000 },
  { n: 72, name: 'Open water', label: 'Long range · 100 km', range: 100000 },
  { n: 6, name: 'World', label: 'Global · worldwide', range: Infinity, global: true },
];
const MAX_TX = 15, MIN_TX = 0.4, GAP_TX = 2500; // seconds; a short pause between transmissions
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const first = n => String(n || 'Captain').split(' ')[0];
const colourOf = c => c?.colours?.sail || c?.colours?.hull || c?.colours?.flag || '#ffffff';
const pick = a => a[Math.floor(Math.random() * a.length)];
const toB64 = buf => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
const fromB64 = s => { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b.buffer; };

export function createRadio({ online, global: makeGlobal, fleet, playerPos, playerName, cpu }) {
  const $ = s => root.querySelector(s);
  const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
  const st = { power: false, auto: saved.auto !== false, mode: saved.mode || 'marine', ch: Math.min(CH.length - 1, saved.ch ?? 0), vol: saved.vol ?? 0.8, voices: !!saved.voices,
    muted: new Set(saved.muted || []), target: null, open: false, tx: null, busy: null, feed: [], queue: [], playing: null, lastTx: 0, heardBy: new Map() };
  const keep = () => { try { localStorage.setItem(KEY, JSON.stringify({ auto: st.auto, mode: st.mode, ch: st.ch, vol: st.vol, voices: st.voices, muted: [...st.muted] })); } catch { /* storage blocked */ } };
  let glob = null; // the worldwide channel, joined only while tuned to Global
  const chan = () => CH[st.ch];
  const live = () => (st.mode === 'direct' ? null : chan().global ? glob : online);

  // ---------- markup ----------
  const fab = document.createElement('button'); fab.type = 'button'; fab.id = 'radio-fab'; fab.setAttribute('aria-label', 'Radio'); fab.hidden = true;
  fab.innerHTML = '<img src="./boat/white/radio.svg" alt="" draggable="false"><span class="rf-ch"></span><i class="rf-rx" aria-hidden="true"></i>';
  document.body.appendChild(fab);
  const root = document.createElement('div'); root.id = 'radio'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Marine radio');
  root.innerHTML = `
    <div class="rd-scrim" aria-hidden="true"></div>
    <section class="rd-body">
      <header class="rd-top">
        <div class="rd-modes" role="tablist"><button type="button" data-mode="music">Music</button><button type="button" data-mode="marine">Marine</button><button type="button" data-mode="direct">Direct</button></div>
        <div class="rd-tools"><button type="button" class="rd-power" aria-label="Radio power"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v8M6.4 6.6a8 8 0 1 0 11.2 0"/></svg></button>
          <button type="button" class="rd-close" aria-label="Close radio"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg></button></div>
      </header>
      <div class="rd-display">
        <div class="rd-ch"><small>CH</small><b>16</b></div>
        <div class="rd-info"><b class="rd-name">Harbour</b><span class="rd-sub">Local · 5 km</span></div>
        <div class="rd-sig" aria-label="Signal"><i></i><i></i><i></i><i></i></div>
      </div>
      <canvas class="rd-wave" aria-hidden="true"></canvas>
      <div class="rd-dial"></div>
      <div class="rd-gate" hidden></div>
      <div class="rd-feed" aria-live="polite"></div>
      <footer class="rd-ctrl">
        <label class="rd-vol"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg><input type="range" min="0" max="1" step="0.05" aria-label="Volume"></label>
        <button type="button" class="rd-ptt" aria-label="Hold to talk"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg></button>
        <div class="rd-state"><b>Hold to talk</b><small>Release to send</small></div>
      </footer>
    </section>`;
  document.body.appendChild(root);
  // nothing in the radio steers the boat or pins a course
  ['pointerdown', 'pointerup', 'click', 'wheel', 'keydown', 'keyup'].forEach(ev => root.addEventListener(ev, e => { if (e.type === 'keydown' && e.key === 'Escape') { close(); return; } e.stopPropagation(); }));
  ['pointerdown', 'pointerup'].forEach(ev => fab.addEventListener(ev, e => e.stopPropagation()));

  // ---------- sound: radio voice chain, static, clicks and beeps ----------
  let ac = null, master = null, voiceIn = null, analyser = null;
  function audio() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return ac; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    ac = new AC(); master = ac.createGain(); master.gain.value = st.vol; analyser = ac.createAnalyser(); analyser.fftSize = 512; master.connect(analyser); analyser.connect(ac.destination);
    // a voice through a little VHF set: band-pass 300 Hz to 3 kHz, a touch of grit, squeezed loud
    const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 320;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3000;
    const sh = ac.createWaveShaper(); { const n = 1024, c = new Float32Array(n); for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * 2.2) / Math.tanh(2.2); } sh.curve = c; }
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -28; comp.ratio.value = 6;
    voiceIn = ac.createGain(); voiceIn.gain.value = 1.4; voiceIn.connect(hp); hp.connect(lp); lp.connect(sh); sh.connect(comp); comp.connect(master);
    return ac;
  }
  const noise = (dur, gain, f = 1800) => { const a = audio(); if (!a) return null; const n = a.sampleRate * dur, b = a.createBuffer(1, n, a.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = a.createBufferSource(); s.buffer = b; const bp = a.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.6; const g = a.createGain();
    g.gain.setValueAtTime(gain, a.currentTime); g.gain.exponentialRampToValueAtTime(0.001, a.currentTime + dur); s.connect(bp); bp.connect(g); g.connect(master); s.start(); return s; };
  const tone = (f0, f1, dur, gain = 0.12, at = 0) => { const a = audio(); if (!a) return; const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + at;
    o.type = 'square'; o.frequency.setValueAtTime(f0, t); o.frequency.linearRampToValueAtTime(f1, t + dur); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02); };
  const sfx = {
    click: () => { noise(0.05, 0.5, 2600); tone(1500, 1500, 0.03, 0.06); },
    beep: () => { tone(1250, 1250, 0.09, 0.08); tone(950, 950, 0.12, 0.08, 0.1); }, // the "roger" beep
    static: (d = 0.35) => noise(d, 0.22),
    on: () => { tone(400, 1100, 0.25, 0.07); noise(0.5, 0.18); },
    off: () => { tone(900, 250, 0.3, 0.07); },
    alert: () => { tone(880, 880, 0.15, 0.1); tone(660, 660, 0.15, 0.1, 0.18); },
  };

  // ---------- the display ----------
  const canvas = $('.rd-wave'), g2 = canvas.getContext('2d'); let micAn = null;
  function drawWave(t) {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w) return;
    if (canvas.width !== w * devicePixelRatio) { canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio; }
    g2.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); g2.clearRect(0, 0, w, h);
    const src = st.tx && micAn ? micAn : analyser, n = 96, arr = new Uint8Array(src ? src.fftSize : 0); if (src) src.getByteTimeDomainData(arr);
    const live = (st.tx || st.playing) && src, col = st.tx ? '#FFC531' : st.power ? '#6EE7C5' : 'rgba(255,255,255,0.35)';
    g2.strokeStyle = col; g2.lineWidth = 2; g2.lineCap = 'round'; g2.beginPath();
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * w;
      const v = live ? (arr[Math.floor(i / n * arr.length)] - 128) / 128 * 2.2 : st.power ? Math.sin(i * 0.5 + t * 3) * 0.03 + (Math.random() - 0.5) * 0.05 : 0;
      const y = h / 2 + Math.max(-1, Math.min(1, v)) * h * 0.42; i ? g2.lineTo(x, y) : g2.moveTo(x, y); }
    g2.stroke();
  }
  const inRange = () => { const c = chan(), me = playerPos(); if (st.mode !== 'marine') return 0;
    if (c.global) return glob?.people() || 0; return (online?.list() || []).filter(p => Math.hypot(p.st.x - me.x, p.st.z - me.z) <= c.range).length; };
  const cpuInRange = () => { if (!cpu || st.mode !== 'marine' || chan().global) return []; const me = playerPos(), now = Date.now(), r = chan().range;
    return ROSTER.map(c => ({ c, s: stateAt(c, now) })).filter(q => q.s && Math.hypot(q.s.x - me.x, q.s.z - me.z) <= r); };
  function paint() { paintTop(); paintDial(); paintGate(); paintFeed(); paintCtrl(); }
  function paintTop() {
    root.classList.toggle('off', !st.power); fab.classList.toggle('on', st.power);
    root.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === st.mode));
    const c = chan(), me = playerPos();
    if (st.mode === 'music') { $('.rd-ch small').textContent = 'FM'; $('.rd-ch b').textContent = '♪'; $('.rd-name').textContent = 'Music'; $('.rd-sub').textContent = 'Spotify · coming soon'; }
    else if (st.mode === 'direct') { $('.rd-ch small').textContent = 'DM'; $('.rd-ch b').textContent = '1:1';
      $('.rd-name').textContent = st.target ? st.target.name : 'Pick a captain'; $('.rd-sub').textContent = st.target ? (st.target.live ? 'Captain · online now' : 'Local sailor · answers in text') : 'Talk to one captain'; }
    else { $('.rd-ch small').textContent = 'CH'; $('.rd-ch b').textContent = String(c.n).padStart(2, '0'); $('.rd-name').textContent = c.name;
      const n = inRange(), k = cpuInRange().length; $('.rd-sub').textContent = `${c.label} · ${n ? `${n} captain${n === 1 ? '' : 's'}` : 'no captains'}${k ? ` · ${k} local sailor${k === 1 ? '' : 's'}` : ''} in range`; }
    const sig = !st.power ? 0 : st.mode === 'music' ? 0 : st.mode === 'direct' ? (st.target ? 4 : 1) : Math.min(4, 1 + inRange() + Math.min(2, cpuInRange().length));
    root.querySelectorAll('.rd-sig i').forEach((e, i) => e.classList.toggle('on', i < sig));
    fab.querySelector('.rf-ch').textContent = st.mode === 'marine' ? `CH ${String(c.n).padStart(2, '0')}` : st.mode === 'direct' ? 'DM' : 'FM';
    void me;
  }
  function paintDial() {
    const d = $('.rd-dial');
    if (st.mode === 'marine') d.innerHTML = `<button type="button" class="rd-step" data-step="-1" aria-label="Previous channel">‹</button><div class="rd-chs">${CH.map((c, i) => `<button type="button" data-ch="${i}" class="${i === st.ch ? 'on' : ''}"><b>${String(c.n).padStart(2, '0')}</b><span>${c.label.split(' · ')[0]}</span></button>`).join('')}</div><button type="button" class="rd-step" data-step="1" aria-label="Next channel">›</button>`;
    else if (st.mode === 'direct') {
      const me = playerPos(), people = (online?.list() || []).map(p => ({ id: 'u:' + p.id, uid: p.id, name: p.name, live: true, colours: p.colours, d: Math.hypot(p.st.x - me.x, p.st.z - me.z) }));
      const locals = cpu ? ROSTER.map(c => ({ c, s: stateAt(c, Date.now()) })).filter(q => q.s).map(q => ({ id: q.c.id, name: q.c.name, live: false, colours: q.c.colours, c: q.c, d: Math.hypot(q.s.x - me.x, q.s.z - me.z) })) : [];
      const list = [...people.sort((a, b) => a.d - b.d), ...locals.sort((a, b) => a.d - b.d)].slice(0, 14);
      d.innerHTML = list.length ? `<div class="rd-people">${list.map(p => `<button type="button" data-to="${esc(p.id)}" class="${st.target?.id === p.id ? 'on' : ''}${p.live ? ' live' : ''}"><i style="background:${colourOf(p)}"></i><b>${esc(first(p.name))}</b><span>${p.d < 950 ? Math.round(p.d) + ' m' : (p.d / 1000).toFixed(1) + ' km'}</span></button>`).join('')}</div>`
        : '<p class="rd-empty">No one is out on the water right now.</p>';
      d._list = list;
    } else d.innerHTML = `<p class="rd-music">Play your own Spotify while you sail. Sailo’s Spotify connection is on its way: until then, keep your music playing in the Spotify app and the radio will sit quietly alongside it.</p>`;
  }
  function paintGate() {
    const gate = $('.rd-gate'), need = st.mode !== 'music' && !st.voices;
    gate.hidden = !need; root.classList.toggle('gated', need);
    if (need) gate.innerHTML = `<p><b>Talk with other captains?</b> Turn on radio voices to hear captains in range and talk back. Voices go out live and aren’t kept.</p><button type="button" class="rd-optin">Turn on radio voices</button>`;
  }
  const ago = t => { const s = Math.round((Date.now() - t) / 1000); return s < 50 ? 'now' : s < 3600 ? `${Math.round(s / 60)} min` : `${Math.floor(s / 3600)} h`; };
  function paintFeed() {
    const f = $('.rd-feed'), rows = st.feed.filter(e => st.mode === 'direct' ? e.direct : !e.direct && e.ch === chan().n).slice(-24).reverse();
    f.innerHTML = st.mode === 'music' ? '' : rows.length ? rows.map(e => `<div class="rd-row${e.me ? ' me' : ''}${e.sos ? ' sos' : ''}" data-k="${e.k}"><i style="background:${e.colour}"></i>
      <div><b>${esc(e.who)}${e.tag ? ` <em>${e.tag}</em>` : ''}</b><span>${e.text ? '“' + esc(e.text) + '”' : `Voice · ${e.dur.toFixed(1)} s`}</span></div>
      <time>${ago(e.t)}</time>${e.clip ? `<button type="button" class="rd-replay" data-play="${e.k}" aria-label="Play again">▶</button>` : ''}${e.uid && !e.me ? `<button type="button" class="rd-mute" data-mute="${esc(e.uid)}">${st.muted.has(e.uid) ? 'Unmute' : 'Mute'}</button>` : ''}</div>`).join('')
      : `<p class="rd-empty">${st.mode === 'direct' ? 'Pick a captain, then hold the mic to talk.' : 'Quiet on this channel. Hold the mic to call out.'}</p>`;
  }
  function paintCtrl() {
    const b = $('.rd-ptt'), s = $('.rd-state'), off = !st.power || st.mode === 'music' || !st.voices || (st.mode === 'direct' && !st.target);
    b.disabled = off; b.classList.toggle('tx', !!st.tx);
    const busy = st.busy && Date.now() < st.busy.until && st.mode === 'marine';
    s.querySelector('b').textContent = st.tx ? `On air · ${Math.min(MAX_TX, (performance.now() - st.tx.t0) / 1000).toFixed(1)} s` : busy ? `${first(st.busy.name)} is talking` : st.playing ? `Receiving · ${first(st.playing.who)}` : !st.power ? 'Radio off' : st.mode === 'music' ? 'Music' : 'Hold to talk';
    s.querySelector('small').textContent = st.tx ? 'Release to send' : busy ? 'Wait for the channel to clear' : !st.power ? 'Tap power to switch on' : st.mode === 'direct' && !st.target ? 'Pick a captain first' : st.mode === 'music' ? '' : `Up to ${MAX_TX} s`;
    $('.rd-vol input').value = st.vol;
  }

  // ---------- the feed and playback ----------
  let k = 0;
  const post = e => { e.k = ++k; e.t = e.t || Date.now(); st.feed.push(e); if (st.feed.length > 80) { const old = st.feed.shift(); if (old.url) URL.revokeObjectURL(old.url); } if (st.open) paintFeed(); };
  async function play(e) {
    const a = audio(); if (!a || !e.buf) return;
    if (st.playing) { st.queue.push(e); return; }
    st.playing = e; fab.classList.add('rx'); paintCtrl();
    try { const b = await a.decodeAudioData(e.buf.slice(0)); sfx.static(0.25); await new Promise(r => setTimeout(r, 220));
      const s = a.createBufferSource(); s.buffer = b; s.connect(voiceIn); const hiss = noise(b.duration + 0.1, 0.03, 2200); s.start(); void hiss;
      await new Promise(r => { s.onended = r; }); sfx.beep(); }
    catch { /* a clip this browser can't decode */ }
    st.playing = null; fab.classList.remove('rx'); paintCtrl();
    const nx = st.queue.sort((x, y) => (y.direct ? 1 : 0) - (x.direct ? 1 : 0)).shift(); if (nx) play(nx); // (direct calls first)
  }
  // a captain's transmission: the clip, or the "keying up" note that comes first
  function heard(kind, p, d) {
    if (!st.power || !st.voices || !p?.id || st.muted.has(p.id)) return;
    const direct = !!d.to, ch = +d.ch, me = playerPos(), c = CH.find(q => q.n === ch);
    if (!direct) { if (st.mode !== 'marine' || ch !== chan().n || !c) return;
      if (!c.global && Number.isFinite(+d.x) && Math.hypot(+d.x - me.x, +d.z - me.z) > c.range) return; }
    if (kind === 'key') { st.busy = { name: p.name, until: Date.now() + (MAX_TX + 2) * 1000 }; paintCtrl(); return; }
    if (kind !== 'clip' || typeof d.clip !== 'string' || d.clip.length > 360000) return;
    const now = Date.now(), h = (st.heardBy.get(p.id) || []).filter(t => now - t < 60000); if (h.length >= 12) return; h.push(now); st.heardBy.set(p.id, h); // (a flood is dropped)
    st.busy = null;
    let buf; try { buf = fromB64(d.clip); } catch { return; }
    const e = { who: p.name, uid: p.id, colour: colourOf(p), tag: direct ? 'to you' : '', ch, direct, dur: Math.min(MAX_TX, +d.dur || 0), buf, clip: true };
    post(e); play(e);
    if (direct && !st.open) fab.classList.add('ping');
  }

  // ---------- push to talk ----------
  let rec = null, stream = null;
  const mimeOf = () => ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find(m => window.MediaRecorder?.isTypeSupported?.(m)) || '';
  async function txStart() {
    if (st.tx || !st.power || !st.voices || st.mode === 'music' || (st.mode === 'direct' && !st.target)) return;
    if (st.mode === 'marine' && st.busy && Date.now() < st.busy.until) { sfx.static(0.2); return; } // half-duplex: one voice at a time
    if (Date.now() - st.lastTx < GAP_TX) return;
    if (!window.MediaRecorder || !navigator.mediaDevices?.getUserMedia) { note('This browser can’t use the microphone.'); return; }
    st.tx = { t0: performance.now(), pending: true }; paintCtrl(); audio();
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } }); }
    catch { st.tx = null; paintCtrl(); note('The microphone is blocked. Allow it for Sailo in your browser settings to talk on the radio.'); return; }
    if (!st.tx) { stream.getTracks().forEach(t => t.stop()); return; } // (released while the mic was being asked for)
    const chunks = [], mime = mimeOf();
    rec = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 16000 });
    rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
    rec.onstop = () => send(chunks, rec.mimeType || mime);
    rec.start(); st.tx.pending = false; st.tx.t0 = performance.now(); sfx.click();
    const src = ac.createMediaStreamSource(stream); micAn = ac.createAnalyser(); micAn.fftSize = 512; src.connect(micAn);
    target()?.radio('key', txMeta());
    st.tx.stop = setTimeout(txEnd, MAX_TX * 1000);
  }
  function txEnd() {
    if (!st.tx) return; clearTimeout(st.tx.stop); const t = st.tx; st.tx = null;
    if (rec && rec.state !== 'inactive') { rec._dur = (performance.now() - t.t0) / 1000; rec.stop(); } sfx.click();
    stream?.getTracks().forEach(x => x.stop()); stream = null; micAn = null; paintCtrl();
  }
  const target = () => st.mode === 'direct' ? (st.target?.live ? online : null) : live();
  const txMeta = () => { const me = playerPos(); return { ch: chan().n, x: Math.round(me.x), z: Math.round(me.z), ...(st.mode === 'direct' && st.target?.live ? { to: st.target.uid } : {}) }; };
  async function send(chunks, mime) {
    const dur = rec?._dur || 0; rec = null; if (dur < MIN_TX || !chunks.length) return;
    st.lastTx = Date.now();
    const blob = new Blob(chunks, { type: mime }), buf = await blob.arrayBuffer();
    const meta = txMeta(), direct = st.mode === 'direct';
    post({ who: 'You', me: true, colour: '#FFC531', ch: meta.ch, direct, tag: direct && st.target ? `to ${first(st.target.name)}` : '', dur, buf, clip: true });
    const via = target(); if (via) via.radio('clip', { ...meta, clip: toB64(buf), mime, dur: +dur.toFixed(1) });
    sfx.beep(); answer(direct);
  }
  // the local sailors in range sometimes answer a call (or always, when you called one of them)
  function answer(direct) {
    if (!cpu) return; const you = first(playerName());
    let c = direct ? (st.target && !st.target.live ? st.target.c : null) : null;
    if (!direct) { const near = cpuInRange(); if (!near.length || Math.random() > 0.6) return; c = pick(near).c; }
    if (!c) return;
    setTimeout(() => { if (!st.power) return; sfx.static(0.3); post({ who: c.name, colour: colourOf(c), tag: 'Local sailor', ch: chan().n, direct, text: voiceLine(c, 'wave', you).replace(/^Hm\. /, '') + ' Over.' }); sfx.beep(); },
      2200 + Math.random() * 2600);
  }
  // ...and chatter on their own: what they're actually doing, where
  let chatT = Date.now() + 9000;
  function chatter() {
    if (Date.now() < chatT || !st.power || st.mode !== 'marine') return; chatT = Date.now() + 35000 + Math.random() * 45000;
    const near = cpuInRange(); if (!near.length) return;
    const { c, s } = pick(near), at = placeNear(s.x, s.z), fish = fishNameOf(pick(c.fav));
    const text = s.kind === 'fish' ? pick([`${first(c.name)} here, ${fish} biting near ${at}. Plenty to go round.`, `Anchored off ${at}, the ${fish} are coming up nicely.`, `Birds working the water near ${at}. Over.`])
      : s.kind === 'sell' ? pick(['At Paradise Station selling the catch. Fair prices today.', 'Hold’s empty again, prices are good at the market.'])
      : s.next === 'sell' ? pick([`Heading in to Paradise Station, hold’s full. Over.`, `Inbound to the station from ${at}.`])
      : s.next === 'home' ? `Heading home to ${c.home}. Good sailing, everyone.` : pick([`Radio check on ${String(chan().n).padStart(2, '0')}. Lovely breeze out by ${at}.`, `Off to try my luck near ${at}.`]);
    sfx.static(0.3); post({ who: c.name, colour: colourOf(c), tag: 'Local sailor', ch: chan().n, text }); if (st.open) sfx.beep();
    fleet?.say(c.id, '📻 ' + text.slice(0, 60) + (text.length > 60 ? '…' : ''), 6000);
  }

  // ---------- power, modes, channels ----------
  function setPower(on, quiet) {
    if (on === st.power) return; st.power = on; if (!on) { txEnd(); st.queue.length = 0; }
    if (!quiet) { on ? sfx.on() : sfx.off(); } fab.hidden = !on || st.open;
    tuneGlobal(); paint();
  }
  function tuneGlobal() { const want = st.power && st.mode === 'marine' && chan().global && st.voices;
    if (want && !glob) glob = makeGlobal?.((kind, p, d) => heard(kind, p, d)) || null; } // (stays joined once tuned)
  function setMode(m) { if (m === st.mode) return; st.mode = m; keep(); if (st.power) sfx.static(0.25); tuneGlobal(); paint(); }
  function setCh(i) { st.ch = (i + CH.length) % CH.length; st.busy = null; keep(); if (st.power) sfx.static(0.3); tuneGlobal(); paint(); }
  function open(mode) {
    audio(); if (mode) setMode(mode); if (!st.power) setPower(true);
    st.open = true; root.hidden = false; document.body.classList.add('radio-open'); fab.hidden = true; fab.classList.remove('ping'); requestAnimationFrame(() => root.classList.add('open')); paint();
  }
  function close() { if (!st.open) return; txEnd(); st.open = false; root.classList.remove('open'); document.body.classList.remove('radio-open'); setTimeout(() => { if (!st.open) root.hidden = true; }, 320); fab.hidden = !st.power; }
  /** Talk to one captain: { id, name, live, uid?, colours, c? } (from their card). */
  function openDirect(p) { st.target = p.live ? { id: p.id, uid: p.uid, name: p.name, live: true, colours: p.colours } : { id: p.id, name: p.name, live: false, colours: p.colours, c: p };
    open('direct'); }

  // ---------- controls ----------
  fab.addEventListener('click', () => open());
  $('.rd-close').addEventListener('click', close);
  $('.rd-power').addEventListener('click', () => setPower(!st.power));
  $('.rd-modes').addEventListener('click', e => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  $('.rd-dial').addEventListener('click', e => { const s = e.target.closest('[data-step]'), c = e.target.closest('[data-ch]'), t = e.target.closest('[data-to]');
    if (s) setCh(st.ch + +s.dataset.step); else if (c) setCh(+c.dataset.ch);
    else if (t) { const p = $('.rd-dial')._list.find(q => q.id === t.dataset.to); if (p) { st.target = p; if (st.power) sfx.static(0.2); paint(); } } });
  $('.rd-gate').addEventListener('click', e => { if (e.target.closest('.rd-optin')) { st.voices = true; keep(); audio(); sfx.on(); tuneGlobal(); paint(); } });
  $('.rd-feed').addEventListener('click', e => { const p = e.target.closest('[data-play]'), m = e.target.closest('[data-mute]');
    if (p) { const ev = st.feed.find(q => q.k === +p.dataset.play); if (ev) play(ev); }
    if (m) { const id = m.dataset.mute; st.muted.has(id) ? st.muted.delete(id) : st.muted.add(id); keep(); paintFeed(); } });
  $('.rd-vol input').addEventListener('input', e => { st.vol = +e.target.value; if (master) master.gain.value = st.vol; keep(); });
  const ptt = $('.rd-ptt');
  ptt.addEventListener('pointerdown', e => { e.preventDefault(); ptt.setPointerCapture?.(e.pointerId); txStart(); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => ptt.addEventListener(ev, txEnd));
  ptt.addEventListener('contextmenu', e => e.preventDefault());
  // Space is push-to-talk while the radio is open
  addEventListener('keydown', e => { if (st.open && e.code === 'Space' && !e.repeat && !e.target.closest?.('input')) { e.preventDefault(); e.stopImmediatePropagation(); txStart(); } }, true);
  addEventListener('keyup', e => { if (st.open && e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); txEnd(); } }, true);
  // a tap on the sea (not on the radio or its button) closes it
  addEventListener('pointerdown', e => { if (st.open && !root.querySelector('.rd-body').contains(e.target) && !fab.contains(e.target) && !e.target.closest?.('#boatmenu')) close(); }, true);
  const note = t => { const n = document.getElementById('nk-note'); if (!n) return; n.querySelector('p').textContent = t; n.classList.remove('show'); void n.offsetWidth; n.classList.add('show'); setTimeout(() => n.classList.remove('show'), 6000); };

  // ---------- every frame ----------
  let paintT = 0, sailed = false, slow = 0;
  function update(t, { moving }) {
    if (moving && !sailed) { sailed = true; if (st.auto && !st.power) setPower(true); } // the radio comes on as you start sailing
    chatter();
    if (st.open) { drawWave(t); if (performance.now() > paintT) { paintT = performance.now() + (st.tx ? 100 : 1000); paintCtrl(); if (!st.tx) { paintTop(); if (++slow % 4 === 0 && st.mode === 'direct') paintDial(); } } }
  }
  return { update, open, close, openDirect, heard, setPower, get power() { return st.power; } };
}
