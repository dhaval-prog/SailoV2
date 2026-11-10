// The radio's saved side (radio-net.js), built on radio.js's hooks:
// - SOS: an in-game help request with an optional voice message. Captains on the chart get an alert card
//   (play, respond, navigate, dismiss, report), a pulsing red marker on the map and a red ring round the boat.
//   It lasts 15 minutes; the database allows one every 10 minutes and five a day. It is clearly not a real
//   distress call and says so.
// - Blocking (enforced by the database) and reports.
import * as net from './radio-net.js';
import { placeNear, ROSTER, stateAt } from './cpu-captains.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const first = n => String(n || 'Captain').split(' ')[0];
const ago = t => { const s = Math.round((Date.now() - Date.parse(t)) / 1000); return s < 50 ? 'now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
const dist = d => d < 950 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
const MAX_REC = 15;
const REASONS = { spam: 'Spam', abuse: 'Abuse', fake_sos: 'Fake SOS', other: 'Something else' };

export function createRadioHelp({ radio, online, chartId, chartName, playerPos, playerName, fleet, hud, pinCourse, cpu }) {
  const ui = radio.ui, H = ui.hooks;
  if (!online) return { heard() {}, update() {} }; // (signed-in captains only)
  const meId = online.me, blocked = new Set();
  const placeOf = (x, z) => placeNear(x, z) || chartName;
  net.blocks().then(b => b.forEach(id => { blocked.add(id); ui.muted.add(id); })).catch(() => {});

  // ---------- a recorder for a message or an SOS (hold the mic) ----------
  function recorder(box, onChange) {
    let ctl = null, clip = null, holding = false, timer = 0; const btn = box.querySelector('.rd-ptt'), state = box.querySelector('.rd-state');
    const paint = () => { btn.classList.toggle('tx', !!ctl); state.querySelector('b').textContent = ctl ? `Recording · ${((performance.now() - ctl.t0) / 1000).toFixed(1)} s` : clip ? `Recorded · ${clip.dur.toFixed(1)} s` : 'Hold to record';
      state.querySelector('small').textContent = ctl ? 'Release to stop' : clip ? 'Hold again to record over it' : `Up to ${MAX_REC} s`; };
    const start = async e => { e.preventDefault(); btn.setPointerCapture?.(e.pointerId); if (ctl || holding) return; holding = true;
      const c = await ui.micStart(); if (!c) { holding = false; return; } if (!holding) { c.stop(); return; }
      ctl = c; ui.sfx.click(); timer = setInterval(paint, 100); setTimeout(() => { if (ctl === c) stop(); }, MAX_REC * 1000); paint(); };
    const stop = async () => { holding = false; if (!ctl) return; const c = ctl; ctl = null; clearInterval(timer); ui.sfx.click();
      const r = await c.stop(); if (r.dur >= 0.4 && r.buf.byteLength) clip = r; paint(); onChange?.(clip); };
    btn.addEventListener('pointerdown', start); ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => btn.addEventListener(ev, stop));
    btn.addEventListener('contextmenu', e => e.preventDefault()); paint();
    return { get clip() { return clip; }, preview: () => clip && ui.playClip(clip.buf, 'You'), clear: () => { clip = null; paint(); onChange?.(null); } };
  }
  const recBox = label => `<div class="rd-rec"><button type="button" class="rd-ptt" aria-label="${esc(label)}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/></svg></button><div class="rd-state"><b></b><small></small></div></div>`;
  const err = (v, e) => { const p = v.querySelector('.rd-err'); p.textContent = e?.message || 'The harbour didn’t answer. Try again?'; p.hidden = false; };

  // ---------- SOS ----------
  let sos = [], mine = null, shown = new Set(), dismissed = new Set();
  const card = document.createElement('div'); card.id = 'sos-card'; card.hidden = true; card.setAttribute('role', 'alertdialog'); document.body.appendChild(card);
  ['pointerdown', 'pointerup', 'click'].forEach(ev => card.addEventListener(ev, e => e.stopPropagation()));
  async function refreshSOS() {
    let list; try { list = await net.activeSOS(chartId); } catch { return; }
    sos = list.filter(s => !blocked.has(s.sender));
    mine = sos.find(s => s.sender === meId) || null;
    const fresh = sos.filter(s => s.sender !== meId && !shown.has(s.id)); fresh.forEach(s => shown.add(s.id));
    if (fresh.length) { alertFor(fresh[0]); }
    if (card.dataset.id && !sos.some(s => s.id === card.dataset.id)) hideCard();
    fleet?.setAlert?.(new Set(sos.filter(s => s.sender !== meId).map(s => 'u:' + s.sender)));
  }
  function alertFor(s) {
    ui.sfx.alert(); setTimeout(() => ui.sfx.alert(), 450); showCard(s);
  }
  function showCard(s, reportOpen = false) {
    const me = playerPos(), d = Math.hypot(s.x - me.x, s.z - me.z);
    card.dataset.id = s.id; card.hidden = false; card.classList.remove('in'); void card.offsetWidth; card.classList.add('in');
    card.innerHTML = `<div class="sos-head"><span class="sos-dot" aria-hidden="true"></span><b>SOS · ${esc(s.sender_name)}</b><time>${ago(s.created_at)}</time></div>
      <p>Needs help near <b>${esc(s.place || placeOf(s.x, s.z))}</b> · ${dist(d)} away</p>
      <div class="sos-acts">${s.dur ? '<button type="button" data-a="play">▶ Play message</button>' : ''}<button type="button" data-a="nav" class="on">Navigate</button><button type="button" data-a="respond">Respond</button><button type="button" data-a="dismiss">Dismiss</button><button type="button" data-a="report">Report</button></div>
      ${reportOpen ? `<div class="rd-why"><span>Report for</span>${['fake_sos', 'abuse', 'spam'].map(r => `<button type="button" data-r="${r}">${REASONS[r]}</button>`).join('')}</div>` : ''}
      <small class="sos-fine">An in-game help request from another Sailo captain.</small>`;
  }
  const hideCard = () => { card.hidden = true; delete card.dataset.id; };
  card.addEventListener('click', async e => {
    const s = sos.find(q => q.id === card.dataset.id); if (!s) { hideCard(); return; }
    const a = e.target.closest('[data-a]')?.dataset.a, r = e.target.closest('[data-r]')?.dataset.r;
    if (r) { try { await net.report({ reported: s.sender, reason: r, sos_id: s.id, context: s.place }); ui.note('Thanks. The report is in.'); } catch (x) { ui.note(x.message); } dismissed.add(s.id); hideCard(); return; }
    if (a === 'play') { try { const c = await net.sosClip(s.id); if (c?.clip) ui.playClip(ui.b64.fromB64(c.clip), s.sender_name); } catch (x) { ui.note(x.message); } }
    else if (a === 'nav') { pinCourse(s.x, s.z); hideCard(); ui.note(`Course set for ${first(s.sender_name)}. Follow the line on the water.`); }
    else if (a === 'respond') { hideCard(); radio.openDirect({ id: 'u:' + s.sender, uid: s.sender, name: s.sender_name, live: true, colours: {} }); }
    else if (a === 'dismiss') { dismissed.add(s.id); hideCard(); }
    else if (a === 'report') showCard(s, true);
  });
  // on the map: pulsing red markers (yours too); tap one for its card
  hud.setSOS?.(() => sos.map(s => ({ id: s.id, x: s.x, z: s.z, name: s.sender_name, mine: s.sender === meId })), id => { const s = sos.find(q => q.id === id); if (s && s.sender !== meId) showCard(s); });

  // the SOS screen on the radio
  H.sos = () => {
    radio.open(); const me = playerPos(), at = placeOf(me.x, me.z);
    if (mine && Date.parse(mine.expires_at) > Date.now()) {
      const left = Math.max(0, Math.round((Date.parse(mine.expires_at) - Date.now()) / 60000));
      const v = ui.view(`<h3 class="sos">SOS active</h3><p class="rd-v-sub">Captains on ${esc(chartName)} can see you near <b>${esc(mine.place || at)}</b> for about ${left} more minute${left === 1 ? '' : 's'}.</p>
        <div class="rd-acts"><button type="button" class="rd-danger rd-end">I’m OK · cancel SOS</button><button type="button" class="rd-ghost rd-cancel">Back</button></div><p class="rd-err" hidden></p>`);
      v.querySelector('.rd-cancel').addEventListener('click', () => ui.view(null));
      v.querySelector('.rd-end').addEventListener('click', async () => { try { await net.resolveSOS(mine.id); online.radio('sos', { end: mine.id }); mine = null; ui.view(null); ui.note('SOS cancelled. Glad you’re OK.'); refreshSOS(); } catch (x) { err(v, x); } });
      return;
    }
    const v = ui.view(`<h3 class="sos">Request help</h3>
      <p class="rd-v-sub">Captains on ${esc(chartName)} will see your boat near <b>${esc(at)}</b> on their map for 15 minutes, and can sail to you or answer on the radio.</p>
      ${recBox('Hold to add a voice message')}
      <p class="rd-fine">This is in-game help between Sailo captains. It doesn’t contact the coastguard or any emergency service. In a real emergency, call your local emergency number.</p>
      <p class="rd-err" hidden></p>
      <div class="rd-acts"><button type="button" class="rd-danger">Send SOS</button><button type="button" class="rd-ghost rd-prev" hidden>▶ Preview</button><button type="button" class="rd-ghost rd-cancel">Cancel</button></div>`);
    const prev = v.querySelector('.rd-prev'), rec = recorder(v.querySelector('.rd-rec'), c => { prev.hidden = !c; });
    v.querySelector('.rd-rec .rd-state small').textContent = 'Optional · up to 15 s';
    prev.addEventListener('click', () => rec.preview());
    v.querySelector('.rd-cancel').addEventListener('click', () => ui.view(null));
    v.querySelector('.rd-danger').addEventListener('click', async ev => {
      const b = ev.currentTarget; b.disabled = true; b.textContent = 'Sending…';
      const c = rec.clip, me2 = playerPos();
      try { const r = await net.sendSOS({ sender_name: String(playerName() || 'Captain').slice(0, 18), chart: chartId, x: Math.round(me2.x), z: Math.round(me2.z), place: at.slice(0, 60),
          ...(c ? { clip: ui.b64.toB64(c.buf), mime: c.mime, dur: +c.dur.toFixed(1) } : {}) });
        mine = { ...r, place: at, x: me2.x, z: me2.z, sender: meId }; online.radio('sos', { sos: r.id }); ui.sfx.alert(); ui.view(null);
        ui.note('SOS sent. Captains on this chart can see you on their map for 15 minutes.'); refreshSOS(); localAnswer(at); }
      catch (x) { b.disabled = false; b.textContent = 'Send SOS'; err(v, x); }
    });
  };
  // in Pune, the nearest local sailor answers an SOS on the radio
  function localAnswer(at) {
    if (!cpu) return; const me = playerPos(), now = Date.now();
    const near = ROSTER.map(c => ({ c, s: stateAt(c, now) })).filter(q => q.s).map(q => ({ ...q, d: Math.hypot(q.s.x - me.x, q.s.z - me.z) })).sort((a, b) => a.d - b.d)[0];
    if (!near) return;
    setTimeout(() => { const from = placeOf(near.s.x, near.s.z), text = `Mayday received, ${first(playerName())}. ${first(near.c.name)} here, ${dist(near.d)} off near ${from}. Hold tight by ${at}, other captains will see you on the map. Over.`;
      ui.sfx.static(0.3); ui.post({ who: near.c.name, colour: near.c.colours.sail || near.c.colours.hull || '#fff', tag: 'Local sailor', ch: 16, text }); ui.sfx.beep();
      fleet?.say(near.c.id, '📻 Mayday received!', 6000); ui.note(`${first(near.c.name)} answered your SOS on channel 16.`); }, 3500);
  }

  // ---------- live pings from the channel (online.js) ----------
  function heardLive(kind, p, d) {
    if (blocked.has(p?.id)) return;
    if (kind === 'sos') refreshSOS();
  }

  refreshSOS();
  let tickT = Date.now() + 45000;
  function update() {
    if (Date.now() < tickT) return; tickT = Date.now() + 45000; refreshSOS();
    if (!card.hidden) { const s = sos.find(q => q.id === card.dataset.id); if (s) card.querySelector('time').textContent = ago(s.created_at); }
  }
  return { heard: heardLive, update };
}
