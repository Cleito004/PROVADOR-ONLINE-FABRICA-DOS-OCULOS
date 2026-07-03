import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision'

const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task'

if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class {
    constructor(data, width, height) {
      this.data = data
      this.width = width
      this.height = height
    }
  }
}

let faceLandmarker = null

export async function initFaceProcessor() {
  const fileset = await FilesetResolver.forVisionTasks(
    'node_modules/@mediapipe/tasks-vision/wasm'
  )
  faceLandmarker = await FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
    runningMode: 'IMAGE',
    numFaces: 1,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  })
  console.log('[FaceProcessor] Modelo carregado')
}

export function detectFace(imageData, width, height) {
  if (!faceLandmarker) return null
  try {
    const input = new ImageData(imageData, width, height)
    const result = faceLandmarker.detect(input)
    if (result.faceLandmarks?.length > 0) {
      return result.faceLandmarks[0].map(l => ({ x: l.x, y: l.y, z: l.z }))
    }
    return null
  } catch (e) {
    console.error('[FaceProcessor]', e.message)
    return null
  }
}

const IDX = {
  lEyeI: 133, lEyeO: 33, rEyeI: 362, rEyeO: 263,
  nBridge: 168, nTip: 1,
  lTemple: 127, rTemple: 356,
  lCheek: 234, rCheek: 454,
  forehead: 10, chin: 175,
}

function v3(x, y, z) {
  return {
    x, y, z,
    add(o) { return v3(this.x + o.x, this.y + o.y, this.z + o.z) },
    sub(o) { return v3(this.x - o.x, this.y - o.y, this.z - o.z) },
    scale(s) { return v3(this.x * s, this.y * s, this.z * s) },
    dot(o) { return this.x * o.x + this.y * o.y + this.z * o.z },
    len() { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z) },
    norm() { const l = this.len(); return l ? this.scale(1 / l) : v3(0, 0, 0) },
    cross(o) { return v3(this.y * o.z - this.z * o.y, this.z * o.x - this.x * o.z, this.x * o.y - this.y * o.x) },
    neg() { return v3(-this.x, -this.y, -this.z) },
    clone() { return v3(this.x, this.y, this.z) },
  }
}

function toV(pts, i) {
  return v3(-pts[i][0], -pts[i][1], -pts[i][2])
}

function mid(a, b) {
  return v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2)
}

export function calcGlassesPose(landmarks, imgW, imgH) {
  const pts = landmarks.map(l => [l.x * imgW, l.y * imgH, l.z * imgW])

  const lEye = mid(toV(pts, IDX.lEyeI), toV(pts, IDX.lEyeO))
  const rEye = mid(toV(pts, IDX.rEyeI), toV(pts, IDX.rEyeO))
  const eMid = mid(lEye, rEye)
  const nose = toV(pts, IDX.nBridge)
  const nTip = toV(pts, IDX.nTip)
  const fHead = toV(pts, IDX.forehead)
  const chin = toV(pts, IDX.chin)
  const lTmp = toV(pts, IDX.lTemple)
  const rTmp = toV(pts, IDX.rTemple)
  const lChk = toV(pts, IDX.lCheek)
  const rChk = toV(pts, IDX.rCheek)

  const eyeDist = lEye.sub(rEye).len()
  const faceW = Math.max(eyeDist, lTmp.sub(rTmp).len(), lChk.sub(rChk).len())
  const faceH = fHead.sub(chin).len()

  const xAxis = rEye.sub(lEye).norm()
  const yRaw = fHead.sub(chin).norm()
  let zAxis = xAxis.cross(yRaw).norm()
  if (zAxis.z < 0) zAxis = zAxis.neg()
  const yAxis = zAxis.cross(xAxis).norm()

  const depthAdj = Math.min(nTip.sub(nose).len() * 0.1, 6)

  const pos = eMid
    .add(xAxis.scale(0))
    .add(yAxis.scale(2))
    .add(zAxis.scale(8 + depthAdj))

  const scale = faceW / 140 * 0.7 + faceH / 210 * 0.3

  return {
    position: pos,
    rotation: { x: Math.atan2(yAxis.z, zAxis.z), y: Math.atan2(-xAxis.z, Math.sqrt(xAxis.x ** 2 + xAxis.y ** 2)), z: Math.atan2(xAxis.y, xAxis.x) },
    scale: scale * 1.2,
    eyeMid: eMid,
    faceLandmarks: pts,
  }
}
