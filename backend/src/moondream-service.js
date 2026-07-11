import { vl } from 'moondream'

let model = null

export function initMoondream() {
  const apiKey = process.env.MOONDREAM_API_KEY
  if (!apiKey) {
    console.log('[Moondream] API key n\u00e3o configurada. Modo offline.')
    return false
  }
  model = new vl({ apiKey })
  console.log('[Moondream] Cliente inicializado!')
  return true
}

export async function query(imageBuffer, question) {
  if (!model) return null
  try {
    const r = await model.query({ image: imageBuffer, question })
    return r.answer
  } catch (e) {
    console.warn('[Moondream] query error:', e.message)
    return null
  }
}

export async function detect(imageBuffer, object) {
  if (!model) return null
  try {
    const r = await model.detect({ image: imageBuffer, object })
    return r.objects || []
  } catch (e) {
    console.warn('[Moondream] detect error:', e.message)
    return null
  }
}

export async function point(imageBuffer, object) {
  if (!model) return null
  try {
    const r = await model.point({ image: imageBuffer, object })
    return r.points || []
  } catch (e) {
    console.warn('[Moondream] point error:', e.message)
    return null
  }
}

export async function caption(imageBuffer, length = 'normal') {
  if (!model) return null
  try {
    const r = await model.caption({ image: imageBuffer, length })
    return r.caption
  } catch (e) {
    console.warn('[Moondream] caption error:', e.message)
    return null
  }
}

const FACE_SHAPE_STYLES = {
  round: { recommended: ['square', 'aviator', 'cateye'], avoid: ['round'] },
  oval: { recommended: ['square', 'aviator', 'round', 'cateye', 'sport'], avoid: [] },
  square: { recommended: ['round', 'cateye', 'aviator'], avoid: ['square'] },
  heart: { recommended: ['round', 'aviator', 'cateye'], avoid: ['square'] },
  diamond: { recommended: ['cateye', 'oval', 'aviator'], avoid: ['square'] },
  oblong: { recommended: ['round', 'cateye', 'square', 'aviator'], avoid: ['sport'] },
}

const STYLE_LABELS = {
  round: 'Redondo',
  square: 'Quadrado',
  aviator: 'Aviador',
  cateye: 'Gatinho',
  sport: 'Esportivo',
}

export async function analyzeFace(imageBuffer) {
  if (!model) return null
  try {
    const [faceAnswer, glassesDetect, centerPt, genderOpt, ageEst] = await Promise.all([
      model.query({
        image: imageBuffer,
        question: 'What is the face shape of the person in this image? Answer with only one word from: round, oval, square, heart, diamond, oblong. Do not explain, just the word.',
      }),
      model.detect({ image: imageBuffer, object: 'eyeglasses or eyeglass frame on a face' }),
      model.point({ image: imageBuffer, object: 'center of the face between the eyes' }),
      model.query({
        image: imageBuffer,
        question: 'What is the gender presentation of this person? Answer only with: masculine, feminine, or neutral.',
      }),
      model.query({
        image: imageBuffer,
        question: 'What is the approximate age of this person? Answer only with a number like: 25, 40, 60. If unsure guess from appearance.',
      }),
    ])

    const faceShape = (faceAnswer.answer || '').toLowerCase().trim()
    const validShapes = ['round', 'oval', 'square', 'heart', 'diamond', 'oblong']
    const shape = validShapes.includes(faceShape) ? faceShape : 'oval'

    const rec = FACE_SHAPE_STYLES[shape] || FACE_SHAPE_STYLES.oval
    const recommendations = rec.recommended.map(s => ({
      id: s,
      label: STYLE_LABELS[s] || s,
    }))
    const avoid = rec.avoid.map(s => STYLE_LABELS[s] || s)

    return {
      faceShape: shape,
      hasGlasses: glassesDetect.objects.length > 0,
      glassesCount: glassesDetect.objects.length,
      faceCenter: centerPt.points.length > 0 ? centerPt.points[0] : null,
      gender: (genderOpt.answer || '').toLowerCase().trim(),
      ageEstimate: parseInt(ageEst.answer) || null,
      recommendations,
      avoid,
    }
  } catch (e) {
    console.warn('[Moondream] Erro na an\u00e1lise facial:', e.message)
    return null
  }
}

export async function autoFit(imageBuffer) {
  const analysis = await analyzeFace(imageBuffer)
  if (!analysis) return null
  return {
    faceShape: analysis.faceShape,
    recommendations: analysis.recommendations,
    avoid: analysis.avoid,
    bestPick: analysis.recommendations.length > 0 ? analysis.recommendations[0].id : 'round',
    hasGlassesCurrently: analysis.hasGlasses,
  }
}

export async function analyzeGlassesFit(imageBuffer, style) {
  if (!model) return null
  try {
    const result = await model.query({
      image: imageBuffer,
      question: `A person is wearing virtual ${style || ''} eyeglasses in this image. Are the glasses positioned correctly over the eyes? Do they align naturally with the face? Answer YES or NO first, then explain why in 10 words or less.`,
    })
    const text = result.answer || ''
    const passed = text.toLowerCase().startsWith('yes')
    return { passed, analysis: text }
  } catch (e) {
    console.warn('[Moondream] Erro na an\u00e1lise de ajuste:', e.message)
    return null
  }
}

const PRESCRIPTION_PATTERNS = {
  sphere: /(?:sphere|sph|esf[eé]rico?)[:\s]*([+-]?\d+(?:\.\d+)?)/i,
  cylinder: /(?:cylinder|cyl|cilindro)[:\s]*([+-]?\d+(?:\.\d+)?)/i,
  axis: /(?:axis|eixo)[:\s]*(\d+(?:\.\d+)?)/i,
  add: /(?:add|adi[çc][ãa]o)[:\s]*([+]?\d+(?:\.\d+)?)/i,
  od: /(?:od|right|direito)[:\s]*([+-]?\d+(?:\.\d+)?)/i,
  os: /(?:os|left|esquerdo)[:\s]*([+-]?\d+(?:\.\d+)?)/i,
  pd: /(?:pd|dp|dist[âa]ncia\s+pupilar)[:\s]*(\d+(?:\.\d+)?)/i,
}

export async function prescriptionOCR(imageBuffer) {
  if (!model) return null
  try {
    const text = await caption(imageBuffer, 'long')
    if (!text) return null

    const prescription = {}
    for (const [key, pattern] of Object.entries(PRESCRIPTION_PATTERNS)) {
      const match = text.match(pattern)
      if (match) prescription[key] = match[1]
    }

    let structured = null
    if (prescription.sphere || prescription.cylinder) {
      structured = {
        od: { sphere: prescription.sphere || null, cylinder: prescription.cylinder || null, axis: prescription.axis || null },
        os: { sphere: prescription.os || prescription.sphere || null, cylinder: null, axis: null },
      }
    }

    return { rawText: text, extracted: prescription, structured, }
  } catch (e) {
    console.warn('[Moondream] Erro no OCR de receita:', e.message)
    return null
  }
}

export async function describeScene(imageBuffer) {
  if (!model) return null
  try {
    const desc = await caption(imageBuffer, 'short')
    return desc
  } catch (e) {
    console.warn('[Moondream] describe error:', e.message)
    return null
  }
}
