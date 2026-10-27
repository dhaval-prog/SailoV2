# SailoV2
Sail. Discover. Connect.

**Sailo · Lighthouse Tug** is a stylised 3D sailing scene built with three.js. You steer a toy-like tugboat that has a lighthouse on its deck. The same code runs as:

| Target | Tech | Output |
| --- | --- | --- |
| Web / PWA | Vite | `dist/` |
| Desktop (Windows, macOS, Linux) | Electron | `release/` installers |
| Mobile (Android, iOS) | Capacitor | `android/`, `ios/` native projects |

## Features
- **Pune Paradise**: a bounded 200 sq mi ocean, a square about 22.8 km (14.1 mi) on each side, centred on the harbour. A location chip shows where you are (miles N/S and E/W of the harbour). The compass button opens a map of the whole ocean with the boat's position and heading: hover to read any spot's position, click or tap to pin a course there (shown as a blinking dotted route) and the tug sails itself to it. The boat's position is saved (to Supabase, plus a local copy) every few seconds and when you leave, so the next visit resumes where you stopped. A warning appears within 600 m of the edge, and the tug is held at the border. World size and helpers live in `src/world.js`, ready for islands and coastlines.
- A hand-built tug with cel shading and ink outlines: lighthouse tower, cabin, stack, fenders, pennant lines, ship's wheel and a spinning propeller.
- A painted, animated sea that the boat rides on, with bow spray, wake foam and ripples.
- **Quick actions** (left of the avatar; stacked under it on phones): **My fleet** (opens the Garage: pick your boat (Lighthouse Tug, Sail Boat, Motor Yacht or Dinghy Sailing Boat), style the sail boat's sails, fly a custom flag on the yacht, colour the dinghy's sails, and see fuel, hold, coins and stats), **Search** (find a place, e.g. Paradise Station, and sail there) and **Inbox** (messages from the harbour).
- **Account & settings** (avatar, top right): editable captain name, rank, stats (fish caught, distance, top speed), Day/Night toggle, six weather presets (Clear, Cloudy, Rain, Storm, Fog, Snow) and model export. Choices are remembered between visits.
- **Paradise Station** (3.7 mi W, 1.1 mi S of the harbour, marked on the map): a harbour island built exactly as in the station file: painted sand, swaying palms, scuttling crabs, starfish and shells, a market stall, a boathouse, an L-shaped pier with waving flags and pennants, a blinking beacon, lanterns and fireflies at night, foam along the shore and calm turquoise shallows. Sail close and press **Sail into port**, pick one of four berths and the tug moors itself; then:
  - **Fish Market**: put fish from your hold into the selling crate (it weighs them) and sell them for coins. Thirteen species, each with its own look, price, weight and catch chance: Sardine 4c (24%), Mackerel 9c (20%), Red Snapper 16c (14%), Pufferfish 24c (9%), Yellowfin Tuna 42c (5%), Cod 14c (6%), Flounder 12c (7%), Barracuda 35c (4%), Mahi-Mahi 48c (3%), Swordfish 95c (1%), Sailfish 120c (0.5%), Permit 55c (2.5%) and John Dory 32c (4%). Your catch goes into a 30-fish hold.
  - **Boathouse**: pump fuel at 2c a litre (hold to pump, +10 L or fill up) and see what's on board.
  - **Cast off** sails back out. The island, pier and rocks can't be sailed through.
