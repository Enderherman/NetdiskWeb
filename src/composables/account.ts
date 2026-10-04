import { computed, readonly, ref } from 'vue'
import { accountApi } from '../api/account'
import { ApiError } from '../api/client'
import type { LoginFields, SessionUser, UserSpace } from '../types/account'

const user = ref<SessionUser | null>(null)
const space = ref<UserSpace | null>(null)
const status = ref<'unknown' | 'authenticated' | 'anonymous' | 'error'>('unknown')
const sessionError = ref('')
const spaceError = ref('')
let pendingSession: Promise<boolean> | null = null
let sessionGeneration = 0

export function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : '操作未完成，请稍后重试'
}

async function refreshSpace() {
  const generation = sessionGeneration
  const userId = user.value?.userId
  if (!userId) return
  spaceError.value = ''
  try {
    const result = await accountApi.space()
    if (generation === sessionGeneration && user.value?.userId === userId) space.value = result
  } catch (error) {
    if (generation === sessionGeneration && user.value?.userId === userId) { space.value = null; spaceError.value = errorMessage(error) }
  }
}

function clearSession() {
  sessionGeneration++
  user.value = null
  space.value = null
  status.value = 'anonymous'
  sessionError.value = ''
  spaceError.value = ''
}

async function ensureSession(force = false): Promise<boolean> {
  if (!force && status.value === 'authenticated') return true
  if (!force && status.value === 'anonymous') return false
  if (pendingSession) return pendingSession
  const generation = sessionGeneration
  pendingSession = (async () => {
    try {
      const result = await accountApi.current()
      if (generation !== sessionGeneration) return false
      user.value = result
      status.value = 'authenticated'
      sessionError.value = ''
      void refreshSpace()
      return true
    } catch (error) {
      if (generation !== sessionGeneration) return false
      user.value = null
      space.value = null
      if (error instanceof ApiError && error.code === 901) clearSession()
      else { status.value = 'error'; sessionError.value = errorMessage(error) }
      return false
    } finally { pendingSession = null }
  })()
  return pendingSession
}

async function login(fields: LoginFields) {
  const generation = ++sessionGeneration
  const result = await accountApi.login(fields)
  if (generation !== sessionGeneration) throw new ApiError('会话已变化，请重新登录', 901)
  user.value = result
  status.value = 'authenticated'
  sessionError.value = ''
  void refreshSpace()
}

async function logout() {
  await accountApi.logout()
  clearSession()
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unit = Math.max(0, Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1))
  return `${(bytes / 1024 ** unit).toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function useAccount() {
  return {
    user: readonly(user), space: readonly(space), status: readonly(status),
    sessionError: readonly(sessionError), spaceError: readonly(spaceError),
    authenticated: computed(() => status.value === 'authenticated'),
    spacePercent: computed(() => space.value?.totalSpace ? Math.min(100, Math.max(0, space.value.useSpace / space.value.totalSpace * 100)) : 0),
    ensureSession, refreshSpace, login, logout, clearSession,
  }
}
