// Two buttons on the circle round the wheel (helm-orbit.js): Throw (a paper plane) and Chat (a speech bubble).
// They take the places the NOS and cannon buttons had. Throw opens MySpace's Throw, rebuilt in Sailo (src/throw, loaded on
// first tap); Chat is still a placeholder.
const ICONS = {
  throw: '<path d="M21 11 2 2l9 19 2-8z"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
};

export function createHelmButtons({ orbit, note, onThrow }) {
  const make = (id, label, icon, at, onTap = () => note(`${label}: coming soon.`)) => {
    const btn = document.createElement('button'); btn.type = 'button'; btn.id = id; btn.className = 'helm-extra'; btn.setAttribute('aria-label', label);
    btn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg>`;
    btn.addEventListener('click', onTap);
    document.body.appendChild(btn);
    let shown = null; // (written to only when it moved: writes between the frame's measurements cost a layout)
    const paint = () => { const p = at(), v = p ? `${Math.round(p[0] - 28)},${Math.round(p[1] - 28)}` : '';
      if (v === shown) return; shown = v; if (!v) { btn.style.visibility = 'hidden'; return; } const [x, y] = v.split(',');
      btn.style.left = `${x}px`; btn.style.top = `${y}px`; btn.style.visibility = ''; };
    setInterval(paint, 250); paint();
  };
  make('throw-btn', 'Throw', ICONS.throw, () => orbit.throwAt?.(56), onThrow || (() => import('./throw/index.js').then(m => m.openThrow({ note })).catch(() => note('Throw couldn’t load. Check your connection?'))));
  make('chat-btn', 'Chat', ICONS.chat, () => orbit.chatAt?.(56));
}
