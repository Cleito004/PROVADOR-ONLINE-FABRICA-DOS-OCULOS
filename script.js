import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LM = {
  leftEyeOuter: 33, rightEyeOuter: 263,
  leftEyeInner: 133, rightEyeInner: 362,
  leftTemple: 127, rightTemple: 356,
  leftCheek: 234, rightCheek: 454,
  forehead: 10, chin: 175,
  noseBridge: 168, noseTip: 1, noseBottom: 2, midEye: 168, leftEyePupil: 143, rightEyePupil: 372
};

// Hand landmark indices
const HM = {
  wrist: 0,
  thumbCMC: 1, thumbMCP: 2, thumbIP: 3, thumbTip: 4,
  indexMCP: 5, indexPIP: 6, indexDIP: 7, indexTip: 8,
  middleMCP: 9, middlePIP: 10, middleDIP: 11, middleTip: 12,
  ringMCP: 13, ringPIP: 14, ringDIP: 15, ringTip: 16,
  pinkyMCP: 17, pinkyPIP: 18, pinkyDIP: 19, pinkyTip: 20,
};

const LENS_COLORS = [
  { color: '#222222', opacity: 0.7, name: 'Preto' },
  { color: '#2a1a2e', opacity: 0.6, name: 'Gradiente' },
  { color: '#1a1a2e', opacity: 0.5, name: 'Azul' },
  { color: '#8B4513', opacity: 0.4, name: 'Marrom' },
  { color: '#ffcc00', opacity: 0.3, name: 'Amarelo' },
  { color: '#ffffff', opacity: 0.05, name: 'Transparente' },
];

const REF_MODEL_WIDTH = 50

const CFG = {
  refHeadWidth: 140,
  refFaceHeight: 210,
  glassesDepth: 2,
  glassesDown: 2,
  glassesCenterX: 0,
  glassesScale: 3.5,
}

const STYLE_CONFIG = {
  round:   { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
  square:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
  aviator: { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0.5,scaleFactor: 0.01, flipY: true  },
  cateye:  { scale: 300, depth: 0, down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
  sport:   { scale: 300, depth: 0, down: 3,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
}

let faceLandmarker;
let handLandmarker;
let glassesGroup;
let videoTexture;
let videoSprite;
let renderer, scene, camera;
let video;
let predictionInFlight = false;
let isActive = false;
let motionPrevData = null;
let motionCooldown = 0;
let motionHistory = [];

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
  lastLensIdx: -1,
  refNoseZ: 0,
};

let currentStyle = 'round';
let currentColor = '#1a1a1a';
let currentLensColor = '#222222';
let currentLensOpacity = 0.7;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function qDelta(a, b) { return 2 * Math.acos(clamp(Math.abs(a.dot(b)), 0, 1)); }

function toVec3(pts, i) {
  const vw = (video && video.videoWidth) || 640;
  const vh = (video && video.videoHeight) || 480;
  return new THREE.Vector3(pts[i][0] - vw/2, -pts[i][1] + vh/2, -pts[i][2]);
}

function countFingers(pts) {
  if (!pts || pts.length < 21) return 0
  let count = 0
  const isRightHand = pts[HM.indexMCP][0] > pts[HM.pinkyMCP][0]
  if (isRightHand) { if (pts[HM.thumbTip][0] < pts[HM.thumbIP][0]) count++ }
  else { if (pts[HM.thumbTip][0] > pts[HM.thumbIP][0]) count++ }
  if (pts[HM.indexTip][1] < pts[HM.indexPIP][1]) count++
  if (pts[HM.middleTip][1] < pts[HM.middlePIP][1]) count++
  if (pts[HM.ringTip][1] < pts[HM.ringPIP][1]) count++
  if (pts[HM.pinkyTip][1] < pts[HM.pinkyPIP][1]) count++
  return count
}

function makeEnvMap() {
  const canvas = document.createElement('canvas')
  canvas.width = 512; canvas.height = 512
  const ctx = canvas.getContext('2d')
  const grad = ctx.createRadialGradient(256, 256, 0, 256, 256, 256)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.3, '#d8d8f0')
  grad.addColorStop(0.6, '#8888bb')
  grad.addColorStop(1, '#222244')
  ctx.fillStyle = grad; ctx.fillRect(0, 0, 512, 512)
  const tex = new THREE.CanvasTexture(canvas)
  tex.mapping = THREE.EquirectangularReflectionMapping
  return tex
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

function showHandStatus(msg) {
  let el = document.getElementById('hand-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'hand-status';
    el.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.85);color:#fff;padding:14px 28px;border-radius:10px;z-index:1000;font-size:18px;text-align:center;pointer-events:none;';
    document.body.appendChild(el);
  }
  el.textContent = msg;
}
function hideHandStatus() {
  const el = document.getElementById('hand-status');
  if (el) el.remove();
}

// ── GLB Model Loader ──────────────────────────────────────────────────

const MODEL_CACHE = {}
function getModelEntry(style) { return MODEL_CACHE[style] }
const MODEL_URLS = {
  round: 'core/assets/models/round.glb',
  square: 'core/assets/models/square.glb',
  aviator: 'core/assets/models/aviator.glb',
  cateye: 'core/assets/models/cateye.glb',
  sport: 'core/assets/models/sport.glb',
}
let gltfLoader = null
function getLoader() {
  if (!gltfLoader) gltfLoader = new GLTFLoader()
  return gltfLoader
}

async function loadAllModels() {
  const loader = getLoader()
  const entries = Object.entries(MODEL_URLS)
  await Promise.all(entries.map(([key, url]) => {
    return new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        const scene = gltf.scene
        const hasArm = [...scene.children].some(c => {
          let found = false
          c.traverse(m => {
            if (m.isMesh) {
              const n = (m.name || '').toLowerCase()
              if (n.includes('temple') || n.includes('arm') || n.includes('hastes') || n.includes('braço')) found = true
            }
          })
          return found
        })
        if (hasArm) {
          const hidden = []
          scene.traverse(c => {
            if (c.isMesh) {
              const n = (c.name || '').toLowerCase()
              if (n.includes('temple') || n.includes('arm') || n.includes('hastes') || n.includes('braço')) {
                hidden.push(c)
                c.visible = false
              }
            }
          })
          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3()
          box.getSize(size)
          const maxDim = Math.max(size.x, size.y, size.z)
          hidden.forEach(c => c.visible = true)
          const normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1
          MODEL_CACHE[key] = { scene, normFactor }
        } else {
          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3()
          box.getSize(size)
          const maxDim = Math.max(size.x, size.y, size.z)
          const normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1
          MODEL_CACHE[key] = { scene, normFactor }
        }
        resolve()
      }, undefined, reject)
    })
  }))
}

