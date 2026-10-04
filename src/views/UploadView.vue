<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { uploadsApi } from '../api/uploads'
import { filesApi } from '../api/files'
import { errorMessage, formatBytes, useAccount } from '../composables/account'
import { FILES_CHANGED_EVENT, uploadPercent, useUploadQueue } from '../uploads/uploadQueue'
import { locateUploadedFile, uploadSearchLocation } from '../uploads/fileLocation'
import type { UploadSearchLocation } from '../uploads/fileLocation'
import type { LocalUploadTask, ServerUploadState, ServerUploadTask, UploadTaskPage } from '../types/uploads'
import AppIcon from '../components/AppIcon.vue'
import FolderPicker from '../components/FolderPicker.vue'
import ModalDialog from '../components/ModalDialog.vue'

const route = useRoute()
const router = useRouter()
const account = useAccount()
const queue = useUploadQueue()
const picker = ref<HTMLInputElement>()
const resumePicker = ref<HTMLInputElement>()
const destination = ref({ id: '0', name: '全部文件', valid: true })
const choosingDestination = ref(false)
const proposedDestination = ref({ id: '0', name: '全部文件', valid: false })
const error = ref('')
const notice = ref('')
const dragging = ref(false)
const serverPage = ref<UploadTaskPage>({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
const serverLoading = ref(false)
const serverError = ref('')
const serverState = ref<ServerUploadState | ''>('')
const serverDestinations = ref<Record<string, string>>({ '0': '全部文件' })
const resumeTarget = ref<ServerUploadTask | null>(null)
const cancelTarget = ref<{ local?: LocalUploadTask; server?: ServerUploadTask } | null>(null)
const cancelBusy = ref(false)
const cancelError = ref('')
const locating = ref(''), locationError = ref('')
const locationFallback = ref<UploadSearchLocation | null>(null)
let locationGeneration = 0
let locator: AbortController | undefined
let locationTimeout: ReturnType<typeof setTimeout> | undefined
const localStates: Record<LocalUploadTask['state'], string> = { queued: '等待上传', hashing: '正在校验文件', uploading: '正在上传', paused: '已暂停', error: '需要处理', completed: '已完成', cancelled: '已取消', cancelling: '正在取消' }
const serverStates: Record<ServerUploadState, string> = { uploading: '待完成', completed: '已完成', cancelled: '已取消', expired: '已过期' }
const activeCount = computed(() => queue.tasks.filter(task => ['queued', 'hashing', 'uploading'].includes(task.state)).length)
let requestGeneration = 0
let destinationGeneration = 0
let disposed = false
async function loadServer(pageNo = 1) {
  const generation = ++requestGeneration
  serverLoading.value = true
  serverError.value = ''
  try {
    const result = await uploadsApi.list(pageNo, serverState.value || undefined)
    if (generation === requestGeneration && !disposed) {
      serverPage.value = result
      await Promise.all([...new Set(result.list.map(task => task.filePid))].filter(pid => !serverDestinations.value[pid]).map(async pid => {
        let name = '原目录当前不可访问'
        try { name = (await filesApi.breadcrumbs(pid))[0]?.fileName || name } catch { /* 任务记录保留原目录身份。 */ }
        if (generation === requestGeneration && !disposed) serverDestinations.value[pid] = name
      }))
    }
  } catch (reason) { if (generation === requestGeneration && !disposed) serverError.value = errorMessage(reason) }
  finally { if (generation === requestGeneration && !disposed) serverLoading.value = false }
}
async function resolveDestination() {
  const generation = ++destinationGeneration
  const pid = typeof route.query.pid === 'string' ? route.query.pid : '0'
  if (pid === '0') { destination.value = { id: '0', name: '全部文件', valid: true }; return }
  destination.value = { id: pid, name: '正在读取目录…', valid: false }
  try {
    const folder = (await filesApi.breadcrumbs(pid))[0]
    if (generation !== destinationGeneration || disposed) return
    if (!folder || folder.folderType !== 1) throw new Error('上传目录不存在，请重新选择')
    destination.value = { id: folder.fileId, name: folder.fileName, valid: true }
  } catch (reason) { if (generation === destinationGeneration && !disposed) { error.value = errorMessage(reason); destination.value = { id: pid, name: '目录不可用', valid: false } } }
}
function addFiles(files: File[]) {
  error.value = ''; notice.value = ''
  if (!destination.value.valid) { error.value = '请先选择可用的上传目录'; return }
  try { queue.add(files, destination.value.id, destination.value.name) }
  catch (reason) { error.value = errorMessage(reason) }
}
function selected(event: Event) {
  const input = event.target as HTMLInputElement
  addFiles(Array.from(input.files || []))
  input.value = ''
}
function dropped(event: DragEvent) {
  dragging.value = false
  const entries = Array.from(event.dataTransfer?.items || [])
  if (entries.some(item => item.webkitGetAsEntry?.()?.isDirectory)) { error.value = '请直接选择文件；文件夹上传将在后续版本提供'; return }
  addFiles(Array.from(event.dataTransfer?.files || []))
}
function selectResume(server: ServerUploadTask) { resumeTarget.value = server; resumePicker.value?.click() }
async function resumeSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const target = resumeTarget.value
  input.value = ''; resumeTarget.value = null; error.value = ''
  if (!file || !target) return
  try { await queue.resumeServer(target, file, target.filePid) }
  catch (reason) { error.value = errorMessage(reason) }
}
async function confirmCancel() {
  if (!cancelTarget.value || cancelBusy.value) return
  cancelBusy.value = true; cancelError.value = ''
  try {
    if (cancelTarget.value.local) await queue.cancel(cancelTarget.value.local.localId)
    else if (cancelTarget.value.server) {
      const task = cancelTarget.value.server
      const local = queue.tasks.find(item => item.fileId === task.fileId)
      if (local) await queue.cancel(local.localId)
      else {
        const result = await uploadsApi.cancel(task.fileId)
        if (!['cancelled', 'expired'].includes(result.state)) throw new Error('服务器尚未确认取消，请刷新后重试')
      }
    }
    notice.value = '取消请求已处理，请以任务状态为准。已完成原件不会被删除。'
    cancelTarget.value = null
    await loadServer(serverPage.value.pageNo)
    void account.refreshSpace()
  } catch (reason) { cancelError.value = reason instanceof Error ? reason.message : '取消失败，请重试' }
  finally { cancelBusy.value = false }
}
function time(value: number) { return new Date(value).toLocaleString('zh-CN', { hour12: false }) }
function cancelLocation() {
  locationGeneration++; locator?.abort(); clearTimeout(locationTimeout); locating.value = ''
}
async function viewFile(task: ServerUploadTask) {
  if (locating.value) return
  const owner = account.user.value?.userId
  if (!owner) { locationError.value = '请登录后查看文件'; locationFallback.value = null; return }
  const generation = ++locationGeneration
  locator = new AbortController(); const signal = locator.signal
  locating.value = task.fileId; locationError.value = ''; locationFallback.value = uploadSearchLocation(task)
  locationTimeout = setTimeout(() => locator?.abort(), 30_000)
  try {
    const location = await locateUploadedFile(task, signal, latest => {
      if (!disposed && generation === locationGeneration && account.user.value?.userId === owner) {
        locationFallback.value = uploadSearchLocation(latest)
        serverPage.value.list = serverPage.value.list.map(item => item.fileId === latest.fileId ? latest : item)
      }
    })
    if (!disposed && generation === locationGeneration && !signal.aborted && account.user.value?.userId === owner) await router.push(location)
  } catch (reason) {
    if (!disposed && generation === locationGeneration && account.user.value?.userId === owner) {
      locationError.value = signal.aborted ? '定位耗时较长，请重试或按名称搜索' : errorMessage(reason)
    }
  } finally { if (!disposed && generation === locationGeneration) { locating.value = ''; clearTimeout(locationTimeout) } }
}
function refreshed() { void loadServer(serverPage.value.pageNo) }
onMounted(() => { void loadServer(); window.addEventListener(FILES_CHANGED_EVENT, refreshed) })
watch(() => route.query.pid, resolveDestination, { immediate: true })
watch(serverState, () => { void loadServer() })
watch(() => account.user.value?.userId, () => { cancelLocation(); locationError.value = ''; locationFallback.value = null }, { flush: 'sync' })
onBeforeUnmount(() => { disposed = true; requestGeneration++; destinationGeneration++; cancelLocation(); window.removeEventListener(FILES_CHANGED_EVENT, refreshed) })
</script>

<template>
  <section class="upload-view">
    <div class="page-heading"><div><p class="eyebrow">MAKE ROOM FOR MORE</p><h1>让文件，来到这里<span class="heading-period">.</span></h1><p class="page-description">慢慢传，也安心存。随时暂停，接着继续。</p></div><div class="upload-summary"><span class="quiet-dot" />{{ activeCount ? `${activeCount} 个任务进行中` : '准备好接收你的文件' }}</div></div>
    <p v-if="error" class="form-error" role="alert">{{ error }}</p><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
    <div v-if="locationError" class="form-error" role="alert">{{ locationError }} <RouterLink v-if="locationFallback" class="text-link" :to="locationFallback">按名称搜索</RouterLink></div>
    <div v-if="locating" role="status">正在核对文件所在目录与分页… <button class="text-button" @click="cancelLocation">取消定位</button></div>
    <div class="upload-destination"><AppIcon name="folder" :size="18" /><span>保存到 <strong>{{ destination.name }}</strong></span><button class="text-button" @click="choosingDestination = true">更改位置</button></div>
    <div class="upload-dropzone" :class="{ dragging }" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="dropped"><span class="dropzone-icon"><AppIcon name="upload" :size="31" /></span><h2>把文件拖到这里</h2><p>或从设备中选择，支持一次上传多个文件。</p><button class="primary-button" :disabled="!destination.valid" @click="picker?.click()"><AppIcon name="plus" :size="17" />选择文件</button><input ref="picker" class="sr-only" type="file" multiple aria-label="选择上传文件" tabindex="-1" @change="selected" /><input ref="resumePicker" class="sr-only" type="file" aria-label="重新选择续传原文件" tabindex="-1" @change="resumeSelected" /></div>
    <section class="upload-section" aria-labelledby="local-upload-title"><div class="upload-section-heading"><h2 id="local-upload-title">本次上传 <span>{{ queue.tasks.length }}</span></h2><p>校验后逐个上传，切换页面仍会继续。</p></div><div v-if="!queue.tasks.length" class="upload-quiet-empty">这里会记录你本次选择的文件。</div><div v-else class="local-upload-list"><article v-for="task in queue.tasks" :key="task.localId" class="upload-task"><div class="upload-task-icon"><AppIcon name="files" :size="24" /></div><div class="upload-task-main"><div class="upload-task-title"><h3 :title="task.fileName">{{ task.fileName }}</h3><span :class="`task-status status-${task.state}`">{{ localStates[task.state] }}</span></div><p class="upload-task-meta">{{ formatBytes(task.fileSize) }} · {{ task.destinationName }}<span v-if="task.state === 'hashing'"> · 校验 {{ task.hashProgress }}%</span><span v-else-if="task.state === 'uploading'"> · {{ uploadPercent(task) }}%<span v-if="task.speed > 0"> · {{ formatBytes(task.speed) }}/秒</span></span><span v-else-if="task.uploadStatus === 'upload_seconds'"> · 秒传完成</span></p><div class="upload-progress" role="progressbar" :aria-label="`${task.fileName} 的${task.state === 'hashing' ? '校验' : '上传'}进度`" :aria-valuenow="task.state === 'hashing' ? task.hashProgress : uploadPercent(task)" aria-valuemin="0" aria-valuemax="100"><span :style="{ width: `${task.state === 'hashing' ? task.hashProgress : uploadPercent(task)}%` }" /></div><p v-if="task.error" class="upload-task-error" role="alert">{{ task.error }}</p></div><div class="upload-task-actions"><button v-if="['queued', 'hashing', 'uploading'].includes(task.state)" :aria-label="`暂停 ${task.fileName}`" @click="queue.pause(task.localId)">暂停</button><button v-if="['paused', 'error'].includes(task.state) && !task.uncertain" :aria-label="`继续 ${task.fileName}`" @click="queue.resume(task.localId)">{{ task.state === 'error' ? '重试' : '继续' }}</button><button v-if="task.uncertain" @click="loadServer()">查服务器任务</button><button v-if="!['completed', 'cancelled'].includes(task.state)" :disabled="task.state === 'cancelling'" :aria-label="`取消 ${task.fileName}`" @click="cancelError = ''; cancelTarget = { local: task }">取消</button></div></article></div></section>
    <section class="upload-section server-upload-section" aria-labelledby="server-upload-title">
      <div class="upload-section-heading"><div><h2 id="server-upload-title">服务器任务</h2><p>刷新或换设备后，重新选择同一原文件可继续已接受的分片。</p></div><div class="server-upload-tools"><label class="sr-only" for="upload-filter">任务状态</label><select id="upload-filter" v-model="serverState"><option value="">全部状态</option><option value="uploading">待完成</option><option value="completed">已完成</option><option value="cancelled">已取消</option><option value="expired">已过期</option></select><button class="icon-button" aria-label="刷新服务器任务" :disabled="serverLoading" @click="loadServer(serverPage.pageNo)"><AppIcon name="refresh" :size="18" /></button></div></div>
      <div v-if="serverLoading" class="upload-quiet-empty" role="status">正在读取服务器记录…</div>
      <div v-else-if="serverError" class="upload-quiet-empty"><p role="alert">{{ serverError }}</p><button class="secondary-button" @click="loadServer()">重新加载</button></div>
      <div v-else-if="!serverPage.list.length" class="upload-quiet-empty">暂时没有{{ serverState ? serverStates[serverState] : '' }}任务。</div>
      <div v-else class="server-upload-list">
        <article v-for="task in serverPage.list" :key="task.fileId" class="server-upload-task">
          <div class="server-task-main">
            <h3>{{ task.fileName }}</h3>
            <p v-if="task.actualFileName && task.actualFileName !== task.fileName" class="server-task-current-name">现名：{{ task.actualFileName }}</p>
            <p>{{ serverStates[task.state] }} · {{ task.receivedCount }} / {{ task.chunks }} 片<span v-if="task.state === 'uploading'"> · 临时占用 {{ formatBytes(task.temporaryBytes) }}</span><span v-else-if="task.fileSize !== null"> · {{ formatBytes(task.fileSize) }}</span></p>
            <p class="server-task-path">上传时保存到 {{ serverDestinations[task.filePid] || '读取位置…' }}</p>
            <p class="server-task-time">{{ task.state === 'uploading' ? '闲置到期' : '记录保留至' }} {{ time(task.expiresAt) }}</p>
            <p v-if="task.state === 'completed' && !task.fileAvailable" class="field-hint">原件当前不可用，可能已移入回收站或删除。</p>
          </div>
          <div class="server-task-actions">
            <template v-if="task.state === 'uploading'"><button class="secondary-button" @click="selectResume(task)">选择原文件继续</button><button class="text-button" @click="cancelError = ''; cancelTarget = { server: task }">取消任务</button></template>
            <button v-else-if="task.state === 'completed' && task.fileAvailable" class="text-link" :disabled="Boolean(locating)" @click="viewFile(task)">{{ locating === task.fileId ? '正在定位…' : '查看文件' }}<AppIcon name="arrow" :size="14" /></button>
          </div>
        </article>
      </div>
      <div v-if="!serverLoading && !serverError && serverPage.pageTotal > 1" class="file-pagination"><span>共 {{ serverPage.totalCount }} 项</span><div><button class="icon-button" aria-label="服务器任务上一页" :disabled="serverPage.pageNo <= 1" @click="loadServer(serverPage.pageNo - 1)">‹</button><span>{{ serverPage.pageNo }} / {{ serverPage.pageTotal }}</span><button class="icon-button" aria-label="服务器任务下一页" :disabled="serverPage.pageNo >= serverPage.pageTotal" @click="loadServer(serverPage.pageNo + 1)">›</button></div></div>
    </section>
    <p class="drive-footnote">暂停会停止本页传输，已接受分片仍占用临时空间。取消需服务器确认；已完成原件不会被取消操作删除。关闭或刷新页面后，需要重新选择原文件。</p>
    <ModalDialog v-if="choosingDestination" title="选择上传位置" @close="choosingDestination = false"><FolderPicker :excluded-ids="[]" @destination="proposedDestination = $event" /><template #footer><button class="secondary-button" @click="choosingDestination = false">取消</button><button class="primary-button" :disabled="!proposedDestination.valid" @click="destination = proposedDestination; choosingDestination = false">保存到这里</button></template></ModalDialog>
    <ModalDialog v-if="cancelTarget" title="取消上传任务" :busy="cancelBusy" @close="cancelTarget = null"><p class="dialog-description">取消“{{ cancelTarget.local?.fileName || cancelTarget.server?.fileName }}”后，服务器会清理已接受的临时分片。若文件已经上传完成，原件会保留。</p><p v-if="cancelError" class="form-error" role="alert">{{ cancelError }}</p><template #footer><button class="secondary-button" :disabled="cancelBusy" @click="cancelTarget = null">继续保留</button><button class="primary-button danger-button" :disabled="cancelBusy" @click="confirmCancel">{{ cancelBusy ? '等待服务器确认…' : '确认取消上传' }}</button></template></ModalDialog>
  </section>
</template>
