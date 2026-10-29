// A local sailor's card (tap their boat or name tag): the full-screen Naked sheet, like the Garage.
import { captain, stateAt, today, hoursOf } from './cpu-captains.js';

const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const BOAT = { tug: ['Lighthouse Tug', 'boat-tug'], sail: ['Sail Boat', 'boat-sail'], yacht: ['Motor Yacht', 'boat-yacht'], dinghy: ['Dinghy Sailing Boat', 'boat-sail'] };

export function captainCard(c, ms = Date.now()) {
  const s = stateAt(c, ms), d = today(c, ms), [boatName, icon] = BOAT[c.boat], col = c.colours.sail || c.colours.hull || c.colours.flag || '#ffffff';
  const now = !s ? 'Ashore right now' : s.kind === 'fish' ? 'Fishing right now' : s.kind === 'sell' ? 'Selling at Paradise Station' : s.next === 'sell' ? 'Sailing to Paradise Station' : s.next === 'fish' ? 'Heading out to fish' : `Heading home to ${c.home}`;
  const pal = c.pal && captain(c.pal), rival = c.rival && captain(c.rival);
  return {
    title: c.name,
    sub: `Local sailor · ${c.rank} · ${c.home}`,
    html: `
      <div class="cp-boat"><span class="gf-ring"><img class="gf-i" src="/gf/white/${icon}.svg" alt=""></span>
        <div class="cp-bi"><b>${esc(boatName)}</b><small><i class="cp-sw" style="background:${col}"></i>${esc(now)}</small></div>
        ${s ? '<span class="gf-sailing"><i></i>Out now</span>' : ''}</div>
      <div class="gf-stats"><div><b>${d.catches}</b><span>Fish today</span></div><div><b>${d.sales}</b><span>Sales today</span></div><div><b>${d.coins}</b><span>Coins today</span></div></div>
      <section class="cp-sec"><h4>Best today</h4><p>${d.best ? `${esc(d.best.name)} · ${d.best.kg >= 10 ? d.best.kg.toFixed(1) : d.best.kg.toFixed(2)} kg` : 'Nothing landed yet today'}</p>
        ${d.recent.length ? `<p class="cp-dim">Latest: ${d.recent.map(esc).join(', ')}</p>` : ''}</section>
      <section class="cp-sec"><h4>About</h4><p>${esc(c.style)}</p></section>
      <section class="cp-sec"><h4>Usually sails</h4><p>${esc(hoursOf(c))} <span class="cp-dim">· Pune time</span></p>
        ${pal ? `<p class="cp-dim">Often sails with ${esc(pal.name)}</p>` : ''}${rival ? `<p class="cp-dim">Rivals with ${esc(rival.name)}</p>` : ''}</section>
      <p class="cp-note">Local sailors are Sailo’s harbour regulars: computer captains who sail Pune Paradise every day.</p>`,
  };
}
