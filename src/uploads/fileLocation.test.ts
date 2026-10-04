import { describe, expect, it, vi } from 'vitest'
import { filesApi } from '../api/files'
import { recentApi } from '../features/recent/api'
import type { FileItem, FilePage } from '../types/files'
import type { ServerUploadTask } from '../types/uploads'
import { locateUploadedFile, uploadSearchLocation } from './fileLocation'

const task: ServerUploadTask = { fileId: 'task000001', fileName: '上传原名.txt', filePid: 'oldFolder', actualFileName: '当前名称.txt', navigationPath: '0', fileMd5: 'a'.repeat(32), chunks: 1, state: 'completed', uploadStatus: 'upload_finish', receivedChunks: [], receivedCount: 1, receivedBytes: 5, temporaryBytes: 0, fileSize: 5, fileAvailable: true, createdAt: 1, updatedAt: 2, expiresAt: 2000000000000 }
const file: FileItem = { fileId: task.fileId, filePid: '0', fileName: '当前名称.txt', fileSize: 5, folderType: 0, status: 2, fileCategory: 4, fileType: 7, lastUpdateTime: '2026-10-05 12:00:00' }
const page = (list: FileItem[] = [file], pageNo = 1, pageTotal = 1): FilePage => ({ list, pageNo, pageTotal, pageSize: 100, totalCount: 100 * pageTotal })
function latest(value: unknown = task) { return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: value }))) }
function directory(list = [file]) {
  vi.spyOn(recentApi, 'folderCount').mockResolvedValue(0)
  return vi.spyOn(recentApi, 'directory').mockResolvedValue(page(list))
}

describe('上传原件跨页定位', () => {
  it('重新读取任务并用真实条目查分页，250个目录后文件在第4页', async () => {
    const fetch = latest(); const candidates = vi.spyOn(filesApi, 'list').mockResolvedValue(page())
    vi.spyOn(recentApi, 'folderCount').mockResolvedValue(250)
    const listing = vi.spyOn(recentApi, 'directory').mockResolvedValueOnce(page([], 3, 4)).mockResolvedValueOnce(page([file], 4, 4))
    const signal = new AbortController().signal
    expect(await locateUploadedFile({ ...task, actualFileName: '过期名称.txt' }, signal)).toEqual({ path: '/drive', query: { page: '4', size: '100', sort: 'lastUpdateTime', direction: 'desc', focus: task.fileId } })
    expect(fetch.mock.calls[0]![0]).toBe('/api/file/uploadTask/task000001')
    expect(fetch.mock.calls[0]![1]!.signal).toBe(signal)
    expect(candidates).toHaveBeenCalledWith(expect.objectContaining({ filePid: '0', fileNameFuzzy: '当前名称.txt' }), signal)
    expect(listing.mock.calls.map(call => call[1])).toEqual([3, 4])
  })
  it('最新任务已改名移动时用新目录，忽略上传时的旧filePid', async () => {
    const moved = { ...file, filePid: 'nested', fileName: '最终名称.txt' }
    const newest = { ...task, actualFileName: moved.fileName, navigationPath: 'parent/nested' }
    latest(newest); const updated = vi.fn()
    const candidates = vi.spyOn(filesApi, 'list').mockResolvedValue(page([moved]))
    vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValueOnce([{ ...file, fileId: 'nested', filePid: 'parent', folderType: 1 }])
      .mockResolvedValueOnce([{ ...file, fileId: 'parent', filePid: '0', folderType: 1 }])
    directory([moved])
    expect((await locateUploadedFile(task, undefined, updated)).query).toMatchObject({ path: 'parent/nested', focus: task.fileId })
    expect(candidates).toHaveBeenCalledWith(expect.objectContaining({ filePid: 'nested', fileNameFuzzy: '最终名称.txt' }), undefined)
    expect(updated).toHaveBeenCalledWith(newest)
  })
  it('目录字段为空时从真实名称候选找到ID，不把另一个同名文件当原件', async () => {
    latest({ ...task, navigationPath: null })
    const candidates = vi.spyOn(filesApi, 'list').mockResolvedValueOnce(page([{ ...file, fileId: 'other' }], 1, 2)).mockResolvedValueOnce(page([file], 2, 2))
    directory()
    expect((await locateUploadedFile(task)).query).toHaveProperty('focus', task.fileId)
    expect(candidates.mock.calls[0]![0]).not.toHaveProperty('filePid')
    expect(candidates).toHaveBeenCalledTimes(2)
  })
  it('旧后端字段缺失只搜索原名，不猜当前目录或制造文件条目', async () => {
    const { actualFileName: _name, navigationPath: _path, ...legacy } = task
    latest(legacy); const candidates = vi.spyOn(filesApi, 'list')
    expect(await locateUploadedFile(task)).toEqual({ path: '/drive', query: { q: task.fileName } })
    expect(candidates).not.toHaveBeenCalled()
  })
  it('原件已回收时保留最新已知名称但不跳转', async () => {
    const unavailable = { ...task, actualFileName: '回收前名称.txt', fileAvailable: false }
    latest(unavailable); const updated = vi.fn(); const candidates = vi.spyOn(filesApi, 'list')
    await expect(locateUploadedFile(task, undefined, updated)).rejects.toThrow('原件当前不可用')
    expect(uploadSearchLocation(updated.mock.calls[0]![0])).toEqual({ path: '/drive', query: { q: '回收前名称.txt' } })
    expect(candidates).not.toHaveBeenCalled()
  })
  it('错ID、伪路径和循环路径不能进入目录查询', async () => {
    const fetch = latest({ ...task, fileId: 'another' }); const candidates = vi.spyOn(filesApi, 'list')
    await expect(locateUploadedFile(task)).rejects.toThrow('响应异常')
    for (const navigationPath of ['../escape', 'same/same', '0/nested', task.fileId]) {
      fetch.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: { ...task, navigationPath } })))
      await expect(locateUploadedFile(task)).rejects.toThrow('目录路径异常')
    }
    expect(candidates).not.toHaveBeenCalled()
  })
  it('候选搜索最多100页，无法找到ID明确失败', async () => {
    latest(); const candidates = vi.spyOn(filesApi, 'list').mockImplementation(async query => page([], query.pageNo, 200))
    await expect(locateUploadedFile(task)).rejects.toThrow('超出定位范围')
    expect(candidates).toHaveBeenCalledTimes(100)
  })
  it('取消或异常页码不返回虚假位置', async () => {
    latest(); const controller = new AbortController(); controller.abort()
    await expect(locateUploadedFile(task, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    vi.spyOn(filesApi, 'list').mockResolvedValue({ ...page(), pageNo: 0 })
    await expect(locateUploadedFile(task)).rejects.toThrow('响应异常')
  })
})
