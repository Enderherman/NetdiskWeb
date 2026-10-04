import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { useAccount } from '../../composables/account'
import AdminUsersView from './AdminUsersView.vue'
import { adminApi } from './api'
import { adminSession, button, page, renderAdmin, userRecord } from './__tests__/fixtures'

beforeEach(() => { vi.spyOn(adminApi, 'users').mockResolvedValue(page([userRecord])) })

describe('用户管理页面', () => {
  it('普通账户不读取管理数据', async () => {
    const { body } = await renderAdmin(AdminUsersView, '/admin/users', false)
    expect(body.text()).toContain('需要管理员权限'); expect(adminApi.users).not.toHaveBeenCalled()
  })
  it('显示真实公开资料，筛选和分页保留请求参数', async () => {
    vi.mocked(adminApi.users).mockResolvedValueOnce({ ...page([userRecord]), totalCount: 21, pageTotal: 2 })
      .mockResolvedValueOnce({ ...page([userRecord]), pageNo: 2, totalCount: 21, pageTotal: 2 })
    const { body } = await renderAdmin(AdminUsersView, '/admin/users')
    expect(body.get('.admin-table').text()).toContain('真实用户'); expect(body.text()).toContain('alice@example.test')
    await body.get('[aria-label="下一页用户"]').trigger('click'); await flushPromises()
    expect(adminApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ pageNo: 2, pageSize: 20 }), expect.any(AbortSignal))
    await body.get('#admin-user-nickname').setValue('真实'); await body.get('#admin-user-email').setValue('example'); await body.get('#admin-user-status').setValue('0')
    await body.get('form').trigger('submit'); await flushPromises()
    expect(adminApi.users).toHaveBeenLastCalledWith(expect.objectContaining({ pageNo: 1, nickNameFuzzy: '真实', emailFuzzy: 'example', status: 0 }), expect.any(AbortSignal))
  })
  it('禁用先确认，失败保留对话框，成功才刷新状态', async () => {
    const save = vi.spyOn(adminApi, 'changeStatus').mockRejectedValueOnce(new ApiError('无法禁用', 500)).mockResolvedValueOnce(null)
    const { body } = await renderAdmin(AdminUsersView, '/admin/users')
    await body.get('[aria-label="禁用 alice"]').trigger('click'); expect(save).not.toHaveBeenCalled()
    expect(body.get('[role="dialog"]').text()).toContain('会话将失效')
    await button(body, '确认禁用').trigger('click'); await flushPromises()
    expect(body.text()).toContain('无法禁用'); expect(body.find('.form-notice.success').exists()).toBe(false)
    vi.mocked(adminApi.users).mockResolvedValue(page([{ ...userRecord, status: 0 }]))
    await button(body, '确认禁用').trigger('click'); await flushPromises()
    expect(save).toHaveBeenLastCalledWith('alice', 0); expect(body.find('[role="dialog"]').exists()).toBe(false)
    expect(body.get('.admin-table .admin-status').text()).toBe('禁用')
  })
  it('容量显示真实用量，拒绝无效缩容并展示服务器的上传占用限制', async () => {
    const save = vi.spyOn(adminApi, 'changeSpace').mockRejectedValueOnce(new ApiError('调整后的容量不能小于上传中空间', 600)).mockResolvedValueOnce(null)
    const { body } = await renderAdmin(AdminUsersView, '/admin/users')
    await body.get('[aria-label="调整 alice 的容量"]').trigger('click')
    expect(body.get('[role="dialog"]').text()).toContain('20.0 MB'); expect(body.get('[role="dialog"]').text()).toContain('100.0 MB')
    await body.get('[aria-label="容量调整方向"]').setValue('subtract'); await body.get('#admin-quota-amount').setValue('90')
    await button(body, '确认调整').trigger('click'); expect(save).not.toHaveBeenCalled()
    expect(body.text()).toContain('不能小于当前已用空间')
    await body.get('#admin-quota-amount').setValue('50'); await button(body, '确认调整').trigger('click'); await flushPromises()
    expect(body.text()).toContain('不能小于上传中空间'); expect(body.find('.form-notice.success').exists()).toBe(false)
    vi.mocked(adminApi.users).mockResolvedValue(page([{ ...userRecord, totalSpace: 50 * 1024 ** 2 }]))
    await button(body, '确认调整').trigger('click'); await flushPromises()
    expect(save).toHaveBeenLastCalledWith('alice', -50); expect(body.get('.admin-table').text()).toContain('50.0 MB')
  })
  it('禁用当前管理员会清会话并跳登录', async () => {
    vi.mocked(adminApi.users).mockResolvedValue(page([{ ...userRecord, userId: adminSession.userId }]))
    vi.spyOn(adminApi, 'changeStatus').mockResolvedValue(null)
    const { body, router } = await renderAdmin(AdminUsersView, '/admin/users')
    await body.get('[aria-label="禁用 operator"]').trigger('click'); expect(body.text()).toContain('当前登录账户')
    await button(body, '确认禁用').trigger('click'); await flushPromises()
    expect(useAccount().user.value).toBeNull(); expect(router.currentRoute.value.path).toBe('/auth/login')
  })
  it('加载失败可以重试，退出后到达的列表不会显示', async () => {
    vi.mocked(adminApi.users).mockRejectedValueOnce(new ApiError('列表读取失败', 500))
    const { body } = await renderAdmin(AdminUsersView, '/admin/users')
    expect(body.text()).toContain('列表读取失败'); expect(body.find('.admin-table').exists()).toBe(false)
    let finish!: (value: ReturnType<typeof page<typeof userRecord>>) => void
    vi.mocked(adminApi.users).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await button(body, '重新加载').trigger('click'); useAccount().clearSession()
    finish(page([userRecord])); await flushPromises()
    expect(body.text()).not.toContain('真实用户'); expect(body.find('.admin-table').exists()).toBe(false)
  })
})
