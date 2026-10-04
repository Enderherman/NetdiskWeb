import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { accountApi } from '../../api/account'
import { ApiError } from '../../api/client'
import { useAccount } from '../../composables/account'
import { settingsApi } from './api'
import SettingsView from './SettingsView.vue'

const user = { userId: 'alice', nickName: '原昵称', isAdmin: false, avatar: null }
beforeEach(() => {
  useAccount().clearSession()
  vi.spyOn(accountApi, 'current').mockResolvedValue({ ...user })
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 10, totalSpace: 100 })
})
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/settings', component: SettingsView }, { path: '/auth/login', component: { template: '<p>请重新登录</p>' } },
  ] })
  await router.push('/settings')
  mount({ template: '<RouterView />' }, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return { body: new DOMWrapper(document.body), router }
}
function button(body: DOMWrapper<Element>, text: string) { return body.findAll('button').find(item => item.text() === text)! }

describe('个人设置', () => {
  it('读取真实昵称、用户ID和头像，不补造邮箱', async () => {
    const { body } = await render()
    expect((body.get('#settings-nickname').element as HTMLInputElement).value).toBe('原昵称')
    expect(body.text()).toContain('alice')
    expect(body.get('img[alt="当前头像"]').attributes('src')).toContain('/api/getAvatar/alice')
    expect(body.find('input[type="email"]').exists()).toBe(false)
    expect(body.text()).not.toContain('@')
  })
  it('读取失败不显示假资料，并允许重试', async () => {
    vi.mocked(accountApi.current).mockRejectedValueOnce(new ApiError('读取失败', 500))
    const { body } = await render()
    expect(body.get('[role="alert"]').text()).toBe('读取失败')
    expect(body.find('#settings-nickname').exists()).toBe(false)
    await button(body, '重试读取').trigger('click'); await flushPromises()
    expect(body.find('#settings-nickname').exists()).toBe(true)
  })
  it('不完整的成功响应不显示虚构账户或请求undefined头像', async () => {
    vi.mocked(accountApi.current).mockResolvedValueOnce({} as typeof user)
    const { body } = await render()
    expect(body.text()).toContain('账户资料响应异常')
    expect(body.find('#settings-nickname').exists()).toBe(false); expect(body.find('img').exists()).toBe(false)
  })
  it('昵称校验、后端错误与读回成功分别处理', async () => {
    const save = vi.spyOn(settingsApi, 'updateNickname').mockRejectedValueOnce(new ApiError('昵称已被使用', 600))
      .mockResolvedValueOnce({ ...user, nickName: '新昵称' })
    const { body } = await render()
    await body.get('#settings-nickname').setValue(' ')
    await button(body, '保存昵称').trigger('submit')
    expect(save).not.toHaveBeenCalled()
    await body.get('#settings-nickname').setValue('新昵称')
    await body.get('form').trigger('submit'); await flushPromises()
    expect(body.text()).toContain('昵称已被使用')
    expect(body.find('.form-notice.success').exists()).toBe(false)
    vi.mocked(accountApi.current).mockResolvedValue({ ...user, nickName: '新昵称' })
    await body.get('form').trigger('submit'); await flushPromises()
    expect(save).toHaveBeenLastCalledWith('新昵称')
    expect(body.get('[role="status"]').text()).toContain('昵称已更新')
    expect(useAccount().user.value?.nickName).toBe('新昵称')
  })
  it('头像校验后上传，失败不换头像，成功刷新图片地址', async () => {
    const save = vi.spyOn(settingsApi, 'uploadAvatar').mockRejectedValueOnce(new ApiError('图片无法解码', 600)).mockResolvedValueOnce(null)
    const { body } = await render()
    const initial = body.get('img').attributes('src')
    const input = body.get('#settings-avatar-file')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [new File(['x'], 'a.svg', { type: 'image/svg+xml' })] })
    await input.trigger('change'); expect(save).not.toHaveBeenCalled(); expect(body.text()).toContain('请选择 JPEG')
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input.element, 'files', { configurable: true, value: [file] })
    await input.trigger('change'); await button(body, '上传头像').trigger('click'); await flushPromises()
    expect(body.text()).toContain('图片无法解码'); expect(body.get('img').attributes('src')).toBe(initial)
    await button(body, '上传头像').trigger('click'); await flushPromises()
    expect(save).toHaveBeenLastCalledWith(file)
    expect(body.get('img').attributes('src')).not.toBe(initial)
    expect(body.get('[role="status"]').text()).toContain('头像已更新')
  })
  it('保存过程禁止重复提交，提交后读取失败不冒充已确认成功', async () => {
    let finish!: (value: typeof user) => void
    const save = vi.spyOn(settingsApi, 'updateNickname').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { body } = await render()
    await body.get('#settings-nickname').setValue('更新昵称')
    await body.get('form').trigger('submit'); await body.get('form').trigger('submit')
    expect(save).toHaveBeenCalledTimes(1)
    expect(button(body, '正在保存…').attributes('disabled')).toBeDefined()
    vi.mocked(accountApi.current).mockRejectedValueOnce(new ApiError('网络中断', 0))
    finish({ ...user, nickName: '更新昵称' }); await flushPromises()
    expect(body.text()).toContain('修改已提交'); expect(body.find('.form-notice.success').exists()).toBe(false)
  })
  it('改密失败保留会话，成功才清会话并去登录页', async () => {
    const change = vi.spyOn(settingsApi, 'changePassword').mockRejectedValueOnce(new ApiError('当前密码不正确', 600)).mockResolvedValueOnce(null)
    const { body, router } = await render()
    await body.get('#settings-current-password').setValue('Oldpass1')
    await body.get('#settings-new-password').setValue('Newpass2')
    await body.get('#settings-confirm-password').setValue('different')
    const form = body.findAll('form').at(-1)!
    await form.trigger('submit'); expect(change).not.toHaveBeenCalled(); expect(body.text()).toContain('不一致')
    await body.get('#settings-confirm-password').setValue('Newpass2')
    await form.trigger('submit'); await flushPromises()
    expect(body.text()).toContain('当前密码不正确'); expect(useAccount().authenticated.value).toBe(true)
    await form.trigger('submit'); await flushPromises()
    expect(change).toHaveBeenLastCalledWith('Oldpass1', 'Newpass2')
    expect(useAccount().user.value).toBeNull(); expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(router.currentRoute.value.query.completed).toBe('reset')
    expect(body.text()).toContain('请重新登录')
  })
})
