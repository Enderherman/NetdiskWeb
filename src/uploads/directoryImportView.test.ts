import { DOMWrapper, flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import { accountApi } from '../api/account'
import { uploadsApi } from '../api/uploads'
import { filesApi } from '../api/files'
import { ApiError } from '../api/client'
import { useAccount } from '../composables/account'
import * as directory from './directoryImport'
import type { DirectoryImportOptions, PreparedDirectoryFile } from './directoryImport'
import UploadView from '../views/UploadView.vue'

const queue = vi.hoisted(() => ({ tasks: [], add: vi.fn(), pause: vi.fn(), resume: vi.fn(), cancel: vi.fn(), resumeServer: vi.fn(), setOwner: vi.fn() }))
vi.mock('./uploadQueue', async original => ({ ...await original<typeof import('./uploadQueue')>(), useUploadQueue: () => queue }))
const owner = { userId: 'owner1', nickName: '本地测试', isAdmin: false, avatar: null }
function selected(path: string): File {
  const file = new File(['data'], path.split('/').at(-1)!)
  Object.defineProperty(file, 'webkitRelativePath', { value: path })
  return file
}
const files = [selected('目录/a.txt'), selected('目录/sub/b.txt')]
const prepared: PreparedDirectoryFile[] = [
  { file: files[0]!, filePid: 'realRoot', destinationName: '全部文件/目录' },
  { file: files[1]!, filePid: 'realSub', destinationName: '全部文件/目录/sub' },
]

beforeEach(async () => {
  queue.add.mockReset()
  useAccount().clearSession()
  vi.spyOn(accountApi, 'login').mockResolvedValue(owner)
  vi.spyOn(accountApi, 'space').mockResolvedValue({ useSpace: 0, totalSpace: 1024 })
  await useAccount().login({ email: 'test@example.invalid', password: 'only-test', checkCode: 'TEST1' })
  vi.spyOn(uploadsApi, 'list').mockResolvedValue({ list: [], totalCount: 0, pageNo: 1, pageSize: 20, pageTotal: 1 })
  vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValue([])
  vi.spyOn(directory, 'prepareDirectoryImport')
})
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/uploads', component: UploadView }, { path: '/drive', component: {} }] })
  await router.push('/uploads')
  const component = mount(UploadView, { attachTo: document.body, global: { plugins: [router] } })
  await flushPromises()
  return { component, dom: new DOMWrapper(document.body) }
}
async function selectFolder(dom: DOMWrapper<HTMLElement>) {
  const input = dom.get('[aria-label="选择上传文件夹"]')
  Object.defineProperty(input.element, 'files', { configurable: true, value: files })
  await input.trigger('change')
}

