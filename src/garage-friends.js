// Garage and Add friends in the Naked HUD style ("Garage + Add friends" design).
// Both open in the shared sheet in its full-screen form (class "nk"): no panel,
// the scene blurs and darkens, and the content sits straight on it, split by
// hairlines.
//   Garage: boat rows ("Sail this boat" plus a pencil to customise sail, flag
//     or dinghy colours; while customising, the fish collection hides), stats,
//     then the fish collection. On phones the pencil sits behind a flick: flick
//     a row left to swap "Sail" for the pencil, flick right or Cancel to undo.
//   Add friends: the captain code shown one character at a time on underlines,
//     an outlined teal Share pill, Copy link as plain text, and the friends list.
// Icons come from public/gf (the Garage + Friends asset pack).

const G = (set, name) => `./gf/${set}/${name}.svg`;
const icon = (set, name, cls = '') => `<img class="gf-i${cls ? ' ' + cls : ''}" src="${G(set, name)}" alt="" draggable="false">`;
const BOATS = {
  tug: { ico: 'boat-tug', sub: 'Sturdy harbour tug with a lighthouse' },
  sail: { ico: 'boat-sail', sub: 'Sloop with mainsail and jib · sails furl at anchor', edit: 'sail' },
  yacht: { ico: 'boat-yacht', sub: 'Flybridge cruiser with radar arch · custom flag', edit: 'yacht' },
  dinghy: { ico: 'boat-sail', sub: 'Daysailer with tall mast and genoa · heels under sail', edit: 'dinghy' },
};
const esc = t => String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const stars = n => `<span class="gf-stars" aria-label="${n} of 5 stars">${'<i class="on">★</i>'.repeat(n)}${'<i>★</i>'.repeat(5 - n)}</span>`;

/** Read an image file and shrink it to `max` px for a pixelated sail or flag. */
const pixelate = (file, max, done) => { const rd = new FileReader();
  rd.onload = () => { const i = new Image(); i.onload = () => { const k = max / Math.max(i.width, i.height), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(i.width * k)); c.height = Math.max(1, Math.round(i.height * k)); c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); done(c.toDataURL('image/png')); }; i.src = rd.result; };
  rd.readAsDataURL(file); };

