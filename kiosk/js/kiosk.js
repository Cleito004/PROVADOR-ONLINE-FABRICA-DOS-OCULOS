// ── Glasses Catalog ──────────────────────────────────────────────────────

const GLASSES_CATALOG = [
  // Demo models (comprovados)
  { id: 'demo1', gender: 'unisex', name: 'Elegante', icon: '👓',
    file: 'assets/models3D/glasses1.glb' },
  { id: 'demo2', gender: 'unisex', name: 'Clássico', icon: '🕶️',
    file: 'assets/models3D/glasses2.glb' },

  // Poly Pizza CC0 — Femininos
  { id: 'pp01', gender: 'female', name: 'Gatinho', icon: '🐱',
    file: 'assets/models3D/poly-pizza/Glasses-Dz9SyIEq7w.glb' },
  { id: 'pp02', gender: 'female', name: 'Borboleta', icon: '🦋',
    file: 'assets/models3D/poly-pizza/Glasses-J289oMy6pQ.glb' },
  { id: 'pp03', gender: 'female', name: 'Coração', icon: '💖',
    file: 'assets/models3D/poly-pizza/Glasses-7NZp449iJq.glb' },
  { id: 'pp04', gender: 'female', name: 'Floral', icon: '🌸',
    file: 'assets/models3D/poly-pizza/Glasses-XLysBbtilu.glb' },
  { id: 'pp05', gender: 'female', name: 'Cristal', icon: '✨',
    file: 'assets/models3D/poly-pizza/Glasses-crbuIoq2dO.glb' },
  { id: 'pp06', gender: 'female', name: 'Sereia', icon: '🧜',
    file: 'assets/models3D/poly-pizza/Pixel Glasses.glb' },

  // Poly Pizza CC0 — Masculinos
  { id: 'pp07', gender: 'male', name: 'Aviador', icon: '✈️',
    file: 'assets/models3D/poly-pizza/Glasses-fNEK0SGJ6D.glb' },
  { id: 'pp08', gender: 'male', name: 'Retrô', icon: '🎸',
    file: 'assets/models3D/poly-pizza/Glasses-WoYlUvyUAb.glb' },
  { id: 'pp09', gender: 'male', name: 'Corsa', icon: '🏎️',
    file: 'assets/models3D/poly-pizza/Glasses-1TJPsi4VIT.glb' },
  { id: 'pp10', gender: 'male', name: 'Courage', icon: '💪',
    file: 'assets/models3D/poly-pizza/Glasses-3jamofoetY.glb' },
  { id: 'pp11', gender: 'male', name: 'Tank', icon: '🛡️',
    file: 'assets/models3D/poly-pizza/Glasses-p5QgQxkMBE.glb' },

  // Poly Pizza CC0 — Unissex
  { id: 'pp12', gender: 'unisex', name: 'Minimalist', icon: '◻️',
    file: 'assets/models3D/poly-pizza/Glasses.glb' },
  { id: 'pp13', gender: 'unisex', name: 'Party', icon: '🎉',
    file: 'assets/models3D/poly-pizza/Party Glasses.glb' },
  { id: 'pp14', gender: 'unisex', name: 'Esportivo', icon: '🏃',
    file: 'assets/models3D/poly-pizza/Ski Goggles.glb' },
  { id: 'pp15', gender: 'unisex', name: 'Urban', icon: '🏙️',
    file: 'assets/models3D/poly-pizza/Glasses-kAxq5NzcFZ.glb' },
  { id: 'pp16', gender: 'unisex', name: 'Navegador', icon: '🧭',
    file: 'assets/models3D/poly-pizza/Glasses-oQtjZCNFoo.glb' },
  { id: 'pp17', gender: 'unisex', name: 'Ciclista', icon: '🚴',
    file: 'assets/models3D/poly-pizza/Glasses-yYdsPoULg1.glb' },
  { id: 'pp18', gender: 'unisex', name: 'Steampunk', icon: '⚙️',
    file: 'assets/models3D/poly-pizza/Glasses-Zh87A7UV3V.glb' },

  // Poly Pizza CC0 — added to complete all 28 models
  { id: 'pp19', gender: 'female', name: 'Geométrica', icon: '🔷',
    file: 'assets/models3D/poly-pizza/Glasses-9SQY3Gsq2s.glb' },
  { id: 'pp20', gender: 'female', name: 'Aro Metal', icon: '💿',
    file: 'assets/models3D/poly-pizza/Glasses-DBEk0SMQCt.glb' },
  { id: 'pp21', gender: 'female', name: 'Gata', icon: '😺',
    file: 'assets/models3D/poly-pizza/Glasses-j3zHqDAnzH.glb' },
  { id: 'pp22', gender: 'female', name: 'Aro Fino', icon: '〰️',
    file: 'assets/models3D/poly-pizza/Glasses-YchMXfQNU0.glb' },
  { id: 'pp23', gender: 'male', name: 'Degradê', icon: '🌫️',
    file: 'assets/models3D/poly-pizza/Glasses-9xOJlCsQzX.glb' },
  { id: 'pp24', gender: 'male', name: 'Azul', icon: '🔵',
    file: 'assets/models3D/poly-pizza/Glasses-i5dNUjQMUG.glb' },
  { id: 'pp25', gender: 'male', name: 'Wayfarer', icon: '🕶️',
    file: 'assets/models3D/poly-pizza/Glasses-j3xPyO1mvt.glb' },
  { id: 'pp26', gender: 'unisex', name: 'Redondo', icon: '⭕',
    file: 'assets/models3D/poly-pizza/Glasses-oc8MPJuSud.glb' },
  { id: 'pp27', gender: 'unisex', name: 'Retangular', icon: '▬',
    file: 'assets/models3D/poly-pizza/Glasses-PNZqCaX1m9.glb' },
  { id: 'pp28', gender: 'unisex', name: 'Clássico Fino', icon: '◇',
    file: 'assets/models3D/poly-pizza/Glasses-SyNFHIhIDd.glb' },
]

