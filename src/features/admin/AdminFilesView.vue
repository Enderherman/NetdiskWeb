<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import FileCollection from '../../components/FileCollection.vue'
import PreviewModal from '../../preview/PreviewModal.vue'
import { ApiError } from '../../api/client'
import { errorMessage, formatBytes } from '../../composables/account'
import { fileDate, fileKind } from '../../composables/filePresentation'
import type { FileItem } from '../../types/files'
import AdminAccessNotice from './AdminAccessNotice.vue'
import AdminNavigation from './AdminNavigation.vue'
import { useAdminAccess } from './access'
import { adminApi, adminContentUrl, adminDownloadUrl, canRead, deletionLabels } from './api'
import { emptyPage } from './types'
import type { AdminFile, AdminUser } from './types'
import './admin.css'

const route = useRoute()
const { allowed, ready, message, actorId, prepare, isCurrent } = useAdminAccess()
const ownerInput = ref(''), owner = ref<AdminUser | null>(null)
const ownerLoading = ref(false), ownerError = ref('')
const page = ref(emptyPage<AdminFile>()), loading = ref(false), error = ref(''), notice = ref('')
const searchInput = ref(''), search = ref(''), state = ref('2')
const appliedState = ref('2')
const trail = ref<AdminFile[]>([]), partialTrail = ref(false)
const currentPid = computed(() => trail.value.at(-1)?.fileId || '0')
const selected = ref<string[]>([]), detail = ref<AdminFile | null>(null), targets = ref<AdminFile[]>([])
const preview = ref<AdminFile | null>(null)
const displayFiles = computed(() => page.value.list.map(file => ({ ...file, fileCover: canRead(file) ? file.fileCover : null })))
const busy = ref(false), downloading = ref(false), actionError = ref('')
const eligibleSelection = computed(() => page.value.list.filter(file => selected.value.includes(file.fileId) && file.delFlag !== 3))
let generation = 0, ownerGeneration = 0, alive = true
let controller: AbortController | undefined, ownerController: AbortController | undefined

async function selectOwner() {
  if (!allowed.value || busy.value || downloading.value) return
  const id = ownerInput.value.trim()
  ownerError.value = ''; notice.value = ''
  if (!/^[A-Za-z0-9]{1,15}$/.test(id)) { ownerError.value = '请输入有效的用户 ID（1–15 位字母或数字）'; return }
  const requestId = ++ownerGeneration, actor = actorId.value
  ownerController?.abort(); ownerController = new AbortController()
  generation++; controller?.abort(); ownerLoading.value = true; owner.value = null; page.value = emptyPage(); selected.value = []
  detail.value = null; preview.value = null; targets.value = []; trail.value = []; partialTrail.value = false; search.value = ''; searchInput.value = ''
  state.value = '2'; appliedState.value = '2'
  try {
    const users = await adminApi.users({ userId: id, pageNo: 1, pageSize: 20 }, ownerController.signal)
    if (!alive || requestId !== ownerGeneration || !isCurrent(actor)) return
    const found = users.list.find(user => user.userId === id)
    if (!found) throw new ApiError('没有找到该用户，请核对用户 ID', 600)
    owner.value = found
    await load(1)
  } catch (reason) {
    if (alive && requestId === ownerGeneration && isCurrent(actor) && !(reason instanceof Error && reason.name === 'AbortError')) ownerError.value = errorMessage(reason)
  } finally { if (alive && requestId === ownerGeneration) ownerLoading.value = false }
}

async function load(pageNo = page.value.pageNo) {
  if (!allowed.value || !owner.value) return
  const ownerId = owner.value.userId, requestId = ++generation, actor = actorId.value
  controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''; selected.value = []
  try {
    const response = await adminApi.files({ userId: ownerId, filePid: search.value ? undefined : currentPid.value,
      fileNameFuzzy: search.value || undefined, delFlag: appliedState.value === '' ? undefined : Number(appliedState.value) as 0 | 1 | 2 | 3,
      pageNo, pageSize: 20 }, controller.signal)
    if (alive && requestId === generation && owner.value?.userId === ownerId && isCurrent(actor)) page.value = response
  } catch (reason) {
    if (alive && requestId === generation && isCurrent(actor) && !(reason instanceof Error && reason.name === 'AbortError')) { page.value = emptyPage(); error.value = errorMessage(reason) }
  } finally { if (alive && requestId === generation) loading.value = false }
}

