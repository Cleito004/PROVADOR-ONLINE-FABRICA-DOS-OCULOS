import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LM = {
  leftEyeOuter: 33, rightEyeOuter: 263,
  leftEyeInner: 133, rightEyeInner: 362,
  leftTemple: 127, rightTemple: 356,
  leftCheek: 234, rightCheek: 454,
  forehead: 10, chin: 175,
  noseBridge: 168, noseTip: 1, noseBottom: 2, midEye: 168,
  leftEyePupil: 143, rightEyePupil: 372
};

const HM = {
  wrist: 0,
  thumbCMC: 1, thumbMCP: 2, thumbIP: 3, thumbTip: 4,
  indexMCP: 5, indexPIP: 6, indexDIP: 7, indexTip: 8,
  middleMCP: 9, middlePIP: 10, middleDIP: 11, middleTip: 12,
  ringMCP: 13, ringPIP: 14, ringDIP: 15, ringTip: 16,
  pinkyMCP: 17, pinkyPIP: 18, pinkyDIP: 19, pinkyTip: 20,
};

const LENS_COLORS = [
  { color: '#111111', opacity: 0.85, name: 'Preto' },
  { color: '#ffffff', opacity: 0.08, name: 'Transparente' },
  { color: '#ffcc00', opacity: 0.35, name: 'Amarelo' },
];

const FRAME_COLORS_RAINBOW = [
  { r: 255, g: 0,   b: 0   },
  { r: 255, g: 136, b: 0   },
  { r: 255, g: 255, b: 0   },
  { r: 0,   g: 255, b: 0   },
  { r: 0,   g: 136, b: 255 },
  { r: 136, g: 0,   b: 255 },
  { r: 255, g: 0,   b: 255 },
  { r: 139, g: 69,  b: 19  },
  { r: 128, g: 128, b: 128 },
  { r: 0,   g: 0,   b: 0   },
  { r: 255, g: 255, b: 255 },
];

const STYLES = ['square', 'aviator', 'cateye'];

// Rótulos em português, para os avisos na tela combinarem com o #style-matrix.
const STYLE_LABELS = { square: 'Quadrado', aviator: 'Aviador', cateye: 'Gatinho' };

const REF_MODEL_WIDTH = 50;

const CFG = {
  refHeadWidth: 140,
  refFaceHeight: 210,
  glassesDepth: 2,
  glassesDown: 2,
  glassesCenterX: 0,
  // 2.98 = os 3.5 de antes x 0.85, que era o fator que o slider de distância
  // aplicava na escala quando estava em -150. A escala não depende mais da
  // distância (eram duas coisas diferentes acopladas), e o tamanho na tela
  // continua o mesmo de antes.
  glassesScale: 2.98,
};

const STYLE_CONFIG = {
  square:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true },
  aviator: { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0.5, scaleFactor: 0.01, flipY: true },
  cateye:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true },
};

let faceLandmarker;
let handLandmarker;
let glassesGroup;
let occluder = null;
// Plano que corta a metade dianteira da máscara da cabeça, atualizado por frame
// (ver o bloco do occluder em runPrediction). Em coordenadas de mundo.
const occFrontPlane = new THREE.Plane();
const occClipPlanes = [occFrontPlane];
let videoTexture;
let videoSprite;
let renderer, scene, camera;

// Occluder ("máscara invisível da cabeça"): esconde automaticamente as astes
// que ficam atrás da cabeça quando o rosto gira. Ajustável ao vivo pelo console
// via window.OCC (ex: OCC.debug = true; OCC.rz = 0.6).
window.OCC = {
  debug: false, // true = mostra a máscara em vermelho para ajuste visual
  // A máscara precisa alcançar a PONTA das astes, senão a ponta escapa e fica
  // flutuando atrás da orelha. Alcance para trás = (back + rz) x largura do rosto.
  // Dá para ser generoso aqui porque o corte frontal (clip) impede que a máscara
  // maior avance sobre a armação.
  back: 0.38,   // deslocamento do centro para trás do rosto (x largura do rosto)
  rx: 0.52,     // raio horizontal (x largura do rosto)
  ry: 0.62,     // raio vertical (x altura do rosto)
  rz: 0.75,     // raio de profundidade (x largura do rosto)
  clip: true,   // corta a metade dianteira da máscara (ver occFrontPlane)
  front: 0.0,   // onde fica esse corte (x largura do rosto; + = mais à frente)
};

// Suavização do rastreamento. Ajustável ao vivo pelo console (window.SMOOTH).
// Valores MENORES = mais suave e mais tremor filtrado, porém com leve atraso;
// MAIORES = mais colado no rosto, porém tremendo mais. Se ainda tremer, baixe
// SMOOTH.pos e SMOOTH.rot; se parecer "arrastando", suba os dois.
window.SMOOTH = {
  pos: 0.22,       // posição: piso do fator por frame
  scale: 0.15,     // escala: mais lenta ainda, o tamanho quase não muda
  posMax: 0.65,    // teto quando a pessoa se move rápido
  posBoost: 0.02,  // quanto o movimento acelera a resposta
  rot: 0.25,       // rotação: piso
  rotMax: 0.70,    // rotação: teto
  rotBoost: 0.9,
};

// Limiares dos gestos de mão. Ajustáveis ao vivo pelo console (window.GEST),
// no mesmo espírito do OCC: GEST.debug = true mostra as métricas na tela.
window.GEST = {
  debug: false,
  fingerCurl: 1.05,  // ponta mais perto do punho que a base x este fator => dedo abaixado
  thumbTuck: 0.95,   // dist(polegar, base do médio) / tamanho da mão abaixo disto => recolhido
  holdMs: 800,       // tempo que o gesto precisa ficar parado para valer
  edgeMargin: 0.02,  // faixa nas bordas do quadro onde a mão é considerada saindo
};
let video;
let predictionInFlight = false;
let isActive = false;

const smooth = {
  readyPos: false,
  readyRot: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  scale: new THREE.Vector3(1,1,1),
  prev: new THREE.Vector3(),
  buffer: [],
  scanning: false,
  scanFrames: [],
  scanCompleted: false,
  handScanning: false,
  handScanFrames: 0,
  handScanCompleted: false,
};

let currentStyle = 'square';
let currentColor = '#000000';
let currentLensIdx = 0; // índice em LENS_COLORS da lente que está valendo
let currentLensColor = LENS_COLORS[currentLensIdx].color;
let currentLensOpacity = LENS_COLORS[currentLensIdx].opacity;

const gestureState = {
  frameHandClosed: false, // punho fechado da mão da armação => barra RGB ativa
  frameColorIdx: 5,
  frameHandFingers: 0,
  lensHandFingers: 0,
};

function releaseColorStrip() {
  if (!gestureState.frameHandClosed) return;
  gestureState.frameHandClosed = false;
  const strip = document.getElementById('color-strip');
  if (strip) strip.classList.remove('active');
}

let adjHeight = -10;
const adjRotation = 0;
const adjLateral = 0;
// Ajuste fino em torno do recuo correto, que agora vem da geometria do modelo.
// Era -150 (o recuo inteiro, fixo em pixels), o que desalinhava os óculos ao
// inclinar a cabeça — ver o cálculo de zOffset em runPrediction.
let adjDistance = 0;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function qDelta(a, b) { return 2 * Math.acos(clamp(Math.abs(a.dot(b)), 0, 1)); }

function toVec3(pts, i) {
  const vw = (video && video.videoWidth) || 640;
  const vh = (video && video.videoHeight) || 480;
  return new THREE.Vector3(pts[i][0] - vw/2, -pts[i][1] + vh/2, -pts[i][2]);
}

function dist2D(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }

// Tamanho da mão na imagem (punho -> base do dedo médio). Serve de régua para
// normalizar as outras medidas, então os gestos funcionam a qualquer distância.
function handSpan(pts) {
  return Math.max(dist2D(pts[HM.wrist], pts[HM.middleMCP]), 1);
}