function buildFromModel(style, frameColor, lensColor, lensOpacity) {
  const entry = MODEL_CACHE[style]
  if (!entry || !entry.scene) return new THREE.Group()
  const clone = entry.scene.clone(true)
  const normFactor = entry.normFactor || 1

  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor,
    metalness: 0.0,
    roughness: 1.0,
    side: THREE.DoubleSide,
  })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor,
    transparent: true,
    opacity: lensOpacity,
    metalness: 0.0,
    roughness: 0.7,
    side: THREE.DoubleSide,
  })

  const meshes = []
  clone.traverse(c => {
    if (c.isMesh) {
      c.frustumCulled = false
      meshes.push(c)
    }
  })

  let lensCount = 0, frameCount = 0
  const frameMeshes = new Set()
  meshes.forEach(c => {
    const origMat = c.material
    const meshName = (c.name || '').toLowerCase()
    const matName = (origMat?.name || '').toLowerCase()
    const transParent = origMat?.transparent || origMat?.alphaMode === 'BLEND' || (typeof origMat?.opacity === 'number' && origMat.opacity < 0.99)

    let isLens = c.userData.isLens
    if (isLens === undefined) {
      if (meshName.includes('temple') || meshName.includes('arm') || meshName.includes('hastes') || meshName.includes('braço')) {
        isLens = false
      } else if (meshName.includes('lens') || meshName.includes('lente') || meshName.includes('vidro') || meshName.includes('crystal')) {
        isLens = true
      } else if (matName.includes('lens') || matName.includes('lente') || matName.includes('vidro') || matName.includes('crystal')) {
        isLens = true
      } else if ((meshName.includes('glass') || matName.includes('glass') || meshName.includes('visor') || matName.includes('visor')) && transParent) {
        isLens = true
      } else if (transParent) {
        isLens = true
      } else {
        isLens = false
      }
    }
    c.material = isLens ? lensMat : frameMat
    if (isLens) lensCount++
    else { frameCount++; frameMeshes.add(c) }
  })

  if (lensCount === 0 && frameCount > 0 && meshes.length >= 2) {
    const candidates = meshes.filter(m => {
      const name = (m.name || '').toLowerCase()
      return !name.includes('temple') && !name.includes('arm') && !name.includes('hastes') && !name.includes('braço')
    })

    if (candidates.length >= 2) {
      const sorted = candidates.map(m => {
        const box = new THREE.Box3().setFromObject(m)
        const size = box.max.clone().sub(box.min)
        return { mesh: m, volume: size.x * size.y * size.z }
      }).sort((a, b) => a.volume - b.volume)

      const nLens = Math.max(1, Math.floor(sorted.length / 2))
      sorted.slice(0, nLens).forEach(({ mesh }) => {
        mesh.material = new THREE.MeshPhysicalMaterial({
          color: lensColor,
          transparent: true,
          opacity: lensOpacity,
          metalness: 0.0,
          roughness: 0.7,
          side: THREE.DoubleSide,
        })
      })
      sorted.slice(nLens).forEach(({ mesh }) => {
        mesh.material = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide })
        frameMeshes.add(mesh)
      })
    } else {
      meshes.forEach(m => {
        m.material = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.0, roughness: 1.0, side: THREE.DoubleSide })
        frameMeshes.add(m)
      })
    }
  }

  meshes.forEach(m => { m.renderOrder = 1; m.depthTest = true; m.scale.z = 1.25 })

  const box = new THREE.Box3().setFromObject(clone)
  const center = new THREE.Vector3()
  box.getCenter(center)
  const size = new THREE.Vector3()
  box.getSize(size)
  const centerOffset = new THREE.Vector3().copy(center).negate()
  const centered = new THREE.Group()
  centered.position.copy(centerOffset)
  centered.add(clone)

  const normGroup = new THREE.Group()
  normGroup.frustumCulled = false
  normGroup.renderOrder = 1
  normGroup.scale.set(normFactor, normFactor, normFactor)
  normGroup.add(centered)

  const wrapper = new THREE.Group()
  wrapper.frustumCulled = false
  wrapper.renderOrder = 1
  wrapper.add(normGroup)
  return wrapper
}