function filter() {
  if (busy.value || downloading.value) return
  if (searchInput.value.trim().length > 200) { error.value = '搜索名称不能超过 200 字'; return }
  search.value = searchInput.value.trim(); appliedState.value = state.value; void load(1)
}
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id] }
function openFile(item: FileItem) {
  const file = page.value.list.find(value => value.fileId === item.fileId)
  if (!file || busy.value || downloading.value) return
  if (file.folderType === 0) { showDetail(file); return }
  if (search.value) { trail.value = [file]; partialTrail.value = file.filePid !== '0' }
  else trail.value = [...trail.value, file]
  search.value = ''; searchInput.value = ''
  if (file.delFlag !== 2) { state.value = ''; appliedState.value = '' }
  void load(1)
}
function navigate(index: number) {
  if (busy.value || downloading.value) return
  trail.value = index < 0 ? [] : trail.value.slice(0, index + 1)
  if (index < 0) partialTrail.value = false
  search.value = ''; searchInput.value = ''; void load(1)
}
function showDetail(item: FileItem) { detail.value = page.value.list.find(value => value.fileId === item.fileId) || null; actionError.value = '' }
function openDelete(files: AdminFile[]) { if (busy.value || downloading.value) return; detail.value = null; targets.value = files.filter(file => file.delFlag !== 3); actionError.value = ''; notice.value = '' }

async function remove() {
  if (!allowed.value || busy.value || !targets.value.length) return
  const actor = actorId.value, records = [...targets.value]
  busy.value = true; actionError.value = ''
  try {
    await adminApi.deleteFiles(records)
    if (!alive || !isCurrent(actor)) return
    targets.value = []; selected.value = []; notice.value = '所选项目已永久删除'
    await load()
  } catch (reason) { if (alive && isCurrent(actor)) actionError.value = errorMessage(reason) }
  finally { if (alive) busy.value = false }
}
async function download(file: AdminFile) {
  if (!allowed.value || downloading.value || busy.value || !canRead(file)) return
  const actor = actorId.value
  downloading.value = true; actionError.value = ''; notice.value = ''
  try {
    const code = await adminApi.downloadCode(file.userId, file.fileId)
    if (!alive || !isCurrent(actor)) return
    const anchor = document.createElement('a'); anchor.href = adminDownloadUrl(code); anchor.download = file.fileName
    document.body.append(anchor); anchor.click(); anchor.remove()
    notice.value = '下载链接已准备，请查看浏览器下载'
  } catch (reason) { if (alive && isCurrent(actor)) actionError.value = errorMessage(reason) }
  finally { if (alive) downloading.value = false }
}

watch(actorId, () => { generation++; ownerGeneration++; controller?.abort(); ownerController?.abort(); owner.value = null; page.value = emptyPage(); detail.value = null; preview.value = null; targets.value = [] }, { flush: 'sync' })
watch(() => route.query.userId, value => { if (typeof value === 'string') { ownerInput.value = value; if (allowed.value) void selectOwner() } })
onMounted(async () => { if (await prepare() && alive && typeof route.query.userId === 'string') { ownerInput.value = route.query.userId; await selectOwner() } })
onBeforeUnmount(() => { alive = false; generation++; ownerGeneration++; controller?.abort(); ownerController?.abort() })
</script>

