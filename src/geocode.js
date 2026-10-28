// Finding a city to sail: countries (built in), states and cities (live), and "use my location".
// The chosen city's coordinates and time zone come from Open-Meteo's geocoder (GeoNames data,
// CC BY 4.0, fine to store). Mapbox is used only for suggestions and to name the city at your
// location: its search results are not stored (Mapbox's terms for temporary geocoding).
// Without a Mapbox token, BigDataCloud's free client-side lookup names your city instead.

const TOKEN = (import.meta.env && import.meta.env.VITE_MAPBOX_TOKEN) || '';
const OM = 'https://geocoding-api.open-meteo.com/v1/search';
const get = async (url, ms = 7000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); try { const r = await fetch(url, { signal: c.signal }); return r.ok ? await r.json() : null; } catch { return null; } finally { clearTimeout(t); } };
const fold = s => (s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/\b(state|province|region|prefecture|county|oblast|governorate|division|territory|of)\b/g, '').replace(/[^a-z0-9]/g, '');

// ISO 3166-1 country codes; names come from the browser (Intl.DisplayNames)
const CODES = ('AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ ' +
  'DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP ' +
  'KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ ' +
  'OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ ' +
  'UA UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW').split(' ');
let countryList = null;
export function countries() {
  if (countryList) return countryList;
  let dn = null; try { dn = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* old browser */ }
  return (countryList = CODES.map(cc => ({ cc, name: dn?.of(cc) || cc })).sort((a, b) => a.name.localeCompare(b.name)));
}
export const searchCountries = q => { const f = fold(q); return countries().filter(c => !f || fold(c.name).includes(f) || c.cc.toLowerCase() === f).slice(0, 12); };

/** States / provinces in a country matching what's typed (suggestions only). */
export async function searchStates(cc, q) {
  if (!q.trim()) return [];
  if (TOKEN) {
    const j = await get(`https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(q)}&types=region&country=${cc.toLowerCase()}&autocomplete=true&limit=8&language=en&access_token=${TOKEN}`);
    const out = (j?.features || []).map(f => f.properties?.name).filter(Boolean);
    if (out.length) return [...new Set(out)];
  }
  // fallback: the states of places with that name
  const j = await get(`${OM}?name=${encodeURIComponent(q)}&count=30&language=en&format=json&countryCode=${cc}`);
  const f = fold(q); return [...new Set((j?.results || []).map(r => r.admin1).filter(a => a && fold(a).startsWith(f.slice(0, 3))))].slice(0, 8);
}

const toCity = r => ({ gid: r.id, name: r.name, region: r.admin1 || '', country: r.country || '', cc: r.country_code || '', lat: r.latitude, lng: r.longitude, tz: r.timezone || '', pop: r.population || 0 });
/** Cities and towns in a country (and state, when chosen) matching what's typed, biggest first. */
export async function searchCities(cc, q, region = '') {
  if (q.trim().length < 2) return [];
  const j = await get(`${OM}?name=${encodeURIComponent(q)}&count=40&language=en&format=json${cc ? `&countryCode=${cc}` : ''}`);
  const all = (j?.results || []).filter(r => /^PPL/.test(r.feature_code || 'PPL')).map(toCity).sort((a, b) => b.pop - a.pop);
  if (!region) return all.slice(0, 12);
  const fr = fold(region), inState = all.filter(c => fold(c.region).includes(fr) || fr.includes(fold(c.region)));
  return (inState.length ? inState : all).slice(0, 12); // nothing in that state: show the rest of the country (labelled with their state)
}

const km = (a, b, c, d) => { const r = Math.PI / 180, x = (d - b) * r * Math.cos((a + c) / 2 * r), y = (c - a) * r; return Math.hypot(x, y) * 6371; };
/** The city at a location (for "use my location"). Returns a city or null. */
export async function cityAt(lat, lng) {
  let name = null, cc = null;
  if (TOKEN) { const j = await get(`https://api.mapbox.com/search/geocode/v6/reverse?longitude=${lng}&latitude=${lat}&types=place&language=en&access_token=${TOKEN}`);
    const p = j?.features?.[0]?.properties; if (p) { name = p.name; cc = p.context?.country?.country_code?.toUpperCase(); } }
  if (!name) { const j = await get(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`);
    if (j) { name = j.city || j.locality; cc = j.countryCode; } }
  if (!name) return null;
  const list = await searchCities(cc || '', name);
  const best = list.map(c => ({ c, d: km(lat, lng, c.lat, c.lng) })).sort((a, b) => a.d - b.d)[0];
  return best && best.d < 60 ? best.c : null;
}

/** The browser's location (asks for permission). Resolves { lat, lng } or rejects with a reason. */
export const myLocation = () => new Promise((ok, no) => {
  if (!navigator.geolocation) return no(new Error('unsupported'));
  navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lng: p.coords.longitude }), e => no(e), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
});
