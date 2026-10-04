import { computed, ref } from 'vue'
import { useAccount } from '../../composables/account'

export function useAdminAccess() {
  const account = useAccount()
  const ready = ref(false)
  const message = ref('')
  const allowed = computed(() => ready.value && account.authenticated.value && account.user.value?.isAdmin === true)
  const actorId = computed(() => `${account.user.value?.userId || ''}:${account.user.value?.isAdmin === true}`)
  async function prepare() {
    const authenticated = await account.ensureSession()
    ready.value = true
    message.value = authenticated ? '此页面需要管理员权限。' : account.sessionError.value || '请先登录管理员账户。'
    return allowed.value
  }
  function isCurrent(actor: string) { return allowed.value && actorId.value === actor }
  return { account, ready, message, allowed, actorId, prepare, isCurrent }
}
