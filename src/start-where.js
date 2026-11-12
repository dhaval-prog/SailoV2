// "Where shall we start?" Each time a captain comes back to the game: sail on from where they last were, or start at
// where they really are now (their device's location, on this city's chart). Shown over the game once it's up; the boat
// waits at the last spot until they choose. Not shown to a new captain (they start at the harbour) or when there's no
// last spot to offer.
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/**
 * opts.lastLabel   where the last spot is (a locality, or a position)
 * opts.onLast()    sail on from the last spot
 * opts.onHere(say) start at the device's location (another city's: its waters open there): resolves when the boat's
 *                  there, rejects with a message for the card; say(text) shows how it's going
 */
export function askStartSpot({ lastLabel, onLast, onHere }) {
  const el = document.createElement('div'); el.id = 'start-where'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'sw-title');
  el.innerHTML = `<div class="sw-card">
      <h2 id="sw-title">Where shall we start?</h2>
      <p class="sw-sub">Pick up where you left off, or start where you are right now.</p>
      <button type="button" class="sw-opt" data-pick="last"><span class="sw-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 21s-7-6.3-7-11.5A7 7 0 0 1 19 9.5C19 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg></span>
        <span class="sw-txt"><b>Where I last sailed</b><small>${esc(lastLabel)}</small></span></button>
      <button type="button" class="sw-opt" data-pick="here"><span class="sw-ico here" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><circle cx="12" cy="12" r="7.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></span>
        <span class="sw-txt"><b>Where I am now</b><small>Uses your device's location</small></span></button>
      <p class="sw-msg" role="status" hidden></p>
    </div>`;
  document.body.appendChild(el); requestAnimationFrame(() => el.classList.add('in'));
  const msg = el.querySelector('.sw-msg'), btns = [...el.querySelectorAll('.sw-opt')];
  let busy = false;
  const close = () => { el.classList.remove('in'); setTimeout(() => el.remove(), 260); };
  el.addEventListener('pointerdown', e => e.stopPropagation()); el.addEventListener('keydown', e => e.stopPropagation()); // (the game behind it doesn't steer)
  btns.forEach(b => b.addEventListener('click', async e => { e.stopPropagation(); if (busy) return;
    if (b.dataset.pick === 'last') { onLast?.(); close(); return; }
    busy = true; b.classList.add('wait'); b.querySelector('small').textContent = 'Finding you…'; msg.hidden = true;
    try { await onHere(t => { b.querySelector('small').textContent = t; }); close(); }
    catch (err) { busy = false; b.classList.remove('wait'); b.querySelector('small').textContent = 'Uses your device’s location'; msg.textContent = err?.message || 'Couldn’t find your location.'; msg.hidden = false; }
  }));
  setTimeout(() => btns[0].focus(), 50);
  return { close };
}
