import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import App from '../App.vue'
import { routes } from '../router'
import { accountApi } from '../api/account'
import { ApiError, SESSION_EXPIRED_EVENT } from '../api/client'
import { useAccount } from '../composables/account'
import { useUploadQueue } from '../uploads/uploadQueue'
import { filesApi } from '../api/files'

const sampleUser = { userId: 'test-id', nickName: '测试用户', isAdmin: false, avatar: null }

beforeEach(() => {
  useAccount().clearSession()
  vi.spyOn(accountApi, 'capabilities').mockResolvedValue({ emailVerificationEnabled: true, qqLoginEnabled: false })
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 512, totalSpace: 1024 })
  vi.spyOn(filesApi, 'list').mockResolvedValue({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
})

async function renderAuth(path = '/auth/login') {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  const wrapper = mount(App, { global: { plugins: [router] } })
  await flushPromises()
  return { wrapper, router }
}

describe('账号表单', () => {
  it('登录绑定上传队列身份，901通知立即清空身份并返回登录', async () => {
    vi.spyOn(accountApi, 'login').mockResolvedValue(sampleUser)
    const setOwner = vi.spyOn(useUploadQueue(), 'setOwner')
    const { wrapper, router } = await renderAuth()
    await wrapper.get('#email').setValue('someone@example.com')
    await wrapper.get('#password').setValue('Secret1!')
    await wrapper.get('#check-code').setValue('AB123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(setOwner).toHaveBeenLastCalledWith('test-id')
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT))
    await flushPromises()
    expect(setOwner).toHaveBeenLastCalledWith('')
    expect(router.currentRoute.value.path).toBe('/auth/login')
  })
  it('拦截空输入并显示错误，不发送登录请求', async () => {
    const login = vi.spyOn(accountApi, 'login')
    const { wrapper } = await renderAuth()
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('[role="alert"]').text()).toBe('请输入有效的邮箱地址')
    expect(login).not.toHaveBeenCalled()
  })

  it('提交明文密码一次，等待期间禁用按钮，成功后导航到目标页并显示真实返回数据', async () => {
    let finish!: (value: typeof sampleUser) => void
    const login = vi.spyOn(accountApi, 'login').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const { wrapper, router } = await renderAuth('/auth/login?redirect=/appearance')
    await wrapper.get('#email').setValue('someone@example.com')
    await wrapper.get('#password').setValue('Secret1!')
    await wrapper.get('#check-code').setValue('AB123')
    await wrapper.get('form').trigger('submit')
    await wrapper.get('form').trigger('submit')
    expect(login).toHaveBeenCalledTimes(1)
    expect(login).toHaveBeenCalledWith({ email: 'someone@example.com', password: 'Secret1!', checkCode: 'AB123' })
    expect(wrapper.get('.auth-submit').attributes('disabled')).toBeDefined()
    finish(sampleUser)
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/appearance')
    expect(wrapper.get('.user-nickname').text()).toBe('测试用户')
    expect(wrapper.get('.storage-usage').text()).toContain('512 B / 1.0 KB')
  })

  it('登录失败显示服务端原因并刷新一次性验证码', async () => {
    vi.spyOn(accountApi, 'login').mockRejectedValue(new ApiError('邮箱或密码错误', 600))
    const { wrapper } = await renderAuth()
    const oldImage = wrapper.get('.captcha-image img').attributes('src')
    await wrapper.get('#email').setValue('someone@example.com')
    await wrapper.get('#password').setValue('Secret1!')
    await wrapper.get('#check-code').setValue('AB123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(wrapper.get('.form-error').text()).toBe('邮箱或密码错误')
    expect(wrapper.get('.captcha-image img').attributes('src')).not.toBe(oldImage)
    expect((wrapper.get('#check-code').element as HTMLInputElement).value).toBe('')
  })

  it('登录成功后在页面跳转完成前清空密码和图形验证码', async () => {
    vi.spyOn(accountApi, 'login').mockResolvedValue(sampleUser)
    const { wrapper, router } = await renderAuth()
    let finishNavigation!: () => void
    const navigation = vi.spyOn(router, 'replace').mockImplementation(() => new Promise<void>(resolve => { finishNavigation = resolve }))
    await wrapper.get('#email').setValue('someone@example.com')
    await wrapper.get('#password').setValue('Secret1!')
    await wrapper.get('#check-code').setValue('AB123')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(navigation).toHaveBeenCalledWith('/drive')
    expect((wrapper.get('#password').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#check-code').element as HTMLInputElement).value).toBe('')
    expect(wrapper.get('.auth-submit').attributes('disabled')).toBeDefined()
    finishNavigation()
    await flushPromises()
  })

  it('注册校验两次密码，成功后回登录显示成功提示而不伪造会话', async () => {
    const register = vi.spyOn(accountApi, 'register').mockResolvedValue(null)
    const { wrapper, router } = await renderAuth('/auth/register')
    await wrapper.get('#email').setValue('new@example.com')
    await wrapper.get('#nickname').setValue('新用户')
    await wrapper.get('#password').setValue('LongPassword123!over18')
    await wrapper.get('#confirm-password').setValue('different1')
    await wrapper.get('#email-code').setValue('123456')
    await wrapper.get('#check-code').setValue('AB123')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.get('.form-error').text()).toBe('两次输入的密码不一致')
    expect(register).not.toHaveBeenCalled()
    await wrapper.get('#confirm-password').setValue('LongPassword123!over18')
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(register).toHaveBeenCalledWith({ email: 'new@example.com', nickName: '新用户', password: 'LongPassword123!over18', checkCode: 'AB123', emailCode: '123456' })
    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(wrapper.text()).toContain('账号创建成功')
    expect(useAccount().authenticated.value).toBe(false)
  })

  it('找回密码使用独立接口并回到登录', async () => {
    const reset = vi.spyOn(accountApi, 'resetPassword').mockResolvedValue(null)
    const { wrapper, router } = await renderAuth('/auth/reset')
    for (const [id, value] of Object.entries({ email: 'old@example.com', password: 'NewPass123!', 'confirm-password': 'NewPass123!', 'email-code': '123456', 'check-code': 'AB123' })) await wrapper.get(`#${id}`).setValue(value)
    await wrapper.get('form').trigger('submit')
    await flushPromises()
    expect(reset).toHaveBeenCalledWith({ email: 'old@example.com', password: 'NewPass123!', emailCode: '123456', checkCode: 'AB123' })
    expect(router.currentRoute.value.query.completed).toBe('reset')
  })

  it('邮箱验证码使用独立 type=1 图片和注册用途，成功后冷却', async () => {
    const send = vi.spyOn(accountApi, 'sendEmailCode').mockResolvedValue(null)
    const { wrapper } = await renderAuth('/auth/register')
    await wrapper.get('#email').setValue('new@example.com')
    await wrapper.get('.email-code-row button').trigger('click')
    expect(wrapper.get('.email-challenge img').attributes('src')).toContain('type=1')
    await wrapper.get('#email-captcha').setValue('MAIL1')
    await wrapper.get('.email-challenge > button').trigger('click')
    await flushPromises()
    expect(send).toHaveBeenCalledWith('new@example.com', 'MAIL1', 0)
    expect(wrapper.find('.email-challenge').exists()).toBe(false)
    expect(wrapper.get('.email-code-row button').text()).toBe('60 秒后重发')
    expect(wrapper.get('.email-code-row button').attributes('disabled')).toBeDefined()
  })

  it('邮件未配置明确提示且禁用注册和发送验证码', async () => {
    vi.mocked(accountApi.capabilities).mockResolvedValue({ emailVerificationEnabled: false, qqLoginEnabled: false })
    const register = vi.spyOn(accountApi, 'register')
    const { wrapper } = await renderAuth('/auth/register')
    expect(wrapper.text()).toContain('当前无法注册或找回密码')
    expect(wrapper.get('.email-code-row button').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.auth-submit').attributes('disabled')).toBeDefined()
    expect(register).not.toHaveBeenCalled()
  })
})