let currentGlasses = null
let currentGender = 'unisex'
let engineReady = false

// ── DOM Refs ─────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id)
const startScreen = $('startScreen')
const mirrorScreen = $('mirrorScreen')
const vitrineTrack = $('vitrineTrack')
const genderBadge = $('genderBadge')
const startBtn = $('startBtn')
const btnCapture = $('btnCapture')
const btnGenderToggle = $('btnGenderToggle')
const btnReset = $('btnReset')
const vitrinePrev = $('vitrinePrev')
const vitrineNext = $('vitrineNext')
const autoCountdown = $('autoCountdown')

// ── Gender Detection (face-api.js) ──────────────────────────────────────

let genderDetector = null
let genderDetectionInterval = null
let autoGenderTimer = null
let autoGenderCountdown = 3

async function initGenderDetector() {
  try {
    await faceapi.nets.tinyFaceDetector.loadFromUri('weights')
    await faceapi.nets.ageGenderNet.loadFromUri('weights')
    genderDetector = true
    console.log('[Kiosk] face-api.js carregado')
  } catch (e) {
    console.warn('[Kiosk] face-api.js não disponível:', e.message)
    genderDetector = false
  }
}

async function detectGenderSilent(videoEl) {
  if (!genderDetector || !videoEl || videoEl.readyState < 2) return null
  try {
    const result = await faceapi.detectSingleFace(videoEl,
      new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.3 })
    ).withAgeAndGender()

    if (result) {
      return {
        gender: result.gender,
        genderProbability: result.genderProbability,
        age: result.age,
      }
    }
  } catch { /* silent */ }
  return null
}

function applyDetectedGender(gender) {
  if (gender === 'male' || gender === 'female') {
    const mapped = gender === 'male' ? 'male' : 'female'
    if (currentGender !== mapped) {
      currentGender = mapped
      rebuildVitrine()
      genderBadge.style.display = 'block'
      genderBadge.textContent = 'Moda ' + (mapped === 'female' ? 'Feminina' : 'Masculina')
    }
  }
}

function startGenderAutoDetect() {
  const videoEl = document.querySelector('video')
  if (!videoEl || !genderDetector) {
    setTimeout(startGenderAutoDetect, 1000)
    return
  }

  let attempts = 0
  const MAX_ATTEMPTS = 15

  const check = () => {
    if (!engineReady || attempts >= MAX_ATTEMPTS) {
      autoCountdown.textContent = '—'
      return
    }

    detectGenderSilent(videoEl).then(result => {
      if (result && result.genderProbability > 0.7) {
        applyDetectedGender(result.gender)
        autoCountdown.textContent = '✓'
        return
      }

      attempts++
      const remaining = MAX_ATTEMPTS - attempts
      if (remaining > 0) {
        autoCountdown.textContent = Math.ceil(remaining / 2)
        setTimeout(check, 500)
      } else {
        autoCountdown.textContent = '—'
      }
    }).catch(() => {
      attempts++
      setTimeout(check, 500)
    })
  }

  setTimeout(check, 500)
}

