<script setup>
import { ref, computed } from 'vue'
import { GLASSES_STYLES, FRAME_COLORS, LENS_OPTIONS } from '../../core/constants.js'
import TryOnCanvas from './components/TryOnCanvas.vue'

const cameraReady = ref(false)
const loading = ref(false)
const engineRef = ref(null)
const videoRef = ref(null)

const style = ref('round')
const frameColor = ref('#1a1a1a')
const lensColor = ref('#1a2e1a')
const lensOpacity = ref(0.7)

const hasChanges = computed(() =>
  style.value !== 'round' ||
  frameColor.value !== '#1a1a1a' ||
  lensColor.value !== '#1a2e1a' ||
  lensOpacity.value !== 0.7
)

function onEngineReady(engine) {
  engineRef.value = engine
  engine.setStateChangeHandler((state) => {
    style.value = state.style
    frameColor.value = state.frameColor
    lensColor.value = state.lensColor
    lensOpacity.value = state.lensOpacity
  })
  setTimeout(() => engine.syncConfigToServer(), 1500)
}

async function handleStartCamera() {
  loading.value = true
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
    })
    if (videoRef.value) {
      videoRef.value.srcObject = stream
      await videoRef.value.play()
      cameraReady.value = true
    }
  } catch {
    alert('Erro ao acessar a câmera. Verifique as permissões.')
  }
  loading.value = false
}

function handleScreenshot() {
  const engine = engineRef.value
  const dataUrl = engine?.captureScreenshot()
  if (dataUrl) {
    const link = document.createElement('a')
    link.download = `provador-vue-${Date.now()}.png`
    link.href = dataUrl
    link.click()
    engine.syncScreenshot(null, null, dataUrl)
  }
}

function handleReset() {
  engineRef.value?.reset()
}
</script>

<template>
  <div class="app">
    <header class="header">
      <div class="logo">
        <span class="logo-icon">👓</span>
        <h1 class="title">Provador Virtual</h1>
      </div>
      <span class="badge">Vue.js</span>
    </header>

    <main class="main">
      <section class="viewer">
        <div v-if="!cameraReady" class="overlay">
          <div class="prompt">
            <span class="prompt-icon">📷</span>
            <h2>Ative sua câmera</h2>
            <p>Posicione seu rosto na frente da câmera para experimentar os óculos</p>
            <button
              class="btn btn-primary"
              :disabled="loading"
              @click="handleStartCamera"
            >
              {{ loading ? 'Carregando...' : 'Ativar Câmera' }}
            </button>
          </div>
        </div>
        <video
          ref="videoRef"
          class="video"
          autoplay
          playsinline
          muted
        />
        <TryOnCanvas
          v-if="cameraReady"
          :video-ref="videoRef"
          @engine-ready="onEngineReady"
        />
      </section>

      <aside class="sidebar">
        <div class="control-group">
          <h3 class="control-label">Modelo</h3>
          <div class="grid-2">
            <button
              v-for="s in GLASSES_STYLES"
              :key="s.id"
              :class="['option-btn', { active: style === s.id }]"
              @click="engineRef?.updateStyle(s.id)"
            >
              <span>{{ s.icon }}</span>
              <span>{{ s.label }}</span>
            </button>
          </div>
        </div>

        <div class="control-group">
          <h3 class="control-label">Armação</h3>
          <div class="color-grid">
            <button
              v-for="c in FRAME_COLORS"
              :key="c.value"
              :class="['color-btn', { active: frameColor === c.value }]"
              :style="{ background: c.value }"
              :title="c.label"
              @click="engineRef?.updateFrameColor(c.value)"
            />
          </div>
        </div>

        <div class="control-group">
          <h3 class="control-label">Lentes</h3>
          <div class="color-grid">
            <button
              v-for="l in LENS_OPTIONS"
              :key="l.color + l.opacity"
              :class="['color-btn', {
                active: lensColor === l.color && lensOpacity === l.opacity
              }]"
              :style="{
                background: l.color,
                border: l.opacity < 0.1 ? '2px solid #555' : '2px solid transparent',
              }"
              :title="l.label"
              @click="engineRef?.updateLens(l.color, l.opacity)"
            />
          </div>
        </div>

        <div class="actions">
          <button class="btn btn-secondary" @click="handleScreenshot">
            📸 Capturar
          </button>
          <button class="btn btn-outline" @click="handleReset">
            ↻ Resetar
          </button>
        </div>
      </aside>
    </main>
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
  background: #0f0f1a;
  color: #e8e8f0;
  overflow: hidden;
  height: 100vh;
}

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 24px;
  background: #1a1a2e;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo-icon {
  font-size: 28px;
}

.title {
  font-size: 20px;
  font-weight: 700;
  background: linear-gradient(135deg, #6C63FF, #a78bfa);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.badge {
  font-size: 11px;
  padding: 4px 12px;
  border-radius: 20px;
  background: rgba(108,99,255,0.2);
  color: #a78bfa;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.viewer {
  flex: 1;
  position: relative;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.video {
  position: absolute;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1);
  visibility: hidden;
}

.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15,15,26,0.85);
  z-index: 10;
}

.prompt {
  text-align: center;
  max-width: 360px;
  padding: 32px;
}

.prompt-icon {
  font-size: 64px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.6;
}

.prompt h2 {
  font-size: 22px;
  margin-bottom: 8px;
}

.prompt p {
  color: #8888aa;
  font-size: 14px;
  margin-bottom: 24px;
  line-height: 1.6;
}

.sidebar {
  width: 280px;
  background: #1a1a2e;
  padding: 16px;
  overflow-y: auto;
  border-left: 1px solid rgba(255,255,255,0.06);
  flex-shrink: 0;
}

.control-group {
  margin-bottom: 20px;
}

.control-label {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: #8888aa;
  margin-bottom: 10px;
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.option-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px;
  background: #25253e;
  border: 2px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  color: #8888aa;
  font-size: 11px;
  font-weight: 500;
  font-family: inherit;
  transition: all 0.2s;
}

.option-btn:hover {
  background: #2f2f4e;
  color: #e8e8f0;
}

.option-btn.active {
  border-color: #6C63FF;
  color: #e8e8f0;
  background: rgba(108,99,255,0.15);
}

.color-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.color-btn {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 3px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0;
}

.color-btn:hover {
  transform: scale(1.15);
}

.color-btn.active {
  border-color: #6C63FF;
  box-shadow: 0 0 0 2px #0f0f1a;
}

.actions {
  display: flex;
  gap: 8px;
  flex-direction: column;
}

.btn {
  padding: 10px 28px;
  border: none;
  border-radius: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  font-family: inherit;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s;
}

.btn-primary {
  background: #6C63FF;
  color: #fff;
}

.btn-primary:hover {
  background: #5A52D5;
  transform: translateY(-1px);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  background: #25253e;
  color: #e8e8f0;
  width: 100%;
}

.btn-secondary:hover {
  background: #35355e;
}

.btn-outline {
  background: transparent;
  color: #8888aa;
  border: 1px solid #25253e;
  width: 100%;
}

.btn-outline:hover {
  border-color: #6C63FF;
  color: #e8e8f0;
}
</style>
