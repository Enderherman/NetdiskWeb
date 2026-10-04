import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import AdminSystemView from './AdminSystemView.vue'
import { adminApi } from './api'
import { button, renderAdmin, systemSettings } from './__tests__/fixtures'

beforeEach(() => { vi.spyOn(adminApi, 'system').mockResolvedValue(systemSettings) })
describe('系统设置页面', () => {
  it('没有管理员角色时不发请求', async () => {
    const { body } = await renderAdmin(AdminSystemView, '/admin/system', false)
    expect(body.text()).toContain('需要管理员权限'); expect(adminApi.system).not.toHaveBeenCalled()
  })
  it('加载真实设置并以纯文本预览全部%s', async () => {
    vi.mocked(adminApi.system).mockResolvedValue({ ...systemSettings, registerEmailContent: '<b>%s</b> 再次 %s' })
    const { body } = await renderAdmin(AdminSystemView, '/admin/system')
    expect((body.get('#admin-initial-space').element as HTMLInputElement).value).toBe('2048')
    expect(body.get('.admin-template-preview').text()).toContain('<b>12345</b> 再次 12345')
    expect(body.get('.admin-template-preview').find('b').exists()).toBe(false)
  })
  it('缺少%s或容量越界不会保存，后端失败不显示成功', async () => {
    const save = vi.spyOn(adminApi, 'saveSystem').mockRejectedValue(new ApiError('Redis 写入失败', 500))
    const { body } = await renderAdmin(AdminSystemView, '/admin/system')
    await body.get('#admin-email-template').setValue('没有占位符 %S'); await body.get('form').trigger('submit')
    expect(save).not.toHaveBeenCalled(); expect(body.text()).toContain('须包含验证码占位符')
    await body.get('#admin-email-template').setValue('验证码 %s'); await body.get('#admin-initial-space').setValue('0'); await body.get('form').trigger('submit')
    expect(save).not.toHaveBeenCalled()
    await body.get('#admin-initial-space').setValue('4096'); await body.get('form').trigger('submit'); await flushPromises()
    expect(body.text()).toContain('Redis 写入失败'); expect(body.find('.form-notice.success').exists()).toBe(false)
  })
  it('成功保存后读回核对，正在保存不会重复提交', async () => {
    let finish!: (value: null) => void
    const save = vi.spyOn(adminApi, 'saveSystem').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { body } = await renderAdmin(AdminSystemView, '/admin/system')
    await body.get('#admin-initial-space').setValue('4096')
    vi.mocked(adminApi.system).mockResolvedValue({ ...systemSettings, userInitUseSpace: 4096 })
    await body.get('form').trigger('submit'); await body.get('form').trigger('submit')
    expect(save).toHaveBeenCalledTimes(1)
    finish(null); await flushPromises()
    expect(save).toHaveBeenCalledWith({ ...systemSettings, userInitUseSpace: 4096 })
    expect(body.get('[role="status"]').text()).toContain('已保存并核对')
  })
  it('保存已提交但读回失败明确提示核对，加载失败不给假默认', async () => {
    vi.mocked(adminApi.system).mockRejectedValueOnce(new ApiError('无法读取设置', 500))
    const { body } = await renderAdmin(AdminSystemView, '/admin/system')
    expect(body.find('form').exists()).toBe(false); expect(body.text()).toContain('无法读取设置')
    await button(body, '重试读取').trigger('click'); await flushPromises()
    vi.spyOn(adminApi, 'saveSystem').mockResolvedValue(null)
    vi.mocked(adminApi.system).mockRejectedValueOnce(new ApiError('读回失败', 500))
    await body.get('form').trigger('submit'); await flushPromises()
    expect(body.text()).toContain('保存已提交'); expect(body.find('.form-notice.success').exists()).toBe(false)
  })
})
