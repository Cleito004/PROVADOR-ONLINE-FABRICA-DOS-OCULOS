import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

const MODEL_CACHE = {}
const MODELS = {
  round: 'core/assets/models/round.glb',
  square: 'core/assets/models/square.glb',
  aviator: 'core/assets/models/aviator.glb',
  cateye: 'core/assets/models/cateye.glb',
  sport: 'core/assets/models/sport.glb',
}

let LOADER = null
function getLoader() {
  if (!LOADER) LOADER = new GLTFLoader()
  return LOADER
}

export async function loadAllGlassesModels() {
  const loader = getLoader()
  const entries = Object.entries(MODELS)
  await Promise.all(entries.map(([key, url]) => {
    return new Promise((resolve, reject) => {
      loader.load(url, gltf => {
        MODEL_CACHE[key] = gltf.scene
        resolve()
      }, undefined, reject)
    })
  }))
}

export function getGlassesModel(style, frameColor, lensColor, lensOpacity) {
  const cached = MODEL_CACHE[style]
  if (!cached) return null

  const root = cached.clone(true)

  const frameMat = new THREE.MeshStandardMaterial({
    color: frameColor, metalness: 0.6, roughness: 0.3,
  })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  let lensCount = 0, frameCount = 0

  root.traverse(c => {
    if (!c.isMesh) return
    const originalMat = c.material
    const matName = (originalMat.name || '').toLowerCase()

    if (matName.includes('lens') || matName.includes('glass') || matName.includes('visor') || matName.includes('lente')) {
      c.material = lensMat.clone()
      lensCount++
    } else {
      c.material = frameMat.clone()
      frameCount++
    }
    c.material.needsUpdate = true
    c.renderOrder = 3
  })

  if (lensCount === 0 && frameCount > 0) {
    const meshes = []
    root.traverse(c => { if (c.isMesh) meshes.push(c) })

    if (meshes.length >= 2) {
      const sorted = meshes.map(m => {
        const box = new THREE.Box3().setFromObject(m)
        const size = box.max.clone().sub(box.min)
        return { mesh: m, volume: size.x * size.y * size.z, minDim: Math.min(size.x, size.y, size.z) }
      }).sort((a, b) => a.volume - b.volume)

      const smallest = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 2)))
      smallest.forEach(({ mesh }) => {
        mesh.material = lensMat.clone()
        mesh.material.needsUpdate = true
        lensCount++
      })
      sorted.filter(s => !smallest.includes(s)).forEach(({ mesh }) => {
        mesh.material = frameMat.clone()
        mesh.material.needsUpdate = true
      })
    } else {
      meshes.forEach(m => {
        m.material = frameMat.clone()
        m.material.needsUpdate = true
      })
    }
  }

  root.traverse(c => { if (c.isMesh) c.material.needsUpdate = true })

  return root
}

export function isModelReady(style) {
  return !!MODEL_CACHE[style]
}

export function getModelURL(style) {
  return MODELS[style] || MODELS.round
}