<template>
  <section class="admin-view">
    <div class="page-heading"><div><p class="eyebrow">STORAGE ADMINISTRATION</p><h1>文件管理<span class="heading-period">.</span></h1><p class="page-description">按所属用户查阅文件，所有操作都保留明确的对象。</p></div><button v-if="allowed && owner" class="secondary-button" :disabled="loading || ownerLoading || busy" @click="load()"><AppIcon name="refresh" :size="16" />刷新文件</button></div>
    <AdminAccessNotice v-if="!allowed" :ready="ready" :message="message" />
    <template v-else>
      <AdminNavigation />
      <form class="admin-filters" @submit.prevent="selectOwner"><div class="form-field"><label for="admin-file-owner">所属用户 ID</label><input id="admin-file-owner" v-model="ownerInput" maxlength="15" :disabled="busy || downloading" placeholder="从用户管理中选择，或输入用户 ID" /></div><button class="primary-button" :disabled="ownerLoading || busy || downloading" type="submit">{{ ownerLoading ? '正在查找…' : '查看用户文件' }}</button></form>
      <p v-if="ownerError" class="form-error" role="alert">{{ ownerError }}</p><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
      <div v-if="ownerLoading && !owner" class="admin-state" role="status">正在核对所属用户…</div><div v-else-if="!owner" class="admin-state"><AppIcon name="folder" :size="36" /><h2>先选择所属用户</h2><p>可从用户管理进入某位用户的网盘，或在上方输入用户 ID。</p></div>
      <template v-else>
        <form class="admin-filters" @submit.prevent="filter"><div class="form-field"><label for="admin-file-search">文件名包含</label><input id="admin-file-search" v-model="searchInput" maxlength="200" :disabled="busy" placeholder="在此用户的全部目录中搜索" /></div><div class="form-field short"><label for="admin-file-state">文件状态</label><select id="admin-file-state" v-model="state" :disabled="busy"><option value="">全部状态</option><option value="2">正常</option><option value="1">回收站</option><option value="0">随上级回收</option><option value="3">已永久删除</option></select></div><button class="secondary-button" :disabled="loading || busy" type="submit">筛选文件</button></form>
        <section class="file-surface" :aria-busy="loading" aria-label="用户文件列表"><div class="admin-owner-heading"><div><strong>{{ owner.nickName || owner.userId }} 的网盘</strong><p>用户 ID：{{ owner.userId }}</p></div><span class="admin-status">{{ appliedState === '' ? '全部状态' : deletionLabels[Number(appliedState)] }}</span></div>
          <nav class="admin-breadcrumbs" aria-label="当前浏览导航"><button @click="navigate(-1)">用户网盘</button><span v-if="partialTrail" aria-label="中间目录已省略">…</span><template v-for="(folder, index) in trail" :key="folder.fileId"><span>/</span><button @click="navigate(index)">{{ folder.fileName }}</button></template><span v-if="search">/ 搜索结果</span></nav>
          <div v-if="selected.length" class="selection-toolbar"><span>已选 {{ selected.length }} 项</span><button :disabled="!eligibleSelection.length || busy" @click="openDelete(eligibleSelection)"><AppIcon name="trash" :size="16" />永久删除所选</button><button class="selection-cancel" @click="selected = []">取消选择</button></div>
          <div v-if="loading" class="admin-state" role="status">正在读取文件…</div><div v-else-if="error" class="admin-state"><p role="alert">{{ error }}</p><button class="secondary-button" @click="load()">重新加载</button></div><div v-else-if="!page.list.length" class="admin-state"><h2>没有匹配的文件</h2><p>检查当前目录和状态筛选条件。</p></div><FileCollection v-else :items="displayFiles" :thumbnail-for="file => adminContentUrl(owner!.userId, file.fileId).replace('/content/', '/thumbnail/')" :selected="selected" layout="list" @select="toggle" @select-all="selected = $event" @open="openFile" @detail="showDetail" />
          <div v-if="!loading && !error && page.totalCount" class="file-pagination"><span>共 {{ page.totalCount }} 项</span><div><button class="icon-button" aria-label="上一页管理文件" :disabled="page.pageNo <= 1" @click="load(page.pageNo - 1)">‹</button><span>{{ page.pageNo }} / {{ page.pageTotal }}</span><button class="icon-button" aria-label="下一页管理文件" :disabled="page.pageNo >= page.pageTotal" @click="load(page.pageNo + 1)">›</button></div></div>
        </section>
      </template>
      <PreviewModal v-if="preview" :file="preview" :content-url="adminContentUrl(preview.userId, preview.fileId)" @close="preview = null" />
      <ModalDialog v-if="detail" title="文件详情" :busy="busy || downloading" @close="detail = null"><h3>{{ detail.fileName }}</h3><dl class="admin-detail-grid"><div><dt>所属用户</dt><dd>{{ detail.userId }}</dd></div><div><dt>状态</dt><dd>{{ deletionLabels[detail.delFlag] }} · {{ detail.status === 2 ? '已就绪' : detail.status === 0 ? '处理中' : '处理失败' }}</dd></div><div><dt>类型</dt><dd>{{ fileKind(detail) }}</dd></div><div><dt>大小</dt><dd>{{ detail.folderType === 1 || detail.fileSize === null ? '—' : formatBytes(detail.fileSize) }}</dd></div><div><dt>修改时间</dt><dd>{{ fileDate(detail.lastUpdateTime) }}</dd></div></dl><div class="admin-content-actions"><button v-if="canRead(detail)" class="secondary-button" @click="preview = detail; detail = null">在线预览<AppIcon name="arrow" :size="15" /></button><button v-if="canRead(detail)" class="primary-button" :disabled="downloading" @click="download(detail)">{{ downloading ? '准备下载…' : '下载原件' }}</button><button class="secondary-button danger-button" :disabled="busy || downloading || detail.delFlag === 3" @click="openDelete([detail])">永久删除</button></div><p v-if="detail.folderType === 0 && !canRead(detail)" class="admin-note">仅正常且已就绪的文件可以预览或下载。</p><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p></ModalDialog>
      <ModalDialog v-if="targets.length" title="永久删除文件" :busy="busy" @close="targets = []"><p class="dialog-description">将永久删除这 {{ targets.length }} 个文件或文件夹及其所有子项，无法再从回收站恢复。</p><p class="admin-note">所属用户：{{ owner?.nickName || targets[0]?.userId }}（{{ targets[0]?.userId }}）。此操作会直接移除所选内容，请确认对象无误。</p><ul class="admin-target-list"><li v-for="file in targets.slice(0, 5)" :key="file.fileId">{{ file.fileName }}</li></ul><p v-if="targets.length > 5" class="field-hint">以及另外 {{ targets.length - 5 }} 项。</p><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p><template #footer><button class="secondary-button" :disabled="busy" @click="targets = []">保留文件</button><button class="primary-button danger-button" :disabled="busy" @click="remove">{{ busy ? '正在永久删除…' : '确认永久删除' }}</button></template></ModalDialog>
    </template>
  </section>
</template>
