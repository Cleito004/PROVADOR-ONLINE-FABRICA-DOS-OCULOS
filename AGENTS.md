# Provador Virtual - Fábrica dos Óculos

## Structure

- **Root** (`index.html`, `script.js`, `style.css`) — Vanilla JS standalone entrypoint (loads Three.js from CDN)
- **`core/`** — Shared engine. ES modules, no package.json. Imported via relative path:
  - `constants.js` — GLASSES_STYLES, FRAME_COLORS, LENS_OPTIONS, facial landmark indices
  - `engine.js` — `TryOnEngine` class (scene, mediapipe, websocket client, smoothing)
  - `glasses-builder.js` — 5 glasses builders (`buildRoundGlasses`, `buildSquareGlasses`, `buildAviatorGlasses`, `buildCateyeGlasses`, `buildSportGlasses`)
- **`next-app/`** — Next.js 14 (App Router). Port 3000 default.
- **`vue-app/`** — Vue 3 + Vite. Port 3001.
- **`backend/`** — Node WebSocket server (port 8080) + Supabase + MediaPipe face processing
- **`kiosk/`** — Physical-store kiosk mode using WebAR.rocks.face + Three.js (served by `serve-kiosk.js` on port 5500)
- **`jeelizGlassesVTOWidget/`** — Jeeliz-based alternative implementation
- **`webar-rocks-face/`** — WebAR.rocks.face library files

## Commands

```bash
npm run next:dev          # Next.js dev server (http://localhost:3000)
npm run vue:dev           # Vue dev server (http://localhost:3001)
npm run backend:dev       # Backend WS server (ws://localhost:8080) with --watch
npm run dev:all           # Concurrent backend + next
npm run install:all       # Install deps in next-app, vue-app, and backend
node serve-kiosk.js       # Serve HTTP(5500) + HTTPS(5501), mostra IPs da rede
.\gerar-ssl.ps1           # Gera certificado SSL auto-assinado (requer 1x)
.\iniciar-kiosk.ps1       # Gera SSL (se necessário), inicia servidor e abre navegador
# HTTPS (com câmera) — acesse de qualquer dispositivo na rede:
# https://192.168.18.25:5501  (ou o IP mostrado no console)
# HTTP (sem câmera, navegação apenas):
# http://192.168.18.25:5500
```

## Key facts

- All three frontend variants (vanilla, Next.js, Vue) use Three.js 0.160.0 for 3D rendering
- Face tracking via MediaPipe FaceLandmarker (loaded from CDN at runtime, GPU delegate)
- Glasses are procedurally generated with Three.js geometry (no GLTF models)
- `core/` is NOT a package — it's imported via relative `../../core/` paths from next-app and vue-app
- Next.js uses `transpilePackages: ['three']` for SSRed three.js
- Styles are procedurally generated: 5 shapes, 6 frame colors, 6 lens options
- Backend requires `.env` with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `WS_PORT` (copy from `.env.example`)
- Backend falls back gracefully if Supabase creds or MediaPipe model are unavailable
- Websocket protocol: `frame`/`face-detected`/`face-lost` for real-time tracking; `config-update`/`screenshot` for persistence
- `kiosk/` uses WebAR.rocks.face (different face tracking library) with Bloom post-processing

## Non-obvious

- First run: install deps in each sub-project separately — `npm run install:all` does this
- Supabase schema in `backend/supabase-schema.sql` — apply manually
- `core/engine.js` line 18 uses unpkg CDN for vision bundle (not jsdelivr like vanilla root)
- Face landmark model URL differs between client (`jsdelivr`) and server (`storage.googleapis.com`)
- Vanilla `script.js` is a standalone copy of the core engine (not importing from `core/`)
- **kiosk bug fix**: `index.html` carregava `WebARRocksLMStabilizer.js` e `OneEuroLMStabilizer.js`, ambos declarando `const WebARRocksLMStabilizer`. O segundo script (OneEuro) falhava, causando tela preta após iniciar a câmera. Removido `WebARRocksLMStabilizer.js` do HTML.
- `iniciar-kiosk.ps1` — atalho que inicia o servidor e abre o navegador automaticamente
