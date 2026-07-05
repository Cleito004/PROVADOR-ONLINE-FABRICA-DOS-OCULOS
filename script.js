import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const LM = {
  leftEyeOuter: 33, rightEyeOuter: 263,
  leftEyeInner: 133, rightEyeInner: 362,
  leftTemple: 127, rightTemple: 356,
  leftCheek: 234, rightCheek: 454,
  forehead: 10, chin: 175,
  noseBridge: 168, noseTip: 1
};

const CFG = {
  refHeadWidth: 140,
  refFaceHeight: 210,
  glassesDown: 2,
  glassesCenterX: 0,
  glassesScale: 1.2
};

const STYLE_CFG = {
  round:   { scale: 1.0, depth: 8,  down: 2, centerX: 0 },
  square:  { scale: 1.0, depth: 8,  down: 2, centerX: 0 },
  aviator: { scale: 1.0, depth: 8,  down: 2, centerX: 0 },
  cateye:  { scale: 1.0, depth: 8,  down: 2, centerX: 0 },
  sport:   { scale: 1.0, depth: 10, down: 3, centerX: 0 },
};

let faceLandmarker;
let glassesGroup;
let videoTexture;
let videoSprite;
let renderer, scene, camera;
let video;
let predictionInFlight = false;
let isActive = false;

const smooth = {
  ready: false,
  pos: new THREE.Vector3(),
  quat: new THREE.Quaternion(),
  scale: new THREE.Vector3(1,1,1),
  prev: new THREE.Vector3()
};

let testModeSketchpad;

let currentStyle = 'round';
let currentColor = '#1a1a1a';
let currentLensColor = '#1a2e1a';
let currentLensOpacity = 0.7;

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function toVec3(pts, i) {
  return new THREE.Vector3(-pts[i][0], -pts[i][1], -pts[i][2]);
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

function qDelta(a, b) {
  return 2 * Math.acos(clamp(Math.abs(a.dot(b)), 0, 1));
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

// ── GLB Model Loader ──────────────────────────────────────────────────

const MODEL_CACHE = {}
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
      loader.load(url, gltf => { MODEL_CACHE[key] = gltf.scene; resolve() }, undefined, reject)
    })
  }))
}

function buildFromModel(style, frameColor, lensColor, lensOpacity) {
  const cached = MODEL_CACHE[style]
  if (!cached) return new THREE.Group()

  const root = cached.clone(true)
  const frameMat = new THREE.MeshStandardMaterial({ color: frameColor, metalness: 0.6, roughness: 0.3 })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  let lensCount = 0
  root.traverse(c => {
    if (!c.isMesh) return
    const n = (c.material.name || '').toLowerCase()
    if (n.includes('lens') || n.includes('glass') || n.includes('visor') || n.includes('lente')) {
      c.material = lensMat.clone(); lensCount++
    } else {
      c.material = frameMat.clone()
    }
    c.material.needsUpdate = true; c.renderOrder = 3
  })

  if (lensCount === 0) {
    const meshes = []
    root.traverse(c => { if (c.isMesh) meshes.push(c) })
    if (meshes.length >= 2) {
      const sorted = meshes.map(m => {
        const box = new THREE.Box3().setFromObject(m)
        const s = box.max.clone().sub(box.min)
        return { mesh: m, vol: s.x * s.y * s.z }
      }).sort((a, b) => a.vol - b.vol)
      const half = Math.max(1, Math.floor(sorted.length / 2))
      sorted.slice(0, half).forEach(({ mesh }) => { mesh.material = lensMat.clone(); lensCount++ })
      sorted.slice(half).forEach(({ mesh }) => { mesh.material = frameMat.clone() })
    } else {
      meshes.forEach(m => { m.material = frameMat.clone() })
    }
  }

  root.traverse(c => { if (c.isMesh) c.material.needsUpdate = true })
  return root
}

const prescription = {
  cylinder: 0,
  axis: 0,
  astigmatism: false,
  blueFilter: false,
  photochromic: 0
};

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

