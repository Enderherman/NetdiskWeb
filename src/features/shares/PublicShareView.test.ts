import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '../../api/client'
import { filesApi } from '../../api/files'
import type { SessionUser } from '../../types/account'
import PublicShareView from './PublicShareView.vue'
import { sharesApi } from './api'
import { filePage, publicInfo, report, rootFolder } from './__tests__/fixtures'
import type { PublicShareInfo } from './types'
import * as previewContent from '../../preview/previewContent'

const account = {
  user: ref<SessionUser | null>(null), status: ref<'anonymous' | 'authenticated' | 'error'>('anonymous'),
  sessionError: ref(''), ensureSession: vi.fn(), refreshSpace: vi.fn(), clearSession: vi.fn(),
}
vi.mock('../../composables/account', async importOriginal => ({
  ...await importOriginal<typeof import('../../composables/account')>(),
  useAccount: () => account,
}))

beforeEach(() => {
  account.user.value = null; account.status.value = 'anonymous'; account.sessionError.value = ''
  account.ensureSession.mockReset().mockResolvedValue(false)
  account.refreshSpace.mockReset().mockResolvedValue(undefined)
  account.clearSession.mockReset().mockImplementation(() => { account.user.value = null; account.status.value = 'anonymous' })
  vi.spyOn(sharesApi, 'info').mockResolvedValue(publicInfo)
  vi.spyOn(sharesApi, 'accessInfo').mockResolvedValue(publicInfo)
  vi.spyOn(sharesApi, 'files').mockImplementation(async (_id, pid) => filePage(pid === 'root' ? [report] : [rootFolder]))
  vi.spyOn(sharesApi, 'folders').mockResolvedValue([rootFolder])
  vi.spyOn(filesApi, 'folders').mockResolvedValue([])
})
function signIn(userId = 'visitor') {
  account.user.value = { userId, nickName: '访客', isAdmin: false, avatar: null }
  account.status.value = 'authenticated'; account.ensureSession.mockResolvedValue(true)
}
async function render(path = '/s/share1', props: { shareId?: string } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/s/:shareId', component: PublicShareView, meta: { public: true } },
    { path: '/auth/login', component: { template: '<div>登录</div>' } },
    { path: '/drive', component: { template: '<div />' } },
  ] })
  await router.push(path)
  const component = mount(PublicShareView, { props, attachTo: document.body, global: { plugins: [router], stubs: { ThemeSwitcher: true } } })
  await flushPromises()
  return { component, body: new DOMWrapper(document.body), router }
}