function createLensMaterial(origMat) {
  const uniforms = {
    uVideoTex: { value: videoTexture },
    uTime: { value: 0 },
    uCylinder: { value: 0 },
    uAxisRad: { value: 0 },
    uAstigmatism: { value: 0 },
    uBlueFilter: { value: 0 },
    uPhotochromic: { value: 0 },
    uBaseColor: { value: new THREE.Color(origMat.color) },
    uBaseOpacity: { value: origMat.opacity }
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vScreenUv;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 clipPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vScreenUv = clipPos.xy / clipPos.w * 0.5 + 0.5;
        gl_Position = clipPos;
      }
    `,
    fragmentShader: `
      uniform sampler2D uVideoTex;
      uniform float uTime;
      uniform float uCylinder;
      uniform float uAxisRad;
      uniform float uAstigmatism;
      uniform float uBlueFilter;
      uniform float uPhotochromic;
      uniform vec3 uBaseColor;
      uniform float uBaseOpacity;

      varying vec2 vScreenUv;
      varying vec2 vUv;

      void main() {
        vec2 uv = vScreenUv;
        uv.x = 1.0 - uv.x;

        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
          gl_FragColor = vec4(uBaseColor, 0.0);
          return;
        }

        if (uAstigmatism > 0.5) {
          vec2 dir = vec2(cos(uAxisRad), sin(uAxisRad));
          vec2 perp = vec2(-dir.y, dir.x);
          float d = dot(uv, dir);
          float p = dot(uv, perp);
          p += uCylinder * 0.015 * (d - 0.5);
          uv = dir * d + perp * p;
        }

        vec4 vid = texture2D(uVideoTex, uv);
        vec3 col = vid.rgb;

        if (uBlueFilter > 0.5) {
          col.b *= 0.4;
          col.r *= 0.7;
          col.g *= 0.7;
        }

        float phot = clamp(uPhotochromic, 0.0, 1.0);
        col = mix(col, col * 0.7 + vec3(0.15, 0.1, 0.05), phot);

        float alpha = uBaseOpacity * vid.a;
        gl_FragColor = vec4(col, alpha);
      }
    `
  });
  return mat;
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

// ── Scene Setup ─────────────────────────────────────────────────────────

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

        // brightness
        color.rgb += uBrightness;

        // contrast
        if (uContrast > 0.0) {
          color.rgb = (color.rgb - 0.5) / (1.0 - uContrast) + 0.5;
        } else {
          color.rgb = (color.rgb - 0.5) * (1.0 + uContrast) + 0.5;
        }

        // saturation
        float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));
        color.rgb = mix(vec3(luma), color.rgb, uSaturation);

        // sharpen (unsharp mask)
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

  scene.environment = makeEnvMap()
  scene.environmentIntensity = 0.08

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

// ── MediaPipe Engine ────────────────────────────────────────────────────

async function initMediaPipe(delegate) {
  const dl = delegate || 'GPU';
  try {
    const VISION_CDN = 'https://unpkg.com/@mediapipe/tasks-vision@0.10.7';
    loadingText.textContent = 'Baixando motor de IA...';
    const vision = await import(`${VISION_CDN}/vision_bundle.mjs`);
    loadingText.textContent = 'Compilando WASM...';
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`);
    loadingText.textContent = `Baixando modelo facial (${dl})...`;
    faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
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
    });
    loadingText.textContent = 'Baixando modelo das mãos...';
    handLandmarker = await vision.HandLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task',
        delegate: dl
      },
      runningMode: 'VIDEO',
      numHands: 2,
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    return true;
  } catch (e) {
    if (dl === 'GPU') {
      console.warn('GPU falhou, tentando CPU:', e);
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

    // ── Gesture swipe (esquerda→direita apenas) ────────────────────
    if (video.videoWidth > 0 && motionCooldown === 0) {
      try {
        if (!window._motionCanvas) {
          window._motionCanvas = document.createElement('canvas')
          window._motionCanvas.width = 48; window._motionCanvas.height = 36
          window._motionCtx = window._motionCanvas.getContext('2d')
        }
        const ctx = window._motionCtx
        ctx.drawImage(video, 0, 0, 48, 36)
        const data = ctx.getImageData(0, 0, 48, 36).data

        if (motionPrevData) {
          let sumX = 0, total = 0
          for (let y = 6; y < 30; y++) {
            for (let x = 6; x < 42; x++) {
              const i = (y * 48 + x) * 4
              const d = Math.abs(data[i] - motionPrevData[i]) +
                        Math.abs(data[i+1] - motionPrevData[i+1]) +
                        Math.abs(data[i+2] - motionPrevData[i+2])
              if (d > 40) { sumX += x * d; total += d }
            }
          }
          if (total > 300) {
            const cx = sumX / total
              motionHistory.push(cx)
              if (motionHistory.length > 4) motionHistory.shift()
              if (motionHistory.length === 4) {
                const d1 = motionHistory[2] - motionHistory[0]
                const d2 = motionHistory[3] - motionHistory[1]
                if (d1 < -3 && d2 < -3) {
                  motionCooldown = 30
                  motionHistory = []
                  const styles = ['round', 'square', 'aviator', 'cateye', 'sport']
                  const idx = styles.indexOf(currentStyle)
                  const next = styles[(idx + 1) % styles.length]
                  currentStyle = next; rebuildGlasses()
                  document.querySelectorAll('.glasses-option').forEach(b => b.classList.remove('active'))
                  const nb = document.querySelector(`.glasses-option[data-style="${next}"]`)
                  if (nb) nb.classList.add('active')
                  const labelEl = nb?.querySelector('span:last-child')
                  showToast(`Mão: ${labelEl ? labelEl.textContent : next}`)
                } else {
                  motionHistory = []
                }
              }
          }
        }
        motionPrevData = data
      } catch {}
    }
    if (motionCooldown > 0) motionCooldown--

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

      const sc = STYLE_CONFIG[currentStyle] || STYLE_CONFIG.round
      const eMid = midpoint(lEye, rEye);
      const eW = lEye.distanceTo(rEye);
      const tW = lTmp.distanceTo(rTmp);
      const cW = lChk.distanceTo(rChk);
      const fW = Math.max(eW, tW, cW);
      const fH = fHead.distanceTo(chn);

      const xEye = lEye.clone().sub(rEye).normalize();
      const yRaw = fHead.clone().sub(chn).normalize();
      const xEyeN = xEye;
      const yAxis = yRaw;
      let zAxis = xEyeN.clone().cross(yAxis).normalize();
      if (zAxis.dot(nTip.clone().sub(nose).normalize()) < 0) zAxis.negate();
      const xAxis = yAxis.clone().cross(zAxis).normalize();

      const wS = fW / CFG.refHeadWidth;
      const hS = fH / CFG.refFaceHeight;
      const bS = wS * 0.7 + hS * 0.3;

      // Depth adjustment: use Z-component of nose tip→bridge vector for head tilt
      // and compare against reference Z captured during scan
      const noseTipZ = nTip.z - nose.z
      const noseZDelta = smooth.scanCompleted ? (nose.z - smooth.refNoseZ) : 0
      const depAdj = clamp(noseTipZ * 0.06 - noseZDelta * 0.04, -1, 3)

      const tPos = nose.clone()
        .addScaledVector(xAxis, sc.centerX)
        .addScaledVector(yAxis, sc.down)
        .addScaledVector(zAxis, CFG.glassesDepth + depAdj)

      const tScaleVal = bS * CFG.glassesScale;
      const tScale = new THREE.Vector3(tScaleVal, tScaleVal, tScaleVal);

      const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat)

      // ── Tracking + Scan (independentes) ─────────────────────────
      // Reposicionamento começa do frame 1, scan é só feedback visual

      if (!smooth.scanCompleted) {
        if (!smooth.scanning) {
          smooth.scanning = true
          smooth.scanFrames = []
          scanOverlay.classList.remove('hidden')
          scanStatus.textContent = 'Escaneando...'
          scanProgressBar.style.width = '0%'
        }
        smooth.scanFrames.push({ x: tPos.x, y: tPos.y, z: nose.z })
        const pct = Math.min(smooth.scanFrames.length / 10, 1) * 100
        scanProgressBar.style.width = pct + '%'
        if (smooth.scanFrames.length >= 10) {
          smooth.scanCompleted = true
          smooth.scanning = false
          smooth.refNoseZ = smooth.scanFrames.reduce((s, f) => s + f.z, 0) / smooth.scanFrames.length
          scanOverlay.classList.add('hidden')
        } else {
          scanStatus.textContent = `${smooth.scanFrames.length}/10`
        }
      }

      const avgPos = tPos.clone();

      const mov = avgPos.distanceTo(smooth.prev);
      smooth.prev.copy(avgPos)

      const aP = clamp(0.97 + mov * 0.02, 0.97, 0.99)
      const aS = clamp(0.96 + mov * 0.03, 0.96, 0.99)

      if (!smooth.readyPos) {
        smooth.pos.copy(avgPos)
        smooth.scale.copy(tScale)
        smooth.readyPos = true
      } else {
        smooth.pos.lerp(avgPos, aP)
        smooth.scale.lerp(tScale, aS)
      }

      if (!smooth.readyRot) {
        smooth.quat.copy(targetQuat)
        smooth.readyRot = true
      } else {
        const aR = qDelta(smooth.quat, targetQuat)
        smooth.quat.slerp(targetQuat, clamp(0.88 + aR * 1.1, 0.88, 0.99))
      }

      const fRatio = fW / fH;
      const jwRatio = tW / fH;
      let faceShape = 'redondo';
      if (fRatio > 1.05) faceShape = 'oval';
      if (fRatio < 0.85) faceShape = 'longo';
      if (jwRatio > 1.1 && fRatio < 0.95) faceShape = 'quadrado';
      if (jwRatio < 0.85 && fRatio > 0.9) faceShape = 'coração';
      const pdMm = (eW * 0.39).toFixed(1);

      const fi = document.getElementById('face-info');
      if (fi) { fi.textContent = `Formato: ${faceShape} | DP: ${pdMm}mm`; fi.classList.remove('hidden'); }

      glassesGroup.position.copy(smooth.pos);
      glassesGroup.quaternion.copy(smooth.quat);
      glassesGroup.scale.copy(smooth.scale);
      if (!glassesGroup.visible) glassesGroup.visible = true;
      glassesGroup.updateWorldMatrix(true, true);
    } else {
      if (glassesGroup) glassesGroup.visible = false;
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

    // ── Hand detection & finger control ─────────────────────
    if (handLandmarker) {
      try {
        const handResult = handLandmarker.detectForVideo(video, performance.now());
        const handLandmarks = handResult.landmarks || [];

        let totalFingers = 0;
        const vw = video.videoWidth || 640;
        const vh = video.videoHeight || 480;
        for (let h = 0; h < handLandmarks.length; h++) {
          const pts = handLandmarks[h].map(l => [l.x * vw, l.y * vh, l.z * vw]);
          totalFingers += countFingers(pts);
        }

        if (smooth.scanCompleted) {
          if (!smooth.handScanCompleted) {
            if (!smooth.handScanning) {
              smooth.handScanning = true;
              smooth.handScanFrames = 0;
              showHandStatus('Mostre as duas mãos abertas');
            }
            if (handLandmarks.length >= 1) smooth.handScanFrames++;
            if (smooth.handScanFrames >= 15) {
              smooth.handScanCompleted = true;
              smooth.handScanning = false;
              hideHandStatus();
              showToast('Mãos escaneadas! Mostre dedos para trocar cor da lente');
            }
          }

          if (smooth.handScanCompleted && totalFingers > 0) {
            const idx = Math.min(totalFingers - 1, LENS_COLORS.length - 1);
            if (idx !== smooth.lastLensIdx) {
              smooth.lastLensIdx = idx;
              currentLensColor = LENS_COLORS[idx].color;
              currentLensOpacity = LENS_COLORS[idx].opacity;
              rebuildGlasses();
              document.querySelectorAll('#lens-color-list .color-option').forEach(b => b.classList.remove('active'));
              const btn = document.querySelector(`#lens-color-list .color-option[data-color="${currentLensColor}"]`);
              if (btn) btn.classList.add('active');
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

// ── Main App ────────────────────────────────────────────────────────────

const startBtn = document.getElementById('start-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const errorOverlay = document.getElementById('error-overlay');
const errorTitle = document.getElementById('error-title');
const errorMessage = document.getElementById('error-message');
const retryBtn = document.getElementById('retry-btn');
const startPrompt = document.getElementById('start-prompt');
const webcam = document.getElementById('webcam');
const screenshotBtn = document.getElementById('screenshot-btn');
const resetBtn = document.getElementById('reset-btn');

const scanOverlay = document.getElementById('scan-overlay');
const scanTitle = document.getElementById('scan-title');
const scanMessage = document.getElementById('scan-message');
const scanProgressBar = document.getElementById('scan-progress-bar');
const scanStatus = document.getElementById('scan-status');

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

async function startApp() {
  stopStream();
  errorOverlay.classList.add('hidden');
  startPrompt.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Ativando câmera...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    webcam.srcObject = stream;
    await webcam.play();
    await new Promise(r => { const c = () => { if (webcam.videoWidth > 0) r(); else requestAnimationFrame(c) }; requestAnimationFrame(c) });
  } catch (e) {
    loadingOverlay.classList.add('hidden');
    startPrompt.classList.remove('hidden');
    showToast('Erro ao acessar a câmera. Verifique as permissões.');
    return;
  }

  loadingText.textContent = 'Inicializando cena 3D...';
  await new Promise(r => setTimeout(r, 100));

  await initScene(webcam);

  loadingText.textContent = 'Carregando modelo de detecção facial...';

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), 15000)
  );
  const load = initMediaPipe();
  const ok = await Promise.race([load, timeout]).catch(() => false);
  if (!ok) {
    showError(
      'Falha ao carregar IA',
      'Nao foi possivel carregar o modelo de deteccao facial. ' +
      'Verifique sua conexao de internet e tente novamente.'
    );
    return;
  }

  loadingText.textContent = 'Pronto!';
  await new Promise(r => setTimeout(r, 200));
  loadingOverlay.classList.add('hidden');

  isActive = true;
  schedulePrediction();
}

retryBtn.addEventListener('click', () => {
  startApp();
});

// ── UI Events ───────────────────────────────────────────────────────────

startBtn.addEventListener('click', startApp);

document.querySelectorAll('.glasses-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.glasses-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStyle = btn.dataset.style;
    rebuildGlasses();
  });
});

