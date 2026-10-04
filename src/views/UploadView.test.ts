import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { uploadsApi } from '../api/uploads'
import { filesApi } from '../api/files'
import { ApiError } from '../api/client'
import { accountApi } from '../api/account'
import { useAccount } from '../composables/account'
import * as location from '../uploads/fileLocation'
import type { LocalUploadTask, ServerUploadTask } from '../types/uploads'
import UploadView from './UploadView.vue'

const fakeQueue = vi.hoisted(() => ({ tasks: [] as LocalUploadTask[], add: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), resumeServer: vi.fn(), setOwner: vi.fn() }))
vi.mock('../uploads/uploadQueue', async importOriginal => ({ ...await importOriginal<typeof import('../uploads/uploadQueue')>(), useUploadQueue: () => fakeQueue }))
const server: ServerUploadTask = { fileId: 'task000001', fileName: '待续传.txt', filePid: '0', fileMd5: 'a'.repeat(32), chunks: 3, state: 'uploading', uploadStatus: null, receivedChunks: [], receivedCount: 1, receivedBytes: 4, temporaryBytes: 4, fileSize: null, fileAvailable: false, createdAt: 1, updatedAt: 2, expiresAt: 2000000000000 }
const page = (list = [server]) => ({ list, totalCount: list.length, pageNo: 1, pageSize: 20, pageTotal: 1 })
let activeRouter: ReturnType<typeof createRouter>
beforeEach(async () => {
  const account = useAccount(); account.clearSession()
  vi.spyOn(accountApi, 'current').mockResolvedValue({ userId: 'owner', nickName: '测试用户', isAdmin: false, avatar: null })
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 0, totalSpace: 1000 })
  await account.ensureSession(true)
  vi.spyOn(location, 'locateUploadedFile').mockResolvedValue({ path: '/drive', query: { page: '4', size: '100', sort: 'lastUpdateTime', direction: 'desc', focus: server.fileId } })
  fakeQueue.tasks = []
  for (const method of [fakeQueue.add, fakeQueue.pause, fakeQueue.resume, fakeQueue.cancel, fakeQueue.resumeServer]) method.mockReset()
  vi.spyOn(uploadsApi, 'list').mockResolvedValue(page())
  vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValue([])
})
async function renderUpload(path = '/uploads') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/uploads', component: UploadView }, { path: '/drive', component: {} }] })
  activeRouter = router
  await router.push(path)
  mount(UploadView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return new DOMWrapper(document.body)
}
describe('上传中心界面', () => {
  it('自动重名后显示当前名称，查看文件等待实际分页后携带文件ID跳转', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '待续传 (1).txt', navigationPath: '0' }]))
    const wrapper = await renderUpload()
    expect(wrapper.get('.server-task-current-name').text()).toBe('现名：待续传 (1).txt')
    await wrapper.get('.server-task-actions button').trigger('click'); await flushPromises()
    expect(activeRouter.currentRoute.value.path).toBe('/drive')
    expect(activeRouter.currentRoute.value.query).toEqual({ page: '4', size: '100', sort: 'lastUpdateTime', direction: 'desc', focus: server.fileId })
  })
  it('定位失败保留最新名称搜索入口，而非跳到错误目录', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '最后定稿.txt', navigationPath: null }]))
    vi.mocked(location.locateUploadedFile).mockImplementation(async (task, _signal, updated) => {
      updated?.({ ...task, actualFileName: '最新改名.txt' }); throw new ApiError('文件位置已变化', 600)
    })
    const wrapper = await renderUpload()
    await wrapper.get('.server-task-actions button').trigger('click'); await flushPromises()
    const link = new URL(wrapper.get('[role="alert"] a').attributes('href')!, 'http://localhost')
    expect(link.searchParams.get('q')).toBe('最新改名.txt')
    expect(wrapper.get('[role="alert"]').text()).toContain('文件位置已变化')
    expect(wrapper.get('.server-task-current-name').text()).toContain('最新改名.txt')
    expect(activeRouter.currentRoute.value.path).toBe('/uploads')
  })
  it('文件移动后查看链接跟随当前完整目录链，保留上传时目录作为历史信息', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '待续传.txt', navigationPath: 'folderA/folderB' }]))
    vi.mocked(location.locateUploadedFile).mockResolvedValue({ path: '/drive', query: { path: 'folderA/folderB', page: '3', size: '100', sort: 'lastUpdateTime', direction: 'desc', focus: server.fileId } })
    const wrapper = await renderUpload()
    expect(wrapper.get('.server-task-path').text()).toContain('上传时保存到 全部文件')
    await wrapper.get('.server-task-actions button').trigger('click'); await flushPromises()
    expect(activeRouter.currentRoute.value.query).toMatchObject({ path: 'folderA/folderB', page: '3', focus: server.fileId })
    expect(activeRouter.currentRoute.value.query).not.toHaveProperty('q')
  })
  it('旧后端没有新定位字段时保留任务名搜索兼容', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true }]))
    vi.mocked(location.locateUploadedFile).mockResolvedValue({ path: '/drive', query: { q: server.fileName } })
    const wrapper = await renderUpload()
    expect(wrapper.find('.server-task-current-name').exists()).toBe(false)
    await wrapper.get('.server-task-actions button').trigger('click'); await flushPromises()
    expect(activeRouter.currentRoute.value.query).toEqual({ q: server.fileName })
  })
  it('定位中禁止重复请求，取消后迟到结果不跳转', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true }]))
    let resolve!: (value: Awaited<ReturnType<typeof location.locateUploadedFile>>) => void
    vi.mocked(location.locateUploadedFile).mockImplementation(() => new Promise(done => { resolve = done }))
    const wrapper = await renderUpload()
    await wrapper.get('.server-task-actions button').trigger('click')
    expect(wrapper.get('.server-task-actions button').attributes('disabled')).toBeDefined()
    await wrapper.get('[role="status"] button').trigger('click')
    expect(vi.mocked(location.locateUploadedFile).mock.calls[0]![1]!.aborted).toBe(true)
    resolve({ path: '/drive', query: { q: server.fileName } }); await flushPromises()
    expect(activeRouter.currentRoute.value.path).toBe('/uploads')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })
  it('退出或账号变化会取消定位并丢弃旧名称和跳转', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true }]))
    let resolve!: (value: Awaited<ReturnType<typeof location.locateUploadedFile>>) => void
    vi.mocked(location.locateUploadedFile).mockImplementation(() => new Promise(done => { resolve = done }))
    const wrapper = await renderUpload(); await wrapper.get('.server-task-actions button').trigger('click')
    useAccount().clearSession()
    resolve({ path: '/drive', query: { q: server.fileName } }); await flushPromises()
    expect(vi.mocked(location.locateUploadedFile).mock.calls[0]![1]!.aborted).toBe(true)
    expect(activeRouter.currentRoute.value.path).toBe('/uploads')
    expect(wrapper.find('[role="alert"] a').exists()).toBe(false)
  })
  it('30秒超时会中止请求并保留名称搜索，不跳到第一页', async () => {
    vi.mocked(uploadsApi.list).mockResolvedValue(page([{ ...server, state: 'completed', fileAvailable: true, actualFileName: '最新名称.txt' }]))
    vi.mocked(location.locateUploadedFile).mockImplementation((_task, signal) => new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(new DOMException('已取消', 'AbortError')), { once: true })
    }))
    const wrapper = await renderUpload()
    vi.useFakeTimers()
    try {
      await wrapper.get('.server-task-actions button').trigger('click')
      await vi.advanceTimersByTimeAsync(30_000)
    } finally { vi.useRealTimers() }
    await flushPromises()
    expect(wrapper.get('[role="alert"]').text()).toContain('定位耗时较长')
    expect(wrapper.get('[role="alert"] a').attributes('href')).toContain(encodeURIComponent('最新名称.txt'))
    expect(vi.mocked(location.locateUploadedFile).mock.calls[0]![1]!.aborted).toBe(true)
    expect(activeRouter.currentRoute.value.path).toBe('/uploads')
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
