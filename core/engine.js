import * as THREE from 'three'
import { loadAllGlassesModels, getGlassesModel, isModelReady } from './glasses-builder.js'
import { LM, FACE_OVAL, CFG, STYLE_CONFIG } from './constants.js'

const VISION_CDN = 'https://unpkg.com/@mediapipe/tasks-vision@0.10.7'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)) }
function toVec3(pts, i, vw, vh) { return new THREE.Vector3(pts[i][0] - vw/2, -pts[i][1] + vh/2, -pts[i][2]) }
function mid(a, b) { return a.clone().add(b).multiplyScalar(0.5) }
function eyeMid(pts, inner, outer, vw, vh) { return mid(toVec3(pts, inner, vw, vh), toVec3(pts, outer, vw, vh)) }
function toPixels(landmarks, v) {
  const w = v.videoWidth, h = v.videoHeight
  return landmarks.map(l => [l.x * w, l.y * h, l.z * w])
}
function qDelta(a, b) { return 2 * Math.acos(clamp(Math.abs(a.dot(b)), 0, 1)) }
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

export class TryOnEngine {
  constructor() {
    this.renderer = null
    this.scene = null
    this.camera = null
    this.video = null
    this.videoTexture = null
    this.videoSprite = null
    this.glassesGroup = new THREE.Group()
    this.occluderMesh = null
    this.faceLandmarker = null
    this.predictionInFlight = false
    this.isActive = false
    this.modelReady = false

    this.smooth = {
      ready: false,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
      scale: new THREE.Vector3(1, 1, 1),
      prev: new THREE.Vector3(),
      buffer: [],
      zBuffer: [],
      scanFrames: [],
      scanCompleted: false,
    }

    this._currentStyle = 'round'
    this._currentColor = '#1a1a1a'
    this._currentLensColor = '#222222'
    this._currentLensOpacity = 0.7
    this._onStateChange = null
    this._animationId = null
  }

  get state() {
    return {
      style: this._currentStyle,
      frameColor: this._currentColor,
      lensColor: this._currentLensColor,
      lensOpacity: this._currentLensOpacity,
      isActive: this.isActive,
    }
  }

  setStateChangeHandler(handler) {
    this._onStateChange = handler
  }

  updateStyle(style) {
    this._currentStyle = style
    this._rebuildGlasses()
    this._notify()
  }

  updateFrameColor(color) {
    this._currentColor = color
    this._rebuildGlasses()
    this._notify()
  }

  updateLens(color, opacity) {
    this._currentLensColor = color
    this._currentLensOpacity = opacity
    this._rebuildGlasses()
    this._notify()
  }

  reset() {
    this._currentStyle = 'round'
    this._currentColor = '#1a1a1a'
    this._currentLensColor = '#222222'
    this._currentLensOpacity = 0.7
    this.smooth.ready = false
    this._rebuildGlasses()
    this._notify()
  }

  _notify() {
    if (this._onStateChange) this._onStateChange(this.state)
  }

  async initScene(videoEl, containerEl) {
    this.video = videoEl
    while (videoEl.videoWidth === 0 || videoEl.videoHeight === 0) {
      await new Promise(r => setTimeout(r, 50))
    }
    await loadAllGlassesModels()
    const vw = videoEl.videoWidth
    const vh = videoEl.videoHeight
    const pad = Math.max(vw, vh) * 0.25

    this.camera = new THREE.OrthographicCamera(-vw / 2 - pad, vw / 2 + pad, vh / 2 + pad, -vh / 2 - pad, 0.1, 5000)
    this.camera.position.set(0, 0, 500)

    this.renderer = new THREE.WebGLRenderer({
      antialias: true, alpha: true, preserveDrawingBuffer: true,
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(vw, vh)
    this.renderer.physicallyCorrectLights = true
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.1
    this.renderer.outputColorSpace = THREE.SRGBColorSpace

    containerEl.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()

    this.videoTexture = new THREE.VideoTexture(videoEl)
    this.videoTexture.minFilter = THREE.LinearFilter
    this.videoTexture.colorSpace = THREE.SRGBColorSpace
    this.videoTexture.needsUpdate = true

    this.videoSprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this.videoTexture, depthWrite: false,
    }))
    this.videoSprite.center.set(0.5, 0.5)
    this.videoSprite.scale.set(vw, vh, 1)
    this.videoSprite.position.set(0, 0, -1)
    this.scene.add(this.videoSprite)

