import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BASE = 'http://localhost:8083'
const OPENCV_API = 'http://localhost:5050'

const __dirname = dirname(fileURLToPath(import.meta.url))

test.describe('Provador Online - Site Atualizado', () => {

  test('pagina carrega sem erros de console', async ({ page }) => {
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', err => errors.push(err.message))

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#start-btn')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('#controls')).toBeAttached()
    await expect(page.locator('#glasses-list')).toBeAttached()
    await expect(page.locator('#color-list')).toBeAttached()
    await expect(page.locator('#lens-color-list')).toBeAttached()
    await expect(page.locator('#screenshot-btn')).toBeAttached()
    await expect(page.locator('#threejs-container')).toBeAttached()

    const fatal = errors.filter(e =>
      !e.includes('MediaPipe') && !e.includes('getUserMedia') &&
      !e.includes('camera') && !e.includes('NotFoundError')
    )
    expect(fatal).toEqual([])
  })

  test('controles da IA Moondream existem', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#moondream-panel')).toBeAttached()
    await expect(page.locator('#md-analyze-btn')).toBeAttached()
    await expect(page.locator('#md-autofit-btn')).toBeAttached()
    await expect(page.locator('#md-prescription-input')).toBeAttached()
  })

  test('troca de estilo funciona', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const styles = page.locator('#glasses-list .glasses-option')
    const count = await styles.count()
    expect(count).toBe(5)

    for (let i = 0; i < count; i++) {
      const btn = styles.nth(i)
      await btn.click()
      await expect(btn).toHaveClass(/active/)
    }
  })

  test('troca de cor funciona', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const colors = page.locator('#color-list .color-option')
    const count = await colors.count()
    expect(count).toBe(6)

    for (let i = 0; i < count; i++) {
      const btn = colors.nth(i)
      await btn.click()
      await expect(btn).toHaveClass(/active/)
    }
  })

  test('screenshot sem erros', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const btn = page.locator('#screenshot-btn')
    await expect(btn).toBeEnabled()
  })
})

test.describe('OpenCV Integration', () => {

  test('painel OpenCV existe e conecta ao backend', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#opencv-panel')).toBeAttached()
    await expect(page.locator('#opencv-status')).toBeAttached()
    await expect(page.locator('#opencv-analyze-btn')).toBeAttached()
    await expect(page.locator('#opencv-auto-btn')).toBeAttached()

    await expect(page.locator('#opencv-status')).toHaveClass(/online/, { timeout: 10000 })
    const statusText = await page.locator('#opencv-status').textContent()
    expect(statusText).toContain('Backend online')
    expect(statusText).toContain('OpenCV')
  })

  test('botoes OpenCV ficam habilitados apos conexao', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#opencv-analyze-btn')).toBeEnabled({ timeout: 10000 })
    await expect(page.locator('#opencv-auto-btn')).toBeEnabled({ timeout: 10000 })
  })

  test('botao Analisar com OpenCV pede camera quando clicado sem camera', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#opencv-analyze-btn')).toBeEnabled({ timeout: 10000 })

    await page.locator('#opencv-analyze-btn').click()

    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 })
    const toastText = await page.locator('#toast').textContent()
    expect(toastText).toContain('câmera')
  })

  test('botao Auto Ajuste OpenCV pede camera quando clicado sem camera', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#opencv-auto-btn')).toBeEnabled({ timeout: 10000 })

    await page.locator('#opencv-auto-btn').click()

    await expect(page.locator('#toast')).toBeVisible({ timeout: 5000 })
    const toastText = await page.locator('#toast').textContent()
    expect(toastText).toContain('câmera')
  })

  test('campos de resultado OpenCV existem', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#opencv-results')).toBeAttached()
    await expect(page.locator('#ocv-detector')).toBeAttached()
    await expect(page.locator('#ocv-faces')).toBeAttached()
    await expect(page.locator('#ocv-shape')).toBeAttached()
    await expect(page.locator('#ocv-lighting')).toBeAttached()
    await expect(page.locator('#ocv-best-style')).toBeAttached()
    await expect(page.locator('#ocv-recommendations')).toBeAttached()
  })

  test('OpenCV backend health check responde corretamente', async ({ request }) => {
    const response = await request.get(`${OPENCV_API}/api/health`)
    expect(response.ok()).toBeTruthy()

    const data = await response.json()
    expect(data.status).toBe('ok')
    expect(data.dnn_loaded).toBeTruthy()
    expect(data.opencv_version).toBeTruthy()
    expect(data.service).toContain('OpenCV')
  })

  test('OpenCV analyze detecta rosto em imagem de canvas', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const result = await page.evaluate(async () => {
      const canvas = document.createElement('canvas')
      canvas.width = 640
      canvas.height = 480
      const ctx = canvas.getContext('2d')

      ctx.fillStyle = '#87CEEB'
      ctx.fillRect(0, 0, 640, 480)

      ctx.fillStyle = '#2a1a0e'
      ctx.beginPath()
      ctx.ellipse(320, 160, 110, 90, 0, Math.PI, Math.PI * 2)
      ctx.fill()

      const skinGrad = ctx.createRadialGradient(320, 230, 10, 320, 240, 120)
      skinGrad.addColorStop(0, '#f0c8a0')
      skinGrad.addColorStop(1, '#d4a574')
      ctx.fillStyle = skinGrad
      ctx.beginPath()
      ctx.ellipse(320, 240, 90, 110, 0, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.ellipse(280, 215, 18, 12, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(360, 215, 18, 12, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#4a3520'
      ctx.beginPath()
      ctx.ellipse(282, 215, 8, 8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.beginPath()
      ctx.ellipse(358, 215, 8, 8, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#c05050'
      ctx.beginPath()
      ctx.ellipse(320, 290, 25, 10, 0, 0, Math.PI)
      ctx.fill()

      const dataUrl = canvas.toDataURL('image/png')

      const res = await fetch('http://localhost:5050/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl })
      })
      return await res.json()
    })

    expect(result.success).toBeTruthy()
    expect(result.faces).toBeTruthy()
    expect(result.lighting).toBeTruthy()
    expect(result.recommendations).toBeTruthy()
    expect(Array.isArray(result.faces.faces)).toBeTruthy()
  })

  test('OpenCV analyze rejeita request sem imagem', async ({ request }) => {
    const response = await request.post(`${OPENCV_API}/api/analyze`, {
      data: {}
    })
    expect(response.status()).toBe(400)
  })
})
