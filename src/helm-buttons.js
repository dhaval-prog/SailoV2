// A button on the circle round the wheel (helm-orbit.js): Chat (a speech bubble), still a placeholder. It takes the
// place the cannon button had.
const ICONS = {
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z"/>',
};

export function createHelmButtons({ orbit, note }) {
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
  make('chat-btn', 'Chat', ICONS.chat, () => orbit.chatAt?.(56));
}