    const envTex = makeEnvMap()
    this.scene.environment = envTex

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8888cc, 0.8))
    const key = new THREE.DirectionalLight(0xffffff, 1.8)
    key.position.set(0, 200, 300)
    this.scene.add(key)
    const fill = new THREE.DirectionalLight(0xaaccff, 0.6)
    fill.position.set(-150, 50, 150)
    this.scene.add(fill)
    const rim = new THREE.DirectionalLight(0xffffff, 0.5)
    rim.position.set(80, 100, -150)
    this.scene.add(rim)

    this.occluderMesh = this._buildOccluder()
    this.occluderMesh.visible = false
    this.scene.add(this.occluderMesh)

    this.glassesGroup = new THREE.Group()
    this.glassesGroup.visible = false
    this.scene.add(this.glassesGroup)
    this._rebuildGlasses()

    const resizeHandler = () => {
      const vw2 = videoEl.videoWidth || vw, vh2 = videoEl.videoHeight || vh
      const pad2 = Math.max(vw2, vh2) * 0.25
      this.camera.left = -vw2 / 2 - pad2
      this.camera.right = vw2 / 2 + pad2
      this.camera.top = vh2 / 2 + pad2
      this.camera.bottom = -vh2 / 2 - pad2
      this.camera.updateProjectionMatrix()
      this.renderer.setSize(vw2, vh2)
      this.videoSprite.scale.set(vw2, vh2, 1)
      this.videoSprite.position.set(0, 0, -1)
    }
    window.addEventListener('resize', resizeHandler)

    this._animate = () => {
      this._animationId = requestAnimationFrame(this._animate)
      if (this.videoTexture) this.videoTexture.needsUpdate = true
      this.renderer.render(this.scene, this.camera)
    }
    this._animate()
  }

  async initMediaPipe() {
    const vision = await import(`${VISION_CDN}/vision_bundle.mjs`)
    const fileset = await vision.FilesetResolver.forVisionTasks(`${VISION_CDN}/wasm`)
    this.faceLandmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
      baseOptions: {
        modelAssetPath: MODEL_URL,
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.5,
      minFacePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
    })
    this.modelReady = true
  }

  startTracking() {
    if (!this.modelReady) return
    this.isActive = true
    this._tick()
  }

  stopTracking() {
    this.isActive = false
    if (this.glassesGroup) this.glassesGroup.visible = false
    if (this.occluderMesh) this.occluderMesh.visible = false
  }

  captureScreenshot() {
    if (!this.renderer) return null
    this.renderer.render(this.scene, this.camera)
    return this.renderer.domElement.toDataURL('image/png')
  }

  dispose() {
    this.stopTracking()
    if (this._animationId) cancelAnimationFrame(this._animationId)
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.renderer?.dispose()
  }

  // ── WebSocket Client ─────────────────────────────────────────────────

  connectWebSocket(url = 'ws://localhost:8080') {
    if (this.ws) this.ws.close()

    try {
      this.ws = new WebSocket(url)

      this.ws.onopen = () => {
        console.log('[WS] Conectado ao servidor')
        this._wsConnected = true
      }

      this.ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data)
          this._handleWsMessage(msg)
        } catch { /* ignore parse errors */ }
      }

      this.ws.onclose = () => {
        console.log('[WS] Desconectado')
        this._wsConnected = false
      }

      this.ws.onerror = (err) => {
        console.warn('[WS] Erro:', err.message)
        this._wsConnected = false
      }
    } catch (e) {
      console.warn('[WS] Não foi possível conectar:', e.message)
      this._wsConnected = false
    }
  }

  sendFrameToServer(canvas) {
    if (!this._wsConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) return

    if (this._frameThrottle) {
      clearTimeout(this._frameThrottle)
    }
    this._frameThrottle = setTimeout(() => {
      try {
        const dataUrl = canvas.toDataURL('image/jpeg', 0.5)
        this.ws.send(JSON.stringify({
          type: 'frame',
          imageData: dataUrl.split(',')[1],
          width: canvas.width,
          height: canvas.height,
        }))
      } catch { /* silent */ }
    }, 100)
  }

  _handleWsMessage(msg) {
    switch (msg.type) {
      case 'connected':
        this._clientId = msg.clientId
        break

      case 'face-detected':
        if (this.glassesGroup && msg.pose) {
          this._applyPoseFromServer(msg.pose)
        }
        break

      case 'face-analysis':
        if (this._onFaceAnalysis) this._onFaceAnalysis(msg)
        break

      case 'glasses-fit-analysis':
        if (this._onGlassesFit) this._onGlassesFit(msg)
        break

      case 'face-lost':
        if (this.glassesGroup) this.glassesGroup.visible = false
        if (this.occluderMesh) this.occluderMesh.visible = false
        this.smooth.ready = false
        break

      case 'config-ack':
        console.log('[WS] Configuração salva no servidor')
        break

      case 'peer-list':
        if (this._onPeers) this._onPeers(msg.peers)
        break

      case 'peer-disconnected':
        if (this._onPeerLeft) this._onPeerLeft(msg.clientId)
        break
    }
  }

  _applyPoseFromServer(pose) {
    if (!this.glassesGroup) return

    this.glassesGroup.visible = true
    if (this.occluderMesh) this.occluderMesh.visible = true

    const pos = new THREE.Vector3(pose.position.x, pose.position.y, pose.position.z)
    const rot = new THREE.Euler(pose.rotation.x, pose.rotation.y, pose.rotation.z)
    const scale = pose.scale || 1

    if (!this.smooth.ready) {
      this.smooth.pos.copy(pos)
      this.smooth.quat.setFromEuler(rot)
      this.smooth.scale.set(scale, scale, scale)
      this.smooth.ready = true
    } else {
      this.smooth.pos.lerp(pos, 0.3)
      this.smooth.quat.slerp(new THREE.Quaternion().setFromEuler(rot), 0.3)
      this.smooth.scale.lerp(new THREE.Vector3(scale, scale, scale), 0.3)
    }

    this.glassesGroup.position.copy(this.smooth.pos)
    this.glassesGroup.quaternion.copy(this.smooth.quat)
    this.glassesGroup.scale.copy(this.smooth.scale)
    this.glassesGroup.updateWorldMatrix(true, true)
  }

  syncConfigToServer(userId, sessionId) {
    if (!this._wsConnected) return
    this.ws.send(JSON.stringify({
      type: 'config-update',
      userId,
      sessionId,
      glassesConfig: {
        style: this._currentStyle,
        frameColor: this._currentColor,
        lensColor: this._currentLensColor,
        lensOpacity: this._currentLensOpacity,
      },
    }))
  }

  syncScreenshot(userId, sessionId, imageUrl) {
    if (!this._wsConnected) return
    this.ws.send(JSON.stringify({
      type: 'screenshot',
      userId,
      sessionId,
      imageUrl,
    }))
  }

  onPeers(handler) { this._onPeers = handler }
  onPeerLeft(handler) { this._onPeerLeft = handler }
  onFaceAnalysis(handler) { this._onFaceAnalysis = handler }
  onGlassesFit(handler) { this._onGlassesFit = handler }

  setFrameCaptureRate(ms) { this._frameCaptureRate = ms }

  requestFaceAnalysis(canvas, glassesStyle) {
    if (!this._wsConnected) return
    try {
      const dataUrl = canvas.toDataURL('image/jpeg', 0.5)
      this.ws.send(JSON.stringify({
        type: 'analyze-face',
        imageData: dataUrl.split(',')[1],
        glassesStyle: glassesStyle || this._currentStyle,
      }))
    } catch { /* silent */ }
  }

  _rebuildGlasses() {
    if (this.glassesGroup) {
      this.scene?.remove(this.glassesGroup)
      this.glassesGroup.traverse(c => {
        if (c.isMesh) {
          c.geometry?.dispose()
          c.material?.dispose()
        }
      })
    }
    const model = getGlassesModel(this._currentStyle, this._currentColor, this._currentLensColor, this._currentLensOpacity)
    if (model) {
      this.glassesGroup = model
    } else {
      this.glassesGroup = new THREE.Group()
    }
    this.scene?.add(this.glassesGroup)
    if (this.occluderMesh) {
      this.scene?.remove(this.occluderMesh)
      this.scene?.add(this.occluderMesh)
    }
    if (!this.isActive) this.glassesGroup.visible = false
  }

  _buildOccluder() {
    const n = FACE_OVAL.length
    const positions = new Float32Array((n + 1) * 3)
    const indices = []
    for (let i = 0; i < n; i++) indices.push(0, i + 1, ((i + 1) % n) + 1)
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setIndex(indices)
    const mat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.renderOrder = 1
    mesh.frustumCulled = false
    return mesh
  }

  _schedulePrediction() {
    if (!this.isActive) return
    if (typeof this.video?.requestVideoFrameCallback === 'function') {
      this.video.requestVideoFrameCallback(() => this._runPrediction())
    } else {
      requestAnimationFrame(() => this._runPrediction())
    }
  }

  _runPrediction() {
    if (this.predictionInFlight) { this._schedulePrediction(); return }
    this.predictionInFlight = true

    if (!this.faceLandmarker || !this.glassesGroup) {
      this.predictionInFlight = false
      this._schedulePrediction()
      return
    }

    try {
      const results = this.faceLandmarker.detectForVideo(this.video, performance.now())

      if (results.faceLandmarks?.length > 0) {
        this.glassesGroup.visible = true
        if (this.occluderMesh) this.occluderMesh.visible = true

        const vw = this.video.videoWidth
        const vh = this.video.videoHeight
        const pts = toPixels(results.faceLandmarks[0], this.video)

        const lEye = eyeMid(pts, LM.leftEyeInner, LM.leftEyeOuter, vw, vh)
        const rEye = eyeMid(pts, LM.rightEyeInner, LM.rightEyeOuter, vw, vh)
        const nose = toVec3(pts, LM.noseBridge, vw, vh)
        const nTip = toVec3(pts, LM.noseTip, vw, vh)
        const fHead = toVec3(pts, LM.forehead, vw, vh)
        const chn = toVec3(pts, LM.chin, vw, vh)
        const lTmp = toVec3(pts, LM.leftTemple, vw, vh)
        const rTmp = toVec3(pts, LM.rightTemple, vw, vh)
        const lChk = toVec3(pts, LM.leftCheek, vw, vh)
        const rChk = toVec3(pts, LM.rightCheek, vw, vh)

        const eMid = mid(lEye, rEye)
        const fW = Math.max(lEye.distanceTo(rEye), lTmp.distanceTo(rTmp), lChk.distanceTo(rChk))
        const fH = fHead.distanceTo(chn)

        const sc = STYLE_CONFIG[this._currentStyle] || STYLE_CONFIG.round

        const noseDir = nTip.clone().sub(nose).normalize()
        const xEye = lEye.clone().sub(rEye).normalize()
        const yRaw = fHead.clone().sub(chn).normalize()
        let zAxis = xEye.clone().cross(yRaw).normalize()
        if (zAxis.dot(noseDir) < 0) zAxis.negate()
        const xAxis = zAxis.clone().cross(yRaw).normalize()
        const yAxis = yRaw

        const rotMat = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
        let targetQuat = new THREE.Quaternion().setFromRotationMatrix(rotMat)

        const tPos = eMid.clone()
          .addScaledVector(xAxis, sc.centerX)
          .addScaledVector(yAxis, sc.down)
          .addScaledVector(zAxis, sc.depth)

        const wS = fW / CFG.refHeadWidth
        const hS = fH / CFG.refFaceHeight
        const bS = wS * 0.7 + hS * 0.3
        const tScaleVal = bS * CFG.glassesScale
        const tScale = new THREE.Vector3(tScaleVal, tScaleVal, tScaleVal)

        // ── Scan rápido (2 frames, independente do tracking) ──────
        if (!this.smooth.scanCompleted) {
          this.smooth.scanFrames.push({ x: tPos.x, y: tPos.y, z: tPos.z })
          if (this.smooth.scanFrames.length >= 2) {
            this.smooth.scanCompleted = true
            if (this._onScanComplete) this._onScanComplete()
          }
        }

        const aD = qDelta(this.smooth.quat, targetQuat)

        this.smooth.buffer.push(tPos.clone())
        if (this.smooth.buffer.length > 3) this.smooth.buffer.shift()
        this.smooth.zBuffer.push(tPos.z)
        if (this.smooth.zBuffer.length > 3) this.smooth.zBuffer.shift()

        if (this.smooth.buffer.length < 1) {
          this.predictionInFlight = false
          this._schedulePrediction()
          return
        }

        const avgPos = new THREE.Vector3()
        this.smooth.buffer.forEach(p => avgPos.add(p))
        avgPos.divideScalar(this.smooth.buffer.length)
        const avgZ = this.smooth.zBuffer.reduce((a, b) => a + b, 0) / this.smooth.zBuffer.length

        const mov = avgPos.distanceTo(this.smooth.prev)
        this.smooth.prev.copy(avgPos)

        if (!this.smooth.ready) {
          this.smooth.pos.copy(avgPos)
          this.smooth.quat.copy(targetQuat)
          this.smooth.scale.copy(tScale)
          this.smooth.ready = true
        } else {
          this.smooth.pos.lerp(avgPos, clamp(0.92 + mov * 0.05, 0.92, 0.98))
          this.smooth.quat.slerp(targetQuat, clamp(0.7 + aD * 0.8, 0.7, 0.97))
          this.smooth.scale.lerp(tScale, clamp(0.88 + mov * 0.04, 0.88, 0.97))
          this.smooth.pos.z += (avgZ - this.smooth.pos.z) * clamp(0.7 + mov * 0.03, 0.7, 0.95)
        }

        this.glassesGroup.position.copy(this.smooth.pos)
        this.glassesGroup.quaternion.copy(this.smooth.quat)
        this.glassesGroup.scale.copy(this.smooth.scale)
        this.glassesGroup.updateWorldMatrix(true, true)

        if (this.occluderMesh) {
          const posAttr = this.occluderMesh.geometry.getAttribute('position')
          let cx = 0, cy = 0, cz = 0
          for (let i = 0; i < FACE_OVAL.length; i++) {
            const fv = toVec3(pts, FACE_OVAL[i], vw, vh).addScaledVector(zAxis, 8)
            posAttr.setXYZ(i + 1, fv.x, fv.y, fv.z)
            cx += fv.x; cy += fv.y; cz += fv.z
          }
          cx /= FACE_OVAL.length; cy /= FACE_OVAL.length; cz /= FACE_OVAL.length
          const coneD = fW * 0.5
          posAttr.setXYZ(0, cx - zAxis.x * coneD, cy - zAxis.y * coneD, cz - zAxis.z * coneD)
          posAttr.needsUpdate = true
        }
      } else {
        if (this.glassesGroup) this.glassesGroup.visible = false
        if (this.occluderMesh) this.occluderMesh.visible = false
        this.smooth.ready = false
      }
    } catch (e) {
      console.warn('Prediction error:', e)
    }

    this.predictionInFlight = false
    this._schedulePrediction()
  }
}
