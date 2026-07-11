export const LM = {
  leftEyeOuter: 33,
  rightEyeOuter: 263,
  leftEyeInner: 133,
  rightEyeInner: 362,
  leftTemple: 127,
  rightTemple: 356,
  leftCheek: 234,
  rightCheek: 454,
  forehead: 10,
  chin: 175,
  noseBridge: 168,
  noseTip: 1,
  noseBottom: 2,
  midEye: 168,
  leftEyePupil: 143,
  rightEyePupil: 372,
}

export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
]

export const CFG = {
  refHeadWidth: 140,
  refFaceHeight: 210,
  glassesDepth: 0,
  glassesDown: 2,
  glassesCenterX: 0,
  glassesScale: 3.5,
}

export const STYLE_CONFIG = {
  round:   { scale: 300, depth: 3,  down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
  square:  { scale: 300, depth: 3,  down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
  aviator: { scale: 300, depth: 3,  down: 2,  centerX: 0, upOffset: 0.5,scaleFactor: 0.01, flipY: true  },
  cateye:  { scale: 300, depth: 3,  down: 2,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
  sport:   { scale: 300, depth: 3,  down: 3,  centerX: 0, upOffset: 0,  scaleFactor: 0.01, flipY: true  },
}

export const GLASSES_STYLES = [
  { id: 'round', label: 'Redondo', icon: '🔵' },
  { id: 'square', label: 'Quadrado', icon: '🔶' },
  { id: 'aviator', label: 'Aviador', icon: '🟣' },
  { id: 'cateye', label: 'Gatinho', icon: '🔺' },
  { id: 'sport', label: 'Esportivo', icon: '⚡' },
]

export const FRAME_COLORS = [
  { value: '#1a1a1a', label: 'Preto' },
  { value: '#8B4513', label: 'Marrom' },
  { value: '#C0A060', label: 'Dourado' },
  { value: '#C0C0C0', label: 'Prata' },
  { value: '#DC143C', label: 'Vermelho' },
  { value: '#4169E1', label: 'Azul' },
]

export const LENS_OPTIONS = [
  { color: '#222222', opacity: 0.7, label: 'Preto' },
  { color: '#2a1a2e', opacity: 0.6, label: 'Gradiente' },
  { color: '#1a1a2e', opacity: 0.5, label: 'Azul' },
  { color: '#8B4513', opacity: 0.4, label: 'Marrom' },
  { color: '#ffcc00', opacity: 0.3, label: 'Amarelo' },
  { color: '#ffffff', opacity: 0.05, label: 'Transparente' },
]
