import * as THREE from 'three'

export function buildRoundGlasses(color, lensColor, lensOpacity) {
  const g = new THREE.Group()
  const frameMat = new THREE.MeshStandardMaterial({ color, metalness: 0.7, roughness: 0.3 })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  const lw = 48, lh = 40, gap = 16, cx = gap / 2 + lw / 2

  ;[-cx, cx].forEach(x => {
    const shape = new THREE.Shape()
    const r = lw / 2 * 0.9
    shape.absellipse(0, 0, r, lh / 2 * 0.9, 0, Math.PI * 2, false, 0)
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), lensMat)
    lens.position.set(x, 0, 0.3)
    g.add(lens)

    const pts = []
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * lh / 2 * 0.9, 0))
    }
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.8, 6, true),
      frameMat
    )
    rim.position.set(x, 0, 0)
    g.add(rim)
  })

  _addBridge(g, cx, lw, lh, frameMat)
  _addTemples(g, cx, lw, lh, frameMat, 0.15)

  g.traverse(c => { if (c.isMesh) c.renderOrder = 3 })
  return g
}

export function buildSquareGlasses(color, lensColor, lensOpacity) {
  const g = new THREE.Group()
  const frameMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.3 })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  const lw = 48, lh = 36, gap = 16, cx = gap / 2 + lw / 2

  ;[-cx, cx].forEach(x => {
    const shape = _makeRoundedRect(lw, lh, 6)
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), lensMat)
    lens.position.set(x, 0, 0.3)
    g.add(lens)

    const pts = _roundedRectPoints(lw, lh, 6)
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 40, 0.8, 6, true),
      frameMat
    )
    rim.position.set(x, 0, 0)
    g.add(rim)
  })

  _addBridge(g, cx, lw, lh, frameMat)
  _addTemples(g, cx, lw, lh, frameMat, 0.1)

  g.traverse(c => { if (c.isMesh) c.renderOrder = 3 })
  return g
}

export function buildAviatorGlasses(color, lensColor, lensOpacity) {
  const g = new THREE.Group()
  const frameMat = new THREE.MeshStandardMaterial({ color, metalness: 0.8, roughness: 0.2 })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  const lw = 50, lh = 38, gap = 14, cx = gap / 2 + lw / 2

  ;[-cx, cx].forEach(x => {
    const shape = _aviatorShape(lw, lh)
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), lensMat)
    lens.position.set(x, 0, 0.3)
    g.add(lens)

    const pts = _aviatorOutline(lw, lh)
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.7, 6, true),
      frameMat
    )
    rim.position.set(x, 0, 0)
    g.add(rim)
  })

  _addBridge(g, cx, lw, lh, frameMat, 0.35)
  _addTemples(g, cx, lw, lh, frameMat, 0.25)

  g.traverse(c => { if (c.isMesh) c.renderOrder = 3 })
  return g
}

export function buildCateyeGlasses(color, lensColor, lensOpacity) {
  const g = new THREE.Group()
  const frameMat = new THREE.MeshStandardMaterial({ color, metalness: 0.6, roughness: 0.25 })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  const lw = 48, lh = 34, gap = 16, cx = gap / 2 + lw / 2

  ;[-cx, cx].forEach(x => {
    const shape = _cateyeShape(lw, lh)
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), lensMat)
    lens.position.set(x, 0, 0.3)
    g.add(lens)

    const pts = _cateyeOutline(lw, lh)
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.7, 6, true),
      frameMat
    )
    rim.position.set(x, 0, 0)
    g.add(rim)
  })

  _addBridge(g, cx, lw, lh, frameMat, -0.1)
  _addTemples(g, cx, lw, lh, frameMat, 0.1)

  g.traverse(c => { if (c.isMesh) c.renderOrder = 3 })
  return g
}