document.querySelectorAll('#color-list .color-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#color-list .color-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentColor = btn.dataset.color;
    rebuildGlasses();
  });
});

document.querySelectorAll('#lens-color-list .color-option').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#lens-color-list .color-option').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentLensColor = btn.dataset.color;
    currentLensOpacity = parseFloat(btn.dataset.opacity) || 0.5;
    rebuildGlasses();
  });
});

screenshotBtn.addEventListener('click', () => {
  if (!renderer) { showToast('Ative a câmera primeiro'); return; }
  renderer.render(scene, camera);
  const link = document.createElement('a');
  link.download = 'provador-virtual-' + Date.now() + '.png';
  link.href = renderer.domElement.toDataURL('image/png');
  link.click();
  showToast('Foto salva!');
});

resetBtn.addEventListener('click', () => {
  if (glassesGroup) {
    smooth.readyPos = false;
    smooth.readyRot = false;
    smooth.scanning = false;
    smooth.scanCompleted = false;
    smooth.scanFrames = [];
    glassesGroup.position.set(0, 0, 0);
    glassesGroup.quaternion.identity();
    glassesGroup.scale.set(1, 1, 1);
    scanOverlay.classList.add('hidden');
  }
  document.querySelectorAll('.glasses-option').forEach(b => b.classList.remove('active'));
  document.querySelector('.glasses-option[data-style="round"]').classList.add('active');
  document.querySelectorAll('#color-list .color-option').forEach(b => b.classList.remove('active'));
  document.querySelector('#color-list .color-option[data-color="#1a1a1a"]').classList.add('active');
  document.querySelectorAll('#lens-color-list .color-option').forEach(b => b.classList.remove('active'));
  document.querySelector('#lens-color-list .color-option[data-color="#222222"]').classList.add('active');
  currentStyle = 'round';
  currentColor = '#1a1a1a';
  currentLensColor = '#222222';
  currentLensOpacity = 0.7;
  rebuildGlasses();
});

