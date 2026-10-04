import { describe, expect, it, vi } from 'vitest'
import { sharesApi, shareContentUrl, shareDownloadUrl } from './api'
import { shareExpired, sharePath, shareReturnPath, shareTimestamp, shareUrl } from './presentation'
import { filePage, publicInfo, sharePage, shareRecord } from './__tests__/fixtures'

describe('分享接口与链接契约', () => {
  it('创建表单使用真实有效期枚举，随机提取码留给后端生成', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: shareRecord })))
    await sharesApi.create('report', 1)
    const options = fetchMock.mock.calls[0]![1]!
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/share/shareFile')
    expect(options.method).toBe('POST')
    expect(options.credentials).toBe('include')
    expect((options.body as URLSearchParams).get('validType')).toBe('1')
    expect((options.body as URLSearchParams).has('code')).toBe(false)
    await sharesApi.create('report', 3, 'Ab12')
    expect((fetchMock.mock.calls[1]![1]!.body as URLSearchParams).get('code')).toBe('Ab12')
  })
  it('提取、撤销、保存与短码签发全部POST且不混淆参数名', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: null })))
    await sharesApi.checkCode('share1', 'Ab123')
    await sharesApi.cancel(['share1', 'share2'])
    await sharesApi.save('share1', ['root', 'report'], 'mine')
    await sharesApi.downloadCode('share1', 'report')
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/showShare/checkShareCode', '/api/share/cancelShare', '/api/showShare/saveShare', '/api/showShare/createDownloadUrl/share1/report'])
    expect(fetchMock.mock.calls.every(call => call[1]?.method === 'POST')).toBe(true)
    const saved = fetchMock.mock.calls[2]![1]!.body as URLSearchParams
    expect(Object.fromEntries(saved.entries())).toEqual({ shareId: 'share1', shareFileIds: 'root,report', myFolderId: 'mine' })
    expect(shareContentUrl('a/b', 'c/d')).toBe('/api/showShare/content/a%2Fb/c%2Fd')
    expect(shareDownloadUrl('a/b')).toBe('/api/showShare/download/a%2Fb')
  })
  it('列表与公共目录保留分页字段，公开页不要求先登录', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async input => {
      const path = String(input)
      return new Response(JSON.stringify({ code: 200, data: path.includes('loadShareList') ? sharePage() : path.includes('loadFileList') ? filePage() : publicInfo }))
    })
    await sharesApi.list(2, 20)
    await sharesApi.info('share1')
    await sharesApi.accessInfo('share1')
    await sharesApi.files('share1', 'root', 2, 20)
    const list = new URL(String(fetchMock.mock.calls[3]![0]), 'http://localhost')
    expect(Object.fromEntries(list.searchParams)).toEqual({ shareId: 'share1', filePid: 'root', pageNo: '2', pageSize: '20' })
  })
  it('不完整成功响应不伪造分享或空列表', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: null })))
    await expect(sharesApi.create('report', 1)).rejects.toThrow('返回信息不完整')
    await expect(sharesApi.list()).rejects.toThrow('分享列表响应异常')
  })
  it('登录回跳只由合法分享ID和目录参数构造，不接受外部跳转', () => {
    expect(shareReturnPath('share1', 'root/folder', 2)).toBe('/s/share1?path=root%2Ffolder&page=2')
    expect(shareReturnPath('share1', '//evil.test', 1)).toBe('/s/share1')
    expect(() => sharePath('../auth')).toThrow()
    expect(() => sharePath('https://evil.test')).toThrow()
    expect(shareUrl('share1', 'https://cloud.example.test')).toBe('https://cloud.example.test/s/share1')
  })
  it('以北京时间解析后端到期值，不随浏览器时区漂移', () => {
    expect(shareTimestamp('2026-10-05 08:00:00')).toBe(Date.parse('2026-10-05T00:00:00Z'))
    expect(shareExpired('2026-10-05 08:00:00', Date.parse('2026-10-05T00:01:00Z'))).toBe(true)
    expect(shareExpired(null)).toBe(false)
  })
})