describe('文件夹准备界面与队列衔接', () => {
  it('混合拖入目录与文件时整批拒绝，真正的零字节普通文件仍可上传', async () => {
    const { dom } = await render()
    const empty = new File([], '空文件.txt')
    const directoryGhost = new File([], '目录')
    await dom.get('.upload-dropzone').trigger('drop', { dataTransfer: {
      files: [empty, directoryGhost], items: [{ webkitGetAsEntry: () => ({ isDirectory: false }) }, { webkitGetAsEntry: () => ({ isDirectory: true }) }],
    } })
    expect(queue.add).not.toHaveBeenCalled()
    expect(dom.get('[role="alert"]').text()).toContain('使用“选择文件夹”')
    await dom.get('.upload-dropzone').trigger('drop', { dataTransfer: { files: [empty], items: [{ webkitGetAsEntry: () => ({ isDirectory: false }) }] } })
    expect(queue.add).toHaveBeenCalledWith([empty], '0', '全部文件')
    expect(queue.add.mock.calls[0]![0][0].size).toBe(0)
    expect(directory.prepareDirectoryImport).not.toHaveBeenCalled()
  })
  it('目录全部准备好之前不上传，之后按每个真实父ID加入现有队列', async () => {
    let finish!: (value: PreparedDirectoryFile[]) => void
    vi.mocked(directory.prepareDirectoryImport).mockImplementation((_files, options) => {
      options.progress?.({ completed: 1, total: 2, created: 1, reused: 0, fileCount: 2, roots: ['目录'], currentPath: '目录/sub' })
      return new Promise(resolve => { finish = resolve })
    })
    const { dom } = await render()
    expect(dom.get('[aria-label="选择上传文件夹"]').attributes('webkitdirectory')).toBeDefined()
    await selectFolder(dom)
    expect(queue.add).not.toHaveBeenCalled()
    expect(dom.get('[aria-label="文件夹准备进度"]').text()).toContain('1 / 2 个目录')
    finish(prepared)
    await flushPromises()
    expect(queue.add.mock.calls).toEqual([[[files[0]], 'realRoot', '全部文件/目录'], [[files[1]], 'realSub', '全部文件/目录/sub']])
    expect(dom.get('.folder-preparation-heading').text()).toContain('已加入上传队列')
    expect(dom.get('.folder-preparation').text()).toContain('是否上传完成请查看下方任务')
  })
  it('停止准备中止请求，迟到结果不能加入队列，可在原目标重试', async () => {
    let finish!: (value: PreparedDirectoryFile[]) => void
    let options!: DirectoryImportOptions
    vi.mocked(directory.prepareDirectoryImport).mockImplementationOnce((_files, opts) => { options = opts; return new Promise(resolve => { finish = resolve }) }).mockResolvedValueOnce(prepared)
    const { dom } = await render()
    await selectFolder(dom)
    await dom.get('.folder-preparation-heading button').trigger('click')
    expect(options.signal.aborted).toBe(true)
    finish(prepared)
    await flushPromises()
    expect(queue.add).not.toHaveBeenCalled()
    expect(dom.get('.folder-preparation').text()).toContain('最后一个请求可能已由服务器完成')
    await dom.get('.folder-preparation-heading button').trigger('click')
    await flushPromises()
    expect(directory.prepareDirectoryImport).toHaveBeenLastCalledWith(files, expect.objectContaining({ targetId: '0', ownerId: 'owner1' }))
    expect(queue.add).toHaveBeenCalledTimes(2)
  })
  it('部分目录失败明确保留已创建目录，重试前不误报文件已上传', async () => {
    vi.mocked(directory.prepareDirectoryImport).mockImplementationOnce(async (_files, options) => {
      options.progress?.({ completed: 1, total: 2, created: 1, reused: 0, fileCount: 2, roots: ['目录'], currentPath: '目录/sub' })
      throw new ApiError('目标目录被占用', 600)
    }).mockResolvedValueOnce(prepared)
    const { dom } = await render()
    await selectFolder(dom)
    await flushPromises()
    expect(queue.add).not.toHaveBeenCalled()
    expect(dom.get('.folder-preparation [role="alert"]').text()).toContain('尚未加入文件上传')
    expect(dom.get('.folder-preparation').text()).toContain('已确认创建 1 个')
    expect(dom.get('.folder-preparation').text()).toContain('不会删除已创建的目录')
    await dom.get('.folder-preparation-heading button').trigger('click')
    await flushPromises()
    expect(queue.add).toHaveBeenCalledTimes(2)
  })
  it('账号变化立即停止并清除原选区，新账号不会自动上传旧File', async () => {
    let finish!: (value: PreparedDirectoryFile[]) => void
    let signal!: AbortSignal
    vi.mocked(directory.prepareDirectoryImport).mockImplementation((_files, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve }) })
    const { dom } = await render()
    await selectFolder(dom)
    useAccount().clearSession()
    vi.mocked(accountApi.login).mockResolvedValue({ ...owner, userId: 'owner2' })
    await useAccount().login({ email: 'other@example.invalid', password: 'only-test', checkCode: 'TEST2' })
    finish(prepared)
    await flushPromises()
    expect(signal.aborted).toBe(true)
    expect(dom.find('.folder-preparation').exists()).toBe(false)
    expect(queue.add).not.toHaveBeenCalled()
  })
  it('离开上传页停止未完成的目录准备，普通多文件选择仍沿用原队列', async () => {
    let signal!: AbortSignal
    vi.mocked(directory.prepareDirectoryImport).mockImplementation((_files, options) => { signal = options.signal; return new Promise(() => {}) })
    const { component, dom } = await render()
    const ordinary = new File(['file'], '普通文件.txt')
    const input = dom.get('[aria-label="选择上传文件"]')
    Object.defineProperty(input.element, 'files', { configurable: true, value: [ordinary] })
    await input.trigger('change')
    expect(queue.add).toHaveBeenCalledWith([ordinary], '0', '全部文件')
    await selectFolder(dom)
    component.unmount()
    expect(signal.aborted).toBe(true)
    expect(queue.add).toHaveBeenCalledTimes(1)
  })
})
