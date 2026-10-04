<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import FileCollection from '../../components/FileCollection.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { errorMessage, formatBytes, useAccount } from '../../composables/account'
import { fileDate, fileIcon, fileKind } from '../../composables/filePresentation'
import { recycleApi } from './api'
import { policySummary, recoveryLabel, retentionInfo } from './presentation'
import type { RecycleEntry, RecyclePage, RecyclePolicy } from './types'
import './recycle.css'

const account = useAccount()
const page = ref<RecyclePage>({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
const pageSize = ref(20)
const requestedPage = ref(1)
const loaded = ref(false)
const loading = ref(true)
const error = ref('')
const policy = ref<RecyclePolicy | null>(null)
const policyLoading = ref(true)
const policyError = ref('')
const selected = ref<string[]>([])
const allSelected = computed(() => page.value.list.length > 0 && selected.value.length === page.value.list.length)
const chosen = computed(() => page.value.list.filter(file => selected.value.includes(file.fileId)))
const notice = ref('')
const detail = ref<RecycleEntry | null>(null)
const operation = ref<'recover' | 'remove' | 'clear' | null>(null)
const targets = ref<RecycleEntry[]>([])
const acknowledged = ref(false)
const busy = ref(false)
const actionError = ref('')
const now = ref(Date.now())
const title = computed(() => operation.value === 'recover' ? '恢复所选内容' : operation.value === 'clear' ? '清空全部回收站' : '永久删除所选内容')
const canAct = computed(() => loaded.value && !loading.value && !error.value && !busy.value)
let generation = 0
let policyGeneration = 0
let actionGeneration = 0
let controller: AbortController | undefined
let policyController: AbortController | undefined
let clock: ReturnType<typeof setInterval> | undefined
let alive = true

async function load(pageNo = page.value.pageNo) {
  const current = ++generation
  controller?.abort(); controller = new AbortController()
  requestedPage.value = pageNo; loading.value = true; error.value = ''
  try {
    const result = await recycleApi.list(pageNo, pageSize.value, controller.signal)
    if (current !== generation) return
    page.value = result; selected.value = []; detail.value = null; loaded.value = true; now.value = Date.now()
  } catch (reason) {
    if (current === generation && !(reason instanceof Error && reason.name === 'AbortError')) error.value = errorMessage(reason)
  } finally { if (current === generation) loading.value = false }
}
async function loadPolicy() {
  const current = ++policyGeneration
  policyController?.abort(); policyController = new AbortController()
  policyLoading.value = true; policyError.value = ''; policy.value = null
  try {
    const result = await recycleApi.policy(policyController.signal)
    if (current === policyGeneration) policy.value = result
  } catch (reason) {
    if (current === policyGeneration && !(reason instanceof Error && reason.name === 'AbortError')) policyError.value = errorMessage(reason)
  } finally { if (current === policyGeneration) policyLoading.value = false }
}
function toggle(id: string) {
  if (!canAct.value || !page.value.list.some(file => file.fileId === id)) return
  selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id]
}
function showDetail(id: string) { detail.value = page.value.list.find(file => file.fileId === id) || null }
function open(kind: 'recover' | 'remove' | 'clear', files = chosen.value) {
  if (!canAct.value || (kind !== 'clear' && !files.length) || (kind === 'clear' && !page.value.totalCount)) return
  detail.value = null; targets.value = [...files]; actionError.value = ''; acknowledged.value = false; operation.value = kind
}
async function execute() {
  if (busy.value || !operation.value || (operation.value !== 'recover' && !acknowledged.value)) return
  const kind = operation.value, ids = targets.value.map(file => file.fileId), userId = account.user.value?.userId
  const actionId = ++actionGeneration
  busy.value = true; actionError.value = ''
  try {
    let message: string
    if (kind === 'recover') { await recycleApi.recover(ids); message = `已恢复 ${ids.length} 个选中条目，请在“我的文件”查看实际恢复位置` }
    else if (kind === 'remove') { await recycleApi.remove(ids); message = '已永久删除所选内容' }
    else {
      const result = await recycleApi.clear()
      message = result.deletedCount ? `已清空全部回收站，共移除 ${result.deletedCount} 项内容` : '回收站已为空'
    }
    if (!alive || actionId !== actionGeneration || account.user.value?.userId !== userId) return
    operation.value = null; targets.value = []; selected.value = []; notice.value = message
    void account.refreshSpace()
    void loadPolicy()
    await load(kind === 'clear' ? 1 : page.value.pageNo)
  } catch (reason) { if (alive && actionId === actionGeneration) actionError.value = errorMessage(reason) }
  finally { if (actionId === actionGeneration) busy.value = false }
}
function changePageSize(value: string) { if (![20, 50, 100].includes(Number(value))) return; pageSize.value = Number(value); void load(1) }
function refresh() { void load(); void loadPolicy() }
watch(() => account.user.value?.userId, () => {
  generation++; policyGeneration++; controller?.abort(); policyController?.abort()
  actionGeneration++; busy.value = false; loading.value = false; policyLoading.value = false
  selected.value = []; targets.value = []; operation.value = null; detail.value = null; notice.value = ''
  page.value = { list: [], totalCount: 0, pageNo: 1, pageSize: pageSize.value, pageTotal: 1 }; loaded.value = false
  policy.value = null; policyError.value = ''; error.value = ''
  if (account.user.value?.userId) { void load(1); void loadPolicy() }
}, { flush: 'sync' })
onMounted(() => { void load(); void loadPolicy(); clock = setInterval(() => { now.value = Date.now() }, 60_000) })
onBeforeUnmount(() => { alive = false; generation++; policyGeneration++; actionGeneration++; controller?.abort(); policyController?.abort(); if (clock) clearInterval(clock) })
</script>

<template>
  <section class="recycle-view">
    <div class="page-heading"><div><p class="eyebrow">A CHANCE TO BRING IT BACK</p><h1>回收站<span class="heading-period">.</span></h1><p class="page-description">需要的内容可以找回，确定不再需要时再永久删除。</p></div><div class="page-actions"><button class="secondary-button" :disabled="loading || policyLoading || busy" @click="refresh"><AppIcon name="refresh" :size="16" />刷新回收站</button><button class="secondary-button" :disabled="!canAct || !page.totalCount" @click="open('clear')"><AppIcon name="trash" :size="16" />清空全部回收站</button></div></div>
    <aside class="recycle-policy" aria-label="回收站保留策略"><AppIcon name="clock" :size="22" /><div><template v-if="policyLoading"><h2>正在读取保留策略…</h2></template><template v-else-if="policyError"><h2>暂时无法显示保留期限</h2><p role="alert">{{ policyError }}</p><p>请稍后重试。条目暂不显示自动清理时间。</p><button @click="loadPolicy">重新读取策略</button></template><template v-else-if="policy"><h2>{{ policySummary(policy) }}</h2><p>恢复时优先回到原目录；原目录不可用时回到“全部文件”。同名内容会自动添加序号。</p><p>回收和到期时间按北京时间显示。缺少有效回收时间时，不显示到期日。</p></template></div></aside>
    <p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
    <section class="file-surface live-file-surface" aria-label="回收站列表" :aria-busy="loading">
      <div class="browse-toolbar"><label class="recycle-page-select"><input type="checkbox" aria-label="选择当前页全部回收项" :checked="allSelected" :indeterminate="selected.length > 0 && !allSelected" :disabled="!canAct || !page.list.length" @change="selected = allSelected ? [] : page.list.map(file => file.fileId)" />选择当前页</label><span class="recycle-count">共 {{ loaded ? page.totalCount : '—' }} 项</span></div>
      <div v-if="selected.length" class="selection-toolbar"><span>已选当前页 {{ selected.length }} 项</span><button :disabled="!canAct" @click="open('recover')"><AppIcon name="refresh" :size="16" />恢复所选</button><button :disabled="!canAct" @click="open('remove')"><AppIcon name="trash" :size="16" />永久删除所选</button><button class="selection-cancel" :disabled="busy" @click="selected = []">取消选择</button></div>
      <div v-if="loading" class="recycle-state" role="status"><span class="loading-dot" /><p>正在读取回收站…</p></div>
      <div v-else-if="error" class="recycle-state"><AppIcon name="trash" :size="36" /><h2>暂时无法读取回收站</h2><p role="alert">{{ error }}</p><button class="secondary-button" @click="load(requestedPage)">重新加载</button></div>
      <div v-else-if="!loaded" class="recycle-state"><p>登录后查看回收站</p><RouterLink class="secondary-button" :to="{ path: '/auth/login', query: { redirect: '/recycle' } }">前往登录</RouterLink></div>
      <div v-else-if="!page.list.length" class="recycle-state"><AppIcon name="trash" :size="40" /><h2>{{ page.totalCount ? '这一页暂时没有回收项' : '回收站是空的' }}</h2><p>{{ page.totalCount ? '回收内容可能已变化，请刷新列表或返回第一页查看。' : '移入回收站的内容会出现在这里。保留期限以当前服务器策略为准。' }}</p><button v-if="page.totalCount" class="secondary-button" @click="load(1)">返回第一页</button><RouterLink v-else class="secondary-button" to="/drive">返回我的文件<AppIcon name="arrow" :size="16" /></RouterLink></div>
      <div v-else class="recycle-grid"><article v-for="file in page.list" :key="file.fileId" class="recycle-card-shell"><FileCollection :thumbnails="false" :items="[file]" :selected="selected" layout="grid" @select="toggle" @open="showDetail($event.fileId)" @detail="showDetail($event.fileId)" /><div class="recycle-entry-time"><p>回收时间：{{ recoveryLabel(file.recoveryTime) }}</p><p :class="{ overdue: retentionInfo(file.recoveryTime, policy, now).overdue }">{{ retentionInfo(file.recoveryTime, policy, now).text }}</p></div></article></div>
      <div v-if="!loading && !error && loaded" class="file-pagination"><span>仅选择当前页，不会隐含选择其他页面</span><div><label for="recycle-page-size">每页</label><select id="recycle-page-size" :value="pageSize" :disabled="busy" @change="changePageSize(($event.target as HTMLSelectElement).value)"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select><button class="icon-button" aria-label="上一页回收站" :disabled="busy || page.pageNo <= 1" @click="load(page.pageNo - 1)">‹</button><span>{{ page.pageNo }} / {{ Math.max(1, page.pageTotal) }}</span><button class="icon-button" aria-label="下一页回收站" :disabled="busy || page.pageNo >= page.pageTotal" @click="load(page.pageNo + 1)">›</button></div></div>
    </section>
    <p class="recycle-footnote">回收站中的内容需先恢复，再打开或下载。</p>
    <ModalDialog v-if="detail" title="回收项详情" @close="detail = null"><div class="file-detail-heading"><span class="file-symbol"><AppIcon :name="fileIcon(detail)" :size="32" /></span><h3>{{ detail.fileName }}</h3></div><dl class="file-details"><div><dt>类型</dt><dd>{{ fileKind(detail) }}</dd></div><div><dt>大小</dt><dd>{{ detail.folderType === 1 || detail.fileSize === null ? '—' : formatBytes(detail.fileSize) }}</dd></div><div><dt>原修改时间</dt><dd>{{ fileDate(detail.lastUpdateTime) }}</dd></div><div><dt>回收时间</dt><dd>{{ recoveryLabel(detail.recoveryTime) }}</dd></div><div><dt>保留情况</dt><dd>{{ retentionInfo(detail.recoveryTime, policy, now).text }}</dd></div></dl><p class="field-hint">时间按北京时间显示。恢复时优先回原目录，不可用时回到“全部文件”。</p><template #footer><button class="secondary-button" @click="open('remove', [detail])">永久删除</button><button class="primary-button" @click="open('recover', [detail])">恢复</button></template></ModalDialog>
    <ModalDialog v-if="operation" :title="title" :busy="busy" @close="operation = null">
      <template v-if="operation === 'recover'"><p class="dialog-description">恢复 {{ targets.length }} 个选中条目？原目录仍可用时优先恢复原目录，否则回到“全部文件”。名称冲突会自动添加序号。</p><p class="field-hint">同批选择父文件夹和其中独立回收的子项时，服务器会保留恢复后的层级。</p></template>
      <template v-else-if="operation === 'remove'"><p class="dialog-description">永久删除 {{ targets.length }} 个选中条目及其回收子树？删除后无法从回收站恢复。</p><p class="field-hint">只处理当前明确选中的内容，不会清空其他页面。</p></template>
      <template v-else><p class="dialog-description">这会清空当前账号的全部回收站，与当前页选择无关。</p><div class="recycle-scope"><strong>范围：所有页面、全部回收项及其回收子树</strong>列表共有 {{ page.totalCount }} 个回收项，包括当前未显示的页面。清空后无法从回收站恢复。</div></template>
      <ul v-if="operation !== 'clear'" class="target-list"><li v-for="file in targets.slice(0, 5)" :key="file.fileId"><AppIcon :name="fileIcon(file)" :size="16" />{{ file.fileName }}</li><li v-if="targets.length > 5">以及另外 {{ targets.length - 5 }} 项</li></ul>
      <label v-if="operation !== 'recover'" class="recycle-confirm"><input v-model="acknowledged" type="checkbox" :disabled="busy" />{{ operation === 'clear' ? '我确认清空当前账号全部回收站，而不仅是选中项或当前页' : '我了解永久删除后无法从回收站恢复' }}</label>
      <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p>
      <template #footer><button class="secondary-button" :disabled="busy" @click="operation = null">取消</button><button class="primary-button" :class="{ 'danger-button': operation !== 'recover' }" :disabled="busy || (operation !== 'recover' && !acknowledged)" @click="execute">{{ busy ? '正在处理…' : operation === 'recover' ? '确认恢复' : operation === 'clear' ? '确认清空全部回收站' : '确认永久删除' }}</button></template>
    </ModalDialog>
  </section>
</template>
