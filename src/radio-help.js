// The radio's saved side (radio-net.js), built on radio.js's hooks:
// - SOS: an in-game help request with an optional voice message. Captains on the chart get an alert card
//   (play, respond, navigate, dismiss, report), a pulsing red marker on the map and a red ring round the boat.
//   It lasts 15 minutes; the database allows one every 10 minutes and five a day. It is clearly not a real
//   distress call and says so.
// - Messages: voice messages (record, preview, send), texts and invites to sail together, kept for the
//   recipient for 7 days, so they reach captains who've gone ashore. The radio's Messages tab lists them.
// - Blocking (enforced by the database: a captain who blocks you can't message you) and reports.
import * as net from './radio-net.js';
import { placeNear, ROSTER, stateAt } from './cpu-captains.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const first = n => String(n || 'Captain').split(' ')[0];
const ago = t => { const s = Math.round((Date.now() - Date.parse(t)) / 1000); return s < 50 ? 'now' : s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86400 ? `${Math.floor(s / 3600)} h ago` : `${Math.floor(s / 86400)} d ago`; };
const dist = d => d < 950 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`;
const MAX_REC = 15;
const REASONS = { spam: 'Spam', abuse: 'Abuse', fake_sos: 'Fake SOS', other: 'Something else' };

export function createRadioHelp({ radio, online, chartId, chartName, playerPos, playerName, fleet, hud, pinCourse, cpu, myScreen }) {
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

  // a glowing signal from your boat to theirs, when they're in view
  function fly(toId) {
    const tag = document.querySelector(`.cpu-tag[data-id="${CSS.escape(toId)}"]:not([hidden])`), from = myScreen?.(); if (!tag || !from) return;
    const r = tag.getBoundingClientRect(), dot = document.createElement('i'); dot.className = 'rd-fly'; document.body.appendChild(dot);
    dot.animate([{ transform: `translate(${from[0]}px, ${from[1]}px) scale(0.6)`, opacity: 0 }, { opacity: 1, offset: 0.15 }, { transform: `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px) scale(1.2)`, opacity: 0 }],
      { duration: 1300, easing: 'cubic-bezier(0.3, 0.6, 0.2, 1)' }).onfinish = () => dot.remove();
  }

  // ---------- writing a message: voice, text or an invite ----------
  /** to: { uid, name } (a real captain). kind: 'voice' | 'text' | 'invite' */
  function compose(kind, to) {
    radio.open('inbox'); const who = first(to.name), me = playerPos(), at = placeOf(me.x, me.z);
    const head = { voice: `Voice message to ${esc(who)}`, text: `Message ${esc(who)}`, invite: `Invite ${esc(who)} to sail together` }[kind];
    const body = kind === 'voice' ? `<p class="rd-v-sub">Hold the mic to record, up to ${MAX_REC} seconds. ${esc(who)} can listen any time in the next 7 days.</p>${recBox('Hold to record')}`
      : kind === 'text' ? `<label class="rd-text"><textarea maxlength="200" rows="3" placeholder="Ahoy ${esc(who)}!"></textarea><small><span>0</span> / 200</small></label>`
      : `<p class="rd-v-sub">${esc(who)} gets your spot near <b>${esc(at)}</b> and can pin a course straight to you.</p>`;
    const v = ui.view(`<h3>${head}</h3>${body}<p class="rd-err" hidden></p>
      <div class="rd-acts"><button type="button" class="rd-primary" ${kind === 'voice' ? 'disabled' : ''}>${kind === 'invite' ? 'Send invite' : 'Send'}</button>${kind === 'voice' ? '<button type="button" class="rd-ghost rd-prev" hidden>▶ Preview</button>' : ''}<button type="button" class="rd-ghost rd-cancel">Cancel</button></div>`);
    const send = v.querySelector('.rd-primary'), prev = v.querySelector('.rd-prev');
    const rec = kind === 'voice' ? recorder(v.querySelector('.rd-rec'), c => { send.disabled = !c; prev.hidden = !c; }) : null;
    const ta = v.querySelector('textarea'); if (ta) { ta.addEventListener('input', () => { v.querySelector('.rd-text span').textContent = ta.value.length; }); setTimeout(() => ta.focus(), 300); }
    prev?.addEventListener('click', () => rec.preview());
    v.querySelector('.rd-cancel').addEventListener('click', () => ui.view(null));
    send.addEventListener('click', async () => {
      const text = ta?.value.trim(); if (kind === 'text' && !text) return;
      send.disabled = true; send.textContent = 'Sending…';
      const m = { sender_name: String(playerName() || 'Captain').slice(0, 18), recipient: to.uid, kind, chart: chartId, x: Math.round(me.x), z: Math.round(me.z),
        ...(kind === 'text' ? { body: text } : {}), ...(kind === 'invite' ? { body: at } : {}),
        ...(kind === 'voice' ? { clip: ui.b64.toB64(rec.clip.buf), mime: rec.clip.mime, dur: +rec.clip.dur.toFixed(1) } : {}) };
      try { await net.sendMessage(m); online.radio('msg', { to: to.uid }); fly('u:' + to.uid); ui.sfx.beep(); ui.view(null);
        ui.note(kind === 'invite' ? `Invite sent to ${who}.` : `Sent to ${who}. They’ll get it even if they’ve gone ashore.`); }
      catch (e) { send.disabled = false; send.textContent = 'Send'; err(v, e); }
    });
  }

  // ---------- the Messages tab ----------
  let msgs = [], seen = null, open = null, reporting = null;
  async function refresh() {
    try { msgs = (await net.inbox()).filter(m => !blocked.has(m.sender)); } catch { return; }
    const ids = new Set(msgs.map(m => m.id));
    if (seen) { const fresh = msgs.filter(m => !seen.has(m.id) && !m.heard_at);
      if (fresh.length) { const m = fresh[0]; ui.sfx.alert(); ui.note(`${first(m.sender_name)} sent you ${m.kind === 'voice' ? 'a voice message' : m.kind === 'invite' ? 'an invite to sail together' : 'a message'}. Open the radio to see it.`); } }
    seen = ids; H.unread = msgs.filter(m => !m.heard_at).length; ui.paintTop(); if (ui.isOpen && ui.mode === 'inbox') ui.paintFeed();
  }
  H.inboxTop = () => ['Messages', msgs.length ? `${H.unread ? `${H.unread} new · ` : ''}${msgs.length} kept for 7 days` : 'Voice messages, texts and invites'];
  H.inbox = el => {
    el.innerHTML = msgs.length ? msgs.map(m => `<div class="rd-msg${m.heard_at ? '' : ' new'}${open === m.id ? ' open' : ''}" data-id="${m.id}">
      <button type="button" class="rd-msg-row"><i></i><div><b>${esc(m.sender_name)} <em>${m.kind === 'voice' ? `Voice · ${(+m.dur || 0).toFixed(1)} s` : m.kind === 'invite' ? 'Invite' : 'Text'}</em></b>
        <span>${m.kind === 'text' ? '“' + esc(m.body) + '”' : m.kind === 'invite' ? `Invites you to sail together${m.body ? ` near ${esc(m.body)}` : ''}` : 'Voice message'}</span></div><time>${ago(m.created_at)}</time></button>
      <div class="rd-msg-acts">${m.kind === 'voice' ? '<button type="button" data-a="play">▶ Play</button>' : ''}${m.kind === 'invite' ? '<button type="button" data-a="sail">⛵ Sail there</button>' : ''}<button type="button" data-a="reply">Reply</button><button type="button" data-a="del">Delete</button><button type="button" data-a="block">Block</button><button type="button" data-a="report">Report</button></div>
      ${reporting === m.id ? `<div class="rd-why"><span>Report ${esc(first(m.sender_name))} for</span>${['spam', 'abuse', 'other'].map(r => `<button type="button" data-r="${r}">${REASONS[r]}</button>`).join('')}</div>` : ''}</div>`).join('')
      : '<p class="rd-empty">No messages yet. Tap a captain’s boat to send them a voice message, a text or an invite.</p>';
  };
  const heard = async m => { if (m.heard_at) return; m.heard_at = new Date().toISOString(); H.unread = msgs.filter(q => !q.heard_at).length; ui.paintTop(); net.markHeard(m.id).catch(() => {}); };
  ui.root.querySelector('.rd-feed').addEventListener('click', async e => {
    if (ui.mode !== 'inbox') return;
    const box = e.target.closest('.rd-msg'); if (!box) return; const m = msgs.find(q => q.id === box.dataset.id); if (!m) return;
    const a = e.target.closest('[data-a]')?.dataset.a, r = e.target.closest('[data-r]')?.dataset.r;
    if (r) { reporting = null; try { await net.report({ reported: m.sender, reason: r, message_id: m.id, context: m.kind === 'text' ? m.body : m.kind }); ui.note('Thanks. The report is in, and Sailo will look at it.'); } catch (x) { ui.note(x.message); } ui.paintFeed(); return; }
    if (!a) { open = open === m.id ? null : m.id; if (m.kind !== 'voice') heard(m); ui.paintFeed(); return; }
    if (a === 'play') { try { const c = await net.messageClip(m.id); if (c?.clip) { ui.playClip(ui.b64.fromB64(c.clip), m.sender_name); heard(m); } } catch (x) { ui.note(x.message); } }
    else if (a === 'sail') { heard(m); if (m.chart === chartId && Number.isFinite(m.x)) { pinCourse(m.x, m.z); radio.close(); ui.note(`Course set for ${first(m.sender_name)}${m.body ? ` near ${m.body}` : ''}.`); }
      else ui.note(`${first(m.sender_name)} was sailing another city's waters. Open the world map to fly there.`); }
    else if (a === 'reply') compose('voice', { uid: m.sender, name: m.sender_name });
    else if (a === 'del') { msgs = msgs.filter(q => q !== m); H.unread = msgs.filter(q => !q.heard_at).length; ui.paint(); net.deleteMessage(m.id).catch(() => {}); }
    else if (a === 'block') { try { await net.block(m.sender); blocked.add(m.sender); ui.muted.add(m.sender); ui.keep(); msgs = msgs.filter(q => q.sender !== m.sender); H.unread = msgs.filter(q => !q.heard_at).length; ui.paint();
      ui.note(`${first(m.sender_name)} is blocked: they can’t message you, and your radio won’t play them.`); } catch (x) { ui.note(x.message); } }
    else if (a === 'report') { reporting = reporting === m.id ? null : m.id; ui.paintFeed(); }
  });

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
    if (kind === 'msg' && d.to === meId) refresh();
    else if (kind === 'sos') refreshSOS();
  }

  refresh(); refreshSOS();
  let tickT = Date.now() + 45000;
  function update() {
    if (Date.now() < tickT) return; tickT = Date.now() + 45000; refresh(); refreshSOS();
    if (!card.hidden) { const s = sos.find(q => q.id === card.dataset.id); if (s) card.querySelector('time').textContent = ago(s.created_at); }
  }
  return { heard: heardLive, update, compose };
}
