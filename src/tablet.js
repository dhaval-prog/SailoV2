// Tablets (iPad and the like: a touch screen with room to spare) drive with both thumbs: a throttle lever on one
// side, the wheel (steering only) on the other. Left-handed captains can swap the sides. While this applies the
// body carries `tablet` (and `lefty` for the swapped sides); phones and computers are unchanged.
const LEFTY = 'sailo:lefty';
export const tabletQ = matchMedia('(pointer: coarse) and (min-width: 721px) and (min-height: 521px) and (orientation: landscape)'); // (upright, an iPad takes the phone layout)
export const isTablet = () => tabletQ.matches;
let lefty = false; try { lefty = localStorage.getItem(LEFTY) === '1'; } catch { /* storage blocked */ }
export const isLefty = () => tabletQ.matches && lefty;
const paint = () => { document.body.classList.toggle('tablet', tabletQ.matches); document.body.classList.toggle('lefty', isLefty()); };
/** Swap the wheel and the throttle (the account panel's switch). */
export function setLefty(on) { lefty = !!on; try { localStorage.setItem(LEFTY, lefty ? '1' : '0'); } catch { /* storage blocked */ } paint(); dispatchEvent(new Event('sailo:controls')); }
tabletQ.addEventListener?.('change', () => { paint(); dispatchEvent(new Event('sailo:controls')); });
paint();
