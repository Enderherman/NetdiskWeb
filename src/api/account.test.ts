import { describe, expect, it, vi } from 'vitest'
import { accountApi, captchaUrl } from './account'
import { request, SESSION_EXPIRED_EVENT } from './client'

describe('账户接口契约', () => {
  it('发送邮箱码和找回密码使用正确用途、路径与原始密码', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: null })))
    await accountApi.sendEmailCode('test@example.com', 'CHECK', 1)
    await accountApi.resetPassword({ email: 'test@example.com', password: 'PlainPassword123!', checkCode: 'RESET', emailCode: '123456' })
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/sendEmailCode')
    expect((fetchMock.mock.calls[0]![1]!.body as URLSearchParams).get('type')).toBe('1')
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/resetPwd')
    expect((fetchMock.mock.calls[1]![1]!.body as URLSearchParams).get('password')).toBe('PlainPassword123!')
    expect(captchaUrl(1, 'new image')).toBe('/api/checkCode?type=1&v=new%20image')
  })
  it('会话失效发出通知，网络失败转换为中文错误', async () => {
    const listener = vi.fn()
    window.addEventListener(SESSION_EXPIRED_EVENT, listener)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ code: 901, message: '登录超时' })))
    await expect(accountApi.current()).rejects.toMatchObject({ code: 901 })
    expect(listener).toHaveBeenCalledTimes(1)
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(accountApi.current()).rejects.toMatchObject({ message: '暂时无法连接服务，请检查网络后重试' })
    window.removeEventListener(SESSION_EXPIRED_EVENT, listener)
  })
  it('保留 Headers 请求头，拒绝非 JSON 服务响应', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('<html>proxy error</html>'))
    await expect(request('/getUserInfo', { headers: new Headers({ 'X-Test': 'yes' }) })).rejects.toMatchObject({ message: '服务响应异常，请稍后重试' })
    expect((fetchMock.mock.calls[0]![1]!.headers as Headers).get('X-Test')).toBe('yes')
  })
})