// Um dedo está abaixado quando a ponta chega mais perto do punho que a própria
// junta da base. Diferente de comparar Y da ponta com Y da PIP, isto não depende
// da mão estar na vertical.
function isFingerCurled(pts, tip, mcp) {
  const wrist = pts[HM.wrist];
  return dist2D(pts[tip], wrist) < dist2D(pts[mcp], wrist) * window.GEST.fingerCurl;
}

// O polegar só conta como recolhido quando a ponta encosta na palma. Esticado
// para o lado (ou para cima, tipo 👍) a distância cresce e o punho não é aceito.
function isThumbTucked(pts) {
  return dist2D(pts[HM.thumbTip], pts[HM.middleMCP]) < handSpan(pts) * window.GEST.thumbTuck;
}

// Punho fechado de verdade: os 4 dedos abaixados E o polegar recolhido.
function isHandFullyClosed(pts) {
  if (!pts || pts.length < 21) return false;
  const allCurled =
    isFingerCurled(pts, HM.indexTip, HM.indexMCP) &&
    isFingerCurled(pts, HM.middleTip, HM.middleMCP) &&
    isFingerCurled(pts, HM.ringTip, HM.ringMCP) &&
    isFingerCurled(pts, HM.pinkyTip, HM.pinkyMCP);
  return allCurled && isThumbTucked(pts);
}

// A confiabilidade dos landmarks cai quando a mão está entrando ou saindo do
// quadro: no modo vídeo o MediaPipe rastreia pelo bounding box do frame anterior,
// e é justamente aí que a contagem de dedos erra. Nessas bordas ignoramos a
// leitura em vez de aplicar uma troca errada.
// Atenção: não usar na barra RGB, que precisa da mão perto da borda lateral
// para alcançar os extremos do arco-íris.
function isHandFullyVisible(pts) {
  if (!pts || pts.length < 21) return false;
  const w = (video && video.videoWidth) || 640;
  const h = (video && video.videoHeight) || 480;
  const mx = w * window.GEST.edgeMargin;
  const my = h * window.GEST.edgeMargin;
  for (let i = 0; i < pts.length; i++) {
    if (pts[i][0] < mx || pts[i][0] > w - mx) return false;
    if (pts[i][1] < my || pts[i][1] > h - my) return false;
  }
  return true;
}

// Um gesto só vale depois de ficar parado por GEST.holdMs (padrão "dwell" das
// interfaces sem toque). Evita trocas acidentais enquanto a mão entra ou sai do
// quadro — era o que fazia a lente escolhida voltar para a primeira opção.
// `applied` guarda o que já está valendo, para a mão voltar com os mesmos dedos
// sem reaplicar nem repetir o aviso.
const gestureDwell = {
  lens:  { value: null, since: 0, applied: null, locked: false },
  style: { value: null, since: 0, applied: null, locked: false },
};

function trackDwell(slot, value) {
  const st = gestureDwell[slot];
  const now = Date.now();
  if (st.value !== value) {
    st.value = value;
    st.since = now;
  }
  if (st.applied === value) return { progress: 1, fired: false };
  const progress = clamp((now - st.since) / window.GEST.holdMs, 0, 1);
  if (progress >= 1) {
    st.applied = value;
    st.locked = false;
    return { progress: 1, fired: true };
  }
  return { progress, fired: false };
}

// Mão aberta: para de trocar e trava o que está valendo. É o gesto que permite
// tirar a mão da tela sem alterar a escolha.
function lockDwell(slot) {
  const st = gestureDwell[slot];
  st.value = null;
  st.locked = true;
}

const dwellEl = {
  box: null, label: null, fill: null,
};

function showDwellFeedback(text, progress) {
  if (!dwellEl.box) {
    dwellEl.box = document.getElementById('gesture-dwell');
    dwellEl.label = document.getElementById('gesture-dwell-label');
    dwellEl.fill = document.getElementById('gesture-dwell-fill');
  }
  if (!dwellEl.box) return;
  dwellEl.label.textContent = text;
  dwellEl.fill.style.width = Math.round(clamp(progress, 0, 1) * 100) + '%';
  dwellEl.box.classList.add('show');
}

function hideDwellFeedback() {
  if (dwellEl.box) dwellEl.box.classList.remove('show');
}

// countOpenFingers ignora o polegar, então 4 é o máximo: a mão inteira aberta.
const OPEN_HAND_FINGERS = 4;

// Regras dos gestos de contagem de dedos. Lente e modelo se comportam igual:
//   mão entrando/saindo do quadro -> ignora (leitura não confiável)
//   0 dedos                       -> não muda nada
//   1..N dedos                    -> escolhe a opção, valendo após o dwell
//   mão aberta (4)                -> trava o que está valendo
// Devolve null quando não há nada a fazer, ou { idx, progress, fired }.
function readFingerSelection(slot, pts, optionCount, label, currentName) {
  if (!isHandFullyVisible(pts)) return null;

  const fingers = countOpenFingers(pts);

  if (fingers >= OPEN_HAND_FINGERS) {
    lockDwell(slot);
    showDwellFeedback(`🔒 ${label}: ${currentName}`, 1);
    return null;
  }

  // A contagem cai para 0 quando a mão sai do quadro, e antes isso devolvia a
  // lente para a primeira opção (o preto).
  if (fingers < 1) {
    hideDwellFeedback();
    return null;
  }

  const idx = Math.min(fingers - 1, optionCount - 1);
  const { progress, fired } = trackDwell(slot, idx);
  return { idx, progress, fired };
}

function countOpenFingers(pts) {
  if (!pts || pts.length < 21) return 0;
  let count = 0;
  if (pts[HM.indexTip][1] < pts[HM.indexPIP][1]) count++;
  if (pts[HM.middleTip][1] < pts[HM.middlePIP][1]) count++;
  if (pts[HM.ringTip][1] < pts[HM.ringPIP][1]) count++;
  if (pts[HM.pinkyTip][1] < pts[HM.pinkyPIP][1]) count++;
  return count;
}

function handXNormalized(pts) {
  if (!pts || pts.length < 21) return 0.5;
  const wrist = pts[HM.wrist];
  const middleMcp = pts[HM.middleMCP];
  return (wrist[0] + middleMcp[0]) / 2 / (video ? video.videoWidth : 640);
}

function frameColorFromPosition(xNorm) {
  xNorm = clamp(xNorm, 0, 1);
  const idx = xNorm * (FRAME_COLORS_RAINBOW.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, FRAME_COLORS_RAINBOW.length - 1);
  const t = idx - lo;
  const c0 = FRAME_COLORS_RAINBOW[lo];
  const c1 = FRAME_COLORS_RAINBOW[hi];
  const r = Math.round(c0.r + (c1.r - c0.r) * t);
  const g = Math.round(c0.g + (c1.g - c0.g) * t);
  const b = Math.round(c0.b + (c1.b - c0.b) * t);
  return { r, g, b, hex: `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}` };
}

