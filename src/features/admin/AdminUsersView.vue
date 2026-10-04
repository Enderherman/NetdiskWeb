<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'
import ModalDialog from '../../components/ModalDialog.vue'
import { errorMessage, formatBytes } from '../../composables/account'
import { fileDate } from '../../composables/filePresentation'
import AdminAccessNotice from './AdminAccessNotice.vue'
import AdminNavigation from './AdminNavigation.vue'
import { useAdminAccess } from './access'
import { adminApi, quotaError } from './api'
import { emptyPage } from './types'
import type { AdminUser, UserFilters } from './types'
import './admin.css'

const router = useRouter()
const { account, allowed, ready, message, actorId, prepare, isCurrent } = useAdminAccess()
const page = ref(emptyPage<AdminUser>())
const userId = ref(''), nickName = ref(''), email = ref(''), status = ref('')
const activeFilters = ref<Omit<UserFilters, 'pageNo' | 'pageSize'>>({})
const loading = ref(false), error = ref(''), filterError = ref(''), notice = ref('')
const target = ref<AdminUser | null>(null)
const modal = ref<'status' | 'quota' | null>(null)
const busy = ref(false), actionError = ref('')
const amount = ref(''), direction = ref<'add' | 'subtract'>('add')
const projected = computed(() => target.value && !quotaError(target.value, amount.value, direction.value)
  ? formatBytes(target.value.totalSpace + Number(amount.value) * 1024 ** 2 * (direction.value === 'add' ? 1 : -1)) : '—')
let generation = 0, alive = true
let controller: AbortController | undefined

async function load(pageNo = page.value.pageNo) {
  if (!allowed.value) return
  const requestId = ++generation, actor = actorId.value
  controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''
  try {
    const response = await adminApi.users({ ...activeFilters.value, pageNo, pageSize: 20 }, controller.signal)
    if (alive && requestId === generation && isCurrent(actor)) page.value = response
  } catch (reason) {
    if (alive && requestId === generation && isCurrent(actor) && !(reason instanceof Error && reason.name === 'AbortError')) {
      page.value = emptyPage(); error.value = errorMessage(reason)
    }
  } finally { if (alive && requestId === generation) loading.value = false }
}
function filter() {
  if (loading.value || busy.value) return
  filterError.value = ''
  if (userId.value.trim().length > 15 || nickName.value.trim().length > 20 || email.value.trim().length > 150) { filterError.value = '用户 ID 最长 15 字，昵称最长 20 字，邮箱最长 150 字'; return }
  activeFilters.value = { userId: userId.value.trim() || undefined, nickNameFuzzy: nickName.value.trim() || undefined,
    emailFuzzy: email.value.trim() || undefined, status: status.value === '' ? undefined : Number(status.value) as 0 | 1 }
  void load(1)
}
function open(value: AdminUser, kind: 'status' | 'quota') { target.value = value; modal.value = kind; actionError.value = ''; notice.value = ''; amount.value = ''; direction.value = 'add' }
async function confirm() {
  if (busy.value || !target.value || !modal.value || !allowed.value) return
  const user = target.value, kind = modal.value, actor = actorId.value
  actionError.value = kind === 'quota' ? quotaError(user, amount.value, direction.value) : ''
  if (actionError.value) return
  busy.value = true; notice.value = ''
  try {
    if (kind === 'status') {
      const next = user.status === 1 ? 0 : 1
      await adminApi.changeStatus(user.userId, next)
      if (!alive || !isCurrent(actor)) return
      if (user.userId === account.user.value?.userId && next === 0) { account.clearSession(); await router.replace('/auth/login'); return }
      notice.value = `已${next === 1 ? '启用' : '禁用'}用户 ${user.nickName || user.userId}`
    } else {
      await adminApi.changeSpace(user.userId, Number(amount.value) * (direction.value === 'add' ? 1 : -1))
      if (!alive || !isCurrent(actor)) return
      notice.value = '容量调整已保存'
      if (user.userId === account.user.value?.userId) void account.refreshSpace()
    }
    modal.value = null; target.value = null; await load()
  } catch (reason) { if (alive && isCurrent(actor)) actionError.value = errorMessage(reason) }
  finally { if (alive) busy.value = false }
}
watch(actorId, () => { generation++; controller?.abort(); page.value = emptyPage(); modal.value = null; target.value = null }, { flush: 'sync' })
onMounted(async () => { if (await prepare() && alive) await load(1) })
onBeforeUnmount(() => { alive = false; generation++; controller?.abort() })
</script>

