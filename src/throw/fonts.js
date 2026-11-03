// Throw's fonts, bundled with the game (so they work offline in the desktop and phone apps). Each weight is registered
// twice: as the family with its weight (Caveat 500), and under the name MySpace used in React Native (Caveat_500Medium),
// so the code ported from MySpace can keep using those names.
import caveat400 from '@fontsource/caveat/files/caveat-latin-400-normal.woff2?url';
import caveat500 from '@fontsource/caveat/files/caveat-latin-500-normal.woff2?url';
import caveat600 from '@fontsource/caveat/files/caveat-latin-600-normal.woff2?url';
import caveat700 from '@fontsource/caveat/files/caveat-latin-700-normal.woff2?url';
import figtree400 from '@fontsource/figtree/files/figtree-latin-400-normal.woff2?url';
import figtree500 from '@fontsource/figtree/files/figtree-latin-500-normal.woff2?url';
import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff2?url';
import figtree700 from '@fontsource/figtree/files/figtree-latin-700-normal.woff2?url';
import figtree800 from '@fontsource/figtree/files/figtree-latin-800-normal.woff2?url';
import dmmono400 from '@fontsource/dm-mono/files/dm-mono-latin-400-normal.woff2?url';
import bricolage800 from '@fontsource/bricolage-grotesque/files/bricolage-grotesque-latin-800-normal.woff2?url';
import dmmono500 from '@fontsource/dm-mono/files/dm-mono-latin-500-normal.woff2?url';

const FACES = [
  ['BricolageGrotesque', 800, 'ExtraBold', bricolage800],
  ['Caveat', 400, 'Regular', caveat400],
  ['Caveat', 500, 'Medium', caveat500],
  ['Caveat', 600, 'SemiBold', caveat600],
  ['Caveat', 700, 'Bold', caveat700],
  ['Figtree', 400, 'Regular', figtree400],
  ['Figtree', 500, 'Medium', figtree500],
  ['Figtree', 600, 'SemiBold', figtree600],
  ['Figtree', 700, 'Bold', figtree700],
  ['Figtree', 800, 'ExtraBold', figtree800],
  ['DMMono', 400, 'Regular', dmmono400],
  ['DMMono', 500, 'Medium', dmmono500],
];
let loading = null;
/** Registers and loads every face once; resolves when they're ready (or failed: the page falls back to system fonts). */
export function loadThrowFonts() {
  if (loading) return loading;
  const faces = FACES.flatMap(([fam, w, n, url]) => [new FontFace(`${fam}_${w}${n}`, `url(${url})`), new FontFace(fam, `url(${url})`, { weight: String(w) })]);
  faces.forEach(f => document.fonts.add(f));
  loading = Promise.allSettled(faces.map(f => f.load())).then(() => {});
  return loading;
}