function colorAtPosition(xNorm) {
  xNorm = clamp(xNorm, 0, 1);
  const idx = xNorm * (FRAME_COLORS_RAINBOW.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.min(lo + 1, FRAME_COLORS_RAINBOW.length - 1);
  const t = idx - lo;
  const c0 = FRAME_COLORS_RAINBOW[lo];
  const c1 = FRAME_COLORS_RAINBOW[hi];
  return `rgb(${Math.round(c0.r + (c1.r - c0.r) * t)},${Math.round(c0.g + (c1.g - c0.g) * t)},${Math.round(c0.b + (c1.b - c0.b) * t)})`;
}

function midpoint(a, b) {
  return a.clone().add(b).multiplyScalar(0.5);
}

function eyeMidpoint(pts, inner, outer) {
  return midpoint(toVec3(pts, inner), toVec3(pts, outer));
}

function toPixels(landmarks, v) {
  const w = v.videoWidth, h = v.videoHeight;
  return landmarks.map(l => [l.x * w, l.y * h, l.z * w]);
}

function showToast(msg) {
  let t = document.getElementById('toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 2500);
}

function showGestureStatus(msg) {
  const el = document.getElementById('hand-gesture-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function hideGestureStatus() {
  const el = document.getElementById('hand-gesture-status');
  if (el) el.classList.remove('show');
}

function updateStyleMatrix(activeStyle) {
  document.querySelectorAll('#style-matrix .style-item').forEach(item => {
    item.classList.toggle('active', item.dataset.style === activeStyle);
  });
}

function updateNeedleColor(xNorm) {
  const needle = document.getElementById('color-needle');
  if (needle) {
    needle.style.backgroundColor = colorAtPosition(xNorm);
    needle.style.boxShadow = `0 0 12px ${colorAtPosition(xNorm)}`;
  }
}

const MODEL_CACHE = {};
function getModelEntry(style) { return MODEL_CACHE[style]; }
const MODEL_URLS = {
  square: 'core/assets/models/square.glb',
  aviator: 'core/assets/models/aviator.glb',
  cateye: 'core/assets/models/cateye.glb',
};
let gltfLoader = null;
function getLoader() {
  if (!gltfLoader) gltfLoader = new GLTFLoader();
  return gltfLoader;
}

async function loadAllModels() {
  const loader = getLoader();
  const entries = Object.entries(MODEL_URLS);
  await Promise.all(entries.map(([key, url]) => {
    return new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        const gltfScene = gltf.scene;
        const hasArm = [...gltfScene.children].some(c => {
          let found = false;
          c.traverse(m => {
            if (m.isMesh) {
              const n = (m.name || '').toLowerCase();
              if (n.includes('temple') || n.includes('arm') || n.includes('hastes') || n.includes('braço')) found = true;
            }
          });
          return found;
        });
        if (hasArm) {
          const hidden = [];
          gltfScene.traverse(c => {
            if (c.isMesh) {
              const n = (c.name || '').toLowerCase();
              if (n.includes('temple') || n.includes('arm') || n.includes('hastes') || n.includes('braço')) {
                hidden.push(c);
                c.visible = false;
              }
            }
          });
          const box = new THREE.Box3().setFromObject(gltfScene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          hidden.forEach(c => c.visible = true);
          const normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1;
          MODEL_CACHE[key] = { scene: gltfScene, normFactor };
        } else {
          const box = new THREE.Box3().setFromObject(gltfScene);
          const size = new THREE.Vector3();
          box.getSize(size);
          const maxDim = Math.max(size.x, size.y, size.z);
          const normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1;
          MODEL_CACHE[key] = { scene: gltfScene, normFactor };
        }
        resolve();
      }, undefined, reject);
    });
  }));
}

function splitFrameMesh(mesh, frameMat, leftMat, rightMat, modelHalfW) {
  const geo = mesh.geometry;
  const posAttr = geo.getAttribute('position');
  const normAttr = geo.getAttribute('normal');
  const uvAttr = geo.getAttribute('uv');
  const idx = geo.getIndex();
  if (!posAttr || !idx || idx.count < 3) return null;

  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < posAttr.count; i++) {
    const x = posAttr.getX(i);
    const z = posAttr.getZ(i);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }

  const xSplit = modelHalfW * 0.32;
  const zMid = (minZ + maxZ) / 2;
  const leftTris = [], frameTris = [], rightTris = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const avgX = (posAttr.getX(a) + posAttr.getX(b) + posAttr.getX(c)) / 3;
    if (avgX < -xSplit) leftTris.push(a, b, c);
    else if (avgX > xSplit) rightTris.push(a, b, c);
    else frameTris.push(a, b, c);
  }
  if (leftTris.length === 0 || rightTris.length === 0 || frameTris.length === 0) {
    const leftTris2 = [], frameTris2 = [], rightTris2 = [];
    for (let i = 0; i < idx.count; i += 3) {
      const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
      const avgX = (posAttr.getX(a) + posAttr.getX(b) + posAttr.getX(c)) / 3;
      const avgZ = (posAttr.getZ(a) + posAttr.getZ(b) + posAttr.getZ(c)) / 3;
      const isBehind = avgZ < zMid - (maxZ - minZ) * 0.1;
      if (isBehind && avgX < 0) leftTris2.push(a, b, c);
      else if (isBehind && avgX > 0) rightTris2.push(a, b, c);
      else frameTris2.push(a, b, c);
    }
    if (leftTris2.length > 0 && rightTris2.length > 0 && frameTris2.length > 0) {
      leftTris.length = 0; frameTris.length = 0; rightTris.length = 0;
      leftTris.push(...leftTris2); frameTris.push(...frameTris2); rightTris.push(...rightTris2);
    } else {
      return null;
    }
  }

  const IndexArr = idx.count > 65535 ? Uint32Array : Uint16Array;

  function buildRegion(tris) {
    const unique = [...new Set(tris)];
    const remap = new Map();
    unique.forEach((old, i) => remap.set(old, i));
    const p = new Float32Array(unique.length * 3);
    const n = normAttr ? new Float32Array(unique.length * 3) : null;
    const u = uvAttr ? new Float32Array(unique.length * 2) : null;
    unique.forEach((oi, ni) => {
      p[ni * 3] = posAttr.getX(oi); p[ni * 3 + 1] = posAttr.getY(oi); p[ni * 3 + 2] = posAttr.getZ(oi);
      if (n) { n[ni * 3] = normAttr.getX(oi); n[ni * 3 + 1] = normAttr.getY(oi); n[ni * 3 + 2] = normAttr.getZ(oi); }
      if (u) { u[ni * 2] = uvAttr.getX(oi); u[ni * 2 + 1] = uvAttr.getY(oi); }
    });
    const ix = new IndexArr(tris.length);
    tris.forEach((oi, i) => ix[i] = remap.get(oi));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    if (n) g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    if (u) g.setAttribute('uv', new THREE.BufferAttribute(u, 2));
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    return g;
  }

  function regionZRange(tris) {
    let rMinZ = Infinity, rMaxZ = -Infinity;
    const seen = new Set();
    for (let i = 0; i < tris.length; i++) {
      const vi = tris[i];
      if (seen.has(vi)) continue;
      seen.add(vi);
      const z = posAttr.getZ(vi);
      if (z < rMinZ) rMinZ = z;
      if (z > rMaxZ) rMaxZ = z;
    }
    return { minZ: rMinZ, maxZ: rMaxZ };
  }

  const leftGeo = buildRegion(leftTris);
  const frameGeo = buildRegion(frameTris);
  const rightGeo = buildRegion(rightTris);
  const leftZ = regionZRange(leftTris);
  const rightZ = regionZRange(rightTris);

  const meshes = [
    { geo: leftGeo, mat: leftMat, name: 'leftTemple' },
    { geo: frameGeo, mat: frameMat, name: 'frameCenter' },
    { geo: rightGeo, mat: rightMat, name: 'rightTemple' },
  ].map(({ geo: g, mat: m, name: n }) => {
    const ms = new THREE.Mesh(g, m);
    ms.position.copy(mesh.position);
    ms.quaternion.copy(mesh.quaternion);
    ms.scale.copy(mesh.scale);
    ms.frustumCulled = false;
    ms.renderOrder = 1;
    ms.name = n;
    ms.userData.isLens = false;
    return ms;
  });

  return { leftMesh: meshes[0], frameMesh: meshes[1], rightMesh: meshes[2], leftZ, rightZ };
}