function patchLenses(grp) {
  grp.traverse(c => {
    if (c.isMesh && c.userData.isLens) {
      const newMat = createLensMaterial(c.material);
      c.material.dispose();
      c.material = newMat;
    }
  });
}

function updateLensUniforms() {
  if (!glassesGroup) return;
  const aRad = prescription.axis * Math.PI / 180;
  glassesGroup.traverse(c => {
    if (c.isMesh && c.userData.isLens && c.material.uniforms) {
      const u = c.material.uniforms;
      u.uTime.value = performance.now() / 1000;
      u.uCylinder.value = prescription.cylinder;
      u.uAxisRad.value = aRad;
      u.uAstigmatism.value = prescription.astigmatism ? 1 : 0;
      u.uBlueFilter.value = prescription.blueFilter ? 1 : 0;
      u.uPhotochromic.value = prescription.photochromic;
    }
  });
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
  patchLenses(glassesGroup);
  updateLensUniforms();
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
  camera.position.set(-vw/2, -vh/2, 500);

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(vw, vh);
  renderer.physicallyCorrectLights = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const container = document.getElementById('threejs-container');
  container.appendChild(renderer.domElement);

  scene = new THREE.Scene();

  videoTexture = new THREE.VideoTexture(video);
  videoTexture.minFilter = THREE.LinearFilter;
  videoTexture.colorSpace = THREE.SRGBColorSpace;
  videoTexture.wrapS = THREE.RepeatWrapping;
  videoTexture.repeat.x = -1;
  videoTexture.offset.x = 1;

  videoSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: videoTexture, depthWrite: false
  }));
  videoSprite.center.set(0.5, 0.5);
  videoSprite.scale.set(-vw, vh, 1);
  videoSprite.position.copy(camera.position);
  videoSprite.position.z = 0;
  scene.add(videoSprite);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  const envTex = pmrem.fromScene(envScene).texture;
  scene.environment = envTex;
  pmrem.dispose();

  const amb = new THREE.HemisphereLight(0xffffff, 0x444466, 0.6);
  scene.add(amb);
  const key = new THREE.DirectionalLight(0xffffff, 1.2);
  key.position.set(0, 120, 250);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xeef0ff, 0.5);
  fill.position.set(-100, 40, 120);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xffffff, 0.4);
  rim.position.set(60, 80, -100);
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
    videoSprite.scale.set(-vw2, vh2, 1);
    videoSprite.position.copy(camera.position);
    videoSprite.position.z = 0;
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

  if ((!faceLandmarker && !testModeSketchpad) || !glassesGroup) {
    predictionInFlight = false;
    schedulePrediction();
    return;
  }

  try {
    const useReal = !testModeSketchpad;
    const fakeResults = useReal ? null : generateFakeFace(video);
    const rawLandmarks = useReal
      ? faceLandmarker.detectForVideo(video, performance.now()).faceLandmarks
      : fakeResults.faceLandmarks;
    const results = { faceLandmarks: rawLandmarks || [] };

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      glassesGroup.visible = true;

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

      const eMid = midpoint(lEye, rEye);
      const eW = lEye.distanceTo(rEye);
      const tW = lTmp.distanceTo(rTmp);
      const cW = lChk.distanceTo(rChk);
      const fW = Math.max(eW, tW, cW);
      const fH = fHead.distanceTo(chn);

      const xAxis = rEye.clone().sub(lEye).normalize();
      const yRaw = fHead.clone().sub(chn).normalize();
      let zAxis = xAxis.clone().cross(yRaw).normalize();
      if (zAxis.z < 0) {
        zAxis.negate();
        xAxis.negate();
      }
      const yAxis = zAxis.clone().cross(xAxis).normalize();

      const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat);

      const sc = STYLE_CFG[currentStyle] || STYLE_CFG.round;
      const tPos = eMid.clone()
        .addScaledVector(xAxis, sc.centerX)
        .addScaledVector(yAxis, sc.down)
        .addScaledVector(zAxis, sc.depth);

      const wS = fW / CFG.refHeadWidth;
      const hS = fH / CFG.refFaceHeight;
      const bS = wS * 0.7 + hS * 0.3;
      const tScaleVal = bS * CFG.glassesScale * sc.scale;
      const tScale = new THREE.Vector3(tScaleVal, tScaleVal, tScaleVal);

      const mov = tPos.distanceTo(smooth.prev);
      const aDelta = qDelta(smooth.quat, targetQuat);

      const aP = clamp(0.15 + mov * 0.015, 0.15, 0.55);
      const aR = clamp(0.20 + aDelta * 0.6, 0.20, 0.75);
      const aS = clamp(0.16 + mov * 0.010, 0.16, 0.45);

      if (!smooth.ready) {
        smooth.pos.copy(tPos);
        smooth.quat.copy(targetQuat);
        smooth.scale.copy(tScale);
        smooth.ready = true;
      } else {
        smooth.pos.lerp(tPos, aP);
        smooth.quat.slerp(targetQuat, aR);
        smooth.scale.lerp(tScale, aS);
      }
      smooth.prev.copy(tPos);

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

      if (prescription.astigmatism || prescription.blueFilter || prescription.photochromic > 0) {
        updateLensUniforms();
      }

      glassesGroup.position.copy(smooth.pos);
      glassesGroup.quaternion.copy(smooth.quat);
      glassesGroup.scale.copy(smooth.scale);
      glassesGroup.updateWorldMatrix(true, true);
    } else {
      if (glassesGroup) glassesGroup.visible = false;
      smooth.ready = false;
      const fi = document.getElementById('face-info');
      if (fi) fi.classList.add('hidden');
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
  smooth.ready = false;
  testModeSketchpad = null;
}

