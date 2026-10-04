<script setup lang="ts">
import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { errorMessage, useAccount } from '../composables/account'
import AppIcon from './AppIcon.vue'
import { avatarUrl } from '../features/settings/api'
const account = useAccount()
const router = useRouter()
const busy = ref(false)
const error = ref('')
const avatarFailed = ref(false)
const avatarRevision = ref(0)
watch(account.user, () => { avatarFailed.value = false; avatarRevision.value++ })
async function logout() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try { await account.logout(); await router.replace('/auth/login') }
  catch (reason) { error.value = errorMessage(reason) }
  finally { busy.value = false }
}
</script>

<template>
  <div v-if="account.user.value" class="account-badge"><RouterLink class="user-avatar" to="/settings" aria-label="个人资料"><img v-if="!avatarFailed" :src="avatarUrl(account.user.value.userId, String(avatarRevision))" alt="" @error="avatarFailed = true" /><span v-else aria-hidden="true">{{ Array.from(account.user.value.nickName)[0] || 'N' }}</span></RouterLink><span class="user-nickname" :title="account.user.value.nickName">{{ account.user.value.nickName }}</span><button class="icon-button logout-button" :disabled="busy" :aria-label="busy ? '正在退出' : '退出登录'" title="退出登录" @click="logout"><AppIcon name="logout" :size="18" /></button><p v-if="error" class="account-error" role="alert">{{ error }}</p></div>
</template>

<style scoped>
.user-avatar { overflow: hidden; color: inherit; text-decoration: none; }
.user-avatar img { width: 100%; height: 100%; object-fit: cover; }
</style>