// ── Moondream AI Client ───────────────────────────────────────────────

const WS_URL = 'ws://localhost:8080'

const mdUI = {
  status: document.getElementById('moondream-status'),
  results: document.getElementById('moondream-results'),
  faceShape: document.getElementById('md-face-shape'),
  recommendations: document.getElementById('md-recommendations'),
  analyzeBtn: document.getElementById('md-analyze-btn'),
  autoFitBtn: document.getElementById('md-autofit-btn'),
  prescriptionInput: document.getElementById('md-prescription-input'),
  prescriptionLabel: document.getElementById('md-prescription-label'),
}

let mdWs = null
let mdConnected = false

const STYLE_IDS = {
  redondo: 'round', quadrado: 'square', aviador: 'aviator',
  gatinho: 'cateye', esportivo: 'sport', oval: 'oval',
  round: 'round', square: 'square', aviator: 'aviator',
  cateye: 'cateye', sport: 'sport', oval: 'oval',
}

function connectMoondream() {
  if (mdWs) return
  try {
    mdWs = new WebSocket(WS_URL)
    mdWs.onopen = () => {
      mdConnected = true
      mdUI.status.textContent = 'IA conectada'
      mdUI.status.className = 'md-status online'
      mdUI.analyzeBtn.disabled = false
      mdUI.autoFitBtn.disabled = false
      mdUI.prescriptionLabel.removeAttribute('aria-disabled')
    }
    mdWs.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        handleMdMessage(msg)
      } catch { /* ignore parse errors */ }
    }
    mdWs.onclose = () => {
      mdConnected = false
      mdUI.status.textContent = 'IA offline'
      mdUI.status.className = 'md-status offline'
      mdUI.analyzeBtn.disabled = true
      mdUI.autoFitBtn.disabled = true
      mdUI.prescriptionLabel.setAttribute('aria-disabled', 'true')
      mdWs = null
      setTimeout(connectMoondream, 5000)
    }
    mdWs.onerror = () => { if (mdWs) mdWs.close() }
  } catch { /* no ws */ }
}

