<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { routeLocationKey, routerKey } from 'vue-router'
import type { RouteLocationNormalizedLoaded, Router } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'
import ThemeSwitcher from '../../components/ThemeSwitcher.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import FolderPicker from '../../components/FolderPicker.vue'
import FileCollection from '../../components/FileCollection.vue'
import PreviewModal from '../../preview/PreviewModal.vue'
import { ApiError } from '../../api/client'
import { errorMessage, formatBytes, useAccount } from '../../composables/account'
import { fileDate, fileIcon, fileKind } from '../../composables/filePresentation'
import type { FileItem, FilePage } from '../../types/files'
import { shareContentUrl, shareDownloadUrl, shareThumbnailUrl, sharesApi } from './api'
import { shareExpiry, sharePath, shareReturnPath, validShareId } from './presentation'
import type { PublicShareInfo } from './types'
import './shares.css'

const props = defineProps<{ shareId?: string }>()
const route = inject<RouteLocationNormalizedLoaded | undefined>(routeLocationKey, undefined)
const router = inject<Router | undefined>(routerKey, undefined)
const account = useAccount()
const shareId = computed(() => props.shareId ?? (typeof route?.params.shareId === 'string' ? route.params.shareId : ''))
const routed = computed(() => validShareId(shareId.value) && route?.path === sharePath(shareId.value))
const localPath = ref('')
const localPage = ref(1)
const path = computed(() => {
  const value = routed.value ? route?.query.path : localPath.value
  return typeof value === 'string' && value !== '0' && value.length <= 2200 && /^[A-Za-z0-9]{1,10}(\/[A-Za-z0-9]{1,10})*$/.test(value) ? value : ''
})
const pathIds = computed(() => path.value ? path.value.split('/') : [])
const pageNo = computed(() => routed.value ? Math.max(1, Math.min(1_000_000, Math.floor(Number(route?.query.page)) || 1)) : localPage.value)
const currentPid = computed(() => pathIds.value.at(-1) || '0')
const phase = ref<'loading' | 'code' | 'ready' | 'invalid' | 'error'>('loading')
const info = ref<PublicShareInfo | null>(null)
const page = ref<FilePage>({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
const crumbs = ref<FileItem[]>([])
const loadingFiles = ref(false)
const extracting = ref(false)
const extractionCode = ref('')
const codeError = ref('')
const error = ref('')
const actionError = ref('')
const notice = ref('')
const selected = ref<string[]>([])
const selectedFiles = computed(() => page.value.list.filter(file => selected.value.includes(file.fileId)))
const ownShare = computed(() => Boolean(info.value?.currentUser || (account.user.value?.userId && account.user.value.userId === info.value?.userId)))
const detail = ref<FileItem | null>(null)
const preview = ref<FileItem | null>(null)
const downloadId = ref('')
const preparingSave = ref(false)
const saveOpen = ref(false)
const saving = ref(false)
const saveTargets = ref<FileItem[]>([])
const saveError = ref('')
const destination = ref({ id: '0', name: '全部文件', valid: false })
const loginPrompt = ref(false)
const loginMessage = ref('登录后，可以把选中的内容保存到你的网盘。')
let generation = 0
let fileGeneration = 0
let infoController: AbortController | undefined
let fileController: AbortController | undefined

function clearFiles() { page.value.list = []; crumbs.value = []; selected.value = []; detail.value = null; preview.value = null }
function accessFailure(reason: unknown): boolean {
  if (reason instanceof ApiError && reason.code === 902) {
    phase.value = 'invalid'; error.value = reason.message; info.value = null; clearFiles(); saveOpen.value = false
    return true
  }
  if (reason instanceof ApiError && reason.code === 903) {
    phase.value = 'code'; codeError.value = '提取验证已失效，请重新输入提取码'; clearFiles(); saveOpen.value = false
    return true
  }
  return false
}
async function bootstrap() {
  const current = ++generation
  fileGeneration++; fileController?.abort(); infoController?.abort(); infoController = new AbortController()
  phase.value = 'loading'; info.value = null; error.value = ''; codeError.value = ''; actionError.value = ''; notice.value = ''
  extractionCode.value = ''; clearFiles(); saveOpen.value = false; loginPrompt.value = false
  if (!validShareId(shareId.value)) { phase.value = 'invalid'; error.value = '分享链接格式不正确'; return }
  void account.ensureSession()
  try {
    const [metadata, extracted] = await Promise.all([
      sharesApi.info(shareId.value, infoController.signal), sharesApi.accessInfo(shareId.value, infoController.signal),
    ])
    if (current !== generation) return
    if (!metadata || typeof metadata.fileName !== 'string') throw new ApiError('分享信息不完整，请重试', 0)
    info.value = extracted || metadata
    if (!extracted) { phase.value = 'code'; return }
    phase.value = 'ready'
    await loadFiles()
  } catch (reason) {
    if (current !== generation || (reason instanceof Error && reason.name === 'AbortError')) return
    if (!accessFailure(reason)) { phase.value = 'error'; error.value = errorMessage(reason) }
  }
}
async function extract() {
  if (extracting.value) return
  codeError.value = ''
  if (!/^[A-Za-z0-9]{4,5}$/.test(extractionCode.value)) { codeError.value = '请输入 4–5 位字母或数字提取码'; return }
  const current = generation, id = shareId.value
  extracting.value = true
  try {
    await sharesApi.checkCode(id, extractionCode.value)
    const extracted = await sharesApi.accessInfo(id)
    if (current !== generation) return
    if (!extracted) throw new ApiError('提取验证未能保留，请检查浏览器 Cookie 后重试', 903)
    info.value = extracted; phase.value = 'ready'; extractionCode.value = ''
    await loadFiles()
  } catch (reason) { if (current === generation && !accessFailure(reason)) codeError.value = errorMessage(reason) }
  finally { extracting.value = false }
}
async function loadFiles() {
  if (phase.value !== 'ready') return
  const current = ++fileGeneration, context = generation
  fileController?.abort(); fileController = new AbortController()
  loadingFiles.value = true; error.value = ''; selected.value = []; detail.value = null
  try {
    const [result, folders] = await Promise.all([
      sharesApi.files(shareId.value, currentPid.value, pageNo.value, 20, fileController.signal),
      path.value ? sharesApi.folders(shareId.value, path.value, fileController.signal) : Promise.resolve([]),
    ])
    if (current !== fileGeneration || context !== generation) return
    if (folders.length !== pathIds.value.length || folders.some((folder, index) => folder.fileId !== pathIds.value[index]
      || (index > 0 && folder.filePid !== folders[index - 1]?.fileId))) throw new ApiError('目录路径已变化，请返回分享首页', 600)
    page.value = result; crumbs.value = folders
  } catch (reason) {
    if (current !== fileGeneration || context !== generation || (reason instanceof Error && reason.name === 'AbortError')) return
    clearFiles()
    if (!accessFailure(reason)) error.value = errorMessage(reason)
  } finally { if (current === fileGeneration) loadingFiles.value = false }
}
function navigate(nextPath: string, nextPage = 1) {
  notice.value = ''; actionError.value = ''
  if (routed.value && router) {
    const query: Record<string, string> = {}
    if (nextPath) query.path = nextPath
    if (nextPage > 1) query.page = String(nextPage)
    void router.push({ path: sharePath(shareId.value), query })
  } else { localPath.value = nextPath; localPage.value = nextPage }
}
function visit(index: number) { navigate(index < 0 ? '' : pathIds.value.slice(0, index + 1).join('/')) }
function open(file: FileItem) {
  if (file.folderType === 1) navigate([...pathIds.value, file.fileId].join('/'))
  else { detail.value = file; actionError.value = '' }
}
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id] }
async function download(file: FileItem) {
  if (downloadId.value || file.folderType === 1 || file.status !== 2) return
  const context = generation, id = shareId.value
  downloadId.value = file.fileId; actionError.value = ''
  try {
    const code = await sharesApi.downloadCode(id, file.fileId)
    if (context !== generation) return
    if (!code || typeof code !== 'string') throw new ApiError('下载链接不可用，请重新尝试', 0)
    const link = document.createElement('a'); link.href = shareDownloadUrl(code); link.download = file.fileName
    document.body.append(link); link.click(); link.remove()
    notice.value = '已请求下载，请查看浏览器的下载列表'
  } catch (reason) { if (context === generation && !accessFailure(reason)) actionError.value = errorMessage(reason) }
  finally { downloadId.value = '' }
}
async function beginSave(files = selectedFiles.value) {
  if (preparingSave.value || saving.value || !files.length || ownShare.value) return
  if (files.some(file => file.status !== 2)) { actionError.value = '所选文件尚未处理完成，请稍后保存'; return }
  const context = generation
  saveTargets.value = [...files]; saveError.value = ''; actionError.value = ''; detail.value = null
  preparingSave.value = true
  try {
    const signedIn = await account.ensureSession(true)
    if (context !== generation) return
    if (!signedIn) {
      if (account.status.value === 'error') { actionError.value = account.sessionError.value || '无法检查登录状态，请重试'; return }
      loginMessage.value = '登录后，可以把选中的内容保存到你的网盘。'; loginPrompt.value = true; return
    }
    if (ownShare.value) { actionError.value = '这是你分享的文件，已经在你的网盘中'; return }
    destination.value = { id: '0', name: '全部文件', valid: false }; saveOpen.value = true
  } finally { preparingSave.value = false }
}
async function save() {
  if (saving.value || !destination.value.valid || !saveTargets.value.length) return
  const context = generation, ownerId = account.user.value?.userId
  saving.value = true; saveError.value = ''
  try {
    await sharesApi.save(shareId.value, saveTargets.value.map(file => file.fileId), destination.value.id)
    if (account.user.value?.userId === ownerId) void account.refreshSpace()
    if (context !== generation || account.user.value?.userId !== ownerId) return
    notice.value = `已将所选内容保存到“${destination.value.name}”`; saveOpen.value = false; selected.value = []
  } catch (reason) {
    if (context !== generation) return
    if (reason instanceof ApiError && (reason.code === 901 || reason.code === 401)) {
      account.clearSession(); saveOpen.value = false; loginMessage.value = '登录已失效，请重新登录后继续保存。'; loginPrompt.value = true
    } else if (!accessFailure(reason)) saveError.value = errorMessage(reason)
  } finally { saving.value = false }
}
function login() {
  const redirect = validShareId(shareId.value) ? shareReturnPath(shareId.value, path.value, pageNo.value) : '/drive'
  if (router) void router.push({ path: '/auth/login', query: { redirect } })
  else window.location.assign(`/auth/login?redirect=${encodeURIComponent(redirect)}`)
}
watch(shareId, bootstrap, { immediate: true })
watch([path, pageNo], () => { if (phase.value === 'ready') void loadFiles() })
watch(() => account.user.value?.userId, () => { saveOpen.value = false; destination.value.valid = false })
onBeforeUnmount(() => { generation++; fileGeneration++; infoController?.abort(); fileController?.abort() })
</script>