function buildFromModel(style, frameColor, lensColor, lensOpacity) {
  const entry = MODEL_CACHE[style];
  if (!entry || !entry.scene) return new THREE.Group();
  const clone = entry.scene.clone(true);
  const normFactor = entry.normFactor || 1;

  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide,
  });
  const leftTempleMat = new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide,
  });
  const rightTempleMat = new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide,
  });
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.0, roughness: 0.7, side: THREE.DoubleSide,
  });

  const meshes = [];
  clone.traverse(c => {
    if (c.isMesh) { c.frustumCulled = false; meshes.push(c); }
  });

  let lensCount = 0, frameCount = 0;
  const frameMeshes = new Set();
  meshes.forEach(c => {
    const origMat = c.material;
    const meshName = (c.name || '').toLowerCase();
    const matName = (origMat?.name || '').toLowerCase();
    const transParent = origMat?.transparent || origMat?.alphaMode === 'BLEND' || (typeof origMat?.opacity === 'number' && origMat.opacity < 0.99);

    let isLens = c.userData.isLens;
    if (isLens === undefined) {
      if (meshName.includes('temple') || meshName.includes('arm') || meshName.includes('hastes') || meshName.includes('braço')) {
        isLens = false;
      } else if (meshName.includes('lens') || meshName.includes('lente') || meshName.includes('vidro') || meshName.includes('crystal')) {
        isLens = true;
      } else if (matName.includes('lens') || matName.includes('lente') || matName.includes('vidro') || matName.includes('crystal')) {
        isLens = true;
      } else if (transParent) {
        isLens = true;
      } else {
        isLens = false;
      }
    }
    c.material = isLens ? lensMat : frameMat;
    c.userData.isLens = isLens;
    if (isLens) lensCount++;
    else { frameCount++; frameMeshes.add(c); }
  });

  if (lensCount === 0 && frameCount > 0 && meshes.length >= 2) {
    const candidates = meshes.filter(m => {
      const name = (m.name || '').toLowerCase();
      return !name.includes('temple') && !name.includes('arm') && !name.includes('hastes') && !name.includes('braço');
    });
    if (candidates.length >= 2) {
      const sorted = candidates.map(m => {
        const box = new THREE.Box3().setFromObject(m);
        const size = box.max.clone().sub(box.min);
        return { mesh: m, volume: size.x * size.y * size.z };
      }).sort((a, b) => a.volume - b.volume);
      const nLens = Math.max(1, Math.floor(sorted.length / 2));
      sorted.slice(0, nLens).forEach(({ mesh }) => {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: lensColor, transparent: true, opacity: lensOpacity,
          metalness: 0.0, roughness: 0.7, side: THREE.DoubleSide,
        });
      });
      sorted.slice(nLens).forEach(({ mesh }) => {
        mesh.material = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide });
        frameMeshes.add(mesh);
      });
    }
  }

  meshes.forEach(m => { m.renderOrder = 1; m.depthTest = true; m.scale.z = 1.25; });

  let bestFrameMesh = null, bestXRange = 0;
  frameMeshes.forEach(m => {
    const b = new THREE.Box3().setFromObject(m);
    const xR = b.max.x - b.min.x;
    if (xR > bestXRange) { bestXRange = xR; bestFrameMesh = m; }
  });
  const modelBox = new THREE.Box3().setFromObject(clone);
  const modelHalfW = (modelBox.max.x - modelBox.min.x) * 0.5;

  let splitLeftMesh = null, splitRightMesh = null;
  let splitLeftZ = null, splitRightZ = null;
  if (bestFrameMesh && bestXRange > modelHalfW * 0.25) {
    const split = splitFrameMesh(bestFrameMesh, frameMat, leftTempleMat, rightTempleMat, modelHalfW);
    if (split) {
      const parent = bestFrameMesh.parent;
      parent.remove(bestFrameMesh);
      parent.add(split.leftMesh);
      parent.add(split.frameMesh);
      parent.add(split.rightMesh);
      frameMeshes.delete(bestFrameMesh);
      frameMeshes.add(split.frameMesh);
      splitLeftMesh = split.leftMesh;
      splitRightMesh = split.rightMesh;
      splitLeftZ = split.leftZ;
      splitRightZ = split.rightZ;
    } else {
    }
  } else {
  }

  if (splitLeftZ && leftTempleMat) {
    const tipCut = splitLeftZ.minZ + (splitLeftZ.maxZ - splitLeftZ.minZ) * 0.22;
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -tipCut);
    leftTempleMat.clippingPlanes = [clipPlane];
    leftTempleMat.clipShadows = true;
    leftTempleMat.needsUpdate = true;
  }
  if (splitRightZ && rightTempleMat) {
    const tipCut = splitRightZ.minZ + (splitRightZ.maxZ - splitRightZ.minZ) * 0.22;
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -tipCut);
    rightTempleMat.clippingPlanes = [clipPlane];
    rightTempleMat.clipShadows = true;
    rightTempleMat.needsUpdate = true;
  }

  const frameMats = [];
  clone.traverse(c => {
    if (c.isMesh && !c.userData.isLens && c.name !== 'leftTemple' && c.name !== 'rightTemple')
      frameMats.push(c.material);
  });

  const box = new THREE.Box3().setFromObject(clone);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const centerOffset = new THREE.Vector3().copy(center).negate();
  const centered = new THREE.Group();
  centered.position.copy(centerOffset);
  centered.add(clone);

  const normGroup = new THREE.Group();
  normGroup.frustumCulled = false;
  normGroup.renderOrder = 1;
  normGroup.scale.set(normFactor, normFactor, normFactor);
  normGroup.add(centered);

  const wrapper = new THREE.Group();
  wrapper.frustumCulled = false;
  wrapper.renderOrder = 1;
  wrapper.userData.frameMaterials = frameMats;
  wrapper.userData.frameMat = frameMat;
  wrapper.userData.leftTempleMat = leftTempleMat;
  wrapper.userData.rightTempleMat = rightTempleMat;
  const bSize = new THREE.Vector3();
  box.getSize(bSize);
  wrapper.userData.templeLen = bSize.z * 0.5;
  // Metade da profundidade do modelo, já em unidades normalizadas: é o recuo
  // que põe as lentes sobre os olhos (ver o cálculo de zOffset em runPrediction).
  wrapper.userData.depthHalf = bSize.z * 0.5 * normFactor;
  wrapper.userData.halfW = bSize.x * 0.5;
  wrapper.userData.halfH = bSize.y * 0.5;
  wrapper.userData.leftTempleMesh = splitLeftMesh;
  wrapper.userData.rightTempleMesh = splitRightMesh;
  wrapper.userData.tipClipLeft = leftTempleMat?.clippingPlanes || [];
  wrapper.userData.tipClipRight = rightTempleMat?.clippingPlanes || [];
  wrapper.add(normGroup);
  return wrapper;
}

function rebuildGlasses() {
  if (!scene) return;
  if (glassesGroup) {
    scene.remove(glassesGroup);
    glassesGroup.traverse(c => {
      if (c.isMesh) {
        c.geometry && c.geometry.dispose();
        c.material && c.material.dispose();
      }
    });
  }
  glassesGroup = buildFromModel(currentStyle, currentColor, currentLensColor, currentLensOpacity);
  if (smooth.readyPos) {
    glassesGroup.position.copy(smooth.pos);
    glassesGroup.quaternion.copy(smooth.quat);
    glassesGroup.scale.copy(smooth.scale);
  }
  scene.add(glassesGroup);
  if (!isActive) {
    glassesGroup.visible = false;
  }
}

