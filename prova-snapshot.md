# Provador Virtual - Fábrica dos Óculos

Sistema de provador virtual de óculos com realidade aumentada via webcam. Suporta 4 variações de frontend (Vanilla, Next.js, Vue, Kiosk) com backend WebSocket compartilhado.

---

## Arquitetura

```
provador-online/
├── index.html          # Entrada standalone Vanilla JS
├── script.js           # Cópia standalone do engine (850 linhas)
├── style.css           # Estilos do Vanilla (dark theme, responsivo)
├── package.json        # Scripts raiz: next:dev, vue:dev, backend:dev, dev:all
│
├── core/               # Engine compartilhado (ES modules, sem package.json)
│   ├── constants.js    # GLASSES_STYLES, FRAME_COLORS, LENS_OPTIONS, landmarks
│   ├── engine.js       # TryOnEngine: Three.js scene, MediaPipe, WebSocket, smoothing
│   └── glasses-builder.js  # 5 builders procedurais (round, square, aviator, cateye, sport)
│
├── next-app/           # Next.js 14 (App Router) — porta 3000
│   └── app/page.js          # Página principal com TryOnCanvas
│
├── vue-app/            # Vue 3 + Vite — porta 3001
│   └── src/App.vue          # Componente principal com TryOnCanvas
│
├── backend/            # Servidor WebSocket (Node + Supabase + MediaPipe)
│   └── src/
│       ├── server.js        # WS server (porta 8080), health check, broadcast
│       ├── face-processor.js    # MediaPipe server-side face detection
│       └── supabase.js      # Persistência: sessões, screenshots, realtime
│
├── kiosk/              # Modo loja física (servido por serve-kiosk.js na porta 5500)
│   ├── index.html           # Tela inicial com seleção de gênero
│   ├── js/kiosk.js          # Catálogo de 20+ modelos GLB, WebAR.rocks.face tracking
│   ├── assets/models3D/     # GLB models (Poly Pizza CC0)
│   ├── libs/                # Three.js + EffectComposer + Bloom pass
│   ├── css/kiosk.css
│   └── weights/             # face-api.js weights (age-gender, tiny-face-detector)
│
├── jeelizGlassesVTOWidget/  # Implementação alternativa com Jeeliz
└── webar-rocks-face/        # Biblioteca WebAR.rocks.face
```

---

## UI — Tela Inicial (Kiosk / Vanilla)

A interface de entrada do **Kiosk** (referência para o snapshot):

```
👓 Provador Virtual
Experimente os óculos da nossa fábrica

Selecione seu estilo
  👩 Feminino
  👨 Masculino
  👤 Unissex

Detecção automática em 1s
[ 📷 Iniciar Experiência ]
```

Fluxo:
1. Usuário seleciona gênero (Feminino / Masculino / Unissex)
2. Catálogo filtra modelos compatíveis
3. Botão "Iniciar Experiência" ativa a câmera e tracking facial
4. Óculos 3D são sobrepostos ao rosto em tempo real

---

## Funcionalidades

### Modelos de Óculos (core procedurais — Vanilla/Next/Vue)
| ID | Nome | Geometria |
|---|---|---|
| `round` | Redondo | Círculo com `absellipse` + `TubeGeometry` |
| `square` | Quadrado | Rounded rect com `CatmullRomCurve3` |
| `aviator` | Aviador | Forma de lágrima com curvas quadráticas |
| `cateye` | Gatinho | Pontas elevadas (estilo retrô feminino) |
| `sport` | Esportivo | Lentes largas, hastes envolventes |

### Cores da Armação
Preto, Marrom, Dourado, Prata, Vermelho, Azul

### Opções de Lente
Verde G-15, Gradiente, Azul, Marrom, Amarelo, Transparente

### Ações
- Capturar screenshot (download `.png`)
- Resetar configurações (padrão: Redondo / Preto / Verde G-15)
- WebSocket: sincronização de configurações entre peers

---

## Tecnologias

- **Three.js** 0.160.0 — renderização 3D, geometria procedural, PBR materials
- **MediaPipe FaceLandmarker** — tracking facial com 468 landmarks (GPU delegate)
- **WebSocket** (ws) — comunicação cliente-servidor em tempo real
- **Supabase** — persistência de sessões e screenshots (fallback graceful)
- **WebAR.rocks.face** — tracking alternativo usado no kiosk
- **face-api.js** — detecção de idade/gênero no kiosk

---

## Comandos

```bash
npm run install:all     # Instalar deps em next-app, vue-app e backend
npm run next:dev        # Next.js em http://localhost:3000
npm run vue:dev         # Vue 3 em http://localhost:3001
npm run backend:dev     # WebSocket em ws://localhost:8080
npm run dev:all         # Backend + Next.js concorrentes
node serve-kiosk.js     # Kiosk em http://localhost:5500
```

---

## Protocolo WebSocket

| Tipo | Direção | Descrição |
|---|---|---|
| `frame` | → servidor | Imagem JPEG (base64) para detecção facial |
| `face-detected` | ← cliente | Pose dos óculos calculada (position, rotation, scale) |
| `face-lost` | ← cliente | Rosto perdeu tracking |
| `config-update` | → servidor | Sincronizar estilo/cor/lente |
| `screenshot` | → servidor | Salvar screenshot no Supabase |
| `peer-list` | ← cliente | Lista de peers conectados |
| `config-synced` | ↺ broadcast | Configuração replicada para todos os peers |
