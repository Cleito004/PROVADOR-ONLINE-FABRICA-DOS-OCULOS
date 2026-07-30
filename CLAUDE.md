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
node serve-root.js        # http://localhost:8000  (alternative; handles query strings)

# Shop-window mode (the actual deliverable: screen behind the shop glass)
.\iniciar-vitrine.ps1     # serves locally + opens Chrome/Edge in --kiosk on ?vitrine=1
.\iniciar-vitrine.ps1 -Online   # same, but pointing at the Vercel URL

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

`tests/astes.spec.mjs` is the exception to "DOM-level": it asserts the **temple geometry contract** (126 tris/side on square+aviator, 2 meshes/122 tris on cateye, a pivot on every temple, stub at 0 yaw and full length at profile) and, since v4.31.0, the **cut contract** — measured against the real loaded GLBs via `diagAstes()`, not against a copy of the formula: front-on the cut must land *before* the earpiece hook starts (last 20% of the temple), and at profile it must reach the tip. That is the regression guard for the "vertical dash at the hinge" defect. It only works because it launches Chrome with `--use-fake-device-for-media-stream` — the GLBs are loaded inside `startApp()`, after `getUserMedia`, so with no camera there is nothing to measure. Use the same trick for any test that needs the render pipeline alive.

The same file also watches the console for shader errors, because the cut is a **hand-patched shader** and broken GLSL does not throw in JS — Three.js just logs and the temple silently disappears, which every other assertion would happily pass. For that guard to work, `diagAstes()` must `renderer.render()` the built model, **not** `renderer.compile()`: since r155 Three.js defers shader-error checking to the program's first real use, so `compile()` links without ever reporting the error. This was verified by deliberately breaking the GLSL and confirming the test fails.

`tests/vitrine.spec.mjs` (v4.32.0) covers the shop-window screen: that the canvas buffer and its CSS box always have the **same** aspect (the proof that nothing is stretched), that a portrait viewport crops the sides and an ultra-wide one crops top/bottom, that the RGB strip's red end is still reachable **inside** the cropped view, and that the on-screen guide resets once no face has been seen. It also needs the fake camera. Note it deliberately does **not** assert that a 1280×720 viewport crops anything: Chrome's fake device emits 16:9, so on a 16:9 viewport nothing needs cropping — asserting a crop there would test the test rig, not the app.

The other tests assert the exact DOM contract of `index.html` (`#style-matrix` has exactly 3 items in order `square, aviator, cateye`) and that there is **no** `input[type="range"]` anywhere — the Distance/Height sliders were removed in v4.33.0 and that assertion exists so they, or any other mouse control, do not come back by accident. Changing the style list breaks tests — update `tests/site.spec.mjs` in the same commit. Console errors mentioning camera/MediaPipe are deliberately filtered out, since CI has no webcam.

## How the root app (`script.js`) works

Pipeline: `startApp()` auto-starts on load (up to 3 retries) → `getUserMedia` → `initScene(video)` → `loadAllModels()` → `initMediaPipe('GPU')` → `schedulePrediction()` loop driven by `requestVideoFrameCallback`.

- **Multi-face**: `numFaces: MAX_FACES` (4). Each detected person gets a **face slot** — its own glasses wrapper, occluder ellipsoid and smoothing state — created on demand by `createFaceSlot()`. Style and colours stay global: gestures apply to the whole scene.
  - `computeFaceFrame(pts)` measures the face and builds the head axes; `matchSlot()` then assigns that face to a slot **by proximity to the previous frame's eye midpoint**. This matters because MediaPipe gives no per-person id and does not keep face order stable between frames — without matching, glasses jump between people.
  - `updateSlotFromFace(slot, frame)` does all the placement for one person, and `updateOccluder(slot, frame)` its mask. Keep per-face work inside these two so calibration stays in one place.
  - Each slot owns its **own** clipping plane: Three.js clipping planes are world-space, so a shared plane would cut other people's masks in the wrong place. For the same reason the old temple-tip clipping planes in `buildFromModel()` were removed — the occluder is what hides temples now.