async function initScene(videoEl) {
  video = videoEl;
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 480;
  await loadAllModels();

  camera = new THREE.OrthographicCamera(-vw/2, vw/2, vh/2, -vh/2, 0.1, 5000);
  camera.position.set(0, 0, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vw, vh);
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const container = document.getElementById('threejs-container');
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.wrapS = THREE.ClampToEdgeWrapping;

  const videoEnhanceMaterial = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: videoTexture },
      uBrightness: { value: 0.06 },
      uContrast: { value: 0.08 },
      uSaturation: { value: 1.08 },
      uSharpen: { value: 0.35 },
      uTexelSize: { value: new THREE.Vector2(1.0 / vw, 1.0 / vh) },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D tDiffuse;
      uniform float uBrightness;
      uniform float uContrast;
      uniform float uSaturation;
      uniform float uSharpen;
      uniform vec2 uTexelSize;
      varying vec2 vUv;
      void main() {
        vec4 color = texture2D(tDiffuse, vUv);
        color.rgb += uBrightness;
        if (uContrast > 0.0) {
          color.rgb = (color.rgb - 0.5) / (1.0 - uContrast) + 0.5;
        } else {
          color.rgb = (color.rgb - 0.5) * (1.0 + uContrast) + 0.5;
        }
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(luma), color.rgb, uSaturation);
        if (uSharpen > 0.0) {
          vec4 n  = texture2D(tDiffuse, vUv + vec2(0.0, uTexelSize.y));
          vec4 s  = texture2D(tDiffuse, vUv - vec2(0.0, uTexelSize.y));
          vec4 e  = texture2D(tDiffuse, vUv + vec2(uTexelSize.x, 0.0));
          vec4 w  = texture2D(tDiffuse, vUv - vec2(uTexelSize.x, 0.0));
          vec4 blur = (n + s + e + w) * 0.25;
          color.rgb += (color.rgb - blur.rgb) * uSharpen;
        }
        color.rgb = clamp(color.rgb, 0.0, 1.0);
        gl_FragColor = color;
      }
    `,
    depthWrite: false,
  });

  videoSprite = new THREE.Sprite(videoEnhanceMaterial);
  videoSprite.center.set(0.5, 0.5);
  videoSprite.scale.set(vw, vh, 1);
  videoSprite.position.set(0, 0, 0);
  scene.add(videoSprite);

  scene.environment = makeEnvMap();
  scene.environmentIntensity = 0.08;

  const amb = new THREE.HemisphereLight(0xffffff, 0x8888cc, 0.8);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.0);
  key.position.set(0, 200, 300);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xaaccff, 0.6);
  fill.position.set(-150, 50, 150);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.5);
  rim.position.set(80, 100, -150);
  scene.add(rim);

  glassesGroup = new THREE.Group();
  scene.add(glassesGroup);
  glassesGroup.visible = false;
  rebuildGlasses();

  // Occluder: esfera (unitária) que será escalada como elipsoide da cabeça.
  // colorWrite:false => invisível na tela; depthWrite:true => ocupa profundidade,
  // escondendo qualquer parte dos óculos que fique atrás dela (aste do lado oposto).
  const occGeo = new THREE.SphereGeometry(1, 32, 24);
  const occMat = new THREE.MeshBasicMaterial({ colorWrite: false });
  occluder = new THREE.Mesh(occGeo, occMat);
  // renderOrder entre o vídeo de fundo (0) e os óculos (1): escreve profundidade
  // DEPOIS do vídeo (para não furar o fundo) e ANTES dos óculos (para ocluí-los).
  occluder.renderOrder = 0.5;
  occluder.visible = false;
  scene.add(occluder);

  window.addEventListener('resize', () => {
    const vw2 = video.videoWidth || 640;
    const vh2 = video.videoHeight || 480;
    camera.left = -vw2/2;
    camera.right = vw2/2;
    camera.top = vh2/2;
    camera.bottom = -vh2/2;
    camera.updateProjectionMatrix();
    renderer.setSize(vw2, vh2);
    videoSprite.scale.set(vw2, vh2, 1);
    videoSprite.position.set(0, 0, 0);
    if (videoEnhanceMaterial.uniforms) {
      videoEnhanceMaterial.uniforms.uTexelSize.value.set(1.0 / vw2, 1.0 / vh2);
    }
  });

  function animate() {
    requestAnimationFrame(animate);
    if (videoTexture) videoTexture.needsUpdate = true;
    renderer.render(scene, camera);
  }
  animate();
}

function makeEnvMap() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.3, '#d8d8f0');
  grad.addColorStop(0.6, '#8888bb');
  grad.addColorStop(1, '#222244');
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 512);
  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function initMediaPipe(delegate) {
  const dl = delegate || 'GPU';
  const VISION_CDN = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.7';
  try {
    loadingText.textContent = 'Baixando motor de IA...';
    const vision = await withTimeout(
      import(`${VISION_CDN}/vision_bundle.mjs`), 15000, 'import vision_bundle'
    );

    loadingText.textContent = 'Compilando WASM...';
    const fileset = await withTimeout(
      vision.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`), 15000, 'FilesetResolver'
    );

    loadingText.textContent = `Carregando modelo facial (${dl})...`;
    faceLandmarker = await withTimeout(
      vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
          delegate: dl
        },
        runningMode: 'VIDEO',
        numFaces: 1,
        minFaceDetectionConfidence: 0.5,
        minFacePresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: false
      }), 20000, 'FaceLandmarker'
    );

    loadingText.textContent = 'Carregando modelo das mãos...';
    handLandmarker = await withTimeout(
      vision.HandLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
          delegate: dl
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      }), 20000, 'HandLandmarker'
    );

    return true;
  } catch (e) {
    console.warn(`MediaPipe ${dl} falhou:`, e.message || e);
    if (dl === 'GPU') {
      console.log('Tentando fallback para CPU...');
      return initMediaPipe('CPU');
    }
    console.error('Falha ao carregar MediaPipe:', e);
    return false;
  }
}

function schedulePrediction() {
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(runPrediction);
  } else {
    requestAnimationFrame(runPrediction);
  }
}

