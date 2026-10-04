import { describe, expect, it, vi } from 'vitest'
import { ApiError, postForm, request } from './client'

describe('API 客户端约定', () => {
  it('携带会话 Cookie，以表单方式发送后端参数并解析 data', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { id: '123' } })))
    expect(await postForm('/test', { name: '中文文件' })).toEqual({ id: '123' })
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('/api/test')
    expect(options?.credentials).toBe('include')
    expect(options?.method).toBe('POST')
    expect((options?.body as URLSearchParams).get('name')).toBe('中文文件')
  })
  it('区分 HTTP 错误与后端业务错误', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }))
    await expect(request('/test')).rejects.toMatchObject({ name: 'ApiError', code: 503 })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 901, message: '登录已过期' })))
    await expect(request('/test')).rejects.toEqual(new ApiError('登录已过期', 901))
  })
})