- **Rendering**: `OrthographicCamera`, webcam drawn as a `THREE.Sprite` with a custom brightness/contrast/saturation/sharpen fragment shader, glasses on top. `renderOrder`: video `0` → occluder `0.5` → glasses `1`.
- **Framing (`ajustarEnquadramento`, v4.32.0)** — the shop-window display is a **portrait** screen while the webcam is landscape. The canvas used to be created at the *video's* size and stretched by CSS (`width:100% !important; height:100% !important`), which on a 9:16 screen did not letterbox, it **distorted**: faces and glasses came out tall and thin. Now the canvas is sized to the *display* and the orthographic frustum is shrunk to the display's aspect, so what does not fit is **cropped** instead of squashed. Crucially the scene's coordinate system stays in **video pixels** — which is what all the face math uses (`landmark.x * videoWidth`) — so no placement, scale or depth calculation had to change. The video sprite deliberately keeps its full `vw × vh` size: the camera does the cropping, not the sprite.
  - `ENQ.fracX` / `fracY` record how much of the video survived the crop. The invariant is that one of them is always exactly `1` (one axis fits whole) and neither exceeds it — `frac > 1` would mean stretching, the old bug.
  - The RGB strip **must** read hand position through `xNaTela()`, not raw video x. With the sides cropped, the old formula asked for the hand at video `x = 0.09` to reach red — a point that is off-screen on a portrait display, so the person would have to move their hand where they cannot see it. With no crop `xNaTela` is the identity, so the landscape behaviour that was approved on camera is untouched.
  - The gesture edge check (`isHandFullyVisible`) deliberately still uses the **video** frame, not the visible crop: its job is to reject MediaPipe's misreads at the capture boundary, which is a property of the video, not of what is displayed.
- **Occluder ("máscara invisível da cabeça")**: an invisible head-shaped solid (`geometriaCabeca()` — a `SphereGeometry` whose *horizontal* cross-section is warped toward a rounded square, scaled per frame, `MeshBasicMaterial({colorWrite:false})`) positioned on the head. It writes depth but no color, so the GPU discards whatever part of the frame is behind the head.
  - It is deliberately **narrower than the temple line** (`OCC.rx = 0.45` vs temples at `±0.5`), so it no longer hides temples at all — that is now `applyTempleFade`'s job. `rx` used to be `1.10` (a *radius*, i.e. 2.2 face widths, over double a real head) to compensate for an ellipsoid thinning at the sides; the compensation swallowed both temples at every angle, which is what made the visible temple a stub. Fixing the *shape* (`OCC.lados`, the superellipse exponent) is what allows a realistic `rx`. Keep `rx` below `0.5` or the near temple gets eaten again.
  - Consequently there is no longer any yaw-driven mask recoil (the old `TEMPLE.reveal`/`slot.templeReveal`): recoiling uncovered *both* temples and forced a second mechanism to re-hide the far one, and the two fought each other. Mask gap is fixed; one mechanism per job.
  - Its **front half is clipped** by `occFrontPlane` (a world-space `THREE.Plane` with normal `-zAxis` through the eye midpoint, updated per frame). Without it, extreme pitch rotated the ellipsoid so its longest radius (`ry * fH`) pointed at the camera, invaded the front of the face and erased *both* temples at once. Clipping only ever *reduces* occlusion, so it cannot regress the yaw behaviour.
  - Live tuning via `window.OCC`: `debug` (renders the mask in red), `back`, `rx`, `ry`, `rz`, plus `clip` / `front` for the new cut. The debug material is only reconfigured when `OCC.debug` changes — setting `needsUpdate` every frame recompiles the shader.
- **Placement is normalised by face width.** `zOffset = (CFG.glassesDepth + depAdj + adjDistance) * fwNorm` where `fwNorm = fW / CFG.refHeadWidth`, and `depAdj` comes from a *dimensionless* nose depth (`(nTip.z - nose.z) / fW`). This replaced a mix of image-pixel and face-relative units plus a `distScale` hack that switched laws once `fW * 1.5` crossed 150 — that switch was the "glasses drift with distance" bug. The formula is calibrated to give the same result as before at `fW = 140`. There is deliberately no depth calibration captured during the scan (the old `smooth.refNoseZ`), which tied placement to whatever distance the person happened to be at during the scan.
- **`splitFrameMesh()`**: cuts a GLB frame into `leftTemple` / `frameCenter` / `rightTemple` by **average triangle Z** (depth is what distinguishes a temple from a lens rim), with X only choosing the side. It is called for **every** frame mesh, not just the biggest one — cateye keeps its temples in two separate primitives, and splitting only the largest mesh meant its temples were never separated and could never be faded. Each side's temples land in `userData.astesEsq` / `astesDir` (arrays, since a side can span meshes) and share one material.
  - `TEMPLE.cutZ = 0.25` is not eyeballed: sweeping 0.15–0.50 over the three GLBs, the band 0.20–0.30 returns the *identical* 126 triangles per temple on all three, because the temple is a separate piece of the mesh. Any value in that plateau grabs it whole and rim-free.
  - The threshold and the X guard must be compared in **geometry coordinates** (`geoHalfW`, `modelMinZ/MaxZ` from `geometry.boundingBox`). The pre-existing bug was comparing raw `posAttr.getX()` against a limit derived from `Box3.setFromObject()`, which already includes the GLB node scale — orders of magnitude apart, so the X rule never fired and every model silently fell through to a Z fallback that cut at 60% depth and captured only the *rear half* of each temple. The front half stayed with the frame and was never faded: that was the "far temple doesn't disappear" symptom.
