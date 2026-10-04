<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { errorMessage } from '../../composables/account'
import { sharesApi } from './api'
import { copyShareText, shareExpired, shareExpiry, shareText, shareUrl } from './presentation'
import type { SharePage, ShareRecord } from './types'
import './shares.css'

const page = ref<SharePage>({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
const loading = ref(false)
const error = ref('')
const notice = ref('')
const selected = ref<string[]>([])
const cancelTargets = ref<ShareRecord[]>([])
const busy = ref(false)
const actionError = ref('')
const copyingId = ref('')
const manualCopy = ref<ShareRecord | null>(null)
const now = ref(Date.now())
const allSelected = computed(() => page.value.list.length > 0 && selected.value.length === page.value.list.length)
let generation = 0
let controller: AbortController | undefined
let clock: ReturnType<typeof setInterval> | undefined

async function load(pageNo = page.value.pageNo) {
  const current = ++generation
  controller?.abort(); controller = new AbortController()
  loading.value = true; error.value = ''; selected.value = []
  try {
    const result = await sharesApi.list(pageNo, 20, controller.signal)
    if (current === generation) { page.value = result; now.value = Date.now() }
  } catch (reason) {
    if (current === generation && !(reason instanceof Error && reason.name === 'AbortError')) {
      page.value.list = []; error.value = errorMessage(reason)
    }
  } finally { if (current === generation) loading.value = false }
}
function toggle(id: string) { selected.value = selected.value.includes(id) ? selected.value.filter(value => value !== id) : [...selected.value, id] }
function openCancel(records: ShareRecord[]) { if (busy.value) return; actionError.value = ''; cancelTargets.value = records }
async function cancel() {
  if (busy.value || !cancelTargets.value.length) return
  busy.value = true; actionError.value = ''
  const ids = cancelTargets.value.map(item => item.shareId)
  try {
    await sharesApi.cancel(ids)
    notice.value = `已取消 ${ids.length} 个分享`
    page.value.list = page.value.list.filter(item => !ids.includes(item.shareId))
    cancelTargets.value = []; selected.value = []
    await load()
  } catch (reason) { actionError.value = errorMessage(reason) }
  finally { busy.value = false }
}
async function copy(record: ShareRecord) {
  if (copyingId.value) return
  copyingId.value = record.shareId; actionError.value = ''; notice.value = ''
  try { await copyShareText(shareText(record)); notice.value = '链接和提取码已复制'; manualCopy.value = null }
  catch (reason) { actionError.value = errorMessage(reason); manualCopy.value = record }
  finally { copyingId.value = '' }
}
function inactive(record: ShareRecord) { return !record.fileName || shareExpired(record.expireTime, now.value) }
onMounted(() => { void load(); clock = setInterval(() => { now.value = Date.now() }, 30_000) })
onBeforeUnmount(() => { generation++; controller?.abort(); if (clock) clearInterval(clock) })
</script>

<template>
  <section class="share-view">
    <div class="page-heading"><div><p class="eyebrow">SHARED WITH OTHERS</p><h1>我的分享<span class="heading-period">.</span></h1><p class="page-description">让内容抵达需要的人，也把访问权留在自己手中。</p></div><button class="secondary-button" :disabled="loading" @click="load()"><AppIcon name="refresh" :size="16" />刷新列表</button></div>
    <p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
    <section class="file-surface" aria-label="分享列表" :aria-busy="loading">
      <div v-if="selected.length" class="selection-toolbar"><span>已选 {{ selected.length }} 个分享</span><button @click="openCancel(page.list.filter(item => selected.includes(item.shareId)))"><AppIcon name="trash" :size="16" />取消分享</button><button class="selection-cancel" @click="selected = []">取消选择</button></div>
      <div v-if="loading" class="share-state" role="status"><span class="loading-dot" /><p>正在读取分享记录…</p></div>
      <div v-else-if="error" class="share-state"><AppIcon name="share" :size="34" /><h2>暂时无法读取分享</h2><p role="alert">{{ error }}</p><button class="secondary-button" @click="load()">重新加载</button></div>
      <div v-else-if="!page.list.length" class="share-state"><AppIcon name="share" :size="38" /><h2>还没有分享记录</h2><p>在“我的文件”中选择一个文件或文件夹，即可创建分享链接。</p><RouterLink class="secondary-button" to="/drive">前往我的文件<AppIcon name="arrow" :size="16" /></RouterLink></div>
      <div v-else class="share-table-wrap"><table class="share-table"><thead><tr><th><input type="checkbox" aria-label="选择当前页全部分享" :checked="allSelected" :indeterminate="selected.length > 0 && !allSelected" @change="selected = allSelected ? [] : page.list.map(item => item.shareId)" /></th><th>分享内容</th><th>提取码</th><th>有效期</th><th class="share-count-column">浏览</th><th><span class="sr-only">操作</span></th></tr></thead><tbody>
        <tr v-for="record in page.list" :key="record.shareId"><td><input type="checkbox" :aria-label="`选择分享 ${record.fileName || record.shareId}`" :checked="selected.includes(record.shareId)" @change="toggle(record.shareId)" /></td><td><div class="share-name"><AppIcon :name="record.folderType === 1 ? 'folder' : 'files'" :size="22" /><div><a v-if="!inactive(record)" :href="shareUrl(record.shareId)" target="_blank" rel="noopener noreferrer"><strong>{{ record.fileName }}</strong></a><strong v-else>{{ record.fileName || '源文件已不可用' }}</strong><span class="share-row-meta share-created-column">创建于 {{ record.shareTime }}</span></div></div></td><td><code class="share-code">{{ record.code || '—' }}</code></td><td><span class="share-status" :class="{ inactive: inactive(record) }">{{ !record.fileName ? '源文件不可用' : shareExpired(record.expireTime, now) ? '已过期' : '有效' }}</span><span class="share-row-meta">{{ shareExpiry(record.expireTime) }}</span></td><td class="share-count-column">{{ record.showCount }}</td><td><div class="share-row-actions"><button :disabled="inactive(record) || Boolean(copyingId)" :aria-label="`复制 ${record.fileName || '分享'} 的链接`" @click="copy(record)">{{ copyingId === record.shareId ? '复制中…' : '复制链接' }}</button><button :aria-label="`取消 ${record.fileName || '分享'} 的分享`" @click="openCancel([record])">取消分享</button></div></td></tr>
      </tbody></table></div>
      <div v-if="!loading && !error && page.totalCount" class="file-pagination"><span>共 {{ page.totalCount }} 个分享</span><div><button class="icon-button" aria-label="上一页分享" :disabled="page.pageNo <= 1" @click="load(page.pageNo - 1)">‹</button><span>{{ page.pageNo }} / {{ page.pageTotal }}</span><button class="icon-button" aria-label="下一页分享" :disabled="page.pageNo >= page.pageTotal" @click="load(page.pageNo + 1)">›</button></div></div>
    </section>
    <ModalDialog v-if="cancelTargets.length" title="取消分享" :busy="busy" @close="cancelTargets = []"><p class="dialog-description">取消这 {{ cancelTargets.length }} 个分享？其他人将无法再通过这些链接访问文件，网盘中的原文件会保留。</p><ul class="target-list"><li v-for="record in cancelTargets.slice(0, 5)" :key="record.shareId">{{ record.fileName || record.shareId }}</li></ul><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p><template #footer><button class="secondary-button" :disabled="busy" @click="cancelTargets = []">保留分享</button><button class="primary-button danger-button" :disabled="busy" @click="cancel">{{ busy ? '正在取消…' : '确认取消分享' }}</button></template></ModalDialog>
    <ModalDialog v-if="manualCopy" title="分享链接" :busy="Boolean(copyingId)" @close="manualCopy = null"><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p><textarea class="share-copy-area" aria-label="手动复制分享链接和提取码" :value="shareText(manualCopy)" readonly @focus="($event.target as HTMLTextAreaElement).select()" /><template #footer><button class="secondary-button" @click="manualCopy = null">关闭</button><button class="primary-button" :disabled="Boolean(copyingId)" @click="copy(manualCopy)">再次复制</button></template></ModalDialog>
  </section>
</template>