export function buildSportGlasses(color, lensColor, lensOpacity) {
  const g = new THREE.Group()
  const frameMat = new THREE.MeshPhysicalMaterial({ color, metalness: 0.3, roughness: 0.6 })
  const lensMat = new THREE.MeshPhysicalMaterial({
    color: lensColor, transparent: true, opacity: lensOpacity,
    metalness: 0.05, roughness: 0.02, side: THREE.DoubleSide, depthWrite: false,
  })

  const lw = 54, lh = 32, gap = 12, cx = gap / 2 + lw / 2

  ;[-cx, cx].forEach(x => {
    const shape = _sportShape(lw, lh)
    const lens = new THREE.Mesh(new THREE.ShapeGeometry(shape, 32), lensMat)
    lens.position.set(x, 0, 0.3)
    g.add(lens)

    const pts = _sportOutline(lw, lh)
    const rim = new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 1.0, 6, true),
      frameMat
    )
    rim.position.set(x, 0, 0)
    g.add(rim)
  })

  ;[-1, 1].forEach(s => {
    const pivot = new THREE.Group()
    const hx = s * (cx + lw * 0.45)
    const aCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -30),
      new THREE.Vector3(0, 0, -58),
    ])
    pivot.add(new THREE.Mesh(new THREE.TubeGeometry(aCurve, 20, 1.2, 6, false), frameMat))
    pivot.position.set(hx, 0, 0)
    pivot.rotation.y = s * 0.1
    g.add(pivot)
  })

  g.traverse(c => { if (c.isMesh) c.renderOrder = 3 })
  return g
}

export const glassesBuilders = {
  round: buildRoundGlasses,
  square: buildSquareGlasses,
  aviator: buildAviatorGlasses,
  cateye: buildCateyeGlasses,
  sport: buildSportGlasses,
}

function _addBridge(g, cx, lw, lh, mat, yOff = 0.05) {
  const pts = [
    new THREE.Vector3(-cx + lw * 0.3, lh * 0.1 + yOff * lh, 0.5),
    new THREE.Vector3(0, lh * 0.18 + yOff * lh * 0.5, 1),
    new THREE.Vector3(cx - lw * 0.3, lh * 0.1 + yOff * lh, 0.5),
  ]
  g.add(new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.8, 6, false), mat
  ))
}

function _addTemples(g, cx, lw, lh, mat, yOff) {
  ;[-1, 1].forEach(s => {
    const pivot = new THREE.Group()
    const hx = s * (cx + lw * 0.38)
    const aCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, -28),
      new THREE.Vector3(0, 0, -55),
    ])
    pivot.add(new THREE.Mesh(new THREE.TubeGeometry(aCurve, 24, 0.9, 6, false), mat))
    pivot.position.set(hx, lh * yOff, 0)
    pivot.rotation.y = s * 0.08
    g.add(pivot)
  })
}

function _makeRoundedRect(w, h, r) {
  const s = new THREE.Shape()
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2
  const cr = Math.min(r, w / 2, h / 2)
  s.moveTo(x0 + cr, y0)
  s.lineTo(x1 - cr, y0)
  s.quadraticCurveTo(x1, y0, x1, y0 + cr)
  s.lineTo(x1, y1 - cr)
  s.quadraticCurveTo(x1, y1, x1 - cr, y1)
  s.lineTo(x0 + cr, y1)
  s.quadraticCurveTo(x0, y1, x0, y1 - cr)
  s.lineTo(x0, y0 + cr)
  s.quadraticCurveTo(x0, y0, x0 + cr, y0)
  return s
}

function _roundedRectPoints(w, h, r) {
  const pts = []
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2
  const cr = Math.min(r, w / 2, h / 2)
  pts.push(new THREE.Vector3(x0 + cr, y0, 0))
  pts.push(new THREE.Vector3(x1 - cr, y0, 0))
  pts.push(new THREE.Vector3(x1, y0 + cr, 0))
  pts.push(new THREE.Vector3(x1, y1 - cr, 0))
  pts.push(new THREE.Vector3(x1 - cr, y1, 0))
  pts.push(new THREE.Vector3(x0 + cr, y1, 0))
  pts.push(new THREE.Vector3(x0, y1 - cr, 0))
  pts.push(new THREE.Vector3(x0, y0 + cr, 0))
  return pts
}

