import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { accountApi } from '../../api/account'
import { filesApi } from '../../api/files'
import { ApiError } from '../../api/client'
import { useAccount } from '../../composables/account'
import RecentView from './RecentView.vue'
import { recentApi } from './api'
import { filePage, recentFolder } from './__tests__/fixtures'

beforeEach(async () => {
  useAccount().clearSession()
  vi.spyOn(accountApi, 'current').mockResolvedValue({ userId: 'alice', nickName: '用户', isAdmin: false, avatar: null })
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 10, totalSpace: 100 })
  await useAccount().ensureSession(true)
  vi.spyOn(recentApi, 'list').mockResolvedValue(filePage())
})
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [
    { path: '/recent', component: RecentView }, { path: '/drive', component: { template: '<p>原目录</p>' } },
  ] })
  await router.push('/recent')
  mount({ template: '<RouterView />' }, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return { body: new DOMWrapper(document.body), router }
}

describe('最近文件页面', () => {
  it('真实文件与更新时间展示，翻页读取后端数据', async () => {
    vi.mocked(recentApi.list).mockResolvedValueOnce({ ...filePage(), totalCount: 21, pageTotal: 2 })
      .mockResolvedValueOnce({ ...filePage(), totalCount: 21, pageNo: 2, pageTotal: 2 })
    const { body } = await render()
    expect(body.text()).toContain('最近报告.pdf'); expect(body.text()).toContain('2026-10-05 10:00')
    expect(body.text()).toContain('按更新时间'); expect(body.text()).not.toContain('最近访问')
    await body.get('[aria-label="下一页最近文件"]').trigger('click'); await flushPromises()
    expect(recentApi.list).toHaveBeenLastCalledWith(2, 20, expect.any(AbortSignal))
  })
  it('打开完整原目录和目标分页，并带focus文件ID', async () => {
    vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValueOnce([recentFolder]).mockResolvedValueOnce([{ ...recentFolder, fileId: 'rootdir', filePid: '0' }])
    vi.spyOn(recentApi, 'folderCount').mockResolvedValue(0)
    vi.spyOn(recentApi, 'directory').mockResolvedValue(filePage())
    const { body, router } = await render()
    await body.get('[aria-label="打开 最近报告.pdf 所在位置"]').trigger('click'); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/drive')
    expect(router.currentRoute.value.query).toEqual({ path: 'rootdir/nested', page: '1', size: '100', sort: 'lastUpdateTime', direction: 'desc', focus: 'report' })
  })
  it('加载失败不放假文件，重试后空列表有清楚空态', async () => {
    vi.mocked(recentApi.list).mockRejectedValueOnce(new ApiError('最近记录读取失败', 500)).mockResolvedValueOnce(filePage([]))
    const { body } = await render()
    expect(body.find('.recent-table').exists()).toBe(false); expect(body.text()).toContain('最近记录读取失败')
    await body.get('.recent-state .secondary-button').trigger('click'); await flushPromises()
    expect(body.text()).toContain('还没有最近文件')
  })
  it('目录失效不跳转，取消进行中的定位不产生迟到跳转', async () => {
    const breadcrumbs = vi.spyOn(filesApi, 'breadcrumbs').mockRejectedValueOnce(new ApiError('目录已删除', 600))
    const { body, router } = await render()
    await body.get('[aria-label="打开 最近报告.pdf 所在位置"]').trigger('click'); await flushPromises()
    expect(body.text()).toContain('目录已删除'); expect(router.currentRoute.value.path).toBe('/recent')
    let finish!: (files: typeof recentFolder[]) => void
    breadcrumbs.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    await body.get('[aria-label="打开 最近报告.pdf 所在位置"]').trigger('click'); await flushPromises()
    await body.get('.recent-locating button').trigger('click')
    finish([{ ...recentFolder, filePid: '0' }]); await flushPromises()
    expect(router.currentRoute.value.path).toBe('/recent')
    expect(body.find('.recent-locating').exists()).toBe(false)
  })
  it('退出后到达的旧列表不能重现私人文件', async () => {
    let finish!: (value: ReturnType<typeof filePage>) => void
    vi.mocked(recentApi.list).mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { body } = await render()
    expect(body.text()).toContain('正在读取')
    useAccount().clearSession(); finish(filePage()); await flushPromises()
    expect(body.text()).not.toContain('最近报告.pdf'); expect(body.text()).toContain('会话已变化')
  })
})
