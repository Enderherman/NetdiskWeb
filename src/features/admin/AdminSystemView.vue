<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppIcon from '../../components/AppIcon.vue'
import { ApiError } from '../../api/client'
import { errorMessage } from '../../composables/account'
import AdminAccessNotice from './AdminAccessNotice.vue'
import AdminNavigation from './AdminNavigation.vue'
import { useAdminAccess } from './access'
import { adminApi, systemError } from './api'
import type { SystemSettings } from './types'
import './admin.css'

const { allowed, ready, message, actorId, prepare, isCurrent } = useAdminAccess()
const value = ref<SystemSettings | null>(null)
const quota = ref(''), title = ref(''), content = ref('')
const loading = ref(false), busy = ref(false), error = ref(''), actionError = ref(''), notice = ref('')
const preview = computed(() => content.value.split('%s').join('12345'))
let generation = 0, alive = true
let controller: AbortController | undefined
function apply(settings: SystemSettings) { value.value = settings; quota.value = String(settings.userInitUseSpace); title.value = settings.registerEmailTitle; content.value = settings.registerEmailContent }
async function load() {
  if (!allowed.value || busy.value) return
  const requestId = ++generation, actor = actorId.value
  controller?.abort(); controller = new AbortController(); loading.value = true; error.value = ''; actionError.value = ''; notice.value = ''; value.value = null
  try { const result = await adminApi.system(controller.signal); if (alive && requestId === generation && isCurrent(actor)) apply(result) }
  catch (reason) { if (alive && requestId === generation && isCurrent(actor) && !(reason instanceof Error && reason.name === 'AbortError')) error.value = errorMessage(reason) }
  finally { if (alive && requestId === generation) loading.value = false }
}
async function save() {
  if (!allowed.value || !value.value || busy.value || loading.value) return
  const submitted = { registerEmailTitle: title.value, registerEmailContent: content.value, userInitUseSpace: Number(quota.value) }
  actionError.value = systemError(submitted); notice.value = ''
  if (actionError.value) return
  const actor = actorId.value
  busy.value = true
  let accepted = false
  try {
    await adminApi.saveSystem(submitted); accepted = true
    if (!alive || !isCurrent(actor)) return
    const stored = await adminApi.system()
    if (!alive || !isCurrent(actor)) return
    apply(stored)
    if (stored.registerEmailTitle !== submitted.registerEmailTitle || stored.registerEmailContent !== submitted.registerEmailContent || stored.userInitUseSpace !== submitted.userInitUseSpace) {
      throw new ApiError('保存后设置已发生变化，请核对当前读取的内容', 0)
    }
    notice.value = '系统设置已保存并核对'
  } catch (reason) {
    if (alive && isCurrent(actor)) actionError.value = accepted && !(reason instanceof ApiError && reason.message.includes('已发生变化'))
      ? '保存已提交，但无法读取最新设置，请重新读取核对' : errorMessage(reason)
  } finally { if (alive) busy.value = false }
}
watch(actorId, () => { generation++; controller?.abort(); value.value = null }, { flush: 'sync' })
onMounted(async () => { if (await prepare() && alive) await load() })
onBeforeUnmount(() => { alive = false; generation++; controller?.abort() })
</script>

<template>
  <section class="admin-view">
    <div class="page-heading"><div><p class="eyebrow">SYSTEM PREFERENCES</p><h1>系统设置<span class="heading-period">.</span></h1><p class="page-description">设置新账户的初始容量与验证码邮件内容。</p></div><button v-if="allowed" class="secondary-button" :disabled="loading || busy" @click="load"><AppIcon name="refresh" :size="16" />重新读取设置</button></div>
    <AdminAccessNotice v-if="!allowed" :ready="ready" :message="message" />
    <template v-else><AdminNavigation /><div v-if="loading" class="admin-state" role="status">正在读取系统设置…</div><div v-else-if="error" class="admin-state"><p role="alert">{{ error }}</p><button class="secondary-button" @click="load">重试读取</button></div><template v-else-if="value"><p v-if="notice" class="form-notice success" role="status">{{ notice }}</p><form class="admin-system-form" @submit.prevent="save"><div class="admin-system-intro"><h2>初始存储空间</h2><p>为新注册账户分配初始容量。需要调整已有账户时，请前往用户管理。</p></div><div class="form-field"><label for="admin-initial-space">初始容量（MB）</label><input id="admin-initial-space" v-model="quota" type="number" min="1" max="1048576" step="1" :disabled="busy" /><p class="field-hint">1–1048576 MB，1 GB = 1024 MB</p></div><div class="admin-system-intro"><h2>验证码邮件</h2><p>正文必须包含字面占位符 <code>%s</code>，发送时会替换为验证码。每一处 <code>%s</code> 都会被替换。</p></div><div><div class="form-field"><label for="admin-email-title">邮件标题</label><input id="admin-email-title" v-model="title" maxlength="150" :disabled="busy" /><p class="field-hint">{{ title.length }} / 150</p></div><div class="form-field"><label for="admin-email-template">邮件正文</label><textarea id="admin-email-template" v-model="content" maxlength="5000" :disabled="busy" /><p class="field-hint">{{ content.length }} / 5000，须包含 %s</p></div><h3 class="admin-note">邮件预览（示例验证码 12345）</h3><div class="admin-template-preview"><strong>{{ title }}</strong>{{ preview }}</div></div><div /><div><p v-if="actionError" class="form-error" role="alert">{{ actionError }}</p><button class="primary-button" type="submit" :disabled="busy">{{ busy ? '正在保存并核对…' : '保存系统设置' }}</button></div></form></template></template>
  </section>
</template>
