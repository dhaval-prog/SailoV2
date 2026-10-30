// Boat tap: the action carousel along the bottom of the screen (Naked HUD design).
// Tapping the boat eases the camera in, ripples mark the selected boat, and the
// actions rise in one after another. There are no containers: outline rings with
// white type, plus a darker scrim at the bottom so the type stays readable.
// Desktop pages four actions at a time with chevrons; phones scroll the row
// sideways with snapping. The page dots follow either.
//
// `menu.style.display` stays the open/closed flag, so code that reads it keeps
// working. Call setOpen() to change it and update() every frame while it's open.

export function initBoatActions({ menu, onOpen, onClose }) {
  const row = menu.querySelector('.ba-row'), items = [...row.querySelectorAll('.ba-item')];
  const prev = menu.querySelector('.ba-nav.prev'), next = menu.querySelector('.ba-nav.next');
  const dots = menu.querySelector('.ba-dots'), caret = menu.querySelector('.ba-caret'), ripples = menu.querySelector('.ba-ripples');
  const isOpen = () => menu.style.display !== 'none';
  const compact = matchMedia('(max-width: 720px), (max-height: 520px), (pointer: coarse) and (orientation: portrait) and (max-width: 1100px)'); // the phone layout (same breakpoint as naked-hud.css)
  let active = 0;

  // the highlighted action: a filled white ring, navy icon and a yellow underline
  const setActive = (i, scroll) => {
    active = Math.max(0, Math.min(items.length - 1, i));
    items.forEach((b, k) => { b.classList.toggle('on', k === active); b.tabIndex = k === active ? 0 : -1; });
    if (scroll) { const b = items[active], l = b.offsetLeft - row.offsetLeft, r = l + b.offsetWidth;
      if (l < row.scrollLeft || r > row.scrollLeft + row.clientWidth) row.scrollTo({ left: l - (row.clientWidth - b.offsetWidth) / 2, behavior: 'smooth' }); }
  };
  items.forEach((b, i) => { b.addEventListener('pointerenter', () => setActive(i)); b.addEventListener('focus', () => setActive(i)); });

  // pages and dots: one dot per screenful of actions
  const paintNav = () => {
    const w = row.clientWidth || 1, pages = Math.max(1, Math.round(row.scrollWidth / w + 0.25)), atEnd = row.scrollLeft + w >= row.scrollWidth - 4;
    const page = atEnd ? pages - 1 : Math.min(pages - 1, Math.round(row.scrollLeft / w));
    if (dots.childElementCount !== pages) dots.innerHTML = '<i></i>'.repeat(pages);
    [...dots.children].forEach((d, k) => d.classList.toggle('on', k === page));
    dots.hidden = pages < 2;
    prev.classList.toggle('off', row.scrollLeft < 4); next.classList.toggle('off', atEnd);
  };
  prev.addEventListener('click', () => row.scrollBy({ left: -row.clientWidth, behavior: 'smooth' }));
  next.addEventListener('click', () => row.scrollBy({ left: row.clientWidth, behavior: 'smooth' }));
  row.addEventListener('scroll', paintNav, { passive: true });
  new ResizeObserver(paintNav).observe(row);

  // a mouse can drag the row too (touch scrolls natively); a drag isn't a tap
  { let drag = null, moved = false;
    row.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button) return; drag = { x: e.clientX, left: row.scrollLeft }; moved = false; });
    addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x; if (Math.abs(dx) > 6) { moved = true; row.style.scrollSnapType = 'none'; row.scrollLeft = drag.left - dx; } });
    addEventListener('pointerup', () => { if (!drag) return; drag = null; row.style.scrollSnapType = ''; });
    row.addEventListener('click', e => { if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); } }, true); }

  // keys while open: ←/→ choose, Enter picks, Esc closes (and the arrows don't steer the boat meanwhile)
  addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.target.closest?.('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); e.stopImmediatePropagation(); setActive(active + (e.key === 'ArrowRight' ? 1 : -1), true); items[active].focus({ preventScroll: true }); }
    else if ((e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button')) { e.preventDefault(); items[active].click(); }
  }, true);

  function setOpen(open) {
    if (open === isOpen()) return;
    menu.style.display = open ? 'block' : 'none';
    document.body.classList.toggle('boat-sel', open);
    if (open) {
      menu.classList.remove('in'); void menu.offsetWidth; menu.classList.add('in'); // replay the rise-in
      row.scrollLeft = 0; setActive(0); paintNav();
      onOpen?.();
    } else onClose?.();
  }

  // every frame while open: ripples around the boat's waterline, the caret points up at it
  function update(cx, cy, width) {
    if (!isOpen()) return;
    const w = Math.max(120, Math.min(innerWidth * 0.8, width)), h = w * 0.36;
    ripples.style.transform = `translate(${(cx - w / 2).toFixed(1)}px, ${(cy - h / 2).toFixed(1)}px)`;
    ripples.style.width = w.toFixed(1) + 'px'; ripples.style.height = h.toFixed(1) + 'px';
    const r = row.getBoundingClientRect();
    caret.style.left = Math.max(r.left + 30, Math.min(r.right - 30, cx)).toFixed(1) + 'px';
    caret.style.top = (r.top - (compact.matches ? 29 : 21) - 11).toFixed(1) + 'px'; // the design's gap above the row
  }

  return { setOpen, update, isOpen, row };
}
