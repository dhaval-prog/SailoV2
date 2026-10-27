# SailoV2
Sail. Discover. Connect.

**Sailo · Lighthouse Tug** is a stylised 3D sailing scene built with three.js. You steer a toy-like tugboat that has a lighthouse on its deck. The same code runs as:

| Target | Tech | Output |
| --- | --- | --- |
| Web / PWA | Vite | `dist/` |
| Desktop (Windows, macOS, Linux) | Electron | `release/` installers |
| Mobile (Android, iOS) | Capacitor | `android/`, `ios/` native projects |

## Features
- A hand-built tug with cel shading and ink outlines: lighthouse tower, cabin, stack, fenders, pennant lines, ship's wheel and a spinning propeller.
- A painted, animated sea that the boat rides on, with bow spray, wake foam and ripples.
- Day and night modes. At night you get stars, a moon, a rotating lighthouse beam, deck lights and blinking nav lights.
- Six weather presets: Clear, Cloudy, Rain, Storm (with lightning), Fog and Snow.
- Chase and top camera views, plus zoom buttons and orbit, pinch and pan.
- Sail with the on-screen joystick, WASD or the arrow keys.
- Tap or click the boat to open the action menu:
  - **Go fishing**: cast, wait for a bite, reel in and keep a catch count.
  - **Drop anchor** / **Raise anchor**.
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
src/three-d-stage.js     <three-d-stage> renderer / camera / controls / exporter element
src/styles.css           overlay styles + mobile breakpoints
electron/main.cjs        desktop shell (serves dist/ over app://)
capacitor.config.json    mobile config
android/, ios/           native projects
public/                  icons + PWA manifest
resources/               source art for native icons/splash
assets/models/           reference exports of the tug (GLB, OBJ + MTL)
```
