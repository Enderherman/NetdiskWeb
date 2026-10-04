import { describe, expect, it, vi } from 'vitest'
import { filesApi } from '../../api/files'
import { operationsApi, validateCopyDestination, zipDownloadUrl } from './api'
import { normalizeSelection } from './selection'
import { copied, folder, source } from './__tests__/fixtures'

describe('复制与ZIP接口', () => {
  it('复制提交真实fileIds/filePid，返回新顶层条目且丢弃内部字段', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: [{ ...copied, filePath: '/private', fileMd5: 'secret' }] })))
    const result = await operationsApi.copy(['report', 'report'], '0')
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/file/copyFile')
    const options = fetchMock.mock.calls[0]![1]!
    expect(options.method).toBe('POST'); expect(options.credentials).toBe('include')
    expect(Object.fromEntries((options.body as URLSearchParams).entries())).toEqual({ fileIds: 'report', filePid: '0' })
    expect(result[0]?.fileId).toBe('copy1'); expect(result[0]).not.toHaveProperty('filePath'); expect(result[0]).not.toHaveProperty('fileMd5')
  })
  it('返回空列表、旧ID或错误目标均不报告复制成功', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    for (const data of [[], [source], [{ ...copied, filePid: 'wrong' }]]) {
      fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data })))
      await expect(operationsApi.copy(['report'], '0')).rejects.toThrow('新条目信息不完整')
    }
  })
  it('ZIP短码为43位Base64URL，签发与兑换路径不混用普通下载接口', async () => {
    const code = 'a_'.repeat(21) + 'Q'
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: code })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: 'A'.repeat(50) })))
    expect(await operationsApi.zipCode(['report', 'folder'])).toBe(code)
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/file/createZipDownloadUrl')
    expect((fetchMock.mock.calls[0]![1]!.body as URLSearchParams).get('fileIds')).toBe('report,folder')
    expect(zipDownloadUrl(code)).toBe(`/api/file/downloadZip/${code}`)
    await expect(operationsApi.zipCode(['report'])).rejects.toThrow('ZIP 下载授权响应异常')
    expect(() => zipDownloadUrl('../secret')).toThrow('无效')
  })
  it('允许同用户跨目录同名项，拒绝混合所有者、路径和矛盾快照', () => {
    expect(normalizeSelection([source, { ...source, fileId: 'other', filePid: 'nested' }, source], 'alice')).toHaveLength(2)
    expect(() => normalizeSelection([{ ...source, userId: 'bob' } as typeof source], 'alice')).toThrow('不同用户')
    expect(() => normalizeSelection([source, { ...source, filePid: 'other' }], 'alice')).toThrow('不同位置')
    for (const invalid of [{ ...source, fileName: '../escape' }, { ...source, filePid: '/outside' }, { ...source, fileId: 'a,b' }, { ...source, status: 0 as const }]) {
      expect(() => normalizeSelection([invalid], 'alice')).toThrow()
    }
    expect(() => normalizeSelection(Array.from({ length: 1001 }, () => source), 'alice')).toThrow('1–1000')
    expect(normalizeSelection([folder, { ...source, filePid: 'folder' }], 'alice')).toHaveLength(2)
  })
  it('完整父链防止复制到自身、后代及异常目录循环', async () => {
    const lookup = vi.spyOn(filesApi, 'breadcrumbs').mockResolvedValueOnce([{ ...folder, fileId: 'child', filePid: 'folder' }])
    await expect(validateCopyDestination('folder', new Set(['folder']))).rejects.toThrow('自身或其子目录')
    await expect(validateCopyDestination('child', new Set(['folder']))).rejects.toThrow('自身或其子目录')
    lookup.mockResolvedValueOnce([{ ...folder, fileId: 'loop', filePid: 'loop' }])
    await expect(validateCopyDestination('loop', new Set())).rejects.toThrow('路径异常')
    await expect(validateCopyDestination('0', new Set(['folder']))).resolves.toBeUndefined()
  })
})
