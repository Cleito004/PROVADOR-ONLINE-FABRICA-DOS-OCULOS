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

const REF_MODEL_WIDTH = 50;

const CFG = {
  refHeadWidth: 140,
  refFaceHeight: 210,
  glassesDepth: 2,
  glassesDown: 2,
  glassesCenterX: 0,
  glassesScale: 3.5,
};

const STYLE_CONFIG = {
  square:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true },
  aviator: { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0.5, scaleFactor: 0.01, flipY: true },
  cateye:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true },
};

let faceLandmarker;
let handLandmarker;
let glassesGroup;
let videoTexture;
let videoSprite;
let renderer, scene, camera;
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
  refNoseZ: 0,
};

let currentStyle = 'square';
let currentColor = '#000000';
let currentLensColor = '#111111';
let currentLensOpacity = 0.85;

const gestureState = {
  rightHandOpen: false,
  rightHandFist: false,
  leftHandFingers: 0,
  rightHandFingers: 0,
  rightHandX: 0.5,
  fistActiveX: null,
  frameColorIdx: 5,
  lastModelSwitchTime: 0,
  lastLensSwitchTime: 0,
};

let adjHeight = -10;
const adjRotation = 0;
const adjLateral = 0;
let adjDistance = -150;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function qDelta(a, b) { return 2 * Math.acos(clamp(Math.abs(a.dot(b)), 0, 1)); }

function toVec3(pts, i) {
  const vw = (video && video.videoWidth) || 640;
  const vh = (video && video.videoHeight) || 480;
  return new THREE.Vector3(pts[i][0] - vw/2, -pts[i][1] + vh/2, -pts[i][2]);
}

function isFist(pts) {
  if (!pts || pts.length < 21) return false;
  const tips = [HM.thumbTip, HM.indexTip, HM.middleTip, HM.ringTip, HM.pinkyTip];
  const mcps = [HM.thumbMCP, HM.indexMCP, HM.middleMCP, HM.ringMCP, HM.pinkyMCP];
  let closed = 0;
  for (let i = 1; i < tips.length; i++) {
    if (pts[tips[i]][1] > pts[mcps[i]][1]) closed++;
  }
  return closed >= 3;
}

