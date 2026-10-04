import { describe, expect, it, vi } from 'vitest'
import { IMAGE_PREVIEW_LIMIT, loadPreview, safeFileUrl, TEXT_PREVIEW_LIMIT, verifyDownload } from './previewContent'
import { SESSION_EXPIRED_EVENT } from '../api/client'
import type { FileItem } from '../types/files'

const file: FileItem = { fileId: 'file123', filePid: '0', fileName: '文件.txt', fileSize: 100, folderType: 0, status: 2, fileType: 7, fileCategory: 4, lastUpdateTime: null }
const signal = () => new AbortController().signal
function response(body: string | Uint8Array<ArrayBuffer>, mime = 'text/plain', total?: number) {
  const length = typeof body === 'string' ? new TextEncoder().encode(body).length : body.byteLength
  return new Response(body, { status: 206, headers: { 'Content-Type': mime, 'Content-Disposition': 'inline', 'Content-Range': `bytes 0-${Math.max(0, length - 1)}/${total ?? length}` } })
}

describe('安全预览读取', () => {
  it('只接受同源固定文件API，分享/管理员URL仍须绑定同一fileId', () => {
    expect(safeFileUrl('file123')).toBe('/api/file/content/file123')
    expect(safeFileUrl('file123', '/api/showShare/content/share123/file123')).toBe('/api/showShare/content/share123/file123')
    expect(safeFileUrl('file123', '/api/admin/content/user123/file123')).toBe('/api/admin/content/user123/file123')
    expect(safeFileUrl('file123', undefined, 'thumbnail')).toBe('/api/file/thumbnail/file123')
    for (const url of ['https://outside.example/file', '//outside.example/a', 'javascript:alert(1)', 'data:text/html,test', '/api/file/content/other', '/api/file/content/file123?redirect=outside', '/api/file/getFile/file123', '/index.html']) expect(() => safeFileUrl('file123', url)).toThrow()
  })

  it('文本限定64KiB且明确标记截断，即使服务端忽略Range也不会读完整大文件', async () => {
    const cancel = vi.fn()
    let pulls = 0
    const stream = new ReadableStream<Uint8Array>({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(16 * 1024).fill(65)) }, cancel })
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response('head', 'text/plain', 1000000))
      .mockResolvedValueOnce(new Response(stream, { headers: { 'Content-Type': 'text/plain', 'Content-Length': '1000000' } }))
    const result = await loadPreview(file, undefined, signal())
    expect(result.mode).toBe('text')
    expect(result.truncated).toBe(true)
    expect(result.text).toHaveLength(TEXT_PREVIEW_LIMIT)
    expect(pulls).toBeLessThanOrEqual(6)
    expect(cancel).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[1]![1]?.headers).toEqual({ Range: `bytes=0-${TEXT_PREVIEW_LIMIT}` })
  })

  it.each(['危险.html', '危险.svg'])('HTML/SVG仅返回源文本：%s', async name => {
    const source = '<svg onload="alert(1)"><script>alert(1)</script></svg>'
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response(source, 'application/octet-stream'))
    const result = await loadPreview({ ...file, fileName: name }, undefined, signal())
    expect(result.mode).toBe('text')
    expect(result.sourceText).toBe(true)
    expect(result.text).toBe(source)
  })

  it('会话过期明确通知应用，分享过期保留分享错误而不冒充预览成功', async () => {
    const expired = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, expired)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ code: 901 }), { headers: { 'Content-Type': 'application/json' } }))
    await expect(loadPreview(file, undefined, signal())).rejects.toMatchObject({ code: 901 })
    expect(expired).toHaveBeenCalledOnce()
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 903 }), { headers: { 'Content-Type': 'application/json' } }))
    await expect(loadPreview(file, '/api/showShare/content/share123/file123', signal())).rejects.toMatchObject({ code: 903, message: '分享验证已失效，请重新提取分享' })
    expect(expired).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_EXPIRED_EVENT, expired)
  })

  it('拒绝伪装成图片或PDF的HTML/SVG字节', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response('<svg onload="alert(1)"/>', 'image/jpeg'))
    expect((await loadPreview(file, undefined, signal())).mode).toBe('unsupported')
    fetchMock.mockResolvedValueOnce(response('<html><script>alert(1)</script></html>', 'application/pdf'))
    expect((await loadPreview(file, undefined, signal())).mode).toBe('unsupported')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('图片超过限制不读取原图，正常PNG以受控Blob返回', async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 0])
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(png, 'image/png', IMAGE_PREVIEW_LIMIT + 1))
    const large = await loadPreview(file, undefined, signal())
    expect(large.mode).toBe('unsupported')
    expect(large.message).toContain('20 MiB')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockImplementation(async () => response(png, 'image/png'))
    const small = await loadPreview(file, undefined, signal())
    expect(small.mode).toBe('image')
    expect(small.image?.size).toBe(png.byteLength)
    expect(small.image?.type).toBe('image/png')
  })

  it.each([['application/pdf', '%PDF-1.7', 'pdf'], ['video/mp4', 'video bytes', 'video'], ['audio/mpeg', 'audio bytes', 'audio']])('原生预览按真实类型而非显示后缀判定：%s', async (mime, bytes, mode) => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(bytes, mime))
    const result = await loadPreview({ ...file, fileName: '已经改名.zip' }, undefined, signal())
    expect(result.mode).toBe(mode)
    expect(result.url).toBe('/api/file/content/file123')
    expect(result.image).toBeUndefined()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('Office降级下载，网络/权限错误不成为空成功', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response('office bytes', 'application/octet-stream'))
    expect((await loadPreview({ ...file, fileName: '报告.docx' }, undefined, signal())).mode).toBe('unsupported')
    fetchMock.mockRejectedValueOnce(new TypeError('offline'))
    await expect(loadPreview(file, undefined, signal())).rejects.toThrow('无法连接文件服务')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }))
    await expect(loadPreview(file, undefined, signal())).rejects.toMatchObject({ code: 403 })
  })

  it('空文件也检查权限，读取与下载不对空文件发送无效Range', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response('', { headers: { 'Content-Type': 'text/plain', 'Content-Length': '0', 'Content-Disposition': 'inline' } }))
    expect((await loadPreview({ ...file, fileSize: 0 }, undefined, signal())).text).toBe('')
    expect(await verifyDownload({ ...file, fileSize: 0 }, undefined, signal())).toBe('/api/file/content/file123?download=true')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    for (const [, options] of fetchMock.mock.calls) expect(options?.headers).toEqual({})
  })
})