function handleMdMessage(msg) {
  switch (msg.type) {
    case 'connected':
      break

    case 'face-analysis':
      mdUI.status.className = 'md-status online'
      mdUI.status.textContent = 'IA conectada'
      if (msg.error) {
        showToast('Falha na análise: ' + msg.error)
        return
      }
      mdUI.faceShape.textContent = msg.faceShape
      if (msg.recommendations && msg.recommendations.length > 0) {
        mdUI.recommendations.innerHTML = msg.recommendations.map(r =>
          `<span class="rec-tag" data-style="${r.id}">${r.label}</span>`
        ).join('')
        mdUI.recommendations.querySelectorAll('.rec-tag').forEach(el => {
          el.addEventListener('click', () => {
            const style = el.dataset.style
            const btn = document.querySelector(`.glasses-option[data-style="${style}"]`)
            if (btn) btn.click()
            showToast(`Estilo "${el.textContent}" selecionado!`)
          })
        })
      }
      mdUI.results.classList.remove('hidden')
      break

    case 'auto-fit-result':
      mdUI.status.className = 'md-status online'
      mdUI.status.textContent = 'IA conectada'
      if (msg.error) { showToast('Auto-fit falhou: ' + msg.error); return }
      mdUI.faceShape.textContent = msg.faceShape
      if (msg.recommendations && msg.recommendations.length > 0) {
        mdUI.recommendations.innerHTML = msg.recommendations.map(r =>
          `<span class="rec-tag" data-style="${r.id}">${r.label}</span>`
        ).join('')
        mdUI.recommendations.querySelectorAll('.rec-tag').forEach(el => {
          el.addEventListener('click', () => {
            const style = el.dataset.style
            const btn = document.querySelector(`.glasses-option[data-style="${style}"]`)
            if (btn) btn.click()
            showToast(`Estilo "${el.textContent}" selecionado!`)
          })
        })
        const bestStyle = msg.bestPick || msg.recommendations[0].id
        const btn = document.querySelector(`.glasses-option[data-style="${bestStyle}"]`)
        if (btn) btn.click()
        showToast(`Auto ajuste: ${msg.faceShape} → ${STYLE_IDS[bestStyle] || bestStyle}!`)
      }
      mdUI.results.classList.remove('hidden')
      break

    case 'prescription-ocr-result':
      if (msg.error) { showToast('Falha ao ler receita: ' + msg.error); return }
      if (msg.rawText) {
        const msg2 = msg.structured ? `Receita lida!\nOD: ${msg.structured.od.sphere || '?'} | OE: ${msg.structured.os.sphere || msg.structured.od.sphere || '?'}` : 'Receita lida!'
        showToast(msg2)
        const existing = document.getElementById('md-prescription-text')
        if (!existing) {
          const el = document.createElement('div')
          el.id = 'md-prescription-text'
          el.style.cssText = 'font-size:11px;color:var(--text-dim);padding:6px 8px;background:var(--surface2);border-radius:6px;max-height:80px;overflow-y:auto;margin-top:4px;'
          mdUI.results.after(el)
        }
        const el = document.getElementById('md-prescription-text')
        el.textContent = msg.rawText.slice(0, 300) + (msg.rawText.length > 300 ? '...' : '')
      }
      break

    case 'glasses-fit-analysis':
      if (msg.analysis) {
        showToast('Ajuste: ' + msg.analysis)
      }
      break
  }
}