export function createGarageFriends({ api, openSheet, closeSheet, sheet, sheetBody, onGarageOpen, paintFleet, lastStats, ECON, FISH, REGION, localOdds, fishWhere, STATION, WORLD }) {
  let editing = null, rendered = false;
  const card = () => sheet.querySelector('.map-card');

  // ---------------- Garage ----------------
  const boatRow = (b, i, active) => {
    const info = BOATS[b.id] || BOATS.tug, st = api.boatStatus(b.id), on = b.id === active, empty = st.fuel <= 0.05;
    const pct = Math.max(0, Math.min(100, Math.round(st.fuel / st.cap * 100))), ed = info.edit;
    return `<div class="gf-boat${on ? ' on' : ''}${empty && !on ? ' empty' : ''}" data-row="${b.id}" style="--d:${(0.15 + i * 0.07).toFixed(2)}s">
      <span class="gf-ring">${icon(on ? 'teal' : 'white', info.ico)}</span>
      <div class="gf-info"><b>${esc(b.name)}</b><small>${info.sub}</small>
        <div class="gf-specs"><span title="Fuel"><i class="gf-fuel"><i class="${pct < 20 ? 'low' : ''}" style="width:${pct}%"></i></i>${Math.round(st.fuel)}/${st.cap} L</span>
          <span title="Fish in hold">${icon('color', 'stat-fish', 'sm')}${st.fish}/${st.holdCap}</span><span title="Top speed">${icon('color', 'stat-speed', 'sm')}${st.kn} kn</span></div>
        ${empty ? `<small class="gf-warn">${on ? 'Out of fuel · running on the reserve' : 'No fuel · refuel it at Paradise Station'}</small>` : ''}</div>
      ${on ? `<div class="gf-acts"><span class="gf-sailing"><i aria-hidden="true"></i>Sailing</span>${ed ? `<button class="gf-edit gf-edit-on${editing === ed ? ' on' : ''}" type="button" data-edit="${ed}" title="Customise" aria-label="Customise ${esc(b.name)}" aria-pressed="${editing === ed}">${icon('white', 'edit', 'w')}${icon('navy', 'edit', 'n')}</button>` : ''}</div>` : `<div class="gf-acts">
        <button class="gf-pill sh-pick" data-boat="${b.id}" type="button"><span class="l">Sail this boat</span><span class="s">Sail</span>${icon('teal', 'arrow', 'arw')}</button>
        ${ed ? `<span class="gf-hint" aria-hidden="true"><i></i><i></i><i></i></span><button class="gf-cancel" type="button" data-unswipe>Cancel</button>
        <button class="gf-edit${editing === ed ? ' on' : ''}" type="button" data-edit="${ed}" title="Customise" aria-label="Customise ${esc(b.name)}" aria-pressed="${editing === ed}">${icon('white', 'edit', 'w')}${icon('navy', 'edit', 'n')}</button>` : ''}
      </div>`}</div>`;
  };
  const swatches = (cols, cur, attrs) => `<div class="gf-sws">${cols.map(c => `<button type="button" class="gf-sw${c === cur ? ' on' : ''}" style="background:${c}" ${attrs(c)} aria-label="Colour ${c}" aria-pressed="${c === cur}"></button>`).join('')}</div>`;
  const imgRow = (id, has, note) => `<div class="gf-imgrow"><label class="gf-dash">${icon('white', 'add-image')}${has ? 'Change image' : 'Add image'}<input id="${id}" type="file" accept="image/*" hidden></label>${has ? `<button class="gf-dash" type="button" id="${id}x">Remove image</button>` : ''}<small>${note}</small></div>`;
  const editHead = t => `<div class="gf-h"><h4>${t}</h4><button class="gf-done" type="button" data-done>Done${icon('teal', 'check', 'sm')}</button></div>`;
  const tabs = (list, cur, attr) => `<div class="gf-tabs" role="tablist">${list.map(([v, l]) => `<button type="button" role="tab" aria-selected="${v === cur}" class="${v === cur ? 'on' : ''}" ${attr}="${v}">${l}</button>`).join('')}</div>`;
  const editUI = () => {
    if (editing === 'sail') { const ss = api.sailStyle(), st = ss.style;
      const row = (r, label) => `<div class="gf-swrow">${label ? `<span>${label}</span>` : ''}${swatches(ss.colours, st.c[r], c => `data-sail-row="${r}" data-c="${c}"`)}</div>`;
      return `<section class="gf-editsec">${editHead('Sail style · Sail boat')}${tabs([['classic', 'Classic'], ['solid', 'Solid'], ['layers', '3 layers']], st.mode, 'data-mode')}
        ${st.mode === 'solid' ? row(0) : st.mode === 'layers' ? row(0, 'Top') + row(1, 'Middle') + row(2, 'Bottom') : ''}${imgRow('gf-simg', !!st.img, 'Shows pixelated on the mainsail')}</section>`; }
    if (editing === 'yacht') { const yf = api.yachtFlag(), fl = yf.flag;
      return `<section class="gf-editsec">${editHead('Custom flag · Motor yacht')}${tabs([['1', 'Flag up'], ['0', 'No flag']], fl.on ? '1' : '0', 'data-flag')}
        ${fl.on ? `<div class="gf-swrow">${swatches(yf.colours, fl.c, c => `data-flag-c="${c}"`)}</div>${imgRow('gf-fimg', !!fl.img, 'Shows pixelated on the flag')}` : ''}</section>`; }
    if (editing === 'dinghy') { const ds = api.dinghySail(), sl = ds.sail;
      return `<section class="gf-editsec">${editHead('Sail colour · Dinghy sailing boat')}<div class="gf-swrow">${swatches(ds.colours, sl.c, c => `data-dinghy-c="${c}"`)}</div>${imgRow('gf-dimg', !!sl.img, 'Shows pixelated on the mainsail')}</section>`; }
    return '';
  };
  const collectionUI = () => { const fc = api.fishCollection(), got = FISH.filter(f => fc.log[f.id]).length;
    const list = [...FISH].sort((a, b) => (!localOdds(a)) - (!localOdds(b))); // these waters first; the rest say where to travel
    return `<section class="gf-coll"><h4>Fish collection · ${got} / ${FISH.length} species</h4><p>Local waters: <b>${esc(REGION.name)}</b>. Travel to other seas for their fish.</p>
      <div class="gf-fishes">${list.map((f, i) => { const r = fc.log[f.id], here = localOdds(f) > 0, note = r ? `×${r.n} · best ${r.best >= 10 ? r.best.toFixed(1) : r.best.toFixed(2)} kg` : here ? 'Not caught yet' : `Found in ${fishWhere(f)}`;
        return `<div class="gf-fish${r ? ' got' : ''}${here ? '' : ' away'}" title="${esc(r ? f.name : note)}" style="--d:${(0.3 + i * 0.025).toFixed(3)}s"><span class="gf-sil"><img src="${fc.img(f.id) || G('color', 'fish-silhouette-placeholder')}" alt=""></span><b>${r ? esc(f.name) : '???'}</b>${stars(fc.stars(f))}<small>${esc(note)}</small></div>`; }).join('')}</div></section>`; };

  function openGarage() {
    onGarageOpen?.();
    const boats = api.boats(), active = api.getBoat(), keep = rendered && sheet.classList.contains('open') ? card()?.scrollTop : 0;
    openSheet('Garage', `My fleet · ${boats.length} boats`, `
      <div class="gf-boats">${boats.map((b, i) => boatRow(b, i, active)).join('')}</div>
      <div class="gf-msg" id="sh-fleet-msg" hidden></div>
      <div class="gf-stats"><div><b>${ECON.coins}</b><span>Coins</span></div><div><b>${lastStats.catchN}</b><span>Fish caught</span></div><div><b>${lastStats.distNm.toFixed(1)}</b><span>Nautical miles</span></div></div>
      ${editing ? editUI() : collectionUI()}
      <div class="gf-end"></div>`, 'garage');
    sheetBody.classList.toggle('gf-calm', rendered); rendered = true; // re-renders don't replay the entrance
    if (keep) card().scrollTop = keep;
    wireGarage();
  }
  const rerender = () => openGarage();
  function wireGarage() {
    const $ = s => sheetBody.querySelector(s), all = s => sheetBody.querySelectorAll(s);
    all('.sh-pick').forEach(b => b.addEventListener('click', () => {
      const r = api.setBoat(b.dataset.boat);
      if (r === 'ok') { editing = null; closeSheet(); paintFleet(); return; }
      const m = $('#sh-fleet-msg'); m.hidden = false;
      m.textContent = r === 'nofuel' ? `That boat has no fuel. Moor at Paradise Station (${STATION.where}), then switch to it there and refuel at the Boathouse.` : 'Raise the anchor and stop fishing first (and wait while mooring).'; }));
    all('[data-edit]').forEach(b => b.addEventListener('click', () => { editing = editing === b.dataset.edit ? null : b.dataset.edit; rerender(); }));
    all('[data-done]').forEach(b => b.addEventListener('click', () => { editing = null; rerender(); }));
    // phones: flick a row left for its pencil, right (or Cancel) to put "Sail" back
    all('.gf-boat').forEach(row => { let sx = null;
      row.addEventListener('pointerdown', e => { sx = e.clientX; });
      row.addEventListener('pointerup', e => { if (sx == null) return; const dx = e.clientX - sx; sx = null;
        if (dx < -25 && row.querySelector('.gf-edit')) { all('.gf-boat.swiped').forEach(r => r !== row && r.classList.remove('swiped')); row.classList.add('swiped'); }
        else if (dx > 25) row.classList.remove('swiped'); });
      row.addEventListener('pointercancel', () => { sx = null; }); });
    all('[data-unswipe]').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); b.closest('.gf-boat').classList.remove('swiped'); }));
    // sail boat
    const ss = api.sailStyle();
    all('[data-mode]').forEach(b => b.addEventListener('click', () => { ss.set({ mode: b.dataset.mode }); rerender(); }));
    all('[data-sail-row]').forEach(b => b.addEventListener('click', () => { const c = [...ss.style.c]; c[+b.dataset.sailRow] = b.dataset.c; ss.set({ c }); rerender(); }));
    $('#gf-simg')?.addEventListener('change', e => { const f = e.target.files[0]; if (f) pixelate(f, 48, img => { ss.set({ img }); rerender(); }); });
    $('#gf-simgx')?.addEventListener('click', () => { ss.set({ img: null }); rerender(); });
    // motor yacht flag
    const yf = api.yachtFlag();
    all('[data-flag]').forEach(b => b.addEventListener('click', () => { yf.set({ on: b.dataset.flag === '1' }); rerender(); }));
    all('[data-flag-c]').forEach(b => b.addEventListener('click', () => { yf.set({ c: b.dataset.flagC }); rerender(); }));
    $('#gf-fimg')?.addEventListener('change', e => { const f = e.target.files[0]; if (f) pixelate(f, 40, img => { yf.set({ img }); rerender(); }); });
    $('#gf-fimgx')?.addEventListener('click', () => { yf.set({ img: null }); rerender(); });
    // dinghy sail
    const ds = api.dinghySail();
    all('[data-dinghy-c]').forEach(b => b.addEventListener('click', () => { ds.set({ c: b.dataset.dinghyC }); rerender(); }));
    $('#gf-dimg')?.addEventListener('change', e => { const f = e.target.files[0]; if (f) pixelate(f, 48, img => { ds.set({ img }); rerender(); }); });
    $('#gf-dimgx')?.addEventListener('click', () => { ds.set({ img: null }); rerender(); });
  }

  // ---------------- Add friends ----------------
  function openFriends() {
    let dev = ''; try { dev = localStorage.getItem('sailo:device') || ''; } catch { /* storage blocked */ }
    const code = (dev.replace(/-/g, '').slice(0, 6) || 'SAILOR').toUpperCase(), link = `${location.origin}${location.pathname}?invite=${code}`;
    openSheet('Add friends', `Invite a friend to sail ${WORLD.name}`, `
      <p class="gf-lead">Share your invite link. Your friend opens it on their phone or computer and starts sailing.</p>
      <div class="gf-codebox"><h4>Your captain code</h4><div class="gf-code" aria-label="Captain code ${code.split('').join(' ')}">${code.split('').map((ch, i) => `<span style="--d:${(0.35 + i * 0.07).toFixed(2)}s"><b>${esc(ch)}</b><i></i></span>`).join('')}</div></div>
      <div class="gf-sharecol">
        <button class="gf-share" type="button" id="sh-share">${icon('teal', 'share')}<span>Share invite link</span></button>
        <button class="gf-copy" type="button" id="sh-copy">${icon('white', 'copy', 'c')}${icon('teal', 'check', 'k')}<span>Copy link</span></button>
      </div>
      <div class="gf-flist"><h4>Friends</h4><div class="gf-empty"><span class="gf-ph" aria-hidden="true"><i></i><i></i><i></i></span><p>No friends yet. Once a friend joins with your link, you'll see them here.</p></div></div>`, 'friends');
    rendered = false;
    const copyBtn = sheetBody.querySelector('#sh-copy'), shareBtn = sheetBody.querySelector('#sh-share');
    // copy the link and say so on the button that was pressed (shows the link itself if the clipboard is blocked)
    const copy = async btn => { const label = btn.querySelector('span'), was = label.textContent;
      try { await navigator.clipboard.writeText(link); label.textContent = 'Link copied'; btn.classList.add('done'); } catch { label.textContent = link; }
      setTimeout(() => { if (btn.isConnected) { label.textContent = was; btn.classList.remove('done'); } }, 2400); };
    copyBtn.addEventListener('click', () => copy(copyBtn));
    // share opens the system share sheet where there is one, otherwise it copies
    shareBtn.addEventListener('click', async () => {
      if (navigator.share) { try { await navigator.share({ title: `Sail with me in ${WORLD.name}`, text: `Join me on the water! Captain code ${code}`, url: link }); } catch { /* cancelled */ } } else copy(shareBtn); });
  }

  return { openGarage: () => { if (!sheet.classList.contains('open')) { editing = null; rendered = false; } openGarage(); }, openFriends };
}
