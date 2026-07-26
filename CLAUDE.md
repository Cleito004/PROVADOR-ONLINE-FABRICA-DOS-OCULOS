# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Virtual glasses try-on ("Provador Virtual") for the store *Fábrica dos Óculos*: webcam AR that renders 3D glasses on the user's face. UI text, comments and commit messages are in Portuguese (pt-BR) — keep writing them in Portuguese.

## Two independent AR stacks

This repo is not one app; it is **two unrelated tracking/rendering engines** plus dead-ends kept around for reference. Know which one you are in before changing anything.

**A. MediaPipe stack** — `script.js` (root, ~1500 lines) and `core/` (`engine.js`, `glasses-builder.js`, `constants.js`).
- MediaPipe `FaceLandmarker` (468 landmarks) + `HandLandmarker`, loaded from the jsdelivr CDN at runtime, GPU delegate with automatic CPU fallback (`initMediaPipe()` in `script.js`).
- Three.js 0.160.0 via `<script type="importmap">` in `index.html` — no bundler for the root app.
- Glasses are **GLB models** (`core/assets/models/*.glb`) loaded with `GLTFLoader`, not procedural geometry.
- `script.js` is the **actively developed** version (all recent `v4.x` commits touch it). `core/engine.js` is an older sibling consumed by `next-app/` and `vue-app/`; the two have diverged (see "Divergences" below). Changes to `script.js` do **not** propagate to `core/`.

**B. WebAR.rocks stack** — `kiosk/` (physical in-store kiosk), plus a byte-for-byte copy in `next-app/kiosk/`.
- `WebARRocksFace.js` + `WebARRocksFaceThreeHelper.js` + `WebARRocksMirror.js` (a try-on wrapper), own bundled Three.js in `kiosk/libs/`, own neural net `kiosk/neuralNets/NN_GLASSES_9.json`.
- 28-model GLB catalog defined inline as `GLASSES_CATALOG` in `kiosk/js/kiosk.js`; occluder mesh from `assets/models3D/occluder.glb`; Bloom + TAA post-processing.
- `face-api.js` (`kiosk/weights/`) does silent age/gender detection to auto-filter the catalog.
- **`kiosk/` and `next-app/kiosk/` must be kept in sync** — they are literal copies. Any edit to one needs the same edit in the other.

**Reference-only / not wired in:** `jeelizGlassesVTOWidget/`, `webar-rocks-face/` (upstream library dump), `core/assets/models/old/`, `onboarding.html` + `onboarding_new*.pdf` (user-facing gesture guide).

## Commands

```powershell
# Root vanilla app (the main app) — static server, no build step
node serve.mjs            # http://localhost:8083  (also what Playwright uses)
node serve-root.js        # http://localhost:8000  (alternative)

# Kiosk — needs HTTPS for camera access on any non-localhost device
.\gerar-ssl.ps1           # once: self-signed cert into %TEMP%\kiosk-cert.pfx, SANs for every LAN IP
.\iniciar-kiosk.ps1       # generates cert if needed, starts server, opens browser
node serve-kiosk.js       # http://localhost:5500 + https://localhost:5501, prints LAN IPs

# Next.js / Vue / Node backend
npm run install:all       # deps in next-app, vue-app, backend (each has its own package.json)
npm run next:dev          # :3000
npm run vue:dev           # :3001
npm run backend:dev       # ws://localhost:8080 (node --watch)
npm run dev:all           # backend + next concurrently
cd next-app; npm run lint # only lint config in the repo (eslint-config-next)

# Python backends (optional, both listen on :5050 — run only one)
cd python-backend; pip install -r requirements.txt; python server.py   # FastAPI, WS /ws, hand contours
cd opencv-backend; pip install -r requirements.txt; python server.py   # Flask, screenshot analysis (Haar + DNN SSD)
```

### Tests

Playwright, DOM-level smoke tests against the root vanilla app. `playwright.config.mjs` auto-starts `node serve.mjs` on :8083 and reuses an existing server.

```powershell
npx playwright test                                        # all
npx playwright test tests/site.spec.mjs                    # one file
npx playwright test -g "matriz de estilos tem 3 opcoes"    # one test by name
npx playwright test --headed --debug                       # interactive
```

The tests assert the exact DOM contract of `index.html` (`#style-matrix` has exactly 3 items in order `square, aviator, cateye`; `#adj-distance` defaults to `-150`; `#adj-height` to `-10`). Changing those defaults or the style list breaks tests — update `tests/site.spec.mjs` in the same commit. Console errors mentioning camera/MediaPipe are deliberately filtered out, since CI has no webcam.

## How the root app (`script.js`) works

Pipeline: `startApp()` auto-starts on load (up to 3 retries) → `getUserMedia` → `initScene(video)` → `loadAllModels()` → `initMediaPipe('GPU')` → `schedulePrediction()` loop driven by `requestVideoFrameCallback`.

