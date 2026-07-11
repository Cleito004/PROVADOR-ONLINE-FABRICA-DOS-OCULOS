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

const REF_MODEL_WIDTH = 50

export async function loadAllGlassesModels() {
  const loader = getLoader()
  const entries = Object.entries(MODELS)
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
        let normFactor = 1
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
          normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1
        } else {
          const box = new THREE.Box3().setFromObject(scene)
          const size = new THREE.Vector3()
          box.getSize(size)
          const maxDim = Math.max(size.x, size.y, size.z)
          normFactor = maxDim > 0 ? REF_MODEL_WIDTH / maxDim : 1
        }
        MODEL_CACHE[key] = { scene, normFactor }
        resolve()
      }, undefined, reject)
    })
  }))
}

export function getGlassesModel(style, frameColor, lensColor, lensOpacity) {
  const cached = MODEL_CACHE[style]
  if (!cached) return null

  const root = cached.scene.clone(true)
  const normFactor = cached.normFactor || 1

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
    c.frustumCulled = false
    const meshName = (c.name || '').toLowerCase()
    const originalMat = c.material
    const matName = (originalMat.name || '').toLowerCase()
    const transParent = originalMat.transparent || originalMat.alphaMode === 'BLEND' || (typeof originalMat.opacity === 'number' && originalMat.opacity < 0.99)

    let isLens = false
    if (meshName.includes('temple') || meshName.includes('arm') || meshName.includes('hastes') || meshName.includes('braço')) {
      isLens = false
    } else if (matName.includes('lens') || matName.includes('lente') || matName.includes('vidro') || matName.includes('crystal')) {
      isLens = true
    } else if ((matName.includes('glass') || matName.includes('visor')) && transParent) {
      isLens = true
    } else if (transParent) {
      isLens = true
    } else {
      isLens = false
    }

    if (isLens) {
      c.material = lensMat.clone()
      lensCount++
    } else {
      c.material = frameMat.clone()
      frameCount++
    }
    c.material.needsUpdate = true
  })

  if (lensCount === 0 && frameCount > 0) {
    const meshes = []
    root.traverse(c => { if (c.isMesh) meshes.push(c) })

    if (meshes.length >= 2) {
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
          mesh.material = lensMat.clone()
          mesh.material.needsUpdate = true
          mesh.frustumCulled = false
          lensCount++
        })
        sorted.slice(nLens).forEach(({ mesh }) => {
          mesh.material = frameMat.clone()
          mesh.material.needsUpdate = true
          mesh.frustumCulled = false
        })
      }
    }

    if (lensCount === 0) {
      root.traverse(c => {
        if (c.isMesh) {
          c.material = frameMat.clone()
          c.material.needsUpdate = true
          c.frustumCulled = false
          frameCount++
        }
      })
    }
  }

  root.traverse(c => { if (c.isMesh) { c.material.needsUpdate = true; c.renderOrder = 1; c.depthTest = true } })

  // ── Temple arms ────────────────────────────────────────────────
  const tmpBox = new THREE.Box3().setFromObject(root)
  const tmpSize = new THREE.Vector3()
  tmpBox.getSize(tmpSize)
  const halfW = tmpSize.x / 2
  const templeLen = tmpSize.x * 0.7
  const templeW = 3
  const templeH = 8

  function makeTemple(side) {
    const geo = new THREE.BoxGeometry(templeW, templeH, templeLen)
    const mat = new THREE.MeshStandardMaterial({
      color: frameColor,
      metalness: 0.3,
      roughness: 0.6,
      side: THREE.DoubleSide,
    })
    const mesh = new THREE.Mesh(geo, mat)
    const xPos = side === 'left' ? -halfW - templeW / 2 : halfW + templeW / 2
    mesh.position.set(xPos, -2, -templeLen / 2 - 2)
    mesh.renderOrder = 1
    mesh.depthTest = true
    mesh.frustumCulled = false
    return mesh
  }

  root.add(makeTemple('left'))
  root.add(makeTemple('right'))

  const normGroup = new THREE.Group()
  normGroup.frustumCulled = false
  normGroup.renderOrder = 1
  normGroup.scale.set(normFactor, normFactor, normFactor)
  normGroup.add(root)

  const wrapper = new THREE.Group()
  wrapper.frustumCulled = false
  wrapper.renderOrder = 1
  wrapper.add(normGroup)
  return wrapper
}

export function isModelReady(style) {
  return !!MODEL_CACHE[style]
}

export function getModelURL(style) {
  return MODELS[style] || MODELS.round
}
