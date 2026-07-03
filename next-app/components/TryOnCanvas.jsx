'use client'

import { useRef, useEffect, useCallback } from 'react'
import { TryOnEngine } from '../../core/engine.js'

export default function TryOnCanvas({ videoRef, cameraReady, onEngineReady }) {
  const containerRef = useRef(null)
  const engineRef = useRef(null)
  const frameIntervalRef = useRef(null)
  const offscreenRef = useRef(null)

  const startFrameSender = useCallback((engine) => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    offscreenRef.current = canvas

    const send = () => {
      if (!videoRef.current || videoRef.current.readyState < 2) return
      const ctx = canvas.getContext('2d')
      ctx.drawImage(videoRef.current, 0, 0, 320, 240)
      engine.sendFrameToServer(canvas)
    }

    send()
    frameIntervalRef.current = setInterval(send, 300)
  }, [videoRef])

  const initEngine = useCallback(async () => {
    if (!containerRef.current || !videoRef.current) return

    const engine = new TryOnEngine()
    engineRef.current = engine
    onEngineReady(engine)

    await engine.initScene(videoRef.current, containerRef.current)
    await engine.initMediaPipe()

    engine.connectWebSocket()
    startFrameSender(engine)

    engine.startTracking()
  }, [videoRef, onEngineReady, startFrameSender])

  useEffect(() => {
    if (cameraReady && containerRef.current) {
      initEngine()
    }
    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current)
      engineRef.current?.dispose()
    }
  }, [cameraReady, initEngine])

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 2,
      }}
    />
  )
}
