import { afterEach, describe, expect, it, vi } from 'vitest'
import { sendChunk, uploadsApi } from './uploads'
import { SESSION_EXPIRED_EVENT } from './client'

class FakeXHR {
  static last: FakeXHR
  upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 200
  responseText = ''
  withCredentials = false
  timeout = 0
  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn()
  abort = vi.fn(() => this.onabort?.())
  constructor() { FakeXHR.last = this }
}
afterEach(() => vi.unstubAllGlobals())
const chunk = () => ({ fileName: '中文.txt', filePid: '0', fileMd5: 'a'.repeat(32), chunks: 1, chunkIndex: 0, blob: new Blob(['abc']) })

describe('上传XHR与任务接口', () => {
  it('首片multipart不带客户端ID，带Cookie且进度不能代替成功回执', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    const progress = vi.fn()
    const result = sendChunk(chunk(), new AbortController().signal, progress)
    const xhr = FakeXHR.last
    expect(xhr.open).toHaveBeenCalledWith('POST', '/api/file/uploadFile')
    expect(xhr.withCredentials).toBe(true)
    const body = xhr.send.mock.calls[0]![0] as FormData
    expect(body.has('fileId')).toBe(false)
    expect(body.get('fileMd5')).toBe('a'.repeat(32))
    xhr.upload.onprogress!({ lengthComputable: true, loaded: 500, total: 1000 })
    expect(progress).toHaveBeenCalledWith(2)
    xhr.responseText = JSON.stringify({ code: 200, data: { fileId: 'task000001', status: 'uploading' } })
    xhr.onload!()
    expect(await result).toEqual({ fileId: 'task000001', status: 'uploading' })
  })
  it('异常完成回执不当成功，401式业务会话失效发出通知', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    const first = sendChunk(chunk(), new AbortController().signal, vi.fn())
    const firstCheck = expect(first).rejects.toThrow('上传回执异常')
    FakeXHR.last.responseText = JSON.stringify({ code: 200, data: { fileId: 'task000001', status: 'done' } })
    FakeXHR.last.onload!()
    await firstCheck
    const second = sendChunk(chunk(), new AbortController().signal, vi.fn())
    const secondCheck = expect(second).rejects.toMatchObject({ code: 901 })
    FakeXHR.last.responseText = JSON.stringify({ code: 901, message: '登录已过期' })
    FakeXHR.last.onload!()
    await secondCheck
    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })
  it('AbortSignal真正调用XHR.abort并报告暂停', async () => {
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
    const controller = new AbortController()
    const result = sendChunk(chunk(), controller.signal, vi.fn())
    const check = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await check
    expect(FakeXHR.last.abort).toHaveBeenCalledOnce()
  })
  it('任务列表/详细查询GET，取消POST且不伪造状态', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: { state: 'cancelled' } })))
    await uploadsApi.list(2, 'uploading')
    await uploadsApi.detail('task000001')
    expect(await uploadsApi.cancel('task000001')).toMatchObject({ state: 'cancelled' })
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual(['/api/file/uploadTasks?pageNo=2&pageSize=20&state=uploading', '/api/file/uploadTask/task000001', '/api/file/cancelUpload/task000001'])
    expect(fetchMock.mock.calls[2]![1]?.method).toBe('POST')
  })
})