function sendToMoondream(type, payload) {
  if (!mdWs || mdWs.readyState !== WebSocket.OPEN) {
    showToast('IA Moondream offline')
    return false
  }
  mdWs.send(JSON.stringify({ type, ...payload }))
  return true
}

function captureFrame() {
  if (!renderer || !video) return null
  renderer.render(scene, camera)
  return renderer.domElement.toDataURL('image/jpeg', 0.5)
}

mdUI.analyzeBtn.addEventListener('click', () => {
  const dataUrl = captureFrame()
  if (!dataUrl) { showToast('Ative a câmera primeiro'); return }
  mdUI.status.textContent = 'Analisando...'
  mdUI.status.className = 'md-status loading'
  sendToMoondream('analyze-face', { imageData: dataUrl.split(',')[1], glassesStyle: currentStyle })
})

mdUI.autoFitBtn.addEventListener('click', () => {
  const dataUrl = captureFrame()
  if (!dataUrl) { showToast('Ative a câmera primeiro'); return }
  mdUI.status.textContent = 'Analisando...'
  mdUI.status.className = 'md-status loading'
  sendToMoondream('auto-fit', { imageData: dataUrl.split(',')[1] })
})

mdUI.prescriptionInput.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    mdUI.status.textContent = 'Lendo receita...'
    mdUI.status.className = 'md-status loading'
    sendToMoondream('prescription-ocr', { imageData: ev.target.result.split(',')[1] })
  }
  reader.readAsDataURL(file)
})

// Also connect Moondream when camera starts
const origStartApp = startApp
startApp = async function() {
  await origStartApp.call(this)
  connectMoondream()
}

// ── OpenCV Backend Client ───────────────────────────────────────────────

const OPENCV_URL = 'http://localhost:5050'

const ocvUI = {
  status: document.getElementById('opencv-status'),
  results: document.getElementById('opencv-results'),
  detector: document.getElementById('ocv-detector'),
  faces: document.getElementById('ocv-faces'),
  shape: document.getElementById('ocv-shape'),
  lighting: document.getElementById('ocv-lighting'),
  bestStyle: document.getElementById('ocv-best-style'),
  recommendations: document.getElementById('ocv-recommendations'),
  analyzeBtn: document.getElementById('opencv-analyze-btn'),
  autoBtn: document.getElementById('opencv-auto-btn'),
}

