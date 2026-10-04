import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../api/client'
import { filesApi } from '../../api/files'
import { useAccount } from '../../composables/account'
import FolderPicker from '../../components/FolderPicker.vue'
import CopyToDialog from './CopyToDialog.vue'
import ZipDownloadDialog from './ZipDownloadDialog.vue'
import FileOperations from './FileOperations.vue'
import { operationsApi } from './api'
import { copied, folder, signIn, source } from './__tests__/fixtures'

beforeEach(async () => { await signIn(); vi.spyOn(filesApi, 'folders').mockResolvedValue([]) })
function body() { return new DOMWrapper(document.body) }
function button(text: string) { return body().findAll('button').find(item => item.text() === text)! }

describe('可复用文件操作', () => {
  it('复制失败不关闭，重试成功才发新条目事件并刷新容量', async () => {
    const copy = vi.spyOn(operationsApi, 'copy').mockRejectedValueOnce(new ApiError('空间不足', 904)).mockResolvedValueOnce([copied])
    const dispatch = vi.spyOn(window, 'dispatchEvent')
    const wrapper = mount(CopyToDialog, { props: { files: [source] }, attachTo: document.body })
    await flushPromises()
    await button('复制到这里').trigger('click'); await flushPromises()
    expect(body().text()).toContain('空间不足'); expect(wrapper.emitted('copied')).toBeUndefined()
    await button('复制到这里').trigger('click'); await flushPromises()
    expect(copy).toHaveBeenLastCalledWith(['report'], '0')
    expect(wrapper.emitted('copied')?.[0]?.[0]).toEqual({ items: [copied], destination: { id: '0', name: '全部文件' } })
    expect(dispatch.mock.calls.some(call => call[0].type === 'netdisk:files-changed')).toBe(true)
  })
  it('复制对话框排除选中目录，并再次验证伪造的后代目标', async () => {
    const copy = vi.spyOn(operationsApi, 'copy').mockResolvedValue([copied])
    vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValue([{ ...folder, fileId: 'child', filePid: 'folder' }])
    const wrapper = mount(CopyToDialog, { props: { files: [folder] }, attachTo: document.body })
    await flushPromises()
    expect(filesApi.folders).toHaveBeenCalledWith('0', ['folder'], expect.any(AbortSignal))
    wrapper.findComponent(FolderPicker).vm.$emit('destination', { id: 'child', name: '子目录', valid: true })
    await button('复制到这里').trigger('click'); await flushPromises()
    expect(copy).not.toHaveBeenCalled(); expect(body().text()).toContain('不能将目录复制到自身或其子目录')
  })
  it('提交中不能重复复制，退出后旧响应不发成功事件', async () => {
    let finish!: (items: typeof copied[]) => void
    const copy = vi.spyOn(operationsApi, 'copy').mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const wrapper = mount(CopyToDialog, { props: { files: [source] }, attachTo: document.body })
    await flushPromises(); await button('复制到这里').trigger('click'); await flushPromises()
    await button('正在复制…').trigger('click'); expect(copy).toHaveBeenCalledTimes(1)
    useAccount().clearSession(); finish([copied]); await flushPromises()
    expect(wrapper.emitted('copied')).toBeUndefined(); expect(wrapper.emitted('close')).toBeDefined()
  })
  it('ZIP支持跨目录选择并用原生链接下载，不声称传输已完成', async () => {
    const zip = vi.spyOn(operationsApi, 'zipCode').mockRejectedValueOnce(new ApiError('目录中有处理中内容', 600)).mockResolvedValueOnce('Z'.repeat(43))
    let href = ''
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { href = this.getAttribute('href') || '' })
    const wrapper = mount(ZipDownloadDialog, { props: { files: [source, { ...source, fileId: 'nested', filePid: 'parent' }] }, attachTo: document.body })
    await button('开始 ZIP 下载').trigger('click'); await flushPromises()
    expect(click).not.toHaveBeenCalled(); expect(body().text()).toContain('处理中内容')
    await button('开始 ZIP 下载').trigger('click'); await flushPromises()
    expect(zip).toHaveBeenLastCalledWith(['report', 'nested'])
    expect(href).toBe('/api/file/downloadZip/' + 'Z'.repeat(43))
    expect(body().get('[role="status"]').text()).toContain('已开始 ZIP 下载')
    expect(body().get('[role="status"]').text()).not.toContain('下载完成')
    expect(wrapper.emitted('started')?.[0]?.[0]).toEqual({ count: 2 })
  })
  it('混合其他用户或无效路径时不签发ZIP', async () => {
    const zip = vi.spyOn(operationsApi, 'zipCode')
    mount(ZipDownloadDialog, { props: { files: [{ ...source, userId: 'bob' } as typeof source] }, attachTo: document.body })
    expect(body().text()).toContain('不能混合不同用户')
    expect(button('开始 ZIP 下载').attributes('disabled')).toBeDefined(); expect(zip).not.toHaveBeenCalled()
  })
  it('工具条固定打开时选择，空选择禁用入口', async () => {
    const wrapper = mount(FileOperations, { props: { files: [] }, attachTo: document.body })
    expect(button('复制到…').attributes('disabled')).toBeDefined()
    await wrapper.setProps({ files: [source] }); await button('打包下载').trigger('click')
    await wrapper.setProps({ files: [{ ...source, fileId: 'different', fileName: '后来更新.txt' }] })
    expect(body().get('[role="dialog"]').text()).toContain('报告.pdf')
    expect(body().get('[role="dialog"]').text()).not.toContain('后来更新.txt')
  })
})