async function startApp() {
  stopStream();
  errorOverlay.classList.add('hidden');
  startPrompt.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Ativando câmera...';

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    webcam.srcObject = stream;
    await webcam.play();
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
    smooth.ready = false;
    glassesGroup.position.set(0, 0, 0);
    glassesGroup.scale.set(1, 1, 1);
  }
  document.querySelectorAll('.glasses-option').forEach(b => b.classList.remove('active'));
  document.querySelector('.glasses-option[data-style="round"]').classList.add('active');
  document.querySelectorAll('#color-list .color-option').forEach(b => b.classList.remove('active'));
  document.querySelector('#color-list .color-option[data-color="#1a1a1a"]').classList.add('active');
  document.querySelectorAll('#lens-color-list .color-option').forEach(b => b.classList.remove('active'));
  document.querySelector('#lens-color-list .color-option[data-color="#1a2e1a"]').classList.add('active');
  currentStyle = 'round';
  currentColor = '#1a1a1a';
  currentLensColor = '#1a2e1a';
  currentLensOpacity = 0.7;
  rebuildGlasses();
});

// ── Lens Effects Events ──────────────────────────────────────────────────

document.getElementById('cylinder-row').style.display = 'none';
document.getElementById('axis-row').style.display = 'none';

document.getElementById('astigmatism-toggle').addEventListener('change', e => {
  prescription.astigmatism = e.target.checked;
  document.getElementById('cylinder-row').style.display = e.target.checked ? 'block' : 'none';
  document.getElementById('axis-row').style.display = e.target.checked ? 'block' : 'none';
  updateLensUniforms();
});

document.getElementById('cylinder-slider').addEventListener('input', e => {
  prescription.cylinder = parseFloat(e.target.value);
  document.getElementById('cylinder-val').textContent = prescription.cylinder.toFixed(2);
  updateLensUniforms();
});

document.getElementById('axis-slider').addEventListener('input', e => {
  prescription.axis = parseInt(e.target.value);
  document.getElementById('axis-val').textContent = prescription.axis + '°';
  updateLensUniforms();
});

document.getElementById('blue-filter-toggle').addEventListener('change', e => {
  prescription.blueFilter = e.target.checked;
  updateLensUniforms();
});

document.getElementById('photochromic-slider').addEventListener('input', e => {
  prescription.photochromic = parseInt(e.target.value) / 100;
  document.getElementById('photochromic-val').textContent = e.target.value + '%';
  updateLensUniforms();
});

// ── Test Mode ────────────────────────────────────────────────────────────

let testTime = 0;

