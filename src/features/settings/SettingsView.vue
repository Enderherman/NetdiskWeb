<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppIcon from '../../components/AppIcon.vue'
import { ApiError } from '../../api/client'
import { errorMessage, useAccount } from '../../composables/account'
import type { SessionUser } from '../../types/account'
import { avatarError, avatarUrl, nicknameError, passwordError, requireProfile, settingsApi } from './api'
import './settings.css'

const router = useRouter()
const account = useAccount()
const profile = ref<SessionUser | null>(null)
const loading = ref(true)
const loadError = ref('')
const nickName = ref('')
const nickError = ref('')
const imageError = ref('')
const secretError = ref('')
const notice = ref('')
const action = ref<'nickname' | 'avatar' | 'password' | ''>('')
const avatar = ref<File | null>(null)
const avatarInput = ref<HTMLInputElement>()
const avatarRevision = ref(String(Date.now()))
const currentPassword = ref('')
const password = ref('')
const confirmation = ref('')
const busy = computed(() => loading.value || Boolean(action.value))
let alive = true
let generation = 0
let avatarVersion = 0
function sameAccount(userId: string) { return alive && account.user.value?.userId === userId }

async function load() {
  if (action.value) return
  const requestId = ++generation
  loading.value = true; loadError.value = ''; notice.value = ''; profile.value = null
  try {
    if (!await account.ensureSession(true) || !account.user.value) throw new ApiError(account.sessionError.value || '无法读取账户资料，请重新登录', 901)
    if (!alive || requestId !== generation) return
    profile.value = requireProfile(account.user.value); nickName.value = profile.value.nickName
  } catch (reason) { if (alive && requestId === generation) loadError.value = errorMessage(reason) }
  finally { if (alive && requestId === generation) loading.value = false }
}

async function refreshAfterSave(userId: string) {
  if (!sameAccount(userId)) return false
  if (!await account.ensureSession(true) || !account.user.value || account.user.value.userId !== userId) {
    throw new ApiError('修改已提交，但最新账户资料未能读取，请刷新核对', 0)
  }
  if (!alive) return false
  profile.value = requireProfile(account.user.value)
  return true
}

async function saveNickname() {
  if (busy.value || !profile.value) return
  nickError.value = nicknameError(nickName.value); notice.value = ''
  if (nickError.value) return
  const userId = profile.value.userId
  action.value = 'nickname'
  try {
    const result = await settingsApi.updateNickname(nickName.value.trim())
    if (result.userId !== userId) throw new ApiError('返回账户不一致，请重新读取资料', 0)
    if (await refreshAfterSave(userId)) { nickName.value = result.nickName; notice.value = '昵称已更新' }
  } catch (reason) { if (alive) nickError.value = errorMessage(reason) }
  finally { if (alive) action.value = '' }
}

function chooseAvatar(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  notice.value = ''; avatar.value = null; imageError.value = ''
  if (!file) return
  imageError.value = avatarError(file)
  if (!imageError.value) avatar.value = file
}

async function saveAvatar() {
  if (busy.value || !profile.value || !avatar.value) return
  const userId = profile.value.userId
  action.value = 'avatar'; imageError.value = ''; notice.value = ''
  try {
    await settingsApi.uploadAvatar(avatar.value)
    if (await refreshAfterSave(userId)) {
      avatarRevision.value = `${Date.now()}-${++avatarVersion}`; avatar.value = null
      if (avatarInput.value) avatarInput.value.value = ''
      notice.value = '头像已更新'
    }
  } catch (reason) { if (alive) imageError.value = errorMessage(reason) }
  finally { if (alive) action.value = '' }
}

async function savePassword() {
  if (busy.value || !profile.value) return
  secretError.value = passwordError(currentPassword.value, password.value, confirmation.value); notice.value = ''
  if (secretError.value) return
  const userId = profile.value.userId
  action.value = 'password'
  try {
    await settingsApi.changePassword(currentPassword.value, password.value)
    if (!sameAccount(userId)) return
    currentPassword.value = ''; password.value = ''; confirmation.value = ''
    account.clearSession()
    await router.replace({ path: '/auth/login', query: { completed: 'reset' } })
  } catch (reason) { if (alive) secretError.value = errorMessage(reason) }
  finally { if (alive) action.value = '' }
}