function _aviatorShape(lw, lh) {
  const s = new THREE.Shape()
  const hw = lw / 2, hh = lh / 2
  s.moveTo(-hw * 0.85, -hh)
  s.quadraticCurveTo(-hw, -hh * 0.2, 0, hh)
  s.quadraticCurveTo(hw, -hh * 0.2, hw * 0.85, -hh)
  return s
}

function _aviatorOutline(lw, lh) {
  const pts = [], hw = lw / 2, hh = lh / 2
  for (let i = 0; i <= 48; i++) {
    const t = i / 48, angle = t * Math.PI * 2
    const y = Math.sin(angle) * hh * 0.95
    let xv
    if (y < 0) {
      const p = -y / hh
      xv = (hw * 0.85 + p * (hw - hw * 0.85)) * Math.cos(angle)
    } else {
      xv = hw * (1 - (y / hh) * 0.15) * Math.cos(angle)
    }
    pts.push(new THREE.Vector3(xv, y, 0))
  }
  return pts
}

function _cateyeShape(lw, lh) {
  const s = new THREE.Shape()
  const hw = lw / 2, hh = lh / 2
  s.moveTo(-hw * 0.7, -hh * 0.8)
  s.quadraticCurveTo(-hw, -hh * 0.1, -hw * 0.85, hh * 0.7)
  s.quadraticCurveTo(-hw * 0.5, hh * 1.15, -hw * 0.3, hh * 1.0)
  s.quadraticCurveTo(0, hh * 0.6, hw * 0.3, hh * 1.0)
  s.quadraticCurveTo(hw * 0.5, hh * 1.15, hw * 0.85, hh * 0.7)
  s.quadraticCurveTo(hw, -hh * 0.1, hw * 0.7, -hh * 0.8)
  s.quadraticCurveTo(0, -hh * 0.9, -hw * 0.7, -hh * 0.8)
  return s
}

function _cateyeOutline(lw, lh) {
  const pts = [], hw = lw / 2, hh = lh / 2
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2 - Math.PI / 2
    const y = Math.sin(angle) * hh
    let xv
    if (y < 0) {
      xv = (hw * 0.7 + (-y / hh) * (hw - hw * 0.7)) * Math.cos(angle)
    } else {
      xv = hw * Math.cos(angle) * (1 + (y / hh) * 0.5)
    }
    pts.push(new THREE.Vector3(xv, y, 0))
  }
  return pts
}

function _sportShape(lw, lh) {
  const s = new THREE.Shape()
  const hw = lw / 2, hh = lh / 2
  s.moveTo(-hw * 0.95, -hh * 0.7)
  s.quadraticCurveTo(-hw * 1.1, 0, -hw * 0.9, hh * 0.8)
  s.quadraticCurveTo(-hw * 0.5, hh * 1.1, 0, hh * 0.6)
  s.quadraticCurveTo(hw * 0.5, hh * 1.1, hw * 0.9, hh * 0.8)
  s.quadraticCurveTo(hw * 1.1, 0, hw * 0.95, -hh * 0.7)
  s.quadraticCurveTo(0, -hh * 0.9, -hw * 0.95, -hh * 0.7)
  return s
}

function _sportOutline(lw, lh) {
  const pts = [], hw = lw / 2, hh = lh / 2
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI * 2, baseY = Math.sin(angle) * hh
    let xv
    if (baseY < 0) {
      xv = (hw * 0.95 - (-baseY / hh) * (hw * 0.15)) * Math.cos(angle)
    } else {
      xv = (hw * 0.9 + (baseY / hh) * (hw * 0.2)) * Math.cos(angle)
    }
    pts.push(new THREE.Vector3(xv, baseY, 0))
  }
  return pts
}