function runPrediction() {
  if (predictionInFlight) { schedulePrediction(); return; }
  predictionInFlight = true;

  if (!faceLandmarker || !glassesGroup) {
    predictionInFlight = false;
    schedulePrediction();
    return;
  }

  try {
    const detection = faceLandmarker.detectForVideo(video, performance.now());
    const results = { faceLandmarks: detection.faceLandmarks || [] };

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const pts = toPixels(results.faceLandmarks[0], video);

      const lEye = eyeMidpoint(pts, LM.leftEyeInner, LM.leftEyeOuter);
      const rEye = eyeMidpoint(pts, LM.rightEyeInner, LM.rightEyeOuter);
      const nose = toVec3(pts, LM.noseBridge);
      const nTip = toVec3(pts, LM.noseTip);
      const fHead = toVec3(pts, LM.forehead);
      const chn = toVec3(pts, LM.chin);
      const lTmp = toVec3(pts, LM.leftTemple);
      const rTmp = toVec3(pts, LM.rightTemple);
      const lChk = toVec3(pts, LM.leftCheek);
      const rChk = toVec3(pts, LM.rightCheek);

      const sc = STYLE_CONFIG[currentStyle] || STYLE_CONFIG.square;
      const eMid = midpoint(lEye, rEye);
      const eW = lEye.distanceTo(rEye);
      const tW = lTmp.distanceTo(rTmp);
      const cW = lChk.distanceTo(rChk);
      const fW = Math.max(eW, tW, cW);
      const fH = fHead.distanceTo(chn);

      const yRaw = fHead.clone().sub(chn).normalize();
      const yAxis = yRaw;
      const xRaw = lTmp.clone().sub(rTmp).normalize();
      let zAxis = xRaw.clone().cross(yAxis).normalize();
      if (zAxis.dot(nTip.clone().sub(nose).normalize()) < 0) zAxis.negate();
      const xAxis = yAxis.clone().cross(zAxis).normalize();

      const wS = fW / CFG.refHeadWidth;
      const hS = fH / CFG.refFaceHeight;
      const bS = wS * 0.7 + hS * 0.3;

      // Tamanho do rosto em relação à distância de referência: 1.0 quando a
      // largura medida é igual a CFG.refHeadWidth. Tudo que desloca os óculos é
      // expresso nesta unidade, então a posição relativa ao rosto não muda
      // quando a pessoa se aproxima ou se afasta da câmera.
      // Usamos só a largura (e não bS) porque a altura do rosto encurta quando a
      // cabeça se inclina, o que fazia os óculos escorregarem no pitch.
      const fwNorm = fW / CFG.refHeadWidth;

      // Profundidade do nariz normalizada pelo tamanho do rosto: adimensional,
      // ao contrário do valor em pixels, que cresce junto com a proximidade.
      // O fator refHeadWidth * 0.06 mantém exatamente o mesmo resultado de antes
      // na distância de referência (fW = 140).
      const noseDepth = (nTip.z - nose.z) / Math.max(fW, 1);
      const depAdj = clamp(noseDepth * CFG.refHeadWidth * 0.06, -1, 3);

      const tScaleVal = bS * CFG.glassesScale;
      const tScale = new THREE.Vector3(tScaleVal, tScaleVal, tScaleVal);

      // O wrapper do modelo é centrado no meio da armação, e as astes ocupam
      // toda a metade de trás. Para as LENTES caírem sobre os olhos, o centro
      // precisa recuar metade da profundidade do modelo — na escala em que ele
      // está sendo desenhado agora.
      //
      // Antes esse recuo era um valor fixo em pixels (adjDistance = -150), o que
      // criava um braço de alavanca ao longo do eixo do nariz: como esse eixo
      // gira junto com a cabeça, inclinar para baixo jogava os óculos para a
      // testa e inclinar para cima jogava para o queixo, além de multiplicar o
      // ruído do rastreamento. Derivando do modelo, o recuo é o mínimo
      // necessário e acompanha o tamanho do rosto.
      const depthHalf = (glassesGroup.userData && glassesGroup.userData.depthHalf) || 0;
      const zOffset = -depthHalf * tScaleVal + (CFG.glassesDepth + depAdj + adjDistance) * fwNorm;

      const tPos = eMid.clone()
        .addScaledVector(xAxis, sc.centerX + adjLateral)
        .addScaledVector(yAxis, adjHeight)
        .addScaledVector(zAxis, zOffset);

      let rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      if (adjRotation !== 0) {
        const tilt = new THREE.Matrix4().makeRotationZ(THREE.MathUtils.degToRad(adjRotation));
        rotMat.multiply(tilt);
      }
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

      if (!smooth.scanCompleted) {
        if (!smooth.scanning) {
          smooth.scanning = true;
          smooth.scanFrames = [];
          scanOverlay.classList.remove('hidden');
          scanStatus.textContent = 'Escaneando...';
          scanProgressBar.style.width = '0%';
        }
        // O scan serve só para dar tempo do tracking estabilizar antes de mostrar
        // os óculos; a profundidade não é mais calibrada aqui (era o refNoseZ,
        // que amarrava a posição à distância em que a pessoa estava no scan).
        smooth.scanFrames.push(1);
        const pct = Math.min(smooth.scanFrames.length / 10, 1) * 100;
        scanProgressBar.style.width = pct + '%';
        if (smooth.scanFrames.length >= 10) {
          smooth.scanCompleted = true;
          smooth.scanning = false;
          scanOverlay.classList.add('hidden');
        } else {
          scanStatus.textContent = `${smooth.scanFrames.length}/10`;
        }
      }

      const avgPos = tPos.clone();
      const mov = avgPos.distanceTo(smooth.prev);
      smooth.prev.copy(avgPos);

      // O fator do lerp é quanto do caminho até o alvo se percorre por frame:
      // 1.0 = pula direto (nenhum filtro), valores baixos = mais suave. Estava em
      // 0.97, ou seja praticamente sem filtro, e todo o tremor do rastreamento
      // aparecia na tela. A base baixa segura o tremor parado; o termo de
      // movimento devolve a resposta rápida quando a pessoa realmente se mexe.
      const S = window.SMOOTH;
      const aP = clamp(S.pos + mov * S.posBoost, S.pos, S.posMax);
      const aS = clamp(S.scale + mov * S.posBoost, S.scale, S.posMax);

      if (!smooth.readyPos) {
        smooth.pos.copy(avgPos);
        smooth.scale.copy(tScale);
        smooth.readyPos = true;
      } else {
        smooth.pos.lerp(avgPos, aP);
        smooth.scale.lerp(tScale, aS);
      }

      if (!smooth.readyRot) {
        smooth.quat.copy(targetQuat);
        smooth.readyRot = true;
      } else {
        const aR = qDelta(smooth.quat, targetQuat);
        smooth.quat.slerp(targetQuat, clamp(S.rot + aR * S.rotBoost, S.rot, S.rotMax));
      }

      const fi = document.getElementById('face-info');
      if (fi) { fi.textContent = `Formato: detectado`; fi.classList.remove('hidden'); }

      glassesGroup.position.copy(smooth.pos);
      glassesGroup.quaternion.copy(smooth.quat);
      glassesGroup.scale.copy(smooth.scale);
      if (!glassesGroup.visible) glassesGroup.visible = true;
      glassesGroup.updateWorldMatrix(true, true);

      // ===== Occluder (máscara invisível da cabeça) =====
      if (occluder) {
        const O = window.OCC;
        // Centro da cabeça = ponto médio dos olhos, deslocado para trás do rosto
        const headCenter = eMid.clone().addScaledVector(zAxis, -O.back * fW);
        occluder.position.copy(headCenter);
        // Orientação alinhada aos eixos da cabeça
        const occBasis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
        occluder.quaternion.setFromRotationMatrix(occBasis);
        // Tamanho do elipsoide (esfera unitária escalada)
        occluder.scale.set(O.rx * fW, O.ry * fH, O.rz * fW);
        occluder.visible = true;

        const m = occluder.material;

        // A máscara só deve esconder o que está ATRÁS do rosto. Ela gira junto
        // com a cabeça, então com a cabeça muito abaixada ou levantada o raio
        // maior do elipsoide (o vertical, ry * fH) passa a apontar para a câmera,
        // invade a frente do rosto e apaga as DUAS astes de uma vez. Cortar a
        // metade dianteira resolve isso: o corte só reduz oclusão, nunca aumenta,
        // então o giro lateral continua escondendo a aste oposta como antes.
        if (O.clip) {
          const planePoint = eMid.clone().addScaledVector(zAxis, O.front * fW);
          occFrontPlane.setFromNormalAndCoplanarPoint(zAxis.clone().negate(), planePoint);
          if (m.clippingPlanes !== occClipPlanes) {
            m.clippingPlanes = occClipPlanes;
            m.needsUpdate = true;
          }
        } else if (m.clippingPlanes && m.clippingPlanes.length) {
          m.clippingPlanes = [];
          m.needsUpdate = true;
        }

        // Modo debug: mostra a máscara em vermelho semitransparente para ajuste.
        // Só reconfigura o material quando o modo muda — needsUpdate a cada frame
        // recompila o shader sem necessidade.
        if (m.userData.debugApplied !== O.debug) {
          m.userData.debugApplied = O.debug;
          if (O.debug) {
            m.colorWrite = true;
            m.transparent = true;
            m.opacity = 0.45;
            m.color.set(0xff0033);
          } else {
            m.colorWrite = false;
            m.transparent = false;
            m.opacity = 1.0;
          }
          m.needsUpdate = true;
        }
      }

      try {
        const yaw = Math.atan2(zAxis.x, zAxis.z);
        const absYaw = Math.abs(yaw);
        const pitch = Math.asin(clamp(-zAxis.y, -1, 1));
        const absPitch = Math.abs(pitch);

        const PITCH_START = 0.15;
        const PITCH_FULL = 0.45;
        const YAW_START = 0.08;
        const YAW_FULL = 0.25;

        const pitchFade = clamp((absPitch - PITCH_START) / (PITCH_FULL - PITCH_START), 0, 1);
        const yawFade = clamp((absYaw - YAW_START) / (YAW_FULL - YAW_START), 0, 1);

        const ud = glassesGroup.userData || {};
        const leftMat = ud.leftTempleMat;
        const rightMat = ud.rightTempleMat;
        const fMat = ud.frameMat;

        let leftMesh = ud.leftTempleMesh;
        let rightMesh = ud.rightTempleMesh;

        if (!leftMesh || !rightMesh) {
          glassesGroup.traverse(c => {
            if (c.isMesh) {
              const n = (c.name || '').toLowerCase();
              if (n.includes('lefttemple') || n.includes('left_arm') || n.includes('left_haste')) leftMesh = c;
              if (n.includes('righttemple') || n.includes('right_arm') || n.includes('right_haste')) rightMesh = c;
            }
          });
        }

        const hasSeparateTemples = !!(leftMesh && rightMesh);

        // Astes sempre 100% visíveis - o occluder (máscara da cabeça) cuida de
        // esconder automaticamente a aste que fica atrás da cabeça ao girar o rosto.
        let leftOp = 1.0, rightOp = 1.0;

        if (hasSeparateTemples) {
          leftMesh.visible = leftOp > 0.01;
          rightMesh.visible = rightOp > 0.01;

          if (leftMat) {
            leftMat.transparent = leftOp < 0.99;
            leftMat.opacity = leftOp;
            leftMat.needsUpdate = true;
          }
          if (rightMat) {
            rightMat.transparent = rightOp < 0.99;
            rightMat.opacity = rightOp;
            rightMat.needsUpdate = true;
          }
          if (fMat) {
            fMat.clippingPlanes = [];
            fMat.transparent = false;
            fMat.opacity = 1.0;
            fMat.needsUpdate = true;
          }
        } else {
          const frameOp = Math.min(leftOp, rightOp);
          const allMats = [fMat, leftMat, rightMat].filter(Boolean);

          if (frameOp < 0.99) {
            allMats.forEach(m => {
              if (!m._origTransparent) {
                m._origTransparent = m.transparent;
                m._origOpacity = m.opacity;
              }
              m.transparent = true;
              m.opacity = frameOp;
              m.depthWrite = frameOp > 0.7;
              m.needsUpdate = true;
            });
          } else {
            allMats.forEach(m => {
              if (m._origTransparent !== undefined) {
                m.transparent = m._origTransparent;
                m.opacity = m._origOpacity;
                delete m._origTransparent;
                delete m._origOpacity;
              } else {
                m.transparent = false;
                m.opacity = 1.0;
              }
              m.depthWrite = true;
              m.clippingPlanes = [];
              m.needsUpdate = true;
            });
          }
        }
      } catch (e) {
        console.warn('[TEMPLE] Error:', e);
      }
    } else {
      if (glassesGroup) glassesGroup.visible = false;
      if (occluder) occluder.visible = false;
      const ud2 = glassesGroup?.userData;
      const cleanMats = [ud2?.leftTempleMat, ud2?.rightTempleMat, ud2?.frameMat].filter(Boolean);
      cleanMats.forEach(m => {
        if (m._origTransparent !== undefined) {
          m.transparent = m._origTransparent;
          m.opacity = m._origOpacity;
          delete m._origTransparent;
          delete m._origOpacity;
        } else {
          m.transparent = false;
          m.opacity = 1.0;
        }
        m.depthWrite = true;
        m.needsUpdate = true;
      });
      if (ud2?.leftTempleMat && ud2.tipClipLeft) ud2.leftTempleMat.clippingPlanes = ud2.tipClipLeft;
      if (ud2?.rightTempleMat && ud2.tipClipRight) ud2.rightTempleMat.clippingPlanes = ud2.tipClipRight;
      if (ud2?.frameMat) ud2.frameMat.clippingPlanes = [];
      if (ud2?.leftTempleMesh) ud2.leftTempleMesh.visible = true;
      if (ud2?.rightTempleMesh) ud2.rightTempleMesh.visible = true;
      smooth.readyPos = false;
      smooth.readyRot = false;
      smooth.scanning = false;
      smooth.scanCompleted = false;
      smooth.scanFrames = [];
      if (!scanOverlay.classList.contains('hidden')) {
        scanOverlay.classList.add('hidden');
      }
      const fi = document.getElementById('face-info');
      if (fi) fi.classList.add('hidden');
    }

    if (handLandmarker) {
      try {
        const handResult = handLandmarker.detectForVideo(video, performance.now());
        const handLandmarks = handResult.landmarks || [];

        if (smooth.scanCompleted) {
          if (!smooth.handScanCompleted) {
            if (!smooth.handScanning) {
              smooth.handScanning = true;
              smooth.handScanFrames = 0;
              showGestureStatus('Mostre as duas mãos abertas');
            }
            if (handLandmarks.length >= 1) smooth.handScanFrames++;
            if (smooth.handScanFrames >= 15) {
              smooth.handScanCompleted = true;
              smooth.handScanning = false;
              hideGestureStatus();
              showToast('Mãos calibradas! Use gestos para controlar');
            }
            predictionInFlight = false;
            schedulePrediction();
            return;
          }

          // O MediaPipe recebe a imagem NÃO espelhada (o scaleX(-1) do #webcam e
          // do #threejs-container é só exibição). Nessa imagem a pessoa aparece
          // como se estivesse de frente para você: a mão DIREITA dela cai na
          // metade esquerda (x < 0.5) e a ESQUERDA na metade direita (x >= 0.5).
          // Daí o mapeamento: mão direita comanda armação + modelo, mão esquerda
          // comanda a lente (é o que o guia em onboarding.html documenta).
          // A metade da imagem é mais confiável que deduzir a mão pela anatomia
          // (indexMCP vs pinkyMCP), que troca de resultado com a palma virada.
          let handFrame = null; // mão direita da pessoa: cor da armação + modelo
          let handLens = null;  // mão esquerda da pessoa: cor da lente

          for (let h = 0; h < handLandmarks.length; h++) {
            const hpts = handLandmarks[h].map(l => [l.x * (video.videoWidth || 640), l.y * (video.videoHeight || 480), l.z * (video.videoWidth || 640)]);
            if (handXNormalized(hpts) < 0.5) handFrame = hpts;
            else handLens = hpts;
          }

          // ── Mão da lente: 1 = Preto, 2 = Transparente, 3 = Amarelo ────────
          if (handLens) {
            const sel = readFingerSelection(
              'lens', handLens, LENS_COLORS.length, 'Lente', LENS_COLORS[currentLensIdx].name
            );
            if (sel) {
              const opt = LENS_COLORS[sel.idx];
              if (sel.fired) {
                currentLensIdx = sel.idx;
                currentLensColor = opt.color;
                currentLensOpacity = opt.opacity;
                rebuildGlasses();
                showToast(`Lente: ${opt.name}`);
                showDwellFeedback(`Lente: ${opt.name} ✓`, 1);
              } else {
                showDwellFeedback(`Lente: ${opt.name}`, sel.progress);
              }
            }
            gestureState.lensHandFingers = countOpenFingers(handLens);
          } else {
            gestureState.lensHandFingers = 0;
          }

          // ── Mão da armação: punho fechado arrasta a barra RGB ─────────────
          if (handFrame) {
            const isClosed = isHandFullyClosed(handFrame);

            if (window.GEST.debug) {
              const tuck = (dist2D(handFrame[HM.thumbTip], handFrame[HM.middleMCP]) / handSpan(handFrame)).toFixed(2);
              showGestureStatus(`punho:${isClosed ? 'sim' : 'nao'} polegar:${tuck} dedos:${countOpenFingers(handFrame)}`);
            }

            if (isClosed) {
              if (!gestureState.frameHandClosed) {
                gestureState.frameHandClosed = true;
                const strip = document.getElementById('color-strip');
                if (strip) strip.classList.add('active');
              }
              const sensitiveX = clamp((0.47 - handXNormalized(handFrame)) / 0.38, 0, 1);

              const fc = frameColorFromPosition(sensitiveX);
              if (fc.hex !== currentColor) {
                currentColor = fc.hex;
                gestureState.frameColorIdx = Math.round(sensitiveX * (FRAME_COLORS_RAINBOW.length - 1));
                rebuildGlasses();
              }

              const needle = document.getElementById('color-needle');
              if (needle) needle.style.left = (sensitiveX * 100) + '%';
              updateNeedleColor(sensitiveX);
              if (!window.GEST.debug) showGestureStatus('Armação: cor RGB');
            } else {
              releaseColorStrip();

              // Dedos abertos trocam o modelo: 1 = Quadrado, 2 = Aviador, 3 = Gatinho.
              const sel = readFingerSelection(
                'style', handFrame, STYLES.length, 'Modelo', STYLE_LABELS[currentStyle]
              );
              if (sel) {
                const styleId = STYLES[sel.idx];
                if (sel.fired) {
                  if (styleId !== currentStyle) {
                    currentStyle = styleId;
                    rebuildGlasses();
                    updateStyleMatrix(currentStyle);
                    showToast(`Modelo: ${STYLE_LABELS[styleId]}`);
                  }
                  showDwellFeedback(`Modelo: ${STYLE_LABELS[styleId]} ✓`, 1);
                } else {
                  showDwellFeedback(`Modelo: ${STYLE_LABELS[styleId]}`, sel.progress);
                }
              }
              gestureState.frameHandFingers = countOpenFingers(handFrame);
              if (!window.GEST.debug) hideGestureStatus();
            }
          } else {
            releaseColorStrip();
            if (!window.GEST.debug) hideGestureStatus();
          }

          // Sem nenhuma mão em cena não há gesto em andamento para mostrar.
          // As escolhas já aplicadas continuam valendo.
          if (!handFrame && !handLens) hideDwellFeedback();
        }
      } catch (e) { /* hand error */ }
    }
  } catch (e) {
    console.warn('Prediction error:', e);
  }

  predictionInFlight = false;
  schedulePrediction();
}

