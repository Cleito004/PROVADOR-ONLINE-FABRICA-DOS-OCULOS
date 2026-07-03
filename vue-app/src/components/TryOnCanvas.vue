<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { TryOnEngine } from '../../../core/engine.js'

const props = defineProps({
  videoRef: { type: Object, required: true },
})

const emit = defineEmits(['engine-ready'])

const containerRef = ref(null)
let engine = null
let frameInterval = null
let offscreen = null

function startFrameSender() {
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 240
  offscreen = canvas

  const send = () => {
    if (!props.videoRef || props.videoRef.readyState < 2) return
    const ctx = canvas.getContext('2d')
    ctx.drawImage(props.videoRef, 0, 0, 320, 240)
    engine?.sendFrameToServer(canvas)
  }

  send()
  frameInterval = setInterval(send, 300)
}

async function initEngine() {
  if (!containerRef.value || !props.videoRef) return

  engine = new TryOnEngine()
  emit('engine-ready', engine)

  await engine.initScene(props.videoRef, containerRef.value)
  await engine.initMediaPipe()

  engine.connectWebSocket()
  startFrameSender()

  engine.startTracking()
}

onMounted(() => {
  initEngine()
})

onUnmounted(() => {
  if (frameInterval) clearInterval(frameInterval)
  engine?.dispose()
})

watch(() => props.videoRef, () => {
  if (props.videoRef) initEngine()
})
</script>

<template>
  <div
    ref="containerRef"
    class="tryon-container"
  />
</template>

<style scoped>
.tryon-container {
  position: absolute;
  inset: 0;
  z-index: 2;
}
</style>