- **Temples are governed by two separate mechanisms** — *how much* temple is visible, and *which* temple is erased. They were one mechanism until v4.30.0, and that is why pitch was broken: the erasure is driven by the depth difference between the two sides, which is **zero in pure pitch**, so no threshold could ever have fixed it. Comparing app screenshots against photos of real glasses in the same poses showed the temples' *angle* was already correct (a temple pointing backwards really does project near-vertically when the head is pitched 40°) — what was missing is that a real head **hides** almost the whole temple in that pose, leaving a stub at the hinge, while the app drew it over the forehead and hair.
  - **Length** (`TEMPLE.minLen/showStart/showFull`, `applyTempleFade`): driven by `|f.xAxis.z|`, the sine of the yaw. Facing the camera or merely tilted, the temple is a stub (`minLen`); as the head turns it grows to full. One quantity covers yaw, pitch and any combination, and because the trigger is yaw it cannot shorten the profile view. Shortening is closer to reality than fading alone: the head's silhouette eats the temple from the tip toward the hinge rather than dissolving it whole.
  - Shortening is a **cut, not a scale** (`prepararCorteAste`, v4.31.0). It used to be `mesh.scale.z = k` with `mesh.position.z` compensated by `hingeZ * (1 - k)`. Scaling **compresses**: Z shrinks and Y does not. Measuring the GLBs, a temple is *straight* over its first 80% (Y drop = 0.0000) and only bends in the last 20% — the earpiece hook, dropping 15.6% of the length. Compressing therefore flips the piece's Y/Z ratio from `0.24` (lying down) to `1.58` on square/aviator and `6.38` on cateye (standing up): front-on the hook became a **vertical dash glued to the hinge**. That was the reported defect, and no value of `minLen` could fix it — compression distorts at every `k < 1`.
  - So the temple is now cut in the fragment shader: `applyTempleFade` writes `uCorteZ = hinge - (hinge - tip) * k` and the patched material discards anything behind it. No vertex moves, so the distortion is **impossible by construction**, the visible part stays at its true geometric place, and the hook reappears on its own once the cut recedes past 80% (`compVisivel > 0.80`, ~22° of yaw with current values). The cut is in **model Z**, not a `THREE.Plane` — planes are world-space and would need per-frame, per-person recomputation, which is why the old ones were removed. Each slot builds its own temple materials (`buildFromModel` runs inside `createFaceSlot`), so one person's cut never reaches another's.
  - `hinge`/`tip` are taken from the **whole side**, not per mesh: cateye delivers its temple in two primitives spanning disjoint Z bands — sequential pieces of the same physical temple — and one cut per side treats them as the single piece they are.
  - Each temple mesh still sits in a **pivot `Group`** (`envolverEmPivo`). It no longer exists to allow scaling; it guarantees the mesh's own transform is neutral so the `position.z` reaching the shader is raw geometry Z, the space `hinge`/`tip` were measured in.
  - `centroNaCena()` measures the **pivot's** `matrixWorld`, never the mesh's — so the depth measurement depends only on where the head is. Under the old scaling this also prevented a feedback loop (shrink → centroid moves → depth difference changes → shrink changes) that made the temples pulse on their own; with the cut, nothing moves at all.
- **`applyTempleFade()`**: erases the far temple using the **real depth difference between the two sides in the scene**, normalised by face width. Sign says which side is behind, magnitude says how much (`TEMPLE.hideStart` → `hideFull`). This replaced a yaw-only trigger (`|xAxis.z| > hideStart`). Because it is geometry rather than a per-axis threshold, yaw, pitch, roll and any combination are handled by one rule with no special cases, a straight-on face keeps **both** temples (equal depth → zero difference), and the old "full pitch hides both temples" bug is impossible by construction. Note that *pure* pitch legitimately keeps both temples: neither is behind the other.
- **Hand-gesture control** (no clickable UI in the root app — gestures only). After the face scan, a hand calibration pass waits ~15 frames. Hands are told apart by **which half of the image** they fall in, not by anatomy (`indexMCP.x > pinkyMCP.x` flips when the palm turns). MediaPipe sees the *unmirrored* frame — the CSS `scaleX(-1)` is display only — so the person's **right** hand lands at `x < 0.5` (frame color + model) and the **left** at `x >= 0.5` (lens color).
  - Discrete selections (lens, model) go through `readFingerSelection()` → `trackDwell()`: the gesture must hold still for `GEST.holdMs` (800 ms) before applying, `0` fingers changes nothing, and **4 fingers (open hand) locks** the current choice. A hand touching the frame edge is ignored entirely (`isHandFullyVisible`), because MediaPipe tracks from the previous frame's bounding box and misreads fingers exactly when the hand is entering or leaving. Together these are what keep the chosen lens from resetting when the hand leaves.
  - `countOpenFingers()` deliberately ignores the thumb, so 4 is the maximum — that is why "open hand" and "4 fingers" are the same reading and 4 is reserved for locking rather than a 4th option.
  - The RGB `#color-strip` is the exception: it needs the hand near the lateral edge to reach the ends of the rainbow, so it does **not** use the edge check. It activates on `isHandFullyClosed()` (all four fingers curled **and** thumb tucked, measured as distances normalised by hand size), so a raised thumb does not trigger it.
  - Live tuning from the console via `window.GEST`: `debug` (prints fist/thumb/finger metrics on screen), `fingerCurl`, `thumbTuck`, `holdMs`, `edgeMargin`.
