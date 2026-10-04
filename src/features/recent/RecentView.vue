<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'
import { ApiError } from '../../api/client'
import { errorMessage, formatBytes, useAccount } from '../../composables/account'
import { fileDate, fileIcon, fileKind } from '../../composables/filePresentation'
import type { FileItem, FilePage } from '../../types/files'
import { locateRecentFile, recentApi } from './api'
import './recent.css'

const route = useRoute(), router = useRouter(), account = useAccount()
const pageNo = computed(() => { const value = Number(route.query.page || 1); return Number.isSafeInteger(value) && value > 0 ? value : 1 })
const pageSize = computed(() => { const value = Number(route.query.size || 20); return [20, 50, 100].includes(value) ? value : 20 })
const page = ref<FilePage>({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
const loading = ref(true), error = ref(''), locating = ref(''), locationError = ref('')
let controller: AbortController | undefined, locator: AbortController | undefined
let generation = 0, locationGeneration = 0, disposed = false
let timeout: ReturnType<typeof setTimeout> | undefined
function cancelLocation() { locationGeneration++; locator?.abort(); clearTimeout(timeout); locating.value = '' }
async function load() {
  const request = ++generation
  controller?.abort(); controller = new AbortController(); cancelLocation()
  loading.value = true; error.value = ''; locationError.value = ''
  const owner = account.user.value?.userId
  if (!owner) { loading.value = false; error.value = '请登录后查看最近文件'; return }
  try {
    const response = await recentApi.list(pageNo.value, pageSize.value, controller.signal)
    if (!disposed && request === generation && account.user.value?.userId === owner) page.value = response
  } catch (reason) {
    if (!disposed && request === generation && !(reason instanceof Error && reason.name === 'AbortError')) {
      page.value.list = []; error.value = errorMessage(reason)
    }
  } finally { if (!disposed && request === generation) loading.value = false }
}
async function locate(file: FileItem) {
  if (locating.value) return
  const owner = account.user.value?.userId
  if (!owner) return
  const request = ++locationGeneration
  locator = new AbortController(); const signal = locator.signal
  locating.value = file.fileId; locationError.value = ''
  timeout = setTimeout(() => locator?.abort(), 30_000)
  try {
    const location = await locateRecentFile(file, signal)
    if (!disposed && request === locationGeneration && !signal.aborted && account.user.value?.userId === owner) await router.push(location)
  } catch (reason) {
    if (!disposed && request === locationGeneration) locationError.value = signal.aborted
      ? '定位耗时较长，请稍后重试' : errorMessage(reason instanceof ApiError ? reason : new ApiError('无法定位文件，请刷新后重试', 0))
  } finally { if (!disposed && request === locationGeneration) { locating.value = ''; clearTimeout(timeout) } }
}
function navigate(pageValue: number, size = pageSize.value) { void router.push({ path: '/recent', query: { page: String(pageValue), size: String(size) } }) }
watch(() => [pageNo.value, pageSize.value], () => { void load() })
watch(() => account.user.value?.userId, () => { generation++; controller?.abort(); cancelLocation(); page.value.list = []; loading.value = false; error.value = '会话已变化，请重新读取最近文件' }, { flush: 'sync' })
onMounted(async () => { if (await account.ensureSession() && !disposed) await load(); else if (!disposed) { loading.value = false; error.value = '请登录后查看最近文件' } })
onBeforeUnmount(() => { disposed = true; generation++; controller?.abort(); cancelLocation() })
</script>

<template>
  <section class="recent-view"><div class="page-heading"><div><p class="eyebrow">RECENT UPDATES</p><h1>最近文件<span class="heading-period">.</span></h1><p class="page-description">按更新时间汇集所有目录中的文件。</p></div><button class="secondary-button" :disabled="loading" @click="load"><AppIcon name="refresh" :size="16" />刷新最近文件</button></div>
    <p v-if="locationError" class="form-error" role="alert">{{ locationError }}</p><div v-if="locating" class="recent-locating" role="status"><span class="loading-dot" />正在定位所在目录与分页…<button class="text-button" @click="cancelLocation">取消定位</button></div>
    <section class="file-surface" aria-label="最近更新的文件" :aria-busy="loading"><div v-if="loading" class="recent-state" role="status">正在读取最近文件…</div><div v-else-if="error" class="recent-state"><AppIcon name="clock" :size="36" /><h2>暂时无法显示最近文件</h2><p role="alert">{{ error }}</p><button class="secondary-button" @click="load">重新加载</button></div><div v-else-if="!page.list.length" class="recent-state"><AppIcon name="clock" :size="38" /><h2>还没有最近文件</h2><p>上传或更新文件后，它们会出现在这里。</p><RouterLink class="secondary-button" to="/drive">前往我的文件</RouterLink></div>
      <div v-else class="recent-table-wrap"><table class="recent-table"><thead><tr><th>文件</th><th>大小</th><th>更新时间</th><th><span class="sr-only">所在位置</span></th></tr></thead><tbody><tr v-for="file in page.list" :key="file.fileId"><td><button class="recent-name" :disabled="Boolean(locating)" :aria-label="`在目录中定位 ${file.fileName}`" @click="locate(file)"><AppIcon :name="fileIcon(file)" :size="23" /><span><strong>{{ file.fileName }}</strong><small>{{ fileKind(file) }}</small></span></button></td><td>{{ file.fileSize === null ? '—' : formatBytes(file.fileSize) }}</td><td>{{ fileDate(file.lastUpdateTime) }}</td><td><button class="recent-location-button" :disabled="Boolean(locating)" :aria-label="`打开 ${file.fileName} 所在位置`" @click="locate(file)">{{ locating === file.fileId ? '正在定位…' : '所在位置' }}<AppIcon name="arrow" :size="15" /></button></td></tr></tbody></table></div>
      <div v-if="!loading && !error" class="file-pagination"><span>共 {{ page.totalCount }} 个文件</span><div><label for="recent-page-size">每页</label><select id="recent-page-size" :value="pageSize" @change="navigate(1, Number(($event.target as HTMLSelectElement).value))"><option :value="20">20</option><option :value="50">50</option><option :value="100">100</option></select><button class="icon-button" aria-label="上一页最近文件" :disabled="page.pageNo <= 1" @click="navigate(page.pageNo - 1)">‹</button><span>{{ page.pageNo }} / {{ page.pageTotal }}</span><button class="icon-button" aria-label="下一页最近文件" :disabled="page.pageNo >= page.pageTotal" @click="navigate(page.pageNo + 1)">›</button></div></div>
    </section><p class="recent-note">点击文件所在位置，将打开原目录并定位到该文件。</p>
  </section>
</template>