function countFingersHand(pts) {
  if (!pts || pts.length < 21) return 0;
  let count = 0;
  const isRightHand = pts[HM.indexMCP][0] > pts[HM.pinkyMCP][0];
  if (isRightHand) { if (pts[HM.thumbTip][0] < pts[HM.thumbIP][0]) count++; }
  else { if (pts[HM.thumbTip][0] > pts[HM.thumbIP][0]) count++; }
  if (pts[HM.indexTip][1] < pts[HM.indexPIP][1]) count++;
  if (pts[HM.middleTip][1] < pts[HM.middlePIP][1]) count++;
  if (pts[HM.ringTip][1] < pts[HM.ringPIP][1]) count++;
  if (pts[HM.pinkyTip][1] < pts[HM.pinkyPIP][1]) count++;
  return count;
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

  const splitX = modelHalfW * 0.45;
  const leftTris = [], frameTris = [], rightTris = [];
  for (let i = 0; i < idx.count; i += 3) {
    const a = idx.getX(i), b = idx.getX(i + 1), c = idx.getX(i + 2);
    const avgX = (posAttr.getX(a) + posAttr.getX(b) + posAttr.getX(c)) / 3;
    if (avgX < -splitX) leftTris.push(a, b, c);
    else if (avgX > splitX) rightTris.push(a, b, c);
    else frameTris.push(a, b, c);
  }
  if (leftTris.length === 0 || rightTris.length === 0 || frameTris.length === 0) return null;

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

  const leftGeo = buildRegion(leftTris);
  const frameGeo = buildRegion(frameTris);
  const rightGeo = buildRegion(rightTris);

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

  return { leftMesh: meshes[0], frameMesh: meshes[1], rightMesh: meshes[2] };
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
  if (bestFrameMesh && bestXRange > modelHalfW * 1.2) {
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
    }
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
  wrapper.userData.halfW = bSize.x * 0.5;
  wrapper.userData.halfH = bSize.y * 0.5;
  wrapper.userData.leftTempleMesh = splitLeftMesh;
  wrapper.userData.rightTempleMesh = splitRightMesh;
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

      const noseTipZ = nTip.z - nose.z;
      const noseZDelta = smooth.scanCompleted ? (nose.z - smooth.refNoseZ) : 0;
      const depAdj = clamp(noseTipZ * 0.06 - noseZDelta * 0.04, -1, 3);

      const maxOffset = fW * 1.5;
      const distScale = Math.abs(adjDistance) > maxOffset ? maxOffset / Math.abs(adjDistance) : 1;

      const zOffset = (CFG.glassesDepth + depAdj + adjDistance * distScale) * bS;
      const tPos = eMid.clone()
        .addScaledVector(xAxis, sc.centerX + adjLateral)
        .addScaledVector(yAxis, adjHeight)
        .addScaledVector(zAxis, zOffset);

      const tScaleVal = bS * CFG.glassesScale * (1 + adjDistance * 0.001);
      const tScale = new THREE.Vector3(tScaleVal, tScaleVal, tScaleVal);

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
        smooth.scanFrames.push({ x: tPos.x, y: tPos.y, z: nose.z });
        const pct = Math.min(smooth.scanFrames.length / 10, 1) * 100;
        scanProgressBar.style.width = pct + '%';
        if (smooth.scanFrames.length >= 10) {
          smooth.scanCompleted = true;
          smooth.scanning = false;
          smooth.refNoseZ = smooth.scanFrames.reduce((s, f) => s + f.z, 0) / smooth.scanFrames.length;
          scanOverlay.classList.add('hidden');
        } else {
          scanStatus.textContent = `${smooth.scanFrames.length}/10`;
        }
      }

      const avgPos = tPos.clone();
      const mov = avgPos.distanceTo(smooth.prev);
      smooth.prev.copy(avgPos);

      const aP = clamp(0.97 + mov * 0.02, 0.97, 0.99);
      const aS = clamp(0.96 + mov * 0.03, 0.96, 0.99);

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
        smooth.quat.slerp(targetQuat, clamp(0.88 + aR * 1.1, 0.88, 0.99));
      }

      const fi = document.getElementById('face-info');
      if (fi) { fi.textContent = `Formato: detectado`; fi.classList.remove('hidden'); }

      glassesGroup.position.copy(smooth.pos);
      glassesGroup.quaternion.copy(smooth.quat);
      glassesGroup.scale.copy(smooth.scale);
      if (!glassesGroup.visible) glassesGroup.visible = true;
      glassesGroup.updateWorldMatrix(true, true);

      const yaw = Math.atan2(zAxis.x, zAxis.z);
      const absYaw = Math.abs(yaw);
      const pitch = Math.asin(clamp(-zAxis.y, -1, 1));
      const absPitch = Math.abs(pitch);
      const yawFadeStart = 0.35;
      const yawFadeEnd = 0.7;
      const pitchFadeStart = 0.15;
      const pitchFadeEnd = 0.4;
      const ud = glassesGroup.userData || {};
      const leftMat = ud.leftTempleMat;
      const rightMat = ud.rightTempleMat;
      const fMat = ud.frameMat;
      const yawActive = absYaw > yawFadeStart && leftMat && rightMat && fMat;
      const pitchActive = absPitch > pitchFadeStart && leftMat && rightMat;

      const templeMeshes = [];
      glassesGroup.traverse(c => {
        if (c.isMesh && (c.name === 'leftTemple' || c.name === 'rightTemple')) {
          templeMeshes.push(c);
        }
      });

      if (!window._templeLogged) {
        window._templeLogged = true;
        const allMeshNames = [];
        glassesGroup.traverse(c => { if (c.isMesh) allMeshNames.push(c.name || '(sem nome)'); });
        console.log(`[DEBUG] templeMeshes: ${templeMeshes.length}, all meshes: ${allMeshNames.join(', ')}, pitch: ${(pitch*180/Math.PI).toFixed(1)}°, pitchActive: ${pitchActive}`);
      }

      if (pitchActive && templeMeshes.length > 0) {
        templeMeshes.forEach(m => { m.visible = false; });
        if (leftMat) leftMat.clippingPlanes = [];
        if (rightMat) rightMat.clippingPlanes = [];
      } else if (!pitchActive) {
        templeMeshes.forEach(m => { m.visible = true; });
      }

      if (yawActive && !pitchActive) {
        const tYaw = clamp((absYaw - yawFadeStart) / (yawFadeEnd - yawFadeStart), 0, 1);
        const signYaw = yaw > 0 ? 1 : -1;
        const halfW = ud.halfW || 30;
        const planeOff = signYaw * (-halfW + tYaw * halfW * 1.1);
        const yawPlane = new THREE.Plane();
        yawPlane.setFromNormalAndCoplanarPoint(
          new THREE.Vector3(signYaw, 0, 0),
          new THREE.Vector3(planeOff, 0, 0)
        );
        const farMat = signYaw > 0 ? leftMat : rightMat;
        farMat.clippingPlanes = [yawPlane];
        const nearMat = signYaw > 0 ? rightMat : leftMat;
        nearMat.clippingPlanes = [];
        if (fMat) fMat.clippingPlanes = [];
      } else if (!pitchActive) {
        if (leftMat) leftMat.clippingPlanes = [];
        if (rightMat) rightMat.clippingPlanes = [];
        if (fMat) fMat.clippingPlanes = [];
      }
    } else {
      if (glassesGroup) glassesGroup.visible = false;
      const ud2 = glassesGroup?.userData;
      if (ud2?.leftTempleMat) ud2.leftTempleMat.clippingPlanes = [];
      if (ud2?.rightTempleMat) ud2.rightTempleMat.clippingPlanes = [];
      if (ud2?.frameMat) ud2.frameMat.clippingPlanes = [];
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

          let leftHandPts = null;
          let rightHandPts = null;

          for (let h = 0; h < handLandmarks.length; h++) {
            const hpts = handLandmarks[h].map(l => [l.x * (video.videoWidth || 640), l.y * (video.videoHeight || 480), l.z * (video.videoWidth || 640)]);
            const isRight = hpts[HM.indexMCP][0] > hpts[HM.pinkyMCP][0];
            if (isRight) rightHandPts = hpts;
            else leftHandPts = hpts;
          }

          if (leftHandPts) {
            const leftHandX = handXNormalized(leftHandPts);
            if (leftHandX >= 0.5) {
              const leftFingers = countOpenFingers(leftHandPts);
              const lensIdx = Math.min(leftFingers, LENS_COLORS.length - 1);
              if (lensIdx !== smooth.lastLensIdx) {
                const now = Date.now();
                if (now - gestureState.lastLensSwitchTime > 300) {
                  smooth.lastLensIdx = lensIdx;
                  gestureState.lastLensSwitchTime = now;
                  currentLensColor = LENS_COLORS[lensIdx].color;
                  currentLensOpacity = LENS_COLORS[lensIdx].opacity;
                  rebuildGlasses();
                  showToast(`Lente: ${LENS_COLORS[lensIdx].name}`);
                }
              }
              gestureState.leftHandFingers = leftFingers;
            } else {
              gestureState.leftHandFingers = 0;
            }
          } else {
            gestureState.leftHandFingers = 0;
          }

          if (rightHandPts) {
            const rightHandX = handXNormalized(rightHandPts);
            const openFingersTotal = countFingersHand(rightHandPts);
            const openFingers = countOpenFingers(rightHandPts);

            if (openFingersTotal === 0 && rightHandX < 0.5) {
              if (!gestureState.rightHandFist) {
                gestureState.rightHandFist = true;
                gestureState.fistActiveX = handXNormalized(rightHandPts);
                const strip = document.getElementById('color-strip');
                if (strip) strip.classList.add('active');
              }
              const handX = handXNormalized(rightHandPts);
              const sensitiveX = clamp((0.47 - handX) / 0.38, 0, 1);

              const fc = frameColorFromPosition(sensitiveX);
              currentColor = fc.hex;
              gestureState.frameColorIdx = Math.round(sensitiveX * (FRAME_COLORS_RAINBOW.length - 1));
              rebuildGlasses();

              const needle = document.getElementById('color-needle');
              if (needle) {
                needle.style.left = (sensitiveX * 100) + '%';
              }
              showGestureStatus(`Armação: cor RGB`);
            } else {
              if (gestureState.rightHandFist) {
                gestureState.rightHandFist = false;
                gestureState.fistActiveX = null;
                const strip = document.getElementById('color-strip');
                if (strip) strip.classList.remove('active');
              }

              if (openFingers >= 1 && rightHandX < 0.5) {
                const styleIdx = Math.min(openFingers - 1, STYLES.length - 1);
                const newStyle = STYLES[styleIdx];
                const now = Date.now();
                if (newStyle !== currentStyle && now - gestureState.lastModelSwitchTime > 300) {
                  currentStyle = newStyle;
                  gestureState.lastModelSwitchTime = now;
                  rebuildGlasses();
                  updateStyleMatrix(currentStyle);
                  showToast(`Estilo: ${currentStyle}`);
                }
                gestureState.rightHandOpen = true;
              }
              gestureState.rightHandFingers = openFingers;
            }
          } else {
            if (gestureState.rightHandFist) {
              gestureState.rightHandFist = false;
              gestureState.fistActiveX = null;
              const strip = document.getElementById('color-strip');
              if (strip) strip.classList.remove('active');
            }
          }
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
let backendAvailable = true;

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
  if (msg.type === 'frame-result' && msg.hand) {
    const hand = msg.hand;
    if (hand.detected && hand.isOpen !== null) {
      const strip = document.getElementById('color-strip');
      if (hand.isOpen) {
        if (strip && !strip.classList.contains('active')) {
          strip.classList.add('active');
        }
      } else {
        if (strip && strip.classList.contains('active') && !gestureState.rightHandFist) {
          strip.classList.remove('active');
        }
      }
    }
  }
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