- **Shop-window mode** (`?vitrine=1`, `MODO_VITRINE` in `script.js`): the delivered product is a screen **behind shop glass**, running all day, with nobody able to touch it or fix it. So this mode hides the cursor and the adjustment sliders, holds a screen Wake Lock, retries the camera **forever** instead of giving up after 3 attempts, and runs a watchdog that restarts `startApp()` if `ultimoFrameEm` stops being updated (frozen loop, lost WebGL context, camera taken by another app). Real fullscreen can't be forced from JS without a user gesture — `iniciar-vitrine.ps1` supplies it by launching the browser with `--kiosk`.
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
- **`script.js` is loaded with `type="module"`.** In a module, *nothing* declared at top level lands on `window` — not `function`, not `const`. Every live-tuning handle and every hook the tests reach (`OCC`, `GEST`, `TEMPLE`, `ENQ`, `GUIA`, `diagAstes`, `xNaTela`, `guiaTick`, `PASSOS_GUIA`, …) is on `window` because it was **assigned there explicitly**. Adding a helper and expecting `window.helper` to exist is a silent failure that only shows up as `is not a function` in a test.
- MediaPipe model asset URLs differ per entry point: root `script.js` uses `storage.googleapis.com` models with the jsdelivr WASM bundle, `core/engine.js` uses the unpkg bundle. Keep them consistent when touching either.

## Deploy

Vercel, static only. `.vercelignore` excludes `kiosk`, `next-app`, `vue-app`, `backend`, both library dumps and all `*.md`/`*.ps1` — **only the root vanilla app plus `core/` and `libs/` ship**. `vercel.json` rewrites everything else to `/index.html` and sends `Cache-Control: no-cache, must-revalidate` for js/css/html (added because the kiosk/browser kept serving stale builds during tuning). The kiosk is deployed by running the local HTTPS server in the store, not through Vercel.

## Conventions

- Commit subject: `vX.Y.Z-DDmon | descrição curta em português` (e.g. `v4.20.0-24jul | Occluder mesh ...`). Bump the version on each functional commit; use `-STABLE-` in the tag for known-good checkpoints.
- Open issues are tracked in plain text at `PROBLEMAS PARA RESOLVER.txt`. As of 26/07/2026 the RGB bar trigger, the lens colour resetting when the hand leaves, the distance-dependent placement and both temples vanishing on full pitch have been addressed in `script.js` (all pending camera validation); **multi-person support is still open** (`numFaces: 1`, with a single glasses+occluder+smoothing set — supporting N faces means one set per face).
- `onboarding.html` is the source for the printed guide (`onboarding_new3.pdf`, generated with Playwright's `page.pdf()` at 1122×793). It is kept aligned with what the code actually does — it documents right hand = frame colour + model, left hand = lens colour, open hand = lock. Gestures the guide once promised but the code does not have (clapping, a 4th blue lens) were removed from the guide rather than implemented. **A motion swipe did once exist** (frame-differencing, left→right, with a cooldown) and was deliberately removed in `e6584ba` when finger counting came in, because the two fought each other — a child waving reads as a swipe. Asked again on 30/07/2026, the user chose **not** to bring it back.
- Since v4.32.0 the same guide also lives **inside** the app (`guiaTick`/`PASSOS_GUIA` in `script.js`, `#guia-dica` in `index.html`) — a shop-window visitor will not read a printed card. It is not a slideshow: each hint leaves the screen only when that gesture is actually performed, steps are marked done **independently** (so starting with the lens counts, instead of nagging for the guide's order), and the whole thing **resets when no face has been seen for `GUIA.reiniciarMs`** — children swap constantly and each new one must see it from the start. The last step has no gesture of its own (locking *is* the absence of a gesture), so it expires on a timer. Keep `onboarding.html` and `PASSOS_GUIA` saying the same thing.
- `AGENTS.md` predates the current `script.js` and describes procedural glasses and 5 styles — trust this file over it.
