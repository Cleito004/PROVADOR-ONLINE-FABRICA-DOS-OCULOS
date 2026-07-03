'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { GLASSES_STYLES, FRAME_COLORS, LENS_OPTIONS } from '../../core/constants.js'
import TryOnCanvas from '../components/TryOnCanvas'
import styles from '../styles/page.module.css'

export default function HomePage() {
  const [style, setStyle] = useState('round')
  const [frameColor, setFrameColor] = useState('#1a1a1a')
  const [lensColor, setLensColor] = useState('#1a2e1a')
  const [lensOpacity, setLensOpacity] = useState(0.7)
  const [isActive, setIsActive] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const engineRef = useRef(null)
  const videoRef = useRef(null)

  const handleEngineReady = useCallback((engine) => {
    engineRef.current = engine
    engine.setStateChangeHandler((state) => {
      setStyle(state.style)
      setFrameColor(state.frameColor)
      setLensColor(state.lensColor)
      setLensOpacity(state.lensOpacity)
      setIsActive(state.isActive)
    })
    setTimeout(() => engine.syncConfigToServer(), 1500)
  }, [])

  const handleStartCamera = useCallback(async () => {
    setLoading(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
      })
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
      }
    } catch {
      alert('Erro ao acessar a câmera. Verifique as permissões.')
    }
    setLoading(false)
  }, [])

  const handleScreenshot = useCallback(() => {
    const engine = engineRef.current
    const dataUrl = engine?.captureScreenshot()
    if (dataUrl) {
      const link = document.createElement('a')
      link.download = `provador-next-${Date.now()}.png`
      link.href = dataUrl
      link.click()
      engine.syncScreenshot(null, null, dataUrl)
    }
  }, [])

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.logo}>
          <span className={styles.logoIcon}>👓</span>
          <h1 className={styles.title}>Provador Virtual</h1>
        </div>
        <span className={styles.badge}>Next.js</span>
      </header>

      <main className={styles.main}>
        <section className={styles.viewer}>
          {!cameraReady && (
            <div className={styles.overlay}>
              <div className={styles.prompt}>
                <span className={styles.promptIcon}>📷</span>
                <h2>Ative sua câmera</h2>
                <p>Posicione seu rosto na frente da câmera para experimentar os óculos</p>
                <button
                  className={styles.btnPrimary}
                  onClick={handleStartCamera}
                  disabled={loading}
                >
                  {loading ? 'Carregando...' : 'Ativar Câmera'}
                </button>
              </div>
            </div>
          )}
          <video ref={videoRef} id="webcam" className={styles.video} autoPlay playsInline muted />
          <TryOnCanvas
            videoRef={videoRef}
            cameraReady={cameraReady}
            onEngineReady={handleEngineReady}
          />
        </section>

        <aside className={styles.sidebar}>
          <div className={styles.controlGroup}>
            <h3 className={styles.controlLabel}>Modelo</h3>
            <div className={styles.grid2}>
              {GLASSES_STYLES.map((s) => (
                <button
                  key={s.id}
                  className={`${styles.optionBtn} ${style === s.id ? styles.active : ''}`}
                  onClick={() => engineRef.current?.updateStyle(s.id)}
                >
                  <span>{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <h3 className={styles.controlLabel}>Armação</h3>
            <div className={styles.colorGrid}>
              {FRAME_COLORS.map((c) => (
                <button
                  key={c.value}
                  className={`${styles.colorBtn} ${frameColor === c.value ? styles.active : ''}`}
                  style={{ background: c.value }}
                  title={c.label}
                  onClick={() => engineRef.current?.updateFrameColor(c.value)}
                />
              ))}
            </div>
          </div>

          <div className={styles.controlGroup}>
            <h3 className={styles.controlLabel}>Lentes</h3>
            <div className={styles.colorGrid}>
              {LENS_OPTIONS.map((l) => (
                <button
                  key={l.color + l.opacity}
                  className={`${styles.colorBtn} ${lensColor === l.color && lensOpacity === l.opacity ? styles.active : ''}`}
                  style={{
                    background: l.color,
                    border: l.opacity < 0.1 ? '2px solid #555' : '2px solid transparent',
                  }}
                  title={l.label}
                  onClick={() => engineRef.current?.updateLens(l.color, l.opacity)}
                />
              ))}
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.btnSecondary} onClick={handleScreenshot}>
              📸 Capturar
            </button>
            <button className={styles.btnOutline} onClick={() => engineRef.current?.reset()}>
              ↻ Resetar
            </button>
          </div>
        </aside>
      </main>
    </div>
  )
}
