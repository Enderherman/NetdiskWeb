<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import type { FileItem } from '../types/files'
import { ApiError } from '../api/client'
import { formatBytes } from '../composables/account'
import { fileKind } from '../composables/filePresentation'
import ModalDialog from '../components/ModalDialog.vue'
import AppIcon from '../components/AppIcon.vue'
import PdfCanvas from './PdfCanvas.vue'
import { IMAGE_PREVIEW_LIMIT, loadPreview, TEXT_PREVIEW_LIMIT, verifyDownload } from './previewContent'
import type { PreviewContent } from './previewContent'
import './preview.css'

const props = defineProps<{ file: FileItem; contentUrl?: string }>()
const emit = defineEmits<{ close: []; error: [error: ApiError] }>()
const content = ref<PreviewContent | null>(null)
const loading = ref(true)
const displayLoading = ref(false)
const error = ref('')
const downloadError = ref('')
const downloadNotice = ref('')
const downloading = ref(false)
const imageUrl = ref('')
const media = ref<HTMLMediaElement>()
let controller: AbortController | undefined
let downloadController: AbortController | undefined
let timeout: ReturnType<typeof setTimeout> | undefined
let generation = 0
let disposed = false
const meta = computed(() => `${fileKind(props.file)}${props.file.fileSize === null ? '' : ` · ${formatBytes(props.file.fileSize)}`}`)

function releaseDisplay() {
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  imageUrl.value = ''
  if (media.value) {
    media.value.pause()
    media.value.removeAttribute('src')
    media.value.load()
  }
}
function displayError(reason: unknown, fallback = '预览读取失败，请重试或下载文件'): ApiError {
  return reason instanceof ApiError ? reason : new ApiError(fallback, 0)
}
async function load() {
  const current = ++generation
  controller?.abort()
  downloadController?.abort()
  clearTimeout(timeout)
  content.value = null
  downloading.value = false
  releaseDisplay()
  controller = new AbortController()
  const signal = controller.signal
  content.value = null
  loading.value = true
  displayLoading.value = false
  error.value = ''; downloadError.value = ''; downloadNotice.value = ''
  timeout = setTimeout(() => controller?.abort(), 30_000)
  try {
    const result = await loadPreview(props.file, props.contentUrl, signal)
    if (current !== generation || disposed) return
    content.value = result
    if (result.image) imageUrl.value = URL.createObjectURL(result.image)
    displayLoading.value = ['image', 'audio', 'video'].includes(result.mode)
  } catch (reason) {
    if (current !== generation || disposed) return
    const failure = displayError(reason, signal.aborted ? '预览读取超时，请重试或下载文件' : undefined)
    error.value = failure.message
    emit('error', failure)
  } finally { if (current === generation && !disposed) { loading.value = false; clearTimeout(timeout) } }
}
async function mediaFailed() {
  if (disposed || !content.value || !['audio', 'video'].includes(content.value.mode)) return
  displayLoading.value = false
  const current = generation
  try {
    // 原生媒体请求失败后再核对授权，避免把过期会话误报为编码不支持。
    await verifyDownload(props.file, props.contentUrl, controller!.signal)
    if (current === generation && !disposed) error.value = '浏览器无法播放此文件，可能不支持该编码。请下载后使用本地播放器打开。'
  } catch (reason) {
    if (current === generation && !disposed) { const failure = displayError(reason); error.value = failure.message; emit('error', failure) }
  }
}
function imageFailed() { displayLoading.value = false; error.value = '图片无法解码，请下载查看原件。' }
async function pdfFailed(reason: ApiError) {
  const current = generation
  try {
    await verifyDownload(props.file, props.contentUrl, controller!.signal)
    if (current === generation && !disposed) { error.value = reason.message; emit('error', reason) }
  } catch (failure) {
    if (current === generation && !disposed) { const problem = displayError(failure); error.value = problem.message; emit('error', problem) }
  }
}
async function download() {
  if (downloading.value) return
  const current = generation
  downloading.value = true; downloadError.value = ''; downloadNotice.value = ''
  downloadController?.abort()
  downloadController = new AbortController()
  try {
    const href = await verifyDownload(props.file, props.contentUrl, downloadController.signal)
    if (disposed || current !== generation) return
    const link = document.createElement('a')
    link.href = href; link.download = props.file.fileName
    document.body.append(link); link.click(); link.remove()
    downloadNotice.value = '已发起下载，请查看浏览器下载列表。'
  } catch (reason) {
    if (!disposed && current === generation) { const failure = displayError(reason, '下载请求失败，请稍后重试'); downloadError.value = failure.message; emit('error', failure) }
  } finally { if (!disposed && current === generation) downloading.value = false }
}
function close() { emit('close') }
watch(() => [props.file.fileId, props.contentUrl], () => { void load() }, { immediate: true })
onBeforeUnmount(() => {
  disposed = true; generation++; controller?.abort(); downloadController?.abort(); clearTimeout(timeout)
  releaseDisplay()
})
async function focusContent() { await nextTick(); document.getElementById('preview-content')?.focus() }
</script>

