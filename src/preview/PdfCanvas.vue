<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { PDFDocumentLoadingTask, PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import { ApiError } from '../api/client'
import { openPdf, PDF_CANVAS_MAX_PIXELS, PDF_PAGE_LIMIT } from './pdfRenderer'
import AppIcon from '../components/AppIcon.vue'

const props = defineProps<{ fileId: string; url: string; title: string }>()
const emit = defineEmits<{ ready: []; error: [error: ApiError] }>()
const canvas = ref<HTMLCanvasElement>()
const stage = ref<HTMLElement>()
const loading = ref(true)
const rendering = ref(false)
const pageNumber = ref(1)
const pages = ref(0)
const zoom = ref(1)
const error = ref('')
const visiblePages = computed(() => Math.min(pages.value, PDF_PAGE_LIMIT))
let documentTask: PDFDocumentLoadingTask | undefined
let documentProxy: PDFDocumentProxy | undefined
let pageProxy: PDFPageProxy | undefined
let renderTask: RenderTask | undefined
let documentGeneration = 0
let renderGeneration = 0
let disposed = false
let loadTimeout: ReturnType<typeof setTimeout> | undefined
let renderTimeout: ReturnType<typeof setTimeout> | undefined

function release() {
  clearTimeout(loadTimeout); clearTimeout(renderTimeout)
  renderGeneration++
  renderTask?.cancel()
  renderTask = undefined
  pageProxy?.cleanup()
  pageProxy = undefined
  if (documentTask) void documentTask.destroy().catch(() => {})
  documentTask = undefined
  documentProxy = undefined
  if (canvas.value) { canvas.value.width = 0; canvas.value.height = 0 }
}
function report(reason: unknown) {
  if (disposed) return
  const name = reason && typeof reason === 'object' && 'name' in reason ? reason.name : ''
  if (name === 'RenderingCancelledException') return
  error.value = name === 'PasswordException' ? '此 PDF 需要密码，请下载后使用本地应用打开。' : 'PDF 解析或绘制失败，请重试或下载原文件。'
  emit('error', new ApiError(error.value, 0))
}
async function renderPage() {
  if (!documentProxy || disposed) return
  const generation = ++renderGeneration
  renderTask?.cancel()
  rendering.value = true
  error.value = ''
  try {
    const page = await documentProxy.getPage(pageNumber.value)
    if (disposed || generation !== renderGeneration) { page.cleanup(); return }
    pageProxy?.cleanup()
    pageProxy = page
    await nextTick()
    const target = canvas.value
    if (!target) return
    const base = page.getViewport({ scale: 1 })
    if (!(base.width > 0 && base.height > 0 && base.width * base.height > 0) || !Number.isFinite(base.width * base.height)) throw new Error('invalid PDF page size')
    const available = Math.max(200, (stage.value?.clientWidth || 640) - 24)
    const density = Math.min(2, window.devicePixelRatio || 1)
    let scale = available / base.width * zoom.value * density
    scale = Math.min(scale, Math.sqrt(PDF_CANVAS_MAX_PIXELS / (base.width * base.height)), 4096 / base.width, 4096 / base.height)
    const viewport = page.getViewport({ scale })
    target.width = Math.max(1, Math.floor(viewport.width))
    target.height = Math.max(1, Math.floor(viewport.height))
    target.style.width = `${viewport.width / density}px`
    target.style.height = `${viewport.height / density}px`
    // 只绘制画布，不创建脚本动作、XFA、表单或链接批注的交互层。
    renderTask = page.render({ canvas: target, viewport, annotationMode: 0, background: 'rgb(255,255,255)' })
    renderTimeout = setTimeout(() => {
      if (!disposed && generation === renderGeneration) { renderTask?.cancel(); error.value = '此页绘制超时，请下载原文件查看。'; emit('error', new ApiError(error.value, 0)); rendering.value = false }
    }, 30_000)
    await renderTask.promise
    if (!disposed && generation === renderGeneration) emit('ready')
  } catch (reason) { if (generation === renderGeneration) report(reason) }
  finally { if (!disposed && generation === renderGeneration) { clearTimeout(renderTimeout); rendering.value = false } }
}
async function load() {
  const generation = ++documentGeneration
  release()
  loading.value = true; error.value = ''; pages.value = 0; pageNumber.value = 1; zoom.value = 1
  try {
    const task = await openPdf(props.fileId, props.url)
    if (disposed || generation !== documentGeneration) { void task.destroy().catch(() => {}); return }
    documentTask = task
    loadTimeout = setTimeout(() => {
      if (!disposed && generation === documentGeneration) { void task.destroy().catch(() => {}); error.value = 'PDF 读取超时，请重试或下载原文件。'; emit('error', new ApiError(error.value, 0)); loading.value = false }
    }, 30_000)
    const document = await task.promise
    if (disposed || generation !== documentGeneration) return
    documentProxy = document
    pages.value = document.numPages
    clearTimeout(loadTimeout)
    loading.value = false
    await renderPage()
  } catch (reason) { if (generation === documentGeneration) report(reason) }
  finally { if (!disposed && generation === documentGeneration) { clearTimeout(loadTimeout); loading.value = false } }
}
function changePage(delta: number) {
  if (loading.value || rendering.value) return
  pageNumber.value = Math.min(visiblePages.value, Math.max(1, pageNumber.value + delta))
  void renderPage()
}
function changeZoom(delta: number) {
  if (loading.value || rendering.value) return
  zoom.value = Math.min(2, Math.max(.5, zoom.value + delta))
  void renderPage()
}
watch(() => [props.url, props.fileId], load, { immediate: true })
onBeforeUnmount(() => { disposed = true; documentGeneration++; release() })
</script>

<template>
  <section class="pdf-canvas-preview" :aria-label="`${title} PDF预览`">
    <div class="pdf-controls"><div><button class="icon-button" aria-label="PDF上一页" :disabled="loading || rendering || pageNumber <= 1" @click="changePage(-1)">‹</button><span aria-live="polite">{{ pages ? `${pageNumber} / ${pages}` : '读取页数…' }}</span><button class="icon-button" aria-label="PDF下一页" :disabled="loading || rendering || pageNumber >= visiblePages" @click="changePage(1)">›</button></div><div><button class="icon-button" aria-label="缩小PDF" :disabled="loading || rendering || zoom <= .5" @click="changeZoom(-.25)">−</button><span>{{ Math.round(zoom * 100) }}%</span><button class="icon-button" aria-label="放大PDF" :disabled="loading || rendering || zoom >= 2" @click="changeZoom(.25)">+</button></div></div>
    <p v-if="loading || rendering" class="preview-loading-label" role="status">{{ loading ? '正在读取 PDF…' : `正在绘制第 ${pageNumber} 页…` }}</p>
    <div v-if="error" class="preview-state"><AppIcon name="files" :size="35" /><p role="alert">{{ error }}</p><button class="secondary-button" @click="load">重新读取 PDF</button></div>
    <div v-show="!error" ref="stage" class="pdf-canvas-stage"><canvas id="preview-content" ref="canvas" tabindex="0" role="img" :aria-label="`${title}，第 ${pageNumber} 页`" @keydown.left.prevent="changePage(-1)" @keydown.right.prevent="changePage(1)">PDF页面预览，完整文本可下载查看。</canvas></div>
    <p class="preview-limit">逐页安全绘制，不执行文档脚本。<span v-if="pages > PDF_PAGE_LIMIT">仅开放前 {{ PDF_PAGE_LIMIT }} 页，下载可查看完整文档。</span></p>
  </section>
</template>