- **Rendering**: `OrthographicCamera` sized to the video, webcam drawn as a `THREE.Sprite` with a custom brightness/contrast/saturation/sharpen fragment shader, glasses on top. `renderOrder`: video `0` → occluder `0.5` → glasses `1`.
- **Occluder ("máscara invisível da cabeça")**: an invisible ellipsoid (`SphereGeometry` scaled per frame, `MeshBasicMaterial({colorWrite:false})`) positioned on the head. It writes depth but no color, so the GPU discards whatever part of the frame is behind the head — this is what makes the far temple disappear on yaw. Do **not** go back to hiding temple meshes by yaw/pitch math — that approach was tried and failed.
  - Its **front half is clipped** by `occFrontPlane` (a world-space `THREE.Plane` with normal `-zAxis` through the eye midpoint, updated per frame). Without it, extreme pitch rotated the ellipsoid so its longest radius (`ry * fH`) pointed at the camera, invaded the front of the face and erased *both* temples at once. Clipping only ever *reduces* occlusion, so it cannot regress the yaw behaviour.
  - Live tuning via `window.OCC`: `debug` (renders the mask in red), `back`, `rx`, `ry`, `rz`, plus `clip` / `front` for the new cut. The debug material is only reconfigured when `OCC.debug` changes — setting `needsUpdate` every frame recompiles the shader.
