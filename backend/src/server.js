import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { v4 as uuidv4 } from 'uuid'
import jpeg from 'jpeg-js'
import 'dotenv/config'
import { initFaceProcessor, detectFace, calcGlassesPose } from './face-processor.js'
import { initSupabase, saveSession, saveScreenshot, getRealtimeChannel } from './supabase.js'
import { initMoondream, analyzeFace, analyzeGlassesFit, autoFit, prescriptionOCR } from './moondream-service.js'

const PORT = process.env.WS_PORT || 8080

const clients = new Map()

function broadcast(msg, excludeId) {
  const data = JSON.stringify(msg)
  for (const [id, ws] of clients) {
    if (id !== excludeId && ws.readyState === 1) {
      ws.send(data)
    }
  }
}

async function handleMessage(clientId, ws, raw) {
  let msg
  try {
    msg = JSON.parse(raw.toString())
  } catch {
    ws.send(JSON.stringify({ type: 'error', message: 'Formato inválido' }))
    return
  }

  switch (msg.type) {

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', ts: Date.now() }))
      break

    case 'frame': {
      const { imageData, width, height } = msg
      if (!imageData || !width || !height) {
        ws.send(JSON.stringify({ type: 'error', message: 'frame: dados inválidos' }))
        return
      }

      let pixels, fw, fh
      try {
        const buf = Buffer.from(imageData, 'base64')
        const raw = jpeg.decode(buf, { useTArray: true })
        pixels = raw.data
        fw = raw.width
        fh = raw.height
      } catch {
        ws.send(JSON.stringify({ type: 'error', message: 'frame: falha ao decodificar JPEG' }))
        return
      }
      const rgba = new Uint8ClampedArray(fw * fh * 4)
      for (let i = 0; i < fw * fh; i++) {
        rgba[i * 4] = pixels[i * 3]
        rgba[i * 4 + 1] = pixels[i * 3 + 1]
        rgba[i * 4 + 2] = pixels[i * 3 + 2]
        rgba[i * 4 + 3] = 255
      }
      const landmarks = detectFace(rgba, fw, fh)

      if (landmarks) {
        const pose = calcGlassesPose(landmarks, fw, fh)
        ws.send(JSON.stringify({
          type: 'face-detected',
          clientId,
          pose,
          ts: Date.now(),
        }))

        broadcast({
          type: 'face-broadcast',
          clientId,
          pose: { position: pose.position, rotation: pose.rotation, scale: pose.scale },
          ts: Date.now(),
        }, clientId)
      } else {
        ws.send(JSON.stringify({
          type: 'face-lost',
          clientId,
          ts: Date.now(),
        }))
      }
      break
    }

    case 'frame-processed': {
      const { imageData, width, height, landmarks: clientLandmarks } = msg
      if (!clientLandmarks) {
        ws.send(JSON.stringify({ type: 'error', message: 'frame-processed: landmarks inválidos' }))
        return
      }

      const pose = calcGlassesPose(clientLandmarks, width, height)
      ws.send(JSON.stringify({
        type: 'processing-result',
        clientId,
        pose,
        ts: Date.now(),
      }))
      break
    }

    case 'config-update': {
      const { sessionId, userId, glassesConfig } = msg
      const sid = sessionId || uuidv4()
      if (userId && glassesConfig) {
        await saveSession(sid, userId, glassesConfig).catch(() => {})
      }
      broadcast({ type: 'config-synced', sessionId: sid, userId, glassesConfig, clientId }, clientId)
      ws.send(JSON.stringify({ type: 'config-ack', sessionId: sid }))
      break
    }

    case 'screenshot': {
      const { userId, sessionId, imageUrl, glassesStyle } = msg
      if (userId && imageUrl) {
        await saveScreenshot(userId, sessionId, imageUrl).catch(() => {})
      }
      broadcast({ type: 'screenshot-saved', userId, sessionId, clientId }, clientId)
      const buf = Buffer.from(imageUrl.split(',')[1] || imageUrl, 'base64')
      analyzeFace(buf).then(facial => {
        if (facial) {
          ws.send(JSON.stringify({ type: 'face-analysis', clientId, ...facial }))
        }
      })
      analyzeGlassesFit(buf, glassesStyle).then(fit => {
        if (fit) {
          ws.send(JSON.stringify({ type: 'glasses-fit-analysis', clientId, ...fit }))
        }
      })
      break
    }

    case 'analyze-face': {
      const { imageData, glassesStyle } = msg
      if (!imageData) {
        ws.send(JSON.stringify({ type: 'error', message: 'analyze-face: imageData obrigatório' }))
        return
      }
      const buf = Buffer.from(imageData, 'base64')
      analyzeFace(buf).then(facial => {
        if (facial) ws.send(JSON.stringify({ type: 'face-analysis', clientId, ...facial }))
        else ws.send(JSON.stringify({ type: 'face-analysis', clientId, error: 'Falha ao analisar' }))
      })
      if (glassesStyle) {
        analyzeGlassesFit(buf, glassesStyle).then(fit => {
          if (fit) ws.send(JSON.stringify({ type: 'glasses-fit-analysis', clientId, ...fit }))
        })
      }
      break
    }

    case 'auto-fit': {
      const { imageData } = msg
      if (!imageData) {
        ws.send(JSON.stringify({ type: 'error', message: 'auto-fit: imageData obrigatório' }))
        return
      }
      const buf2 = Buffer.from(imageData, 'base64')
      autoFit(buf2).then(result => {
        if (result) ws.send(JSON.stringify({ type: 'auto-fit-result', clientId, ...result }))
        else ws.send(JSON.stringify({ type: 'auto-fit-result', clientId, error: 'Falha ao analisar' }))
      })
      break
    }

    case 'prescription-ocr': {
      const { imageData } = msg
      if (!imageData) {
        ws.send(JSON.stringify({ type: 'error', message: 'prescription-ocr: imageData obrigatório' }))
        return
      }
      const buf3 = Buffer.from(imageData, 'base64')
      prescriptionOCR(buf3).then(result => {
        if (result) ws.send(JSON.stringify({ type: 'prescription-ocr-result', clientId, ...result }))
        else ws.send(JSON.stringify({ type: 'prescription-ocr-result', clientId, error: 'Falha ao ler receita' }))
      })
      break
    }

    default:
      ws.send(JSON.stringify({ type: 'error', message: `Tipo desconhecido: ${msg.type}` }))
  }
}