<template>
  <ModalDialog :title="file.fileName" wide @close="close">
    <div class="preview-toolbar"><span>{{ meta }}</span><span v-if="content?.mode === 'text'">{{ content.sourceText ? '源文本 · 不执行页面内容' : 'UTF-8 文本' }}</span><button v-if="content && !error" class="text-button" @click="focusContent">跳至预览内容</button></div>
    <div v-if="loading" class="preview-state" role="status"><span class="loading-dot" /><h3>正在读取预览…</h3><p>只读取需要的内容。</p></div>
    <div v-else-if="error" class="preview-state"><AppIcon name="files" :size="37" /><h3>暂时无法预览</h3><p role="alert">{{ error }}</p><button class="secondary-button" @click="load">重新加载</button></div>
    <template v-else-if="content">
      <div v-if="content.mode === 'unsupported'" id="preview-content" tabindex="0" class="preview-state"><AppIcon name="files" :size="43" /><h3>下载后查看完整内容</h3><p>{{ content.message }}</p></div>
      <div v-else-if="content.mode === 'text'" id="preview-content" tabindex="0" class="text-preview"><p v-if="content.truncated" class="preview-limit" role="status">仅预览前 {{ TEXT_PREVIEW_LIMIT / 1024 }} KiB，内容已截断。下载可查看完整文件。</p><p v-if="content.text === ''" class="preview-empty">这是一个空文件。</p><pre v-else>{{ content.text }}</pre></div>
      <div v-else-if="content.mode === 'image'" id="preview-content" tabindex="0" class="image-preview"><p v-if="displayLoading" role="status" class="preview-loading-label">正在显示图片…</p><img :src="imageUrl" :alt="file.fileName" @load="displayLoading = false" @error="imageFailed" /><p class="preview-limit">原图预览 · 最大 {{ IMAGE_PREVIEW_LIMIT / 1024 / 1024 }} MiB</p></div>
      <PdfCanvas v-else-if="content.mode === 'pdf'" :file-id="file.fileId" :url="content.url" :title="file.fileName" @error="pdfFailed" />
      <div v-else-if="content.mode === 'video'" class="media-preview"><p v-if="displayLoading" role="status" class="preview-loading-label">正在读取视频信息…</p><video id="preview-content" ref="media" :src="content.url" controls playsinline preload="metadata" :aria-label="`${file.fileName} 视频预览`" @loadedmetadata="displayLoading = false" @error="mediaFailed" /><p class="preview-limit">是否可播放取决于浏览器支持的编码。</p></div>
      <div v-else-if="content.mode === 'audio'" class="media-preview audio-preview"><AppIcon name="music" :size="52" /><p v-if="displayLoading" role="status">正在读取音频信息…</p><audio id="preview-content" ref="media" :src="content.url" controls preload="metadata" :aria-label="`${file.fileName} 音频预览`" @loadedmetadata="displayLoading = false" @error="mediaFailed" /><p class="preview-limit">使用浏览器原生音频播放。</p></div>
    </template>
    <p v-if="downloadError" class="form-error" role="alert">{{ downloadError }}</p><p v-if="downloadNotice" class="preview-download-notice" role="status">{{ downloadNotice }}</p>
    <template #footer><button class="secondary-button" @click="close">关闭</button><button class="primary-button" :disabled="downloading || file.status !== 2" @click="download"><AppIcon name="download" :size="17" />{{ downloading ? '准备下载…' : '下载原文件' }}</button></template>
  </ModalDialog>
</template>