<template>
  <section class="admin-view">
    <div class="page-heading"><div><p class="eyebrow">ADMINISTRATION</p><h1>用户管理<span class="heading-period">.</span></h1><p class="page-description">查找账户，管理访问状态与存储额度。</p></div><button v-if="allowed" class="secondary-button" :disabled="loading || busy" @click="load()"><AppIcon name="refresh" :size="16" />刷新列表</button></div>
    <AdminAccessNotice v-if="!allowed" :ready="ready" :message="message" />
    <template v-else>
      <AdminNavigation />
      <form class="admin-filters" @submit.prevent="filter"><div class="form-field"><label for="admin-user-id">用户 ID</label><input id="admin-user-id" v-model="userId" maxlength="15" :disabled="busy" /></div><div class="form-field"><label for="admin-user-nickname">昵称包含</label><input id="admin-user-nickname" v-model="nickName" maxlength="20" :disabled="busy" /></div><div class="form-field"><label for="admin-user-email">邮箱包含</label><input id="admin-user-email" v-model="email" maxlength="150" :disabled="busy" /></div><div class="form-field short"><label for="admin-user-status">账户状态</label><select id="admin-user-status" v-model="status" :disabled="busy"><option value="">全部</option><option value="1">正常</option><option value="0">禁用</option></select></div><button class="primary-button" :disabled="loading || busy" type="submit">筛选用户</button></form>
      <p v-if="filterError" class="form-error" role="alert">{{ filterError }}</p><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
      <section class="file-surface" aria-label="用户列表" :aria-busy="loading"><div v-if="loading" class="admin-state" role="status">正在读取用户…</div><div v-else-if="error" class="admin-state"><p role="alert">{{ error }}</p><button class="secondary-button" @click="load()">重新加载</button></div><div v-else-if="!page.list.length" class="admin-state"><h2>没有匹配的用户</h2><p>调整筛选条件后再试。</p></div><div v-else class="admin-table-wrap"><table class="admin-table"><thead><tr><th>用户</th><th>邮箱</th><th>状态</th><th>已用 / 总空间</th><th class="admin-date-column">最近登录</th><th>操作</th></tr></thead><tbody><tr v-for="user in page.list" :key="user.userId"><td><strong>{{ user.nickName || user.userId }}</strong><small>{{ user.userId }}</small></td><td>{{ user.email || '—' }}</td><td><span class="admin-status" :class="{ active: user.status === 1 }">{{ user.status === 1 ? '正常' : '禁用' }}</span></td><td>{{ formatBytes(user.useSpace) }}<small>/ {{ formatBytes(user.totalSpace) }}</small></td><td class="admin-date-column">{{ fileDate(user.lastLoginTime) }}</td><td><div class="admin-user-actions"><button :aria-label="`调整 ${user.userId} 的容量`" @click="open(user, 'quota')">调整容量</button><button :aria-label="`${user.status === 1 ? '禁用' : '启用'} ${user.userId}`" @click="open(user, 'status')">{{ user.status === 1 ? '禁用' : '启用' }}</button><RouterLink :to="{ path: '/admin/files', query: { userId: user.userId } }">查看文件</RouterLink></div></td></tr></tbody></table></div><div v-if="!loading && !error && page.totalCount" class="file-pagination"><span>共 {{ page.totalCount }} 位用户</span><div><button class="icon-button" aria-label="上一页用户" :disabled="page.pageNo <= 1" @click="load(page.pageNo - 1)">‹</button><span>{{ page.pageNo }} / {{ page.pageTotal }}</span><button class="icon-button" aria-label="下一页用户" :disabled="page.pageNo >= page.pageTotal" @click="load(page.pageNo + 1)">›</button></div></div></section>
      <ModalDialog v-if="target && modal" :title="modal === 'quota' ? '调整用户容量' : target.status === 1 ? '禁用用户' : '启用用户'" :busy="busy" @close="modal = null; target = null">
        <p class="dialog-description">{{ target.nickName || target.userId }} · {{ target.userId }}</p>
        <template v-if="modal === 'quota'"><dl class="admin-detail-grid"><div><dt>当前已用</dt><dd>{{ formatBytes(target.useSpace) }}（含回收站）</dd></div><div><dt>当前总容量</dt><dd>{{ formatBytes(target.totalSpace) }}</dd></div></dl><label class="field-hint" for="admin-quota-amount">调整容量（1 GB = 1024 MB）</label><div class="admin-quota-row"><select v-model="direction" aria-label="容量调整方向" :disabled="busy"><option value="add">增加</option><option value="subtract">减少</option></select><input id="admin-quota-amount" v-model="amount" type="number" min="1" max="2147483647" step="1" placeholder="整数 MB" :disabled="busy" /></div><p class="field-hint">调整后总容量：{{ projected }}</p><p class="admin-note">调整后的容量不能小于文件、回收站及上传中的实际占用。保存时会按最新用量再次核对。</p></template>
        <p v-else class="admin-note">{{ target.status === 1 ? '禁用后，该用户已登录会话将失效，无法继续访问网盘；已保存的文件会保留。' : '启用后，该用户可以重新登录并访问网盘。' }}<strong v-if="target.userId === account.user.value?.userId && target.status === 1">这是当前登录账户，确认后将立即退出。</strong></p>
        <p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p><template #footer><button class="secondary-button" :disabled="busy" @click="modal = null; target = null">取消</button><button class="primary-button" :class="{ 'danger-button': modal === 'status' && target.status === 1 }" :disabled="busy" @click="confirm">{{ busy ? '正在保存…' : modal === 'quota' ? '确认调整' : target.status === 1 ? '确认禁用' : '确认启用' }}</button></template>
      </ModalDialog>
    </template>
  </section>
</template>
