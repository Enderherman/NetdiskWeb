import type { Router } from 'vue-router'
import { useAccount } from '../composables/account'

export function safeReturnPath(value: unknown): string {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.startsWith('/auth') ? value : '/drive'
}

export function installAuthGuard(router: Router) {
  router.beforeEach(async (to) => {
    const account = useAccount()
    const authenticated = await account.ensureSession(to.meta.admin === true)
    if (to.meta.public) {
      if (authenticated && to.path.startsWith('/auth/')) return safeReturnPath(to.query.redirect)
      return true
    }
    if (!authenticated) return { path: '/auth/login', query: { redirect: to.fullPath } }
    if (to.meta.admin && !account.user.value?.isAdmin) return '/forbidden'
    return true
  })
}