- **Coins and fuel** (chip under the clock): coins are shared; each boat has its own tank, fish hold and top speed (Tug 120 L · 30 fish · 12 kn, Sail Boat 60 L · 16 · 15 kn, Motor Yacht 240 L · 45 · 22 kn, Dinghy 20 L · 8 · 9 kn) and burns fuel at its own rate. An empty boat limps on its reserve; switch to another boat, and an empty boat can only be taken out again at Paradise Station, where you refuel it.
- **Live time & weather** (on by default, switch in settings): a subtle chip (Calibri, falling back to the open Carlito font) shows Pune's time, date and day, with a sun or moon icon to match, and the sky follows Pune's real weather and daylight (Open-Meteo, no API key). Picking a time of day or weather by hand turns live mode off.
- At night you get a realistic star field (thousands of stars of varied brightness and colour, twinkling more near the horizon, with a faint Milky Way), a moon, a rotating lighthouse beam, deck lights and blinking nav lights.
- **Camera dock** (bottom right): top view, chase view (default), photo capture, compass (opens the map), and zoom in/out.
- **Chase view** (default, ship's-wheel button): the camera sits behind the boat. Sail with the wooden steering wheel (turns as you steer, speed ring, gear readout), WASD or the arrow keys, or tap the water to drop a course buoy and let the tug steer itself there.
- **Top view** (target button): a wide, tilted view of the boat; the wheel hides, and tap or click anywhere on the water to drop a course buoy and the tug steers itself there. Touching the wheel or keys takes back control. `V` toggles views.
- Tap or click the boat to open the action menu, a carousel of cards (swipe or use the arrows): Go fishing, Drop anchor, **Garage** (my fleet), **Your profile** and **Add friends** (share an invite link with your captain code):
  - **Go fishing**: a playable mini-game (about 20–40 s a catch):
    - *Cast*: hold on the sea to aim; a power arc swings out and back. Release in the gold band for a **perfect cast** (a streak of perfect casts builds a combo that draws rarer fish). Cast into a **fishing spot** (birds circling over bubbles) for bigger species.
    - *Wait*: watch a fish shadow swim in, circle and nibble the bobber. Strike (tap, Space or the Strike! button) only on the real bite; too early or too late and it gets away.
    - *Fight*: hold to reel and keep the tension needle in the moving green zone; too tight snaps the line, too slack lets it shake free. Swipe (or arrow keys) against the fish's run to tire it. Each species fights its own way (tuna runs, barracuda sprints, swordfish and sailfish leap: tap at the top of the jump). Storms and rain make fish pull harder; night brings rare fish.
    - *Catch*: the fish leaps aboard in slow motion and a card shows its weight, stars, value and any new record or new species. **Keep** it in the hold or **Release** it for a small coin bonus.
    - The Garage shows your **Fish collection** (13 species, count and best weight; uncaught fish are silhouettes). Synthesized sounds (cast, splash, reel click, line whine) and phone vibration.
  - **Drop anchor** / **Raise anchor**: the camera swings to the bow to show the anchor and chain dropping into the sea or being hauled back up (about 3 seconds each).
- Export the boat as OBJ + MTL or GLB (desktop/web only).
- Phone and tablet layouts that respect safe areas and work in portrait and landscape.

## Getting started
```bash
npm install
npm run dev          # http://localhost:5173 (also reachable from phones on your LAN)
npm run build        # production web build in dist/
```

### Desktop (Electron)
```bash
npm run desktop       # build + launch the desktop app
npm run desktop:dist  # build installers into release/ (dmg / nsis / AppImage)
```
For live reload, run `npm run dev` in one terminal and `npm run desktop:dev` in another.

### Mobile (Capacitor)
```bash
npm run android   # build, sync, open in Android Studio (needs the Android SDK)
npm run ios       # build, sync, open in Xcode (macOS only)
npm run mobile:sync
```
App id: `com.sailo.app`. The icons and splash screens come from `resources/` via `npx @capacitor/assets generate --assetPath resources`.

## Project layout
```
index.html               UI overlay markup
src/main.js              scene: boat model, sea, sky, weather, sailing, fishing, anchor
src/world.js             Pune Paradise: world size, bounds and position helpers
src/fishing.js           playable fishing: cast meter, shadows and bites, the fight, catch card, fish log
src/station.js           Paradise Station: island model, docking, Fish Market, Boathouse, coins and fuel
src/boats/sailboat.js    the Sail Boat, built in code from Sail_Boat.html (rig, sails that furl at anchor, sail styles)
src/boats/motoryacht.js  the Motor Yacht, built in code from Motor_Yacht.html (flybridge, radar arch, custom flag)
src/boats/dinghy.js      the Dinghy Sailing Boat, built in code from Dinghy_sailing_boat.html (tall rig, genoa, tiller, heel)
src/station-island.js    the station island, built in code from the station file (geometry, animation, effects)
src/station.css          styles for the station UI (scoped under .stn)
src/live.js              Pune clock and live weather (Open-Meteo)
src/persist.js           saves/restores the boat position (Supabase RPCs + localStorage)
supabase/migrations/     database setup for the saved positions
src/hud.js               settings panel, camera dock and HUD readouts
src/three-d-stage.js     <three-d-stage> renderer / camera / controls / exporter element
src/styles.css           overlay styles + mobile breakpoints
electron/main.cjs        desktop shell (serves dist/ over app://)
capacitor.config.json    mobile config
android/, ios/           native projects
public/                  icons + PWA manifest
resources/               source art for native icons/splash
assets/models/           reference exports of the tug (GLB, OBJ + MTL)
```
