import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { ApiError } from '../../api/client'
import ShareManageView from './ShareManageView.vue'
import { sharesApi } from './api'
import { sharePage, shareRecord } from './__tests__/fixtures'

beforeEach(() => { vi.spyOn(sharesApi, 'list').mockResolvedValue(sharePage()) })
afterEach(() => { Reflect.deleteProperty(navigator, 'clipboard') })
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/shares', component: ShareManageView }, { path: '/drive', component: { template: '<div />' } }] })
  await router.push('/shares')
  mount(ShareManageView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return new DOMWrapper(document.body)
}

describe('我的分享', () => {
  it('显示真实文件名、提取码、浏览量和失效状态，支持分页', async () => {
    vi.mocked(sharesApi.list).mockResolvedValueOnce({ ...sharePage([shareRecord, { ...shareRecord, shareId: 'old', fileName: '旧文件.txt', expireTime: '2000-01-01 00:00:00' }]), totalCount: 21, pageTotal: 2 })
      .mockResolvedValueOnce({ ...sharePage([shareRecord]), pageNo: 2, totalCount: 21, pageTotal: 2 })
    const body = await render()
    expect(body.get('.share-table').text()).toContain('季度报告.pdf')
    expect(body.get('.share-table').text()).toContain('Ab123')
    expect(body.get('.share-table').text()).toContain('已过期')
    expect(body.get('[aria-label="复制 旧文件.txt 的链接"]').attributes('disabled')).toBeDefined()
    await body.get('[aria-label="下一页分享"]').trigger('click'); await flushPromises()
    expect(sharesApi.list).toHaveBeenLastCalledWith(2, 20, expect.any(AbortSignal))
    expect(body.get('[aria-label="下一页分享"]').attributes('disabled')).toBeDefined()
  })
  it('取消分享必须确认，失败可重试且成功后重新读取列表', async () => {
    const cancel = vi.spyOn(sharesApi, 'cancel').mockRejectedValueOnce(new ApiError('操作未完成', 600)).mockResolvedValueOnce(null)
    const body = await render()
    await body.get('[aria-label="取消 季度报告.pdf 的分享"]').trigger('click')
    expect(cancel).not.toHaveBeenCalled()
    await body.get('.modal-footer .secondary-button').trigger('click')
    expect(cancel).not.toHaveBeenCalled()
    await body.get('[aria-label="取消 季度报告.pdf 的分享"]').trigger('click')
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toBe('操作未完成')
    expect(body.find('[role="dialog"]').exists()).toBe(true)
    vi.mocked(sharesApi.list).mockResolvedValue(sharePage([]))
    await body.get('.modal-footer .primary-button').trigger('click'); await flushPromises()
    expect(cancel).toHaveBeenLastCalledWith(['share1'])
    expect(body.find('[role="dialog"]').exists()).toBe(false)
    expect(body.get('[role="status"]').text()).toContain('已取消 1 个分享')
    expect(body.text()).toContain('还没有分享记录')
  })
  it('批量撤销传全部选中ID，进行中不可重复发送', async () => {
    vi.mocked(sharesApi.list).mockResolvedValue(sharePage([shareRecord, { ...shareRecord, shareId: 'share2', fileName: '第二份.pdf' }]))
    let finish!: (value: null) => void
    const cancel = vi.spyOn(sharesApi, 'cancel').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const body = await render()
    await body.get('[aria-label="选择当前页全部分享"]').setValue(true)
    await body.get('.selection-toolbar button').trigger('click')
    await body.get('.modal-footer .primary-button').trigger('click')
    await body.get('.modal-footer .primary-button').trigger('click')
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(cancel).toHaveBeenCalledWith(['share1', 'share2'])
    finish(null); await flushPromises()
  })
  it('剪贴板不可用时展示可手动复制的完整内容', async () => {
    const body = await render()
    await body.get('[aria-label="复制 季度报告.pdf 的链接"]').trigger('click'); await flushPromises()
    expect(body.get('[role="alert"]').text()).toContain('自动复制')
    const value = (body.get('textarea').element as HTMLTextAreaElement).value
    expect(value).toContain('/s/share1'); expect(value).toContain('Ab123')
    expect(body.find('.form-notice.success').exists()).toBe(false)
  })
  it('加载失败没有假列表，重试只显示接口结果', async () => {
    vi.mocked(sharesApi.list).mockRejectedValueOnce(new ApiError('网络中断', 0)).mockResolvedValueOnce(sharePage())
    const body = await render()
    expect(body.find('.share-table').exists()).toBe(false)
    expect(body.get('[role="alert"]').text()).toBe('网络中断')
    await body.get('.share-state .secondary-button').trigger('click'); await flushPromises()
    expect(body.get('.share-table').text()).toContain('季度报告.pdf')
  })
})