// ── Gender Toggle ───────────────────────────────────────────────────────

function cycleGender() {
  const order = ['female', 'male', 'unisex']
  const idx = order.indexOf(currentGender)
  currentGender = order[(idx + 1) % order.length]
  genderBadge.style.display = 'block'
  const labels = { female: 'Moda Feminina', male: 'Moda Masculina', unisex: 'Unissex' }
  genderBadge.textContent = labels[currentGender]
  rebuildVitrine()
}

// ── Vitrine ────────────────────────────────────────────────────────────

function rebuildVitrine() {
  const filtered = GLASSES_CATALOG.filter(g =>
    g.gender === currentGender || g.gender === 'unisex'
  )

  vitrineTrack.innerHTML = ''
  filtered.forEach(g => {
    const el = document.createElement('div')
    el.className = 'vitrine-item' + (g.id === currentGlasses ? ' active' : '')
    el.innerHTML = `<span class="item-icon">${g.icon}</span><span>${g.name}</span>`
    el.addEventListener('click', () => selectGlasses(g.id))
    vitrineTrack.appendChild(el)
  })

  if (filtered.length > 0) {
    const hasActive = filtered.some(g => g.id === currentGlasses)
    if (!hasActive) {
      selectGlasses(filtered[0].id)
    }
  }
}

function selectGlasses(id) {
  currentGlasses = id
  const glass = GLASSES_CATALOG.find(g => g.id === id)
  if (!glass) return

  document.querySelectorAll('.vitrine-item').forEach(el => el.classList.remove('active'))
  const activeEl = Array.from(vitrineTrack.children).find(
    el => el.textContent.trim().includes(glass.name)
  )
  if (activeEl) activeEl.classList.add('active')

  if (engineReady) {
    loadGlassesModel(glass.file)
  }
}

function loadGlassesModel(url) {
  if (typeof WebARRocksMirror !== 'undefined' && WebARRocksMirror.load) {
    WebARRocksMirror.load(url)
  }
}

// ── Mirror Initialization ─────────────────────────────────────────────

