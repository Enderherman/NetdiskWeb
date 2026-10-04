<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { errorMessage, useAccount } from '../composables/account'
import AppIcon from './AppIcon.vue'
const account = useAccount()
const router = useRouter()
const busy = ref(false)
const error = ref('')
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
  <div v-if="account.user.value" class="account-badge"><span class="user-avatar" aria-hidden="true">{{ Array.from(account.user.value.nickName)[0] || 'N' }}</span><span class="user-nickname" :title="account.user.value.nickName">{{ account.user.value.nickName }}</span><button class="icon-button logout-button" :disabled="busy" :aria-label="busy ? '正在退出' : '退出登录'" title="退出登录" @click="logout"><AppIcon name="logout" :size="18" /></button><p v-if="error" class="account-error" role="alert">{{ error }}</p></div>
</template>