let ocvConnected = false

async function connectOpenCV() {
  try {
    const res = await fetch(`${OPENCV_URL}/api/health`)
    if (res.ok) {
      const data = await res.json()
      ocvConnected = true
      ocvUI.status.textContent = `Backend online (OpenCV ${data.opencv_version})`
      ocvUI.status.className = 'opencv-status online'
      ocvUI.analyzeBtn.disabled = false
      ocvUI.autoBtn.disabled = false
    }
  } catch {
    ocvConnected = false
    ocvUI.status.textContent = 'Backend offline'
    ocvUI.status.className = 'opencv-status offline'
    ocvUI.analyzeBtn.disabled = true
    ocvUI.autoBtn.disabled = true
    setTimeout(connectOpenCV, 5000)
  }
}

async function analyzeWithOpenCV() {
  if (!ocvConnected) {
    showToast('Backend OpenCV offline')
    return
  }
  const dataUrl = captureFrame()
  if (!dataUrl) {
    showToast('Ative a câmera primeiro')
    return
  }

  ocvUI.status.textContent = 'Analisando...'
  ocvUI.status.className = 'opencv-status loading'

  try {
    const res = await fetch(`${OPENCV_URL}/api/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl })
    })

    const data = await res.json()

    if (!data.success) {
      showToast('Falha na análise: ' + (data.error || 'Erro desconhecido'))
      ocvUI.status.textContent = 'Erro na análise'
      ocvUI.status.className = 'opencv-status error'
      return
    }

    ocvUI.status.textContent = 'Análise completa'
    ocvUI.status.className = 'opencv-status online'

    ocvUI.detector.textContent = data.faces.detector === 'dnn' ? 'DNN SSD' : 'Haar Cascade'
    ocvUI.faces.textContent = data.faces.faces_count

    if (data.faces.faces.length > 0) {
      const face = data.faces.faces[0]
      ocvUI.shape.textContent = face.face_shape || '-'

      if (face.glasses_fit && face.glasses_fit.length > 0) {
        const best = face.glasses_fit[0]
        ocvUI.bestStyle.textContent = `${best.description} (${best.score}%)`
      }
    }

    ocvUI.lighting.textContent = data.lighting.condition

    ocvUI.recommendations.innerHTML = data.recommendations.map(r => {
      const icon = r.type === 'success' ? '&#x2705;' : (r.type === 'warning' ? '&#x26A0;&#xFE0F;' : (r.type === 'error' ? '&#x274C;' : '&#x2139;&#xFE0F;'))
      return `<div class="ocv-rec ${r.type}">${icon} ${r.message}</div>`
    }).join('')

    ocvUI.results.classList.remove('hidden')
    showToast('Análise OpenCV concluída!')
  } catch (e) {
    console.error('OpenCV analyze error:', e)
    showToast('Erro ao conectar com backend OpenCV')
    ocvUI.status.textContent = 'Erro de conexão'
    ocvUI.status.className = 'opencv-status error'
  }
}

function autoFitOpenCV() {
  if (!ocvConnected) {
    showToast('Backend OpenCV offline')
    return
  }
  const dataUrl = captureFrame()
  if (!dataUrl) {
    showToast('Ative a câmera primeiro')
    return
  }

  ocvUI.status.textContent = 'Auto ajuste...'
  ocvUI.status.className = 'opencv-status loading'

  fetch(`${OPENCV_URL}/api/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl })
  })
  .then(res => res.json())
  .then(data => {
    if (!data.success || !data.faces.faces.length) {
      showToast('Nenhum rosto detectado para auto-ajuste')
      ocvUI.status.textContent = 'Sem rosto detectado'
      ocvUI.status.className = 'opencv-status error'
      return
    }

    const face = data.faces.faces[0]
    if (face.glasses_fit && face.glasses_fit.length > 0) {
      const best = face.glasses_fit[0]
      const btn = document.querySelector(`.glasses-option[data-style="${best.style}"]`)
      if (btn) {
        btn.click()
        showToast(`Auto ajuste: ${face.face_shape} → ${best.description}!`)
      }
    }

    ocvUI.status.textContent = 'Auto ajuste aplicado'
    ocvUI.status.className = 'opencv-status online'
  })
  .catch(e => {
    console.error('OpenCV auto-fit error:', e)
    showToast('Erro no auto-ajuste')
    ocvUI.status.textContent = 'Erro'
    ocvUI.status.className = 'opencv-status error'
  })
}

ocvUI.analyzeBtn.addEventListener('click', analyzeWithOpenCV)
ocvUI.autoBtn.addEventListener('click', autoFitOpenCV)

// Auto-connect OpenCV on page load (independent of camera/MediaPipe)
connectOpenCV()

// ── Test Mode removed ───────────────────────────────────────────────────
