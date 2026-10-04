import { beforeEach, describe, expect, it, vi } from 'vitest'
import { accountApi } from '../api/account'
import { ApiError } from '../api/client'
import { formatBytes, useAccount } from './account'
import { createMemoryHistory, createRouter } from 'vue-router'
import { installAuthGuard, safeReturnPath } from '../router/guards'

const fixture = { userId: 'user-test', nickName: '测试', isAdmin: false, avatar: null }
beforeEach(() => { useAccount().clearSession(); vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 100, totalSpace: 1000 }) })

describe('会话与路由守卫', () => {
  it('恢复现有会话，容量请求失败不抹掉登录状态', async () => {
    vi.spyOn(accountApi, 'current').mockResolvedValue(fixture)
    vi.mocked(accountApi.space).mockRejectedValue(new ApiError('空间暂不可用', 500))
    const account = useAccount()
    expect(await account.ensureSession(true)).toBe(true)
    await Promise.resolve()
    expect(account.user.value).toEqual(fixture)
    expect(account.space.value).toBeNull()
    expect(account.spaceError.value).toBe('空间暂不可用')
  })
  it('会话超时清空用户和容量，网络错误保持明确的错误状态', async () => {
    vi.spyOn(accountApi, 'current').mockRejectedValue(new ApiError('登录已过期', 901))
    const account = useAccount()
    expect(await account.ensureSession(true)).toBe(false)
    expect(account.status.value).toBe('anonymous')
    vi.mocked(accountApi.current).mockRejectedValue(new ApiError('网络不可用', 0))
    expect(await account.ensureSession(true)).toBe(false)
    expect(account.status.value).toBe('error')
    expect(account.sessionError.value).toBe('网络不可用')
  })
  it('退出失败保留会话，退出成功才清除身份', async () => {
    vi.spyOn(accountApi, 'login').mockResolvedValue(fixture)
    const logout = vi.spyOn(accountApi, 'logout').mockRejectedValueOnce(new ApiError('网络断开', 0)).mockResolvedValueOnce(null)
    const account = useAccount()
    await account.login({ email: 'test@example.com', password: 'test1234', checkCode: 'abcde' })
    await expect(account.logout()).rejects.toThrow('网络断开')
    expect(account.authenticated.value).toBe(true)
    await account.logout()
    expect(logout).toHaveBeenCalledTimes(2)
    expect(account.user.value).toBeNull()
    expect(account.space.value).toBeNull()
  })
  it('退出后到达的旧容量响应不会重新填入会话', async () => {
    let finish!: (space: { useSpace: number; totalSpace: number }) => void
    vi.mocked(accountApi.space).mockImplementation(() => new Promise(resolve => { finish = resolve }))
    vi.spyOn(accountApi, 'login').mockResolvedValue(fixture)
    vi.spyOn(accountApi, 'logout').mockResolvedValue(null)
    const account = useAccount()
    await account.login({ email: 'test@example.com', password: 'test1234', checkCode: 'abcde' })
    await account.logout()
    finish({ useSpace: 1024, totalSpace: 2048 })
    await Promise.resolve()
    expect(account.space.value).toBeNull()
    expect(account.authenticated.value).toBe(false)
  })
  it('匿名访问受保护页面转入登录，携带内部返回地址', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [
      { path: '/drive', component: {} },
      { path: '/auth/login', component: {}, meta: { public: true } },
    ] })
    installAuthGuard(router)
    await router.push('/drive')
    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(router.currentRoute.value.query.redirect).toBe('/drive')
  })
  it('拒绝外部和反斜杠返回地址，容量边界不显示虚假值', () => {
    for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/login', null]) expect(safeReturnPath(value)).toBe('/drive')
    expect(safeReturnPath('/appearance')).toBe('/appearance')
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(-1)).toBe('—')
  })
})
