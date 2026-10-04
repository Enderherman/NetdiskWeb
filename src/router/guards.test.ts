import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { accountApi } from '../api/account'
import { useAccount } from '../composables/account'
import { installAuthGuard } from './guards'

beforeEach(() => {
  useAccount().clearSession()
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 0, totalSpace: 1024 })
})

describe('公共分享路由', () => {
  function router() {
    const instance = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/drive', component: {} },
      { path: '/shares', component: {} },
      { path: '/auth/login', component: {}, meta: { public: true } },
      { path: '/s/:shareId', component: {}, meta: { public: true } },
    ] })
    installAuthGuard(instance)
    return instance
  }
  it('游客可提取公共分享，管理页要求登录并保留回跳', async () => {
    const instance = router()
    await instance.push('/s/testShare?path=folderA&page=2')
    expect(instance.currentRoute.value.fullPath).toBe('/s/testShare?path=folderA&page=2')
    await instance.push('/shares')
    expect(instance.currentRoute.value.fullPath).toBe('/auth/login?redirect=/shares')
  })
  it('已登录用户保留分享目录，登录入口安全返回分享页', async () => {
    vi.spyOn(accountApi, 'login').mockResolvedValue({ userId: 'demo', nickName: '测试', isAdmin: false, avatar: null })
    await useAccount().login({ email: 'demo@netdisk.test', password: 'test-password', checkCode: 'abcde' })
    const instance = router()
    await instance.push('/s/testShare?path=folderA&page=2')
    expect(instance.currentRoute.value.fullPath).toBe('/s/testShare?path=folderA&page=2')
    await instance.push({ path: '/auth/login', query: { redirect: '/s/testShare?path=folderA' } })
    expect(instance.currentRoute.value.fullPath).toBe('/s/testShare?path=folderA')
  })
})
