// A local sailor's card (tap their boat or name tag): the full-screen Naked sheet, like the Garage.
import { captain, stateAt, today, hoursOf, statusText, statusOf } from './cpu-captains.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const BOAT = { tug: ['Lighthouse Tug', 'boat-tug'], sail: ['Sail Boat', 'boat-sail'], yacht: ['Motor Yacht', 'boat-yacht'], dinghy: ['Dinghy Sailing Boat', 'boat-sail'] };

export function captainCard(c, ms = Date.now()) {
  const s = stateAt(c, ms), d = today(c, ms), [boatName, icon] = BOAT[c.boat], col = c.colours.sail || c.colours.hull || c.colours.flag || '#ffffff';
  const now = s ? statusText(c, s) : 'Ashore right now', k = statusOf(c, ms), f = Math.max(0, Math.min(1, k.fuel / k.cap));
  const fuelCls = f < 0.08 ? 'empty' : f < 0.2 ? 'crit' : f < 0.35 ? 'low' : '';
  const pal = c.pal && captain(c.pal), rival = c.rival && captain(c.rival);
  return {
    title: c.name,
    sub: `Local sailor · ${c.rank} · ${c.home}`,
    html: `
      <div class="cp-boat"><span class="gf-ring"><img class="gf-i" src="/gf/white/${icon}.svg" alt=""></span>
        <div class="cp-bi"><b>${esc(boatName)}</b><small><i class="cp-sw" style="background:${col}"></i>${esc(now)}</small></div>
        ${s ? '<span class="gf-sailing"><i></i>Out now</span>' : ''}</div>
      <div class="cp-wave"><div class="cp-acts"><button type="button" class="cp-wv">👋 Wave</button><button type="button" class="cp-call">📻 Radio</button></div><p class="cp-reply" hidden></p></div>
      <section class="cp-sec cp-ops"><h4>On board</h4>
        <div class="cp-fuel ${fuelCls}"><span>Fuel</span><i><b style="width:${(f * 100).toFixed(1)}%"></b></i><em>${Math.round(k.fuel)} / ${k.cap} L</em></div>
        <div class="cp-row"><span>Cargo</span><em>${k.hold} / ${k.holdCap} fish</em></div>
        <div class="cp-row"><span>Coins</span><em>${k.coins.toLocaleString('en-IN')}</em></div></section>
      <div class="gf-stats"><div><b>${d.catches}</b><span>Fish today</span></div><div><b>${d.sales}</b><span>Sales today</span></div><div><b>${d.coins}</b><span>Coins today</span></div></div>
      <section class="cp-sec"><h4>Best today</h4><p>${d.best ? `${esc(d.best.name)} · ${d.best.kg >= 10 ? d.best.kg.toFixed(1) : d.best.kg.toFixed(2)} kg` : 'Nothing landed yet today'}</p>
        ${d.recent.length ? `<p class="cp-dim">Latest: ${d.recent.map(esc).join(', ')}</p>` : ''}</section>
      <section class="cp-sec"><h4>About</h4><p>${esc(c.style)}</p></section>
      <section class="cp-sec"><h4>Usually sails</h4><p>${esc(hoursOf(c))} <span class="cp-dim">· Pune time</span></p>
        ${pal ? `<p class="cp-dim">Often sails with ${esc(pal.name)}</p>` : ''}${rival ? `<p class="cp-dim">Rivals with ${esc(rival.name)}</p>` : ''}</section>
      <p class="cp-note">Local sailors are Sailo’s harbour regulars: computer captains who sail Pune Paradise every day.</p>`,
  };
}

const LIVE_NOW = { fish: 'Fishing right now', anchor: 'At anchor', dock: 'At Paradise Station' };
/** A real captain online (online.js): what they share, and a Wave button. */
export function liveCard(c, st) {
  const [boatName, icon] = BOAT[c.boat] || BOAT.tug, col = c.colours.sail || c.colours.hull || c.colours.flag || '#ffffff';
  const now = LIVE_NOW[st?.kind] || (st?.speed > 0.5 ? 'Sailing now' : 'Drifting');
  return {
    title: c.name,
    sub: `Captain · online now${c.rank ? ' · ' + c.rank : ''}`,
    html: `
      <div class="cp-boat"><span class="gf-ring"><img class="gf-i" src="/gf/white/${icon}.svg" alt=""></span>
        <div class="cp-bi"><b>${esc(boatName)}</b><small><i class="cp-sw" style="background:${col}"></i>${esc(now)}</small></div>
        <span class="gf-sailing"><i></i>Online</span></div>
      <div class="cp-wave"><div class="cp-acts"><button type="button" class="cp-wv">👋 Wave</button><button type="button" class="cp-call">📻 Radio</button><button type="button" class="cp-msg" data-k="voice">🎙 Voice message</button><button type="button" class="cp-msg" data-k="text">✉ Text</button><button type="button" class="cp-msg" data-k="invite">⛵ Invite to sail</button></div><p class="cp-reply" hidden></p></div>
      <div class="gf-stats"><div><b>${c.catches || 0}</b><span>Fish caught</span></div><div><b>${esc(c.rank || 'Deckhand')}</b><span>Rank</span></div></div>
      <p class="cp-note">A real captain sailing these waters right now. Wave, call them on the radio, or leave a voice message, a text or an invite: they’ll get it even after they’ve gone ashore.</p>`,
  };
}