describe('公共分享页', () => {
  it('游客先提取，错误码不放行，正确后才读取真实文件', async () => {
    vi.mocked(sharesApi.accessInfo).mockResolvedValueOnce(null).mockResolvedValue(publicInfo)
    const check = vi.spyOn(sharesApi, 'checkCode').mockRejectedValueOnce(new ApiError('提取码错误', 600)).mockResolvedValueOnce(null)
    const { body } = await render()
    expect(body.text()).toContain('输入提取码')
    expect(sharesApi.files).not.toHaveBeenCalled()
    await body.get('#public-share-code').setValue('bad12')
    await body.get('.share-unlock').trigger('submit'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toBe('提取码错误')
    expect(sharesApi.files).not.toHaveBeenCalled()
    await body.get('#public-share-code').setValue('Ab123')
    await body.get('.share-unlock').trigger('submit'); await flushPromises()
    expect(check).toHaveBeenLastCalledWith('share1', 'Ab123')
    expect(body.get('.file-table').text()).toContain('分享资料')
    expect(account.user.value).toBeNull()
  })
  it('游客可导航、原件预览与短码下载，来源均为分享接口', async () => {
    const preview = vi.spyOn(previewContent, 'loadPreview').mockResolvedValue({ mode: 'text', url: '/api/showShare/content/share1/report', mime: 'text/plain', text: '分享原件内容' })
    vi.spyOn(sharesApi, 'downloadCode').mockResolvedValue('short-code')
    let href = ''
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { href = this.getAttribute('href') || '' })
    const { body, router } = await render()
    await body.get('.file-name-button').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.query.path).toBe('root')
    expect(sharesApi.files).toHaveBeenLastCalledWith('share1', 'root', 1, 20, expect.any(AbortSignal))
    await body.get('[aria-label="季度报告.pdf 的详情和操作"]').trigger('click')
    await body.get('.detail-actions .primary-button').trigger('click'); await flushPromises()
    expect(sharesApi.downloadCode).toHaveBeenCalledWith('share1', 'report')
    expect(href).toBe('/api/showShare/download/short-code')
    expect(body.get('[role="status"]').text()).toContain('已请求下载')
    await body.findAll('.detail-actions button').find(button => button.text() === '在线预览')!.trigger('click')
    await flushPromises()
    expect(preview).toHaveBeenCalledWith(report, '/api/showShare/content/share1/report', expect.any(AbortSignal))
    expect(body.get('.text-preview').text()).toContain('分享原件内容')
    expect(body.findAll('[role="dialog"]')).toHaveLength(1)
  })
  it('游客缩略图走分享授权接口，预览期间撤销分享立即清除内容', async () => {
    vi.mocked(sharesApi.files).mockResolvedValue(filePage([{ ...report, fileCover: 'stored.jpg' }]))
    vi.spyOn(previewContent, 'loadPreview').mockRejectedValue(new ApiError('分享已失效', 902))
    const { body } = await render()
    expect(body.get('.file-symbol img').attributes('src')).toBe('/api/showShare/thumbnail/share1/report')
    await body.get('[aria-label="季度报告.pdf 的详情和操作"]').trigger('click')
    await body.findAll('.detail-actions button').find(button => button.text() === '在线预览')!.trigger('click')
    await flushPromises()
    expect(body.text()).toContain('分享已失效或不存在')
    expect(body.find('[role="dialog"]').exists()).toBe(false)
  })
  it('匿名保存先提示登录，回跳固定当前分享目录并忽略外部redirect', async () => {
    const { body, router } = await render('/s/share1?path=root&page=2&redirect=https://evil.test')
    await body.get('[aria-label="选择 季度报告.pdf"]').setValue(true)
    await body.get('.selection-toolbar button').trigger('click'); await flushPromises()
    expect(body.get('[role="dialog"]').text()).toContain('登录后保存')
    expect(filesApi.folders).not.toHaveBeenCalled()
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/auth/login')
    expect(router.currentRoute.value.query.redirect).toBe('/s/share1?path=root&page=2')
  })
  it('登录后选个人目录保存，仅成功后提示完成并刷新容量', async () => {
    signIn()
    const target = { ...rootFolder, fileId: 'mine', fileName: '个人归档' }
    vi.mocked(filesApi.folders).mockResolvedValueOnce([target]).mockResolvedValueOnce([])
    const save = vi.spyOn(sharesApi, 'save').mockResolvedValue(null)
    const { body } = await render('/s/share1?path=root')
    await body.get('[aria-label="选择 季度报告.pdf"]').setValue(true)
    await body.get('.selection-toolbar button').trigger('click'); await flushPromises()
    expect(filesApi.folders).toHaveBeenCalledWith('0', [], expect.any(AbortSignal))
    await body.get('.picker-folders button').trigger('click'); await flushPromises()
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(save).toHaveBeenCalledWith('share1', ['report'], 'mine')
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    expect(body.get('[role="status"]').text()).toContain('个人归档')
    expect(account.refreshSpace).toHaveBeenCalledTimes(1)
  })
  it('空间不足保留保存窗口和选择，不出现假成功', async () => {
    signIn()
    vi.spyOn(sharesApi, 'save').mockRejectedValue(new ApiError('网盘空间不足，请扩容', 904))
    const { body } = await render('/s/share1?path=root')
    await body.get('[aria-label="选择 季度报告.pdf"]').setValue(true)
    await body.get('.selection-toolbar button').trigger('click'); await flushPromises()
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="dialog"] [role="alert"]').text()).toContain('网盘空间不足')
    expect(body.get('.move-destination').text()).toContain('全部文件')
    expect(body.find('.form-notice.success').exists()).toBe(false)
    expect(account.refreshSpace).not.toHaveBeenCalled()
  })
  it('保存遇到401关闭个人目录并提示重新登录，不丢弃安全回跳', async () => {
    signIn()
    vi.spyOn(sharesApi, 'save').mockRejectedValue(new ApiError('登录已失效', 401))
    const { body, router } = await render('/s/share1?path=root')
    await body.get('[aria-label="选择 季度报告.pdf"]').setValue(true)
    await body.get('.selection-toolbar button').trigger('click'); await flushPromises()
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(account.clearSession).toHaveBeenCalled()
    expect(body.find('.folder-picker').exists()).toBe(false)
    expect(body.get('[role="dialog"]').text()).toContain('重新登录')
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.query.redirect).toBe('/s/share1?path=root')
  })
  it('取消/过期分享明确失效，提取会话过期则重新验证', async () => {
    vi.mocked(sharesApi.info).mockRejectedValueOnce(new ApiError('分享已失效', 902))
    const { body } = await render()
    expect(body.text()).toContain('分享已失效或不存在')
    expect(body.find('.file-table').exists()).toBe(false)
    vi.mocked(sharesApi.files).mockRejectedValueOnce(new ApiError('提取验证失效', 903))
    await body.get('.share-state .secondary-button').trigger('click'); await flushPromises()
    expect(body.find('#public-share-code').exists()).toBe(true)
    expect(body.get('[role="alert"]').text()).toContain('重新输入')
  })
  it('本人分享不提供重复保存入口', async () => {
    signIn('owner')
    const save = vi.spyOn(sharesApi, 'save')
    const { body } = await render()
    await body.get('[aria-label="选择 分享资料"]').setValue(true)
    expect(body.get('.selection-toolbar').text()).toContain('这是你分享的内容')
    expect(body.get('.selection-toolbar').text()).not.toContain('保存到我的网盘')
    expect(save).not.toHaveBeenCalled()
  })
  it('旧分享请求迟到不能覆盖通过props切换的新分享', async () => {
    let finish!: (info: PublicShareInfo) => void
    vi.mocked(sharesApi.info).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { component, body } = await render('/s/share1', { shareId: 'share1' })
    vi.mocked(sharesApi.info).mockResolvedValue({ ...publicInfo, fileName: '新的分享' })
    vi.mocked(sharesApi.accessInfo).mockResolvedValue({ ...publicInfo, fileName: '新的分享' })
    await component.setProps({ shareId: 'share2' }); await flushPromises()
    finish({ ...publicInfo, fileName: '旧的分享' }); await flushPromises()
    expect(body.get('.public-share-heading').text()).toContain('新的分享')
    expect(body.get('.public-share-heading').text()).not.toContain('旧的分享')
  })
})