<template>
  <div class="public-share-page">
    <header class="public-share-header"><RouterLink class="brand" to="/drive"><span class="brand-mark"><AppIcon name="folder" :size="20" /></span><span>Netdisk<span class="brand-dot">.</span></span></RouterLink><ThemeSwitcher /></header>
    <main class="public-share-main">
      <div v-if="info" class="public-share-heading"><span class="file-symbol"><AppIcon name="share" :size="30" /></span><div><p class="eyebrow">SHARED WITH YOU</p><h1>{{ info.fileName }}</h1><p class="share-meta">{{ info.nickName }} 分享于 {{ fileDate(info.shareTime) }}<br />{{ info.expireTime ? `到期时间：${shareExpiry(info.expireTime)}` : '永久有效' }}</p></div></div>
      <div v-if="phase === 'loading'" class="share-state" role="status"><span class="loading-dot" /><p>正在检查分享链接…</p></div>
      <section v-else-if="phase === 'invalid' || phase === 'error'" class="share-state"><AppIcon name="share" :size="38" /><h2>{{ phase === 'invalid' ? '分享已失效或不存在' : '暂时无法打开分享' }}</h2><p role="alert">{{ error }}</p><button class="secondary-button" @click="bootstrap">重新检查</button><RouterLink class="text-link" to="/drive">返回我的网盘<AppIcon name="arrow" :size="16" /></RouterLink></section>
      <form v-else-if="phase === 'code'" class="share-unlock" @submit.prevent="extract"><h2>输入提取码</h2><p>验证后，即可查看这份分享。</p><div class="form-field"><label for="public-share-code">提取码</label><input id="public-share-code" v-model="extractionCode" maxlength="5" autocomplete="off" autocapitalize="off" placeholder="4–5 位字母或数字" :disabled="extracting" /></div><p v-if="codeError" class="form-error" role="alert">{{ codeError }}</p><button class="primary-button" :disabled="extracting">{{ extracting ? '正在验证…' : '查看分享' }}<AppIcon name="arrow" :size="16" /></button></form>
      <template v-else-if="phase === 'ready'">
        <p v-if="notice" class="form-notice success" role="status">{{ notice }}</p><p v-if="actionError && !detail" class="form-error" role="alert">{{ actionError }}</p>
        <section class="file-surface live-file-surface" aria-label="分享文件列表" :aria-busy="loadingFiles">
          <div class="browse-toolbar"><nav class="folder-crumbs" aria-label="分享目录路径"><button :disabled="!path" @click="visit(-1)">分享文件</button><template v-for="(folder, index) in crumbs" :key="folder.fileId"><AppIcon name="chevron" :size="12" /><button :disabled="index === crumbs.length - 1" @click="visit(index)">{{ folder.fileName }}</button></template></nav><button class="icon-button" aria-label="刷新分享文件" :disabled="loadingFiles" @click="loadFiles"><AppIcon name="refresh" :size="17" /></button></div>
          <div v-if="selected.length" class="selection-toolbar"><span>已选 {{ selected.length }} 项</span><button v-if="!ownShare" :disabled="preparingSave || saving" @click="beginSave()"><AppIcon name="folder" :size="16" />{{ preparingSave ? '正在检查登录…' : '保存到我的网盘' }}</button><span v-else>这是你分享的内容</span><button class="selection-cancel" @click="selected = []">取消选择</button></div>
          <div v-if="loadingFiles" class="share-state" role="status"><span class="loading-dot" /><p>正在读取分享文件…</p></div>
          <div v-else-if="error" class="share-state"><p role="alert">{{ error }}</p><button class="secondary-button" @click="loadFiles">重新加载</button><button v-if="path" class="text-link" @click="visit(-1)">返回分享首页</button></div>
          <div v-else-if="!page.list.length" class="share-state"><AppIcon name="folder" :size="34" /><h2>这个文件夹是空的</h2><p>可以返回上一级查看其他分享内容。</p></div>
          <FileCollection v-else :thumbnail-for="file => shareThumbnailUrl(shareId, file.fileId)" :items="page.list" :selected="selected" layout="list" @select="toggle" @select-all="selected = $event" @open="open" @detail="detail = $event; actionError = ''" />
          <div v-if="!loadingFiles && !error" class="file-pagination"><span>共 {{ page.totalCount }} 项</span><div><button class="icon-button" aria-label="上一页分享文件" :disabled="page.pageNo <= 1" @click="navigate(path, page.pageNo - 1)">‹</button><span>{{ page.pageNo }} / {{ Math.max(1, page.pageTotal) }}</span><button class="icon-button" aria-label="下一页分享文件" :disabled="page.pageNo >= page.pageTotal" @click="navigate(path, page.pageNo + 1)">›</button></div></div>
        </section>
        <p class="share-owner-note">{{ ownShare ? '这是你的分享，原文件已在你的网盘中。' : '选择文件或文件夹，可以保存到自己的网盘。' }}</p>
      </template>
    </main>
    <footer class="public-share-footer">由 Netdisk 分享 · <RouterLink to="/drive">前往我的网盘</RouterLink></footer>

    <PreviewModal v-if="preview" :file="preview" :content-url="shareContentUrl(shareId, preview.fileId)" @close="preview = null" @error="accessFailure" />
    <ModalDialog v-if="detail" title="分享文件详情" :busy="Boolean(downloadId)" @close="detail = null"><div class="file-detail-heading"><span class="file-symbol"><AppIcon :name="fileIcon(detail)" :size="32" /></span><h3>{{ detail.fileName }}</h3></div><dl class="file-details"><div><dt>类型</dt><dd>{{ fileKind(detail) }}</dd></div><div><dt>大小</dt><dd>{{ detail.folderType === 1 || detail.fileSize === null ? '—' : formatBytes(detail.fileSize) }}</dd></div><div><dt>修改时间</dt><dd>{{ fileDate(detail.lastUpdateTime) }}</dd></div></dl><div class="detail-actions"><button v-if="detail.folderType === 0 && detail.status === 2" class="secondary-button" @click="preview = detail; detail = null">在线预览<AppIcon name="arrow" :size="15" /></button><button v-if="detail.folderType === 0" class="primary-button" :disabled="Boolean(downloadId) || detail.status !== 2" @click="download(detail)"><AppIcon name="download" :size="16" />{{ downloadId ? '准备下载…' : '下载文件' }}</button><button v-if="!ownShare" class="secondary-button" :disabled="preparingSave || detail.status !== 2" @click="beginSave([detail])">保存到我的网盘</button></div><p v-if="detail.folderType === 1" class="field-hint">目录可以先保存到自己的网盘，再打包下载。</p><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p></ModalDialog>
    <ModalDialog v-if="saveOpen" title="保存到我的网盘" :busy="saving" @close="saveOpen = false"><p class="dialog-description">选择 {{ saveTargets.length }} 项的保存位置。同名文件会自动添加序号，所需空间由服务端检查。</p><FolderPicker :excluded-ids="[]" :disabled="saving" @destination="destination = $event" /><p class="move-destination">目标：{{ destination.name }}</p><p v-if="saveError" class="form-error" role="alert">{{ saveError }}</p><template #footer><button class="secondary-button" :disabled="saving" @click="saveOpen = false">取消</button><button class="primary-button" :disabled="saving || !destination.valid" @click="save">{{ saving ? '正在保存…' : '保存到这里' }}</button></template></ModalDialog>
    <ModalDialog v-if="loginPrompt" title="登录后保存" @close="loginPrompt = false"><p class="dialog-description">{{ loginMessage }}登录后会返回当前分享目录，文件仍需由你确认保存。</p><template #footer><button class="secondary-button" @click="loginPrompt = false">继续浏览</button><button class="primary-button" @click="login">前往登录</button></template></ModalDialog>
  </div>
</template>