const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const errorOverlay = document.getElementById('error-overlay');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const webcam = document.getElementById('webcam');

const scanOverlay = document.getElementById('scan-overlay');
const scanTitle = document.getElementById('scan-title');
const scanMessage = document.getElementById('scan-message');
const scanProgressBar = document.getElementById('scan-progress-bar');
const scanStatus = document.getElementById('scan-status');

document.querySelectorAll('#adjustment-panel input[type="range"]').forEach(slider => {
  slider.addEventListener('input', () => {
    const d = document.getElementById('adj-distance');
    const dv = document.getElementById('adj-distance-value');
    if (d) adjDistance = parseFloat(d.value);
    if (dv) dv.textContent = d ? d.value : '-150';
    const h = document.getElementById('adj-height');
    const hv = document.getElementById('adj-height-value');
    if (h) adjHeight = parseFloat(h.value);
    if (hv) hv.textContent = h ? h.value : '0';
  });
});

function showError(title, msg) {
  loadingOverlay.classList.add('hidden');
  errorTitle.textContent = title;
  errorMessage.textContent = msg;
  errorOverlay.classList.remove('hidden');
}

function stopStream() {
  if (webcam.srcObject) {
    webcam.srcObject.getTracks().forEach(t => t.stop());
    webcam.srcObject = null;
  }
  if (renderer) {
    const container = document.getElementById('threejs-container');
    if (renderer.domElement.parentNode === container) {
      container.removeChild(renderer.domElement);
    }
    renderer.dispose();
    renderer = null;
  }
  video = null;
  videoTexture = null;
  videoSprite = null;
  predictionInFlight = false;
  isActive = false;
  smooth.readyPos = false;
  smooth.readyRot = false;
  smooth.scanning = false;
  smooth.scanCompleted = false;
  smooth.scanFrames = [];
}