function initMirror() {
  const canvasFace = $('WebARRocksFaceCanvas')
  const canvasThree = $('threeCanvas')

  WebARRocksMirror.init({
    canvasFace: canvasFace,
    canvasThree: canvasThree,
    width: window.innerHeight * (9 / 16),
    height: window.innerHeight,

    specWebARRocksFace: {
      NNCPath: 'neuralNets/NN_GLASSES_9.json',
      scanSettings: { threshold: 0.8 },
      maxFacesDetected: 1,
    },

    landmarksStabilizerSpec: {
      beta: 10,
      minCutOff: 0.001,
      freqRange: [2, 144],
      forceFilterNNInputPxRange: [2.5, 6],
    },

    isLightReconstructionEnabled: true,
    lightReconstructionIntensityPow: 2.5,
    lightReconstructionAmbIntensityFactor: 25.0,
    lightReconstructionDirIntensityFactor: 25.0,
    lightReconstructionTotalIntensityMin: 0.15,

    isGlasses: true,
    modelURL: null,
    occluderURL: 'assets/models3D/occluder.glb',
    envmapURL: 'assets/envmaps/venice_sunset_1k.hdr',

    pointLightIntensity: 0.4,
    pointLightY: 200,
    hemiLightIntensity: 0.3,

    bloom: {
      threshold: 0.7,
      strength: 6,
      radius: 0.5,
    },

    taaLevel: 2,

    branchFadingZ: -0.9,
    branchFadingTransition: 0.6,
    branchBendingAngle: 5,
    branchBendingZ: 0,

    debugLandmarks: false,
    debugOccluder: false,

    solvePnPImgPointsLabels: [
      'leftEarBottom', 'rightEarBottom',
      'noseBottom', 'noseLeft', 'noseRight',
      'leftEyeExt', 'rightEyeExt',
    ],
  }).then(() => {
    console.log('[Kiosk] WebARRocksMirror inicializado')
    engineReady = true

    const glass = GLASSES_CATALOG.find(g => g.id === currentGlasses)
    if (glass) loadGlassesModel(glass.file)

    const resizeHandler = () => {
      WebARRocksMirror.resize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('orientationchange', resizeHandler)
    window.addEventListener('resize', resizeHandler)

    startGenderAutoDetect()

    hideLoading()

  }).catch(err => {
    console.warn('[Kiosk] Erro WebARRocksMirror:', err)
    hideLoading()
    mirrorScreen.style.display = 'none'
    startScreen.style.display = 'flex'
    showToast(getCameraHelp(err))
    handleStart._locked = false
    startBtn.disabled = false
  })
}

// ── Loading overlay ────────────────────────────────────────────────────

function showLoading(text) {
  const existing = document.querySelector('.loading-overlay')
  if (existing) existing.remove()
  const el = document.createElement('div')
  el.className = 'loading-overlay'
  el.innerHTML = `<div class="loading-spinner"></div><div class="loading-text">${text}</div>`
  document.body.appendChild(el)
}

function hideLoading() {
  const el = document.querySelector('.loading-overlay')
  if (el) el.remove()
}

function showToast(msg) {
  let t = document.querySelector('.kiosk-toast')
  if (!t) {
    t = document.createElement('div')
    t.className = 'kiosk-toast'
    document.body.appendChild(t)
  }
  t.textContent = msg
  t.classList.add('visible')
  clearTimeout(t._hide)
  t._hide = setTimeout(() => t.classList.remove('visible'), 4000)
}

// ── Start Screen Flow ──────────────────────────────────────────────────

function getCameraHelp(err) {
  const isHttp = location.protocol === 'http:' && location.hostname !== 'localhost'
  if (isHttp) {
    return 'Câmera bloqueada em HTTP. Use HTTPS: https://' + location.hostname + ':5501'
  }
  const msg = (err && (err.message || err)) || ''
  if (msg.includes('NotAllowed') || msg.includes('Permission'))
    return 'Permissão da câmera negada. Permita o acesso no navegador.'
  if (msg.includes('NotFound'))
    return 'Nenhuma câmera encontrada no dispositivo.'
  if (msg.includes('WEBCAM_UNAVAILABLE'))
    return 'Câmera não encontrada. Conecte uma câmera e recarregue.'
  return 'Câmera indisponível. Verifique se está conectada e use HTTPS.'
}

function handleStart() {
  if (handleStart._locked) return
  handleStart._locked = true
  startBtn.disabled = true
  startScreen.style.display = 'none'
  mirrorScreen.style.display = 'flex'
  showLoading('Iniciando câmera...')

  setTimeout(() => {
    initMirror()
  }, 300)
}

// ── Screenshot ─────────────────────────────────────────────────────────

function captureScreenshot() {
  if (typeof WebARRocksMirror === 'undefined') return

  WebARRocksMirror.capture_image(cv => {
    const link = document.createElement('a')
    link.download = `provador-${Date.now()}.png`
    link.href = cv.toDataURL('image/png')
    link.click()
  })
}

// ── Reset ──────────────────────────────────────────────────────────────

function resetKiosk() {
  if (typeof WebARRocksMirror !== 'undefined' && WebARRocksMirror.destroy) {
    WebARRocksMirror.destroy().then(() => {
      engineReady = false
      mirrorScreen.style.display = 'none'
      startScreen.style.display = 'flex'
      genderBadge.style.display = 'none'
      currentGlasses = null
      currentGender = 'unisex'
      autoCountdown.textContent = '3'
      rebuildVitrine()
      handleStart._locked = false
      startBtn.disabled = false
    })
  } else {
    handleStart._locked = false
    startBtn.disabled = false
  }
}

// ── Vitrine scroll ─────────────────────────────────────────────────────

function scrollVitrine(dir) {
  vitrineTrack.scrollBy({ left: dir * 150, behavior: 'smooth' })
}

// ── Gender buttons on start screen ─────────────────────────────────────

document.querySelectorAll('.gender-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.gender-btn').forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    currentGender = btn.dataset.gender
  })
})

// ── Auto gender countdown ──────────────────────────────────────────────

function startAutoGenderCountdown() {
  let count = 3
  const tick = () => {
    autoCountdown.textContent = count
    if (count <= 0) {
      autoCountdown.textContent = '✓'
      return
    }
    count--
    setTimeout(tick, 1000)
  }
  tick()
}

// ── Init ───────────────────────────────────────────────────────────────

async function init() {
  showLoading('Carregando detector facial...')
  await initGenderDetector()
  hideLoading()

  rebuildVitrine()
  startAutoGenderCountdown()

  startBtn.addEventListener('click', handleStart)

  btnCapture.addEventListener('click', captureScreenshot)
  btnGenderToggle.addEventListener('click', cycleGender)
  btnReset.addEventListener('click', resetKiosk)
  vitrinePrev.addEventListener('click', () => scrollVitrine(-1))
  vitrineNext.addEventListener('click', () => scrollVitrine(1))
}

document.addEventListener('DOMContentLoaded', init)
