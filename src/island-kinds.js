// What kind of place an island is: it takes the kind of the map label it's named after (island-names.js), so an island
// named for a restaurant is a restaurant island, one named for a temple a shrine, and so on. Opening hours are each
// kind's usual ones (the map's data doesn't carry hours): the city's own time, IST for Pune.
export const KINDS = {
  restaurant: { label: 'Restaurant', stamp: 'Restaurant', open: [11 * 60, 23 * 60 + 30] },
  market:     { label: 'Market', stamp: 'Market', open: [10 * 60, 21 * 60 + 30] },
  campus:     { label: 'Campus', stamp: 'Campus', open: [8 * 60, 17 * 60] },
  garden:     { label: 'Garden', stamp: 'Garden', open: [5 * 60 + 30, 20 * 60 + 30] },
  shrine:     { label: 'Shrine', stamp: 'Shrine', open: [5 * 60 + 30, 21 * 60 + 30] },
  homes:      { label: 'Homes', stamp: 'Homes', open: null },
};
export const KIND_IDS = Object.keys(KINDS);

/** The kind for a map label ({ cat, kind }), or homes when there's none or it's a street, a society or a locality. */
export const kindOf = p => {
  const c = p?.cat;
  return c === 'food' || c === 'hotel' ? 'restaurant' : c === 'mall' || c === 'shop' ? 'market' : c === 'school' ? 'campus'
    : c === 'park' ? 'garden' : c === 'worship' ? 'shrine' : 'homes';
};
/** Is a place of this kind open at this time (minutes since midnight)? Homes are always "open". */
export const isOpen = (kind, mins) => { const o = KINDS[kind]?.open; return !o || (mins >= o[0] && mins < o[1]); };
const hm = m => { const h = Math.floor(m / 60), mm = m % 60, ap = h >= 12 ? 'pm' : 'am', h12 = ((h + 11) % 12) + 1; return `${h12}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${ap}`; };
/** "Open · until 11:30 pm" / "Closed · opens 11 am" (or null for homes). */
export const hoursText = (kind, mins) => { const o = KINDS[kind]?.open; if (!o) return null;
  return isOpen(kind, mins) ? `Open · until ${hm(o[1])}` : `Closed · opens ${hm(o[0])}`; };