async function main() {
  console.log('[Server] Inicializando...')
  initSupabase()
  initMoondream()

  console.log('[Server] Carregando modelo MediaPipe...')
  try {
    await initFaceProcessor()
    console.log('[Server] Modelo MediaPipe pronto!')
  } catch (e) {
    console.error('[Server] Falha ao carregar MediaPipe:', e.message)
    console.log('[Server] Continuando sem processamento facial no servidor...')
  }

  const httpServer = createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ status: 'ok', clients: clients.size, uptime: process.uptime() }))
      return
    }
    res.writeHead(426, { 'Content-Type': 'text/plain' })
    res.end('Use WebSocket para conectar')
  })

  const wss = new WebSocketServer({ server: httpServer })

  wss.on('connection', (ws) => {
    const clientId = uuidv4()
    clients.set(clientId, ws)
    console.log(`[Server] Cliente conectado: ${clientId} (total: ${clients.size})`)

    ws.send(JSON.stringify({
      type: 'connected',
      clientId,
      ts: Date.now(),
    }))

    ws.on('message', (raw) => {
      handleMessage(clientId, ws, raw)
    })

    ws.on('close', () => {
      clients.delete(clientId)
      console.log(`[Server] Cliente desconectado: ${clientId} (total: ${clients.size})`)
      broadcast({ type: 'peer-disconnected', clientId })
    })

    ws.on('error', (err) => {
      console.error(`[Server] Erro no cliente ${clientId}:`, err.message)
      clients.delete(clientId)
    })
  })

  httpServer.listen(PORT, () => {
    console.log(`[Server] WebSocket rodando em ws://localhost:${PORT}`)
    console.log(`[Server] Health check: http://localhost:${PORT}/health`)
  })
}

main().catch(console.error)
