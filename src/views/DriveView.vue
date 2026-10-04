<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { filesApi, downloadUrl } from '../api/files'
import { ApiError } from '../api/client'
import { errorMessage, formatBytes, useAccount } from '../composables/account'
import { fileDate, fileIcon, fileKind, validateFileName } from '../composables/filePresentation'
import type { FileCategory, FileItem, FilePage, SortField } from '../types/files'
import AppIcon from '../components/AppIcon.vue'
import ModalDialog from '../components/ModalDialog.vue'
import FolderPicker from '../components/FolderPicker.vue'
import FileCollection from '../components/FileCollection.vue'
import { FILES_CHANGED_EVENT } from '../uploads/uploadQueue'
import PreviewModal from '../preview/PreviewModal.vue'
import ShareCreateDialog from '../features/shares/ShareCreateDialog.vue'
import FileOperations from '../features/operations/FileOperations.vue'
import { useFileFocus } from '../features/recent/useFileFocus'

const route = useRoute()
const router = useRouter()
const account = useAccount()
const categories: { value: FileCategory; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'doc', label: '文档' }, { value: 'image', label: '图片' },
  { value: 'video', label: '视频' }, { value: 'music', label: '音频' }, { value: 'others', label: '其他' },
]
const sortOptions: { value: SortField; label: string }[] = [
  { value: 'lastUpdateTime', label: '修改时间' }, { value: 'fileName', label: '名称' },
  { value: 'fileSize', label: '大小' }, { value: 'createTime', label: '创建时间' },
]
const category = computed<FileCategory>(() => categories.find(item => item.value === route.query.category)?.value || 'all')
const search = computed(() => typeof route.query.q === 'string' ? route.query.q.slice(0, 200) : '')
const searchInput = ref(search.value)
const path = computed(() => typeof route.query.path === 'string' && /^[A-Za-z0-9]{1,10}(\/[A-Za-z0-9]{1,10})*$/.test(route.query.path) ? route.query.path : '')
const pathIds = computed(() => path.value ? path.value.split('/') : [])
const currentPid = computed(() => pathIds.value.at(-1) || '0')
const globalSearch = computed(() => category.value !== 'all' || Boolean(search.value))
const sortField = computed<SortField>(() => sortOptions.find(item => item.value === route.query.sort)?.value || 'lastUpdateTime')
const sortDirection = computed(() => route.query.direction === 'asc' ? 'asc' : 'desc')
const pageSize = computed(() => [20, 50, 100].includes(Number(route.query.size)) ? Number(route.query.size) : 20)
const pageNo = computed(() => Math.max(1, Math.min(1_000_000, Math.floor(Number(route.query.page)) || 1)))
const layout = ref<'list' | 'grid'>('list')
try { if (localStorage.getItem('netdisk.file-layout') === 'grid') layout.value = 'grid' } catch { /* 受限存储保持默认。 */ }
watch(layout, value => { try { localStorage.setItem('netdisk.file-layout', value) } catch { /* 不阻止切换。 */ } })
const page = ref<FilePage>({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
const crumbs = ref<FileItem[]>([])
const loading = ref(false)
const error = ref('')
const notice = ref('')
const selectedIds = ref<string[]>([])
const selectedFiles = computed(() => page.value.list.filter(file => selectedIds.value.includes(file.fileId)))
const fileSurface = ref<HTMLElement>()
const { focusError } = useFileFocus({ focus: () => route.query.focus, items: () => page.value.list, loading,
  root: fileSurface, select: id => { selectedIds.value = [id] } })
const modal = ref<'create' | 'rename' | 'delete' | 'move' | 'detail' | null>(null)
const previewFile = ref<FileItem | null>(null)
const shareFile = ref<FileItem | null>(null)
const targets = ref<FileItem[]>([])
const targetIds = computed(() => targets.value.map(file => file.fileId))
const nameInput = ref('')
const actionError = ref('')
const busy = ref(false)
const downloading = ref(false)
const destination = ref({ id: '0', name: '全部文件', valid: false })
const dialogTitle = computed(() => ({ create: '新建文件夹', rename: '重命名', delete: '移入回收站', move: '移动到', detail: '文件详情' })[modal.value || 'detail'])
let requestId = 0
let controller: AbortController | undefined

function navigate(patch: Record<string, string | number | undefined>) {
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries({ ...route.query, ...patch })) if (typeof value === 'string' || typeof value === 'number') query[key] = String(value)
  return router.push({ path: '/drive', query })
}
function submitSearch() { void navigate({ q: searchInput.value.trim() || undefined, path: undefined, page: undefined }) }
function selectCategory(value: FileCategory) { void navigate({ category: value === 'all' ? undefined : value, path: undefined, page: undefined }) }
function visitCrumb(index: number) { void navigate({ path: index < 0 ? undefined : pathIds.value.slice(0, index + 1).join('/'), category: undefined, q: undefined, page: undefined }) }
function toggleFile(fileId: string) {
  selectedIds.value = selectedIds.value.includes(fileId) ? selectedIds.value.filter(id => id !== fileId) : [...selectedIds.value, fileId]
}
async function loadFiles() {
  const currentRequest = ++requestId
  controller?.abort()
  controller = new AbortController()
  loading.value = true
  error.value = ''
  selectedIds.value = []
  crumbs.value = []
  page.value = { list: [], totalCount: 0, pageNo: 1, pageSize: pageSize.value, pageTotal: 1 }
  try {
    const [result, breadcrumb] = await Promise.all([
      filesApi.list({ category: category.value, fileNameFuzzy: search.value || undefined,
        filePid: globalSearch.value ? undefined : currentPid.value, sortField: sortField.value,
        sortDirection: sortDirection.value, pageNo: pageNo.value, pageSize: pageSize.value }, controller.signal),
      path.value && !globalSearch.value ? filesApi.breadcrumbs(path.value, controller.signal) : Promise.resolve([]),
    ])
    if (currentRequest !== requestId) return
    page.value = result
    crumbs.value = breadcrumb
  } catch (reason) {
    if (currentRequest === requestId && !(reason instanceof Error && reason.name === 'AbortError')) error.value = errorMessage(reason)
  } finally { if (currentRequest === requestId) loading.value = false }
}
watch(() => route.fullPath, () => { previewFile.value = null; searchInput.value = search.value; void loadFiles() }, { immediate: true })
function refreshAfterUpload() { void loadFiles() }
window.addEventListener(FILES_CHANGED_EVENT, refreshAfterUpload)
onBeforeUnmount(() => { requestId++; controller?.abort(); window.removeEventListener(FILES_CHANGED_EVENT, refreshAfterUpload) })

async function openFolder(file: FileItem) {
  error.value = ''
  try {
    let ids = [...pathIds.value, file.fileId]
    if (globalSearch.value) {
      ids = [file.fileId]
      const visited = new Set(ids)
      let parentId = file.filePid
      while (parentId && parentId !== '0') {
        if (visited.has(parentId) || ids.length >= 100) throw new ApiError('目录路径异常，请刷新后重试', 600)
        visited.add(parentId)
        const parent = (await filesApi.breadcrumbs(parentId))[0]
        if (!parent) throw new ApiError('上级目录已不可用，请刷新后重试', 600)
        ids.unshift(parent.fileId)
        parentId = parent.filePid
      }
    }
    await navigate({ path: ids.join('/'), category: undefined, q: undefined, page: undefined })
  } catch (reason) { error.value = errorMessage(reason) }
}
function openModal(type: NonNullable<typeof modal.value>, files: FileItem[] = []) {
  targets.value = files
  nameInput.value = type === 'rename' ? files[0]?.fileName || '' : ''
  actionError.value = ''
  destination.value = { id: '0', name: '全部文件', valid: false }
  modal.value = type
}
function openShare(file: FileItem) {
  if (file.status !== 2) return
  modal.value = null
  previewFile.value = null
  shareFile.value = file
}
async function performAction() {
  if (busy.value || !modal.value) return
  actionError.value = ''
  if (modal.value === 'create' || modal.value === 'rename') {
    actionError.value = validateFileName(nameInput.value)
    if (actionError.value) return
  }
  if (modal.value === 'move' && !destination.value.valid) return
  busy.value = true
  try {
    if (modal.value === 'create') { await filesApi.createFolder(currentPid.value, nameInput.value.normalize('NFC')); notice.value = '文件夹已创建' }
    if (modal.value === 'rename') { await filesApi.rename(targets.value[0]!.fileId, nameInput.value.normalize('NFC')); notice.value = '名称已更新' }
    if (modal.value === 'delete') { await filesApi.recycle(targets.value.map(file => file.fileId)); notice.value = `已将 ${targets.value.length} 项移入回收站` }
    if (modal.value === 'move') { await filesApi.move(targets.value.map(file => file.fileId), destination.value.id); notice.value = `已移动到“${destination.value.name}”` }
    modal.value = null
    await loadFiles()
    void account.refreshSpace()
  } catch (reason) { actionError.value = errorMessage(reason) }
  finally { busy.value = false }
}
async function download(file: FileItem) {
  if (downloading.value || file.folderType === 1 || file.status !== 2) return
  downloading.value = true
  actionError.value = ''
  try {
    const code = await filesApi.downloadCode(file.fileId)
    const link = document.createElement('a')
    link.href = downloadUrl(code)
    link.download = file.fileName
    document.body.append(link)
    link.click()
    link.remove()
    notice.value = '已请求下载，请查看浏览器的下载列表'
  } catch (reason) { actionError.value = errorMessage(reason) }
  finally { downloading.value = false }
}
</script>

<template>
  <section class="drive-view">
    <div class="page-heading"><div><p class="eyebrow">YOUR PERSONAL CLOUD</p><h1>我的文件<span class="heading-period">.</span></h1><p class="page-description">留一处空间，给每一份重要。</p></div><div class="page-actions"><button class="secondary-button" :disabled="globalSearch || loading || Boolean(error)" :title="globalSearch ? '返回文件夹后新建' : '在当前文件夹新建'" @click="openModal('create')"><AppIcon name="plus" :size="17" /><span>新建文件夹</span></button><button class="primary-button" :disabled="globalSearch || loading || Boolean(error)" title="上传到当前文件夹" @click="router.push({ path: '/uploads', query: { pid: currentPid } })"><AppIcon name="upload" :size="17" /><span>上传文件</span></button></div></div>
    <div class="drive-filterbar"><nav class="category-tabs" aria-label="文件分类"><button v-for="item in categories" :key="item.value" :aria-current="category === item.value ? 'page' : undefined" @click="selectCategory(item.value)">{{ item.label }}</button></nav><form class="file-search" role="search" @submit.prevent="submitSearch"><AppIcon name="search" :size="17" /><input v-model="searchInput" aria-label="搜索全部文件" placeholder="搜索你的文件" maxlength="200" /><button v-if="search" class="icon-button search-clear" type="button" aria-label="清除搜索" @click="searchInput = ''; submitSearch()"><AppIcon name="close" :size="15" /></button><button class="search-submit" type="submit">搜索</button></form></div>
    <div v-if="notice" class="drive-notice" role="status"><AppIcon name="check" :size="16" /><span>{{ notice }}</span><button class="icon-button" aria-label="关闭提示" @click="notice = ''"><AppIcon name="close" :size="14" /></button></div>
    <p v-if="focusError" class="form-notice" role="status">{{ focusError }}</p>
    <section ref="fileSurface" class="file-surface live-file-surface" aria-label="文件列表" :aria-busy="loading">
      <div class="browse-toolbar"><nav class="folder-crumbs" aria-label="当前文件路径"><button :disabled="!path && !globalSearch" @click="visitCrumb(-1)">全部文件</button><template v-if="!globalSearch"><template v-for="(folder, index) in crumbs" :key="folder.fileId"><AppIcon name="chevron" :size="12" /><button :disabled="index === crumbs.length - 1" @click="visitCrumb(index)">{{ folder.fileName }}</button></template></template><span v-else class="search-scope">/ {{ search ? `搜索“${search}”` : categories.find(item => item.value === category)?.label }} · 所有目录</span></nav><div class="browse-tools"><button class="icon-button" aria-label="刷新文件列表" :disabled="loading" @click="loadFiles"><AppIcon name="refresh" :size="17" /></button><label class="sr-only" for="file-sort">排序方式</label><select id="file-sort" :value="sortField" @change="navigate({ sort: ($event.target as HTMLSelectElement).value, page: undefined })"><option v-for="option in sortOptions" :key="option.value" :value="option.value">{{ option.label }}</option></select><button class="sort-direction" :aria-label="sortDirection === 'asc' ? '当前升序，切换降序' : '当前降序，切换升序'" @click="navigate({ direction: sortDirection === 'asc' ? 'desc' : 'asc', page: undefined })">{{ sortDirection === 'asc' ? '↑' : '↓' }}</button><div class="view-toggle" role="group" aria-label="文件显示方式"><button :aria-pressed="layout === 'list'" aria-label="列表视图" @click="layout = 'list'"><AppIcon name="list" :size="17" /></button><button :aria-pressed="layout === 'grid'" aria-label="网格视图" @click="layout = 'grid'"><AppIcon name="grid" :size="16" /></button></div></div></div>
      <div v-show="selectedIds.length" class="selection-toolbar"><span>已选 {{ selectedIds.length }} 项</span><button v-if="selectedFiles.length === 1" :disabled="selectedFiles[0]?.status !== 2" @click="openModal('rename', selectedFiles)"><AppIcon name="edit" :size="16" />重命名</button><button v-if="selectedFiles.length === 1" :disabled="selectedFiles[0]?.status !== 2" @click="openShare(selectedFiles[0]!)"><AppIcon name="share" :size="16" />分享</button><button @click="openModal('move', selectedFiles)"><AppIcon name="move" :size="16" />移动</button><button @click="openModal('delete', selectedFiles)"><AppIcon name="trash" :size="16" />移入回收站</button><FileOperations :files="selectedFiles" :disabled="loading" @copied="notice = `已复制 ${$event.items.length} 项到“${$event.destination.name}”`" @download-started="notice = '已开始 ZIP 下载，请查看浏览器下载列表'" /><button class="selection-cancel" @click="selectedIds = []">取消选择</button></div>
      <div v-if="loading" class="files-state" role="status"><span class="loading-dot" /><h2>正在整理你的空间…</h2><p>读取文件列表</p></div>
      <div v-else-if="error" class="files-state"><AppIcon name="files" :size="36" /><h2>暂时无法显示文件</h2><p role="alert">{{ error }}</p><button class="secondary-button" @click="loadFiles">重新加载</button><button v-if="path || globalSearch" class="text-button" @click="visitCrumb(-1)">返回全部文件</button></div>
      <div v-else-if="!page.list.length" class="files-state empty-files"><span class="empty-folder-icon"><AppIcon :name="globalSearch ? 'search' : 'folder'" :size="40" /></span><p class="eyebrow">A LITTLE ROOM FOR WHAT’S NEXT</p><h2>{{ globalSearch ? '没有找到匹配的文件' : '这里，等着新的开始' }}</h2><p>{{ globalSearch ? '试试其他名称或分类。' : '从一个文件夹开始，让重要的事物井井有条。' }}</p><button v-if="!globalSearch" class="text-link" @click="openModal('create')">创建第一个文件夹<AppIcon name="arrow" :size="17" /></button><button v-else class="text-link" @click="visitCrumb(-1)">查看全部文件<AppIcon name="arrow" :size="17" /></button></div>
      <FileCollection v-else :items="page.list" :selected="selectedIds" :layout="layout" @select="toggleFile" @select-all="selectedIds = $event" @open="$event.folderType === 1 ? openFolder($event) : previewFile = $event" @detail="openModal('detail', [$event])" />
      <div v-if="!loading && !error" class="file-pagination"><span>共 {{ page.totalCount }} 项<span v-if="selectedIds.length"> · 已选 {{ selectedIds.length }} 项</span></span><div><label for="page-size">每页</label><select id="page-size" :value="pageSize" @change="navigate({ size: ($event.target as HTMLSelectElement).value, page: undefined })"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select><button class="icon-button" aria-label="上一页" :disabled="page.pageNo <= 1" @click="navigate({ page: page.pageNo - 1 })">‹</button><span>{{ page.pageNo }} / {{ Math.max(1, page.pageTotal) }}</span><button class="icon-button" aria-label="下一页" :disabled="page.pageNo >= page.pageTotal" @click="navigate({ page: page.pageNo + 1 })">›</button></div></div>
    </section>
    <p class="drive-footnote">{{ globalSearch ? '分类与搜索会查找所有目录中的文件。' : '点击文件打开预览；不支持的格式可下载后查看。' }}</p>
    <ShareCreateDialog v-if="shareFile" :file="shareFile" @close="shareFile = null" />
    <PreviewModal v-if="previewFile" :file="previewFile" @close="previewFile = null" />
    <ModalDialog v-if="modal" :key="modal" :title="dialogTitle" :busy="busy || downloading" @close="modal = null">
      <form v-if="modal === 'create' || modal === 'rename'" id="name-form" @submit.prevent="performAction"><div class="form-field"><label for="file-name">{{ modal === 'create' ? '文件夹名称' : '完整名称' }}</label><input id="file-name" v-model="nameInput" :disabled="busy" maxlength="200" autocomplete="off" :placeholder="modal === 'create' ? '给新文件夹起个名字' : ''" /><p v-if="modal === 'rename' && targets[0]?.folderType === 0" class="field-hint">请保留需要的扩展名。重命名不会转换文件格式。</p></div></form>
      <template v-else-if="modal === 'delete'"><p class="dialog-description">将 {{ targets.length }} 项移入回收站？文件会保留在回收站中，此操作不会立即永久删除。</p><ul class="target-list"><li v-for="file in targets.slice(0, 5)" :key="file.fileId"><AppIcon :name="fileIcon(file)" :size="17" /><span>{{ file.fileName }}</span></li><li v-if="targets.length > 5">以及另外 {{ targets.length - 5 }} 项</li></ul><p class="field-hint">可在侧栏“回收站”恢复内容，保留期限以服务器策略为准。</p></template>
      <div v-else-if="modal === 'move'" key="move-content"><p class="dialog-description">选择 {{ targets.length }} 项的新位置。同名文件会自动添加序号。</p><FolderPicker :excluded-ids="targetIds" :disabled="busy" @destination="destination = $event" /><p class="move-destination">目标：{{ destination.name }}</p></div>
      <template v-else-if="modal === 'detail' && targets[0]"><div class="file-detail-heading"><span class="file-symbol" :class="{ 'is-folder': targets[0].folderType === 1 }"><AppIcon :name="fileIcon(targets[0])" :size="34" /></span><h3>{{ targets[0].fileName }}</h3></div><dl class="file-details"><div><dt>类型</dt><dd>{{ fileKind(targets[0]) }}</dd></div><div><dt>大小</dt><dd>{{ targets[0].folderType === 1 || targets[0].fileSize === null ? '—' : formatBytes(targets[0].fileSize) }}</dd></div><div><dt>修改时间</dt><dd>{{ fileDate(targets[0].lastUpdateTime) }}</dd></div><div><dt>状态</dt><dd>{{ targets[0].status === 2 ? '可用' : targets[0].status === 0 ? '处理中' : '处理失败' }}</dd></div></dl><div class="detail-actions"><button v-if="targets[0].folderType === 0" class="primary-button" :disabled="downloading || targets[0].status !== 2" @click="download(targets[0])"><AppIcon name="download" :size="16" />{{ downloading ? '准备下载…' : '下载文件' }}</button><button class="secondary-button" :disabled="targets[0].status !== 2" @click="openShare(targets[0])"><AppIcon name="share" :size="16" />分享</button><button class="secondary-button" :disabled="targets[0].status !== 2" @click="openModal('rename', targets)"><AppIcon name="edit" :size="16" />重命名</button><button class="secondary-button" @click="openModal('move', targets)"><AppIcon name="move" :size="16" />移动</button><button class="secondary-button" @click="openModal('delete', targets)"><AppIcon name="trash" :size="16" />移入回收站</button></div></template>
      <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
      <template v-if="modal !== 'detail'" #footer><button class="secondary-button" :disabled="busy" @click="modal = null">取消</button><button class="primary-button" :class="{ 'danger-button': modal === 'delete' }" :disabled="busy || (modal === 'move' && !destination.valid)" @click="performAction">{{ busy ? '正在处理…' : modal === 'create' ? '创建' : modal === 'rename' ? '保存' : modal === 'delete' ? '移入回收站' : '移动到这里' }}</button></template>
    </ModalDialog>
  </section>
</template>