function generateFakeFace(videoEl) {
  const w = videoEl.videoWidth || 640;
  const h = videoEl.videoHeight || 480;
  const cx = w * 0.5 + Math.sin(testTime * 0.6) * w * 0.04;
  const cy = h * 0.45 + Math.cos(testTime * 0.8) * h * 0.03;
  const tilt = Math.sin(testTime * 0.4) * 0.08;
  const tw = w * 0.14, th = h * 0.28, d = w * 0.02;
  const cosT = Math.cos(tilt), sinT = Math.sin(tilt);
  function pt(xo, yo) {
    const rx = xo * cosT - yo * sinT, ry = xo * sinT + yo * cosT;
    return { x: (cx + rx) / w, y: (cy + ry) / h, z: (yo * 0.3 + xo * 0.1) / w };
  }
  const lms = new Array(478).fill().map(() => ({ x: 0.5, y: 0.5, z: 0 }));
  lms[LM.forehead]       = pt(0,   -th * 0.55);
  lms[LM.chin]           = pt(0,    th * 0.55);
  lms[LM.leftEyeOuter]   = pt(-tw * 0.4, -th * 0.12);
  lms[LM.leftEyeInner]   = pt(-tw * 0.12, -th * 0.12);
  lms[LM.rightEyeOuter]  = pt(tw * 0.4,  -th * 0.12);
  lms[LM.rightEyeInner]  = pt(tw * 0.12, -th * 0.12);
  lms[LM.leftTemple]     = pt(-tw * 0.55, -th * 0.05);
  lms[LM.rightTemple]    = pt(tw * 0.55, -th * 0.05);
  lms[LM.leftCheek]      = pt(-tw * 0.38, th * 0.18);
  lms[LM.rightCheek]     = pt(tw * 0.38, th * 0.18);
  lms[LM.noseBridge]     = pt(0,   0);
  lms[LM.noseTip]        = pt(0,   th * 0.12);
  const zS = Math.cos(testTime * 0.5) * d;
  for (let i = 0; i < 478; i++) lms[i].z += zS;
  return { faceLandmarks: [lms] };
}

function drawTestFace(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, w, h);
  const cx = w * 0.5 + Math.sin(testTime * 0.6) * w * 0.04;
  const cy = h * 0.45 + Math.cos(testTime * 0.8) * h * 0.03;
  const r = w * 0.18;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(testTime * 0.4) * 0.08);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ffcc00';
  ctx.fill();
  ctx.strokeStyle = '#e6b800';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 0.12, r * 0.1, 0, Math.PI * 2);
  ctx.arc(r * 0.3, -r * 0.12, r * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, r * 0.08, r * 0.03, 0, Math.PI * 2);
  ctx.fillStyle = '#ffcc00';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, r * 0.2, r * 0.35, 0.08 * Math.PI, 0.92 * Math.PI);
  ctx.strokeStyle = '#1a1a1a';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

async function initTestMode() {
  stopStream();
  errorOverlay.classList.add('hidden');
  startPrompt.classList.add('hidden');
  loadingOverlay.classList.remove('hidden');
  loadingText.textContent = 'Criando ambiente de teste...';

  const w = 640, h = 480;
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.id = 'test-canvas';
  const ctx = canvas.getContext('2d');

  testModeSketchpad = { canvas, ctx, w, h };
  testTime = 0;

  drawTestFace(ctx, w, h);

  const stream = canvas.captureStream(30);
  webcam.srcObject = stream;
  await webcam.play();

  loadingText.textContent = 'Inicializando cena 3D...';
  await new Promise(r => setTimeout(r, 100));

  await initScene(webcam);

  const anim = () => {
    if (!testModeSketchpad) return;
    testTime += 0.016;
    drawTestFace(ctx, w, h);
    requestAnimationFrame(anim);
  };
  anim();

  loadingText.textContent = 'Pronto! (modo teste)';
  await new Promise(r => setTimeout(r, 200));
  loadingOverlay.classList.add('hidden');

  isActive = true;
  rebuildGlasses();
  schedulePrediction();
}

document.getElementById('test-mode-btn').addEventListener('click', initTestMode);
