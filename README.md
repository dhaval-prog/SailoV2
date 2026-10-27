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
- **Account & settings** (avatar, top right): editable captain name, rank, stats (fish caught, distance, top speed), Day/Night toggle, six weather presets (Clear, Cloudy, Rain, Storm, Fog, Snow) and model export. Choices are remembered between visits.
- **Live time & weather** (on by default, switch in settings): a subtle handwritten (Caveat) chip shows Pune's time, date and day, and the sky follows Pune's real weather and daylight (Open-Meteo, no API key). Picking a time of day or weather by hand turns live mode off.
- At night you get a realistic star field (thousands of stars of varied brightness and colour, twinkling more near the horizon, with a faint Milky Way), a moon, a rotating lighthouse beam, deck lights and blinking nav lights.
- **Camera dock** (bottom right): top view, chase view (default), photo capture, compass (opens the map), zoom in/out and recenter.
- **Chase view** (default, ship's-wheel button): the camera sits behind the boat. Sail with the wooden steering wheel (turns as you steer, speed ring, gear readout), WASD or the arrow keys, or tap the water to drop a course buoy and let the tug steer itself there.
- **Top view** (target button): a wide, tilted view of the boat; the wheel hides, and tap or click anywhere on the water to drop a course buoy and the tug steers itself there. Touching the wheel or keys takes back control. `V` toggles views.
- Tap or click the boat to open the action menu:
  - **Go fishing**: a casting circle appears around the boat; tap anywhere in the sea inside it to cast there (tap again to recast), wait for a bite, reel in and keep a catch count.
  - **Drop anchor** / **Raise anchor**: the camera swings to the bow to show the anchor and chain dropping into the sea or being hauled back up.
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
