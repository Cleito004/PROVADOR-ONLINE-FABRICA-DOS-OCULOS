import { test, expect } from '@playwright/test'

const BASE = 'http://localhost:8083'

test.describe('Provador Virtual - Frontend', () => {

  test('pagina carrega sem erros fatais de console', async ({ page }) => {
    const errors = []
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })
    page.on('pageerror', err => errors.push(err.message))

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#threejs-container')).toBeAttached({ timeout: 10000 })
    await expect(page.locator('#webcam')).toBeAttached()
    await expect(page.locator('#style-matrix')).toBeAttached()

    const fatal = errors.filter(e =>
      !e.includes('MediaPipe') && !e.includes('getUserMedia') &&
      !e.includes('camera') && !e.includes('NotFoundError') &&
      !e.includes('NotAllowedError') && !e.includes('NotReadableError')
    )
    expect(fatal).toEqual([])
  })

  test('matriz de estilos tem 3 opcoes', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const styles = page.locator('#style-matrix .style-item')
    const count = await styles.count()
    expect(count).toBe(3)

    const expectedStyles = ['square', 'aviator', 'cateye']
    for (let i = 0; i < count; i++) {
      const styleAttr = await styles.nth(i).getAttribute('data-style')
      expect(styleAttr).toBe(expectedStyles[i])
    }
  })

  test('primeiro estilo esta ativo por padrao', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const firstStyle = page.locator('#style-matrix .style-item').first()
    await expect(firstStyle).toHaveClass(/active/)
  })

  test('clique no estilo nao gera erro', async ({ page }) => {
    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const styles = page.locator('#style-matrix .style-item')
    const secondStyle = styles.nth(1)
    await secondStyle.click()

    await page.waitForTimeout(500)
    const jsErrors = errors.filter(e => !e.includes('camera') && !e.includes('MediaPipe'))
    expect(jsErrors).toEqual([])
  })

  test('sliders de ajuste existem e funcionam', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const distanceSlider = page.locator('#adj-distance')
    const heightSlider = page.locator('#adj-height')

    await expect(distanceSlider).toBeAttached()
    await expect(heightSlider).toBeAttached()

    const distValue = await distanceSlider.inputValue()
    expect(Number(distValue)).toBe(-150)

    const heightValue = await heightSlider.inputValue()
    expect(Number(heightValue)).toBe(-10)
  })

  test('faixa de cores RGB existe', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#color-strip-container')).toBeAttached()
    await expect(page.locator('#color-strip')).toBeAttached()
    await expect(page.locator('#color-needle')).toBeAttached()
  })

  test('status de gesto de mao existe', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#hand-gesture-status')).toBeAttached()
  })

  test('video webcam existe', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    const video = page.locator('#webcam')
    await expect(video).toBeAttached()
    await expect(video).toHaveAttribute('autoplay')
    await expect(video).toHaveAttribute('playsinline')
  })

  test('overlay de escaneamento existe', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#scan-overlay')).toBeAttached()
    await expect(page.locator('#scan-progress-bar')).toBeAttached()
    await expect(page.locator('#scan-status')).toBeAttached()
  })

  test('overlay de loading existe', async ({ page }) => {
    await page.goto(BASE, { waitUntil: 'domcontentloaded' })

    await expect(page.locator('#loading-overlay')).toBeAttached()
    await expect(page.locator('#loading-text')).toBeAttached()
  })
})
