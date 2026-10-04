import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { uploadsApi } from '../api/uploads'
import { filesApi } from '../api/files'
import { ApiError } from '../api/client'
import type { LocalUploadTask, ServerUploadTask } from '../types/uploads'
import UploadView from './UploadView.vue'

const fakeQueue = vi.hoisted(() => ({ tasks: [] as LocalUploadTask[], add: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), resumeServer: vi.fn(), setOwner: vi.fn() }))
vi.mock('../uploads/uploadQueue', async importOriginal => ({ ...await importOriginal<typeof import('../uploads/uploadQueue')>(), useUploadQueue: () => fakeQueue }))
const server: ServerUploadTask = { fileId: 'task000001', fileName: '待续传.txt', filePid: '0', fileMd5: 'a'.repeat(32), chunks: 3, state: 'uploading', uploadStatus: null, receivedChunks: [], receivedCount: 1, receivedBytes: 4, temporaryBytes: 4, fileSize: null, fileAvailable: false, createdAt: 1, updatedAt: 2, expiresAt: 2000000000000 }
const page = (list = [server]) => ({ list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 })
beforeEach(() => {
  fakeQueue.tasks = []
  for (const method of [fakeQueue.add, fakeQueue.pause, fakeQueue.resume, fakeQueue.cancel, fakeQueue.resumeServer]) method.mockReset()
  vi.spyOn(uploadsApi, 'list').mockResolvedValue(page())
  vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValue([])
})
async function renderUpload(path = '/uploads') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/uploads', component: UploadView }, { path: '/drive', component: {} }] })
  await router.push(path)
  mount(UploadView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return new DOMWrapper(document.body)
}
describe('上传中心界面', () => {
  it('自动重名后显示当前名称，根目录查看文件使用当前目录和文件ID', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '待续传 (1).txt', navigationPath: '0' }]))
    const wrapper = await renderUpload()
    expect(wrapper.get('.server-task-current-name').text()).toBe('现名：待续传 (1).txt')
    const link = new URL(wrapper.get('.server-task-actions a').attributes('href')!, 'http://localhost')
    expect(link.pathname).toBe('/drive')
    expect(link.searchParams.get('focus')).toBe(server.fileId)
    expect(link.searchParams.has('path')).toBe(false)
    expect(link.searchParams.has('q')).toBe(false)
  })
  it('改名后无法取得目录链时按当前真实名称搜索，而非原任务名', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '最后定稿.txt', navigationPath: null }]))
    const wrapper = await renderUpload()
    const link = new URL(wrapper.get('.server-task-actions a').attributes('href')!, 'http://localhost')
    expect(link.searchParams.get('q')).toBe('最后定稿.txt')
    expect(wrapper.get('.server-task-current-name').text()).toContain('最后定稿.txt')
  })
  it('文件移动后查看链接跟随当前完整目录链，保留上传时目录作为历史信息', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '待续传.txt', navigationPath: 'folderA/folderB' }]))
    const wrapper = await renderUpload()
    const link = new URL(wrapper.get('.server-task-actions a').attributes('href')!, 'http://localhost')
    expect(link.searchParams.get('path')).toBe('folderA/folderB')
    expect(link.searchParams.get('focus')).toBe(server.fileId)
    expect(link.searchParams.has('q')).toBe(false)
    expect(wrapper.get('.server-task-path').text()).toContain('上传时保存到 全部文件')
  })
  it('旧后端没有新定位字段时保留任务名搜索兼容', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true }]))
    const wrapper = await renderUpload()
    const link = new URL(wrapper.get('.server-task-actions a').attributes('href')!, 'http://localhost')
    expect(link.searchParams.get('q')).toBe(server.fileName)
    expect(wrapper.find('.server-task-current-name').exists()).toBe(false)
  })
  it('显示服务器真实任务，刷新可重查且筛选发送准确状态', async () => {
    const wrapper = await renderUpload()
    expect(wrapper.get('.server-upload-task').text()).toContain('待续传.txt')
    expect(wrapper.get('.server-upload-task').text()).toContain('临时占用 4 B')
    await wrapper.get('#upload-filter').setValue('uploading')
    await flushPromises()
    expect(uploadsApi.list).toHaveBeenLastCalledWith(1, 'uploading')
    await wrapper.get('[aria-label="刷新服务器任务"]').trigger('click')
    expect(uploadsApi.list).toHaveBeenCalledTimes(3)
  })
  it('多文件选择和拖放都进入当前目录队列，不悄悄接收文件夹', async () => {
    const wrapper = await renderUpload()
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')]
    const input = wrapper.get('input[aria-label="选择上传文件"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: files })
    await input.trigger('change')
    expect(fakeQueue.add).toHaveBeenCalledWith(files, '0', '全部文件')
    await wrapper.get('.upload-dropzone').trigger('drop', { dataTransfer: { files, items: [] } })
    expect(fakeQueue.add).toHaveBeenCalledTimes(2)
    await wrapper.get('.upload-dropzone').trigger('drop', { dataTransfer: { files, items: [{ webkitGetAsEntry: () => ({ isDirectory: true }) }] } })
    expect(fakeQueue.add).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[role="alert"]').text()).toContain('文件夹上传')
  })
  it('重新选择服务器任务原文件绑定原目录，错误清晰显示', async () => {
    fakeQueue.resumeServer.mockRejectedValueOnce(new ApiError('文件大小不匹配，请选择原文件', 600))
    const wrapper = await renderUpload()
    await wrapper.get('.server-task-actions .secondary-button').trigger('click')
    const selected = new File(['mismatch'], '待续传.txt')
    const input = wrapper.get('input[aria-label="重新选择续传原文件"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [selected] })
    await input.trigger('change')
    await flushPromises()
    expect(fakeQueue.resumeServer).toHaveBeenCalledWith(server, selected, '0')
    expect(wrapper.get('[role="alert"]').text()).toContain('文件大小不匹配')
  })
  it('取消失败保留任务和对话框，服务器确认后才显示终止状态', async () => {
    const cancel = vi.spyOn(uploadsApi, 'cancel').mockRejectedValueOnce(new ApiError('暂时不能取消', 500)).mockResolvedValueOnce({ ...server, state: 'cancelled', temporaryBytes: 0 })
    const wrapper = await renderUpload()
    await wrapper.get('.server-task-actions .text-button').trigger('click')
    expect(cancel).not.toHaveBeenCalled()
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.modal-panel [role="alert"]').text()).toBe('暂时不能取消')
    expect(wrapper.get('.server-upload-task').text()).toContain('待完成')
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'cancelled', temporaryBytes: 0 }]))
    await wrapper.get('.modal-footer .primary-button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    expect(wrapper.get('.server-upload-task').text()).toContain('已取消')
  })
  it('服务器加载失败可重试，不显示伪造任务', async () => {
    vi.mocked(uploadsApi.list).mockRejectedValueOnce(new ApiError('任务列表读取失败', 500)).mockResolvedValueOnce(page([]))
    const wrapper = await renderUpload()
    expect(wrapper.get('[role="alert"]').text()).toBe('任务列表读取失败')
    expect(wrapper.find('.server-upload-task').exists()).toBe(false)
    await wrapper.get('.server-upload-section .secondary-button').trigger('click')
    await flushPromises()
    expect(wrapper.get('.server-upload-section').text()).toContain('暂时没有任务')
  })
})