- **Placement is normalised by face width.** `zOffset = (CFG.glassesDepth + depAdj + adjDistance) * fwNorm` where `fwNorm = fW / CFG.refHeadWidth`, and `depAdj` comes from a *dimensionless* nose depth (`(nTip.z - nose.z) / fW`). This replaced a mix of image-pixel and face-relative units plus a `distScale` hack that switched laws once `fW * 1.5` crossed 150 — that switch was the "glasses drift with distance" bug. The formula is calibrated to give the same result as before at `fW = 140`. There is deliberately no depth calibration captured during the scan (the old `smooth.refNoseZ`), which tied placement to whatever distance the person happened to be at during the scan.
- **`splitFrameMesh()`**: cuts a single-mesh GLB frame into `leftTemple` / `frameCenter` / `rightTemple` geometries by average triangle X (fallback: by Z, for models whose temples don't separate on X), so each temple gets its own material and clipping plane. Requires `renderer.localClippingEnabled = true`. Legacy of the pre-occluder approach; temple opacity is now forced to 1.0.
- **Hand-gesture control** (no clickable UI in the root app — gestures only). After the face scan, a hand calibration pass waits ~15 frames. Hands are told apart by **which half of the image** they fall in, not by anatomy (`indexMCP.x > pinkyMCP.x` flips when the palm turns). MediaPipe sees the *unmirrored* frame — the CSS `scaleX(-1)` is display only — so the person's **right** hand lands at `x < 0.5` (frame color + model) and the **left** at `x >= 0.5` (lens color).
  - Discrete selections (lens, model) go through `readFingerSelection()` → `trackDwell()`: the gesture must hold still for `GEST.holdMs` (800 ms) before applying, `0` fingers changes nothing, and **4 fingers (open hand) locks** the current choice. A hand touching the frame edge is ignored entirely (`isHandFullyVisible`), because MediaPipe tracks from the previous frame's bounding box and misreads fingers exactly when the hand is entering or leaving. Together these are what keep the chosen lens from resetting when the hand leaves.
  - `countOpenFingers()` deliberately ignores the thumb, so 4 is the maximum — that is why "open hand" and "4 fingers" are the same reading and 4 is reserved for locking rather than a 4th option.
  - The RGB `#color-strip` is the exception: it needs the hand near the lateral edge to reach the ends of the rainbow, so it does **not** use the edge check. It activates on `isHandFullyClosed()` (all four fingers curled **and** thumb tucked, measured as distances normalised by hand size), so a raised thumb does not trigger it.
  - Live tuning from the console via `window.GEST`: `debug` (prints fist/thumb/finger metrics on screen), `fingerCurl`, `thumbTuck`, `holdMs`, `edgeMargin`.
- **Optional Node backend client** at the bottom of `script.js`: connects to `ws://localhost:8080/ws` and streams 320×240 JPEGs every 100 ms. `handleBackendMessage()` is deliberately a no-op — it used to open the color strip on `hand.isOpen`, which was both inverted (the strip is for a *closed* hand) and a second source of truth competing with the local gesture. It self-disables permanently on the first error (`backendAvailable = false`), so the app is fully functional with no backend.

## Node backend (`backend/`)

ESM, `ws` on `WS_PORT` (default 8080) with a `/health` HTTP endpoint. Message types handled in `src/server.js`: `ping`, `frame`, `frame-processed`, `config-update`, `screenshot`, `analyze-face`, `auto-fit`, `prescription-ocr`; emits `face-detected` / `face-lost` / `face-broadcast` / `config-synced` / `peer-disconnected`. Server-side face detection uses `@mediapipe/tasks-vision` (`src/face-processor.js`), persistence is Supabase (`src/supabase.js`, schema in `backend/supabase-schema.sql` — apply manually), and vision-AI features go through Moondream (`src/moondream-service.js`).

Everything degrades gracefully: missing `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `MOONDREAM_API_KEY` or a missing MediaPipe model just disables that feature rather than failing startup.

## Divergences and gotchas

- **`script.js` vs `core/engine.js`**: root has 3 styles (`square, aviator, cateye`), gesture control, the occluder, the video-enhance shader and its own `STYLE_CONFIG`; `core/` still exposes 5 styles + 6 frame colors + 6 lens options (`core/constants.js`) and a click-driven UI. Fixes made in one file must be ported deliberately — there is no shared code path.
- **`core/` is not an npm package.** `next-app/` and `vue-app/` import it as `../../core/engine.js`; Next.js needs `transpilePackages: ['three']` for that to work.
- `core/glasses-builder.js` requests `core/assets/models/*.glb` as **page-relative** URLs. That resolves correctly for the root app only — `next-app/` and `vue-app/` have no `public/core/assets` copy, so model loading there is broken until those assets are served.
- **`kiosk/js/kiosk.js` is double-encoded UTF-8 (mojibake) with a BOM and CRLF**, while `next-app/kiosk/js/kiosk.js` is clean UTF-8/LF. Emoji and accents in the kiosk catalog render as garbage. When syncing the two copies, copy from the `next-app/` one and don't "fix" the mojibake with a naive search/replace — re-save the file as real UTF-8.
- `kiosk/index.html` must load **only one** landmark stabilizer. `WebARRocksLMStabilizer.js` and `OneEuroLMStabilizer.js` both declare `const WebARRocksLMStabilizer`; loading both throws and leaves a black screen after the camera starts. Only `OneEuroLMStabilizer.js` is included.
- Live tuning in the kiosk: `WebARRocksMirror` builds `window.OCC` (occluder `scale`/`x`/`y`/`z`/`debug`) and `window.GLS` (glasses `scale`/`x`/`y`/`z`/`rotX`) in `build_tuningAPI()`, applied to every clone under `threeFaceFollowers`. `kiosk/js/tuning-panel.js` puts sliders on top of that — press **T** or open with `?ajuste=1`; values persist in `localStorage` under `kioskTuning` and "Copiar valores" emits a snippet to paste into `kiosk.js`. Units are `dev/face.obj` units (head width 154). Prefer shrinking/pushing back the occluder over pushing the glasses forward in Z.
- The kiosk needs HTTPS off localhost; `getCameraHelp()` already surfaces the right message, so don't debug camera failures before checking the protocol.
- MediaPipe model asset URLs differ per entry point: root `script.js` uses `storage.googleapis.com` models with the jsdelivr WASM bundle, `core/engine.js` uses the unpkg bundle. Keep them consistent when touching either.

## Deploy

Vercel, static only. `.vercelignore` excludes `kiosk`, `next-app`, `vue-app`, `backend`, both library dumps and all `*.md`/`*.ps1` — **only the root vanilla app plus `core/` and `libs/` ship**. `vercel.json` rewrites everything else to `/index.html` and sends `Cache-Control: no-cache, must-revalidate` for js/css/html (added because the kiosk/browser kept serving stale builds during tuning). The kiosk is deployed by running the local HTTPS server in the store, not through Vercel.

## Conventions

- Commit subject: `vX.Y.Z-DDmon | descrição curta em português` (e.g. `v4.20.0-24jul | Occluder mesh ...`). Bump the version on each functional commit; use `-STABLE-` in the tag for known-good checkpoints.
- Open issues are tracked in plain text at `PROBLEMAS PARA RESOLVER.txt`. As of 26/07/2026 the RGB bar trigger, the lens colour resetting when the hand leaves, the distance-dependent placement and both temples vanishing on full pitch have been addressed in `script.js` (all pending camera validation); **multi-person support is still open** (`numFaces: 1`, with a single glasses+occluder+smoothing set — supporting N faces means one set per face).
- `onboarding.html` is the source for the printed guide (`onboarding_new3.pdf`, generated with Playwright's `page.pdf()` at 1122×793). It is kept aligned with what the code actually does — it documents right hand = frame colour + model, left hand = lens colour, open hand = lock. Gestures the guide once promised but the code never had (open-hand swipe, clapping, a 4th blue lens) were removed rather than implemented.
- `AGENTS.md` predates the current `script.js` and describes procedural glasses and 5 styles — trust this file over it.