onMounted(load)
onBeforeUnmount(() => { alive = false; generation++; currentPassword.value = ''; password.value = ''; confirmation.value = '' })
</script>

<template>
  <section class="account-settings-view">
    <div class="page-heading"><div><p class="eyebrow">YOUR ACCOUNT</p><h1>个人设置<span class="heading-period">.</span></h1><p class="page-description">管理自己的资料，让账户保持熟悉与安全。</p></div><button class="secondary-button" :disabled="busy" @click="load"><AppIcon name="refresh" :size="16" />重新读取资料</button></div>
    <div v-if="loading" class="settings-state" role="status">正在读取账户资料…</div>
    <div v-else-if="loadError" class="settings-state"><p class="form-error" role="alert">{{ loadError }}</p><button class="secondary-button" @click="load">重试读取</button></div>
    <template v-else-if="profile">
      <p v-if="notice" class="form-notice success" role="status">{{ notice }}</p>
      <section class="settings-block"><div class="settings-explanation"><h2>账户资料</h2><p>昵称会显示在账户栏和你创建的分享中。</p><dl class="settings-identity"><dt>用户 ID</dt><dd>{{ profile.userId }}</dd><dt>账户角色</dt><dd>{{ profile.isAdmin ? '管理员' : '用户' }}</dd></dl></div>
        <form class="settings-form" @submit.prevent="saveNickname"><div class="form-field"><label for="settings-nickname">昵称</label><input id="settings-nickname" v-model="nickName" autocomplete="nickname" maxlength="20" :disabled="busy" /><p class="field-hint">1–20 个字符</p></div><p v-if="nickError" class="form-error" role="alert">{{ nickError }}</p><button class="primary-button" :disabled="busy" type="submit">{{ action === 'nickname' ? '正在保存…' : '保存昵称' }}</button></form>
      </section>
      <section class="settings-block"><div class="settings-explanation"><h2>个人头像</h2><p>支持 JPEG、PNG、GIF、BMP，最多 2 MB，图片边长不超过 4096 像素。</p></div><div class="settings-form"><div class="settings-avatar-row"><img class="settings-avatar" :src="avatarUrl(profile.userId, avatarRevision)" alt="当前头像" /><div><label class="secondary-button settings-file-label" for="settings-avatar-file"><AppIcon name="image" :size="16" />选择图片</label><input id="settings-avatar-file" ref="avatarInput" class="settings-file-input" type="file" accept="image/jpeg,image/png,image/gif,image/bmp" :disabled="busy" @change="chooseAvatar" /><p class="field-hint">{{ avatar?.name || '选择后点击上传，当前头像才会更换。' }}</p></div></div><p v-if="imageError" class="form-error" role="alert">{{ imageError }}</p><button class="primary-button" :disabled="busy || !avatar" @click="saveAvatar">{{ action === 'avatar' ? '正在上传…' : '上传头像' }}</button></div></section>
      <section class="settings-block"><div class="settings-explanation"><h2>更改密码</h2><p>修改成功后，当前会话与其他已登录会话都会失效，需要用新密码重新登录。</p></div><form class="settings-form" @submit.prevent="savePassword"><div class="form-field"><label for="settings-current-password">当前密码</label><input id="settings-current-password" v-model="currentPassword" type="password" autocomplete="current-password" maxlength="64" :disabled="busy" /></div><div class="form-field"><label for="settings-new-password">新密码</label><input id="settings-new-password" v-model="password" type="password" autocomplete="new-password" maxlength="64" :disabled="busy" /><p class="field-hint">8–64 位，至少包含英文字母和数字</p></div><div class="form-field"><label for="settings-confirm-password">确认新密码</label><input id="settings-confirm-password" v-model="confirmation" type="password" autocomplete="new-password" maxlength="64" :disabled="busy" /></div><p v-if="secretError" class="form-error" role="alert">{{ secretError }}</p><button class="primary-button" :disabled="busy" type="submit">{{ action === 'password' ? '正在修改…' : '修改密码并重新登录' }}</button></form></section>
    </template>
  </section>
</template>