let autoRetryCount = 0;
const MAX_AUTO_RETRY = 3;
let autoStartDone = false;

async function startApp() {
  console.log('[DEBUG] startApp called');
  stopStream();
  errorOverlay.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Ativando câmera...';

  try {
    console.log('[DEBUG] Requesting camera...');
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    console.log('[DEBUG] Camera stream obtained');
    webcam.srcObject = stream;
    await webcam.play();
    console.log('[DEBUG] Video playing, dimensions:', webcam.videoWidth, 'x', webcam.videoHeight);
    await new Promise(r => { const c = () => { if (webcam.videoWidth > 0) r(); else requestAnimationFrame(c); }; requestAnimationFrame(c); });
  } catch (e) {
    console.error('[DEBUG] Camera error:', e.message);
    loadingOverlay.classList.add('hidden');
    if (autoRetryCount < MAX_AUTO_RETRY) {
      autoRetryCount++;
      showToast(`Tentativa ${autoRetryCount}/${MAX_AUTO_RETRY}...`);
      setTimeout(startApp, 3000);
    } else {
      showToast('Câmera indisponível. Verifique as permissões.');
    }
    return;
  }

  loadingText.textContent = 'Inicializando cena 3D...';
  await new Promise(r => setTimeout(r, 100));

  console.log('[DEBUG] Initializing scene...');
  await initScene(webcam);
  console.log('[DEBUG] Scene initialized');

  loadingText.textContent = 'Carregando modelo de detecção facial...';

  console.log('[DEBUG] Loading MediaPipe...');
  const ok = await initMediaPipe();
  if (!ok) {
    console.error('[DEBUG] MediaPipe failed');
    loadingOverlay.classList.add('hidden');
    if (autoRetryCount < MAX_AUTO_RETRY) {
      autoRetryCount++;
      showToast(`Reconectando... (${autoRetryCount}/${MAX_AUTO_RETRY})`);
      setTimeout(startApp, 3000);
    } else {
      showToast('Falha ao carregar IA. Verifique sua conexão.');
    }
    return;
  }

  console.log('[DEBUG] All ready!');
  autoRetryCount = 0;
  loadingText.textContent = 'Pronto!';
  await new Promise(r => setTimeout(r, 200));
  loadingOverlay.classList.add('hidden');

  isActive = true;
  schedulePrediction();
}

// ── Auto-start ──────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  if (!autoStartDone) {
    autoStartDone = true;
    setTimeout(startApp, 500);
  }
});

// ── Python Backend WebSocket Client ─────────────────────────────────────

const BACKEND_WS_URL = 'ws://localhost:8080/ws';
let backendWs = null;
let backendConnected = false;
let backendReconnectTimer = null;

// O backend opcional roda na maquina de quem desenvolve. Numa pagina servida por
// HTTPS o navegador bloqueia ws:// por mixed content e o console enche de erro
// sem nenhum ganho, entao so tentamos conectar quando a propria pagina e local.
const isLocalPage = ['localhost', '127.0.0.1', '[::1]', ''].includes(location.hostname);
let backendAvailable = isLocalPage;

function connectBackend() {
  if (!backendAvailable) return;
  if (backendWs && backendWs.readyState <= 1) return;

  try {
    backendWs = new WebSocket(BACKEND_WS_URL);

    backendWs.onopen = () => {
      backendConnected = true;
      console.log('Python backend connected');
    };

    backendWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        handleBackendMessage(msg);
      } catch { /* ignore */ }
    };

    backendWs.onclose = () => {
      backendConnected = false;
      backendReconnectTimer = setTimeout(connectBackend, 5000);
    };

    backendWs.onerror = () => {
      backendAvailable = false;
      if (backendWs) backendWs.close();
      console.log('Python backend not available, running without server-side OpenCV');
    };
  } catch {
    backendAvailable = false;
  }
}

function handleBackendMessage(msg) {
  // A barra RGB é controlada só pelo gesto local (punho fechado). O backend
  // chegava a abri-la com hand.isOpen — invertido, já que a barra existe para a
  // mão FECHADA — e disputava o controle com o gesto, fazendo a barra aparecer
  // sozinha. O contorno de mão do OpenCV não distingue polegar esticado de
  // punho fechado, então não serve para esse gatilho.
  void msg;
}

function sendFrameToBackend() {
  if (!backendConnected || !backendWs || !video || !isActive) return;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(video.videoWidth || 640, 320);
    canvas.height = Math.min(video.videoHeight || 480, 240);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.5);

    backendWs.send(JSON.stringify({
      type: 'frame',
      image: dataUrl,
      frame: frame_counter++,
    }));
  } catch { /* ignore */ }
}

let frame_counter = 0;
let backendFrameTimer = null;

function startBackendFrameStream() {
  if (backendFrameTimer) return;
  backendFrameTimer = setInterval(sendFrameToBackend, 100);
}

connectBackend();

// Start backend frame streaming when camera starts
const origStartAppFn = startApp;
startApp = async function() {
  await origStartAppFn.call(this);
  if (isActive) {
    startBackendFrameStream();
  }
};
