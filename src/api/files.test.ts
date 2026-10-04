import { describe, expect, it, vi } from 'vitest'
import { filesApi, downloadUrl } from './files'
import { validateFileName } from '../composables/filePresentation'

describe('文件接口契约', () => {
  it('全局搜索省略父目录，保留搜索特殊字符的原义', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: {} })))
    await filesApi.list({ category: 'doc', fileNameFuzzy: '100%_报告', sortField: 'fileName', sortDirection: 'asc', pageNo: 2, pageSize: 50 })
    const url = new URL(String(fetchMock.mock.calls[0]![0]), 'http://localhost')
    expect(url.pathname).toBe('/api/file/loadDataList')
    expect(url.searchParams.has('filePid')).toBe(false)
    expect(url.searchParams.get('fileNameFuzzy')).toBe('100%_报告')
    expect(url.searchParams.get('sortField')).toBe('fileName')
    expect(url.searchParams.has('orderBy')).toBe(false)
  })
  it('写操作和下载凭据全部POST，移动与回收使用fileIds参数', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: null })))
    await filesApi.createFolder('0', '工作文档')
    await filesApi.rename('file1', '完整名称.pdf')
    await filesApi.move(['file1', 'file2'], 'folder1')
    await filesApi.recycle(['file1', 'file2'])
    await filesApi.downloadCode('file1')
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/file/newFolder', '/api/file/rename', '/api/file/changeFileFolder', '/api/file/delFile', '/api/file/createDownloadUrl/file1'])
    for (const [, options] of fetchMock.mock.calls) expect(options?.method).toBe('POST')
    expect((fetchMock.mock.calls[1]![1]?.body as URLSearchParams).get('fileName')).toBe('完整名称.pdf')
    expect((fetchMock.mock.calls[2]![1]?.body as URLSearchParams).get('fileIds')).toBe('file1,file2')
    expect((fetchMock.mock.calls[3]![1]?.body as URLSearchParams).get('fileIds')).toBe('file1,file2')
    expect(downloadUrl('a/b')).toBe('/api/file/download/a%2Fb')
  })
  it('名称允许中文和完整后缀，拒绝危险或跨平台保留名称', () => {
    expect(validateFileName('季度 报告.pdf')).toBe('')
    for (const name of ['', 'a'.repeat(201), 'CON.txt', 'NUL', '尾点.', ' 前空白', '后空白 ', '../file', 'a\\b', 'a\nb']) expect(validateFileName(name)).not.toBe('')
  })
})
