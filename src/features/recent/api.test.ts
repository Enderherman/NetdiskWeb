import { describe, expect, it, vi } from 'vitest'
import { filesApi } from '../../api/files'
import { locateRecentFile, recentApi } from './api'
import { filePage, recentFile, recentFolder } from './__tests__/fixtures'

describe('最近文件与真实定位', () => {
  it('最近列表只发真实分页参数，不模拟阅读历史或返回内部字段', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: filePage([{ ...recentFile, filePath: '/private' } as typeof recentFile]) })))
    const result = await recentApi.list(2, 50)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/file/recent?pageNo=2&pageSize=50')
    expect(fetchMock.mock.calls[0]![1]!.credentials).toBe('include'); expect(result.list[0]).not.toHaveProperty('filePath')
    await expect(recentApi.list(0, 20)).rejects.toThrow('页码')
  })
  it('异常分页或夹杂目录时不构造假列表', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: filePage([recentFolder]) })))
    await expect(recentApi.list()).rejects.toThrow('响应异常'); await expect(recentApi.list()).rejects.toThrow('响应异常')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it('逐级核对父链，跳过纯目录页并返回实际文件所在分页与focus', async () => {
    vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValueOnce([recentFolder]).mockResolvedValueOnce([{ ...recentFolder, fileId: 'rootdir', filePid: '0' }])
    vi.spyOn(recentApi, 'folderCount').mockResolvedValue(250)
    const directory = vi.spyOn(recentApi, 'directory').mockResolvedValueOnce({ ...filePage([]), pageNo: 3, pageSize: 100, pageTotal: 4, totalCount: 350 })
      .mockResolvedValueOnce({ ...filePage(), pageNo: 4, pageSize: 100, pageTotal: 4, totalCount: 350 })
    expect(await locateRecentFile(recentFile)).toEqual({ path: '/drive', query: { path: 'rootdir/nested', page: '4', size: '100', sort: 'lastUpdateTime', direction: 'desc', focus: 'report' } })
    expect(directory.mock.calls.map(call => call[1])).toEqual([3, 4])
  })
  it('根目录不拼伪路径，失效或循环父链不会跳到错误位置', async () => {
    const folders = vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValue([{ ...recentFolder, filePid: 'nested' }])
    vi.spyOn(recentApi, 'folderCount').mockResolvedValue(0)
    vi.spyOn(recentApi, 'directory').mockResolvedValue(filePage([{ ...recentFile, filePid: '0' }]))
    expect((await locateRecentFile({ ...recentFile, filePid: '0' })).query).not.toHaveProperty('path')
    expect(folders).not.toHaveBeenCalled()
    await expect(locateRecentFile(recentFile)).rejects.toThrow('路径异常')
    folders.mockResolvedValueOnce([])
    await expect(locateRecentFile(recentFile)).rejects.toThrow('上级目录已不可用')
  })
  it('已移动文件或取消请求不产生声称已定位的结果', async () => {
    vi.spyOn(recentApi, 'folderCount').mockResolvedValue(0)
    const directory = vi.spyOn(recentApi, 'directory').mockResolvedValue(filePage([]))
    await expect(locateRecentFile({ ...recentFile, filePid: '0' })).rejects.toThrow('位置已变化')
    const controller = new AbortController(); controller.abort()
    await expect(locateRecentFile({ ...recentFile, filePid: '0' }, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(directory).toHaveBeenCalledTimes(1)
  })
})
