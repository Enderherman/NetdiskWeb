import { describe, expect, it, vi } from 'vitest'
import { qqApi, qqErrorMessage, safeQqAuthorizationUrl } from './qq'

function authorization(patch: Record<string, string> = {}) {
  const params = new URLSearchParams({ client_id: '1234567', response_type: 'code', scope: 'get_user_info',
    state: 'A'.repeat(43), redirect_uri: `${window.location.origin}/api/qqlogin/callback`, ...patch })
  return `https://graph.qq.com/oauth2.0/authorize?${params}`
}

describe('QQ授权边界', () => {
  it('只接受官方HTTPS授权地址及本站固定回调', () => {
    expect(safeQqAuthorizationUrl(authorization())).toBe(authorization())
    for (const value of [authorization().replace('https:', 'http:'), authorization().replace('graph.qq.com','graph.qq.com.evil.test'),
      authorization().replace('graph.qq.com','attacker@graph.qq.com'), authorization().replace('/authorize?', '/token?'),
      authorization({ redirect_uri: 'https://evil.test/callback' }), authorization({ state: '' }), authorization({ response_type: 'token' }),
      `${authorization()}&client_id=9999`, `${authorization()}#fragment`, null]) {
      expect(() => safeQqAuthorizationUrl(value)).toThrow('QQ 授权地址不可用')
    }
  })
  it('POST发起授权仅携带安全回跳和Cookie，不提交凭据或登录密码', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: authorization() })))
    const signal = new AbortController().signal
    expect(await qqApi.start('/s/shareA?path=folderA', signal)).toBe(authorization())
    expect(fetch).toHaveBeenCalledWith('/api/qqlogin', expect.objectContaining({ method: 'POST', credentials: 'include', signal }))
    expect([...(fetch.mock.calls[0]![1]!.body as URLSearchParams).entries()]).toEqual([['callBackUrl','/s/shareA?path=folderA']])
    fetch.mockResolvedValue(new Response(JSON.stringify({ code: 200, data: authorization() })))
    await qqApi.start('//evil.test')
    expect((fetch.mock.calls[1]![1]!.body as URLSearchParams).get('callBackUrl')).toBe('/drive')
  })
  it('后端不可用响应不能当作授权地址，错误说明只映射固定分类', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 600, message: 'QQ登录暂未配置' })))
    await expect(qqApi.start('/drive')).rejects.toThrow('QQ登录暂未配置')
    expect(qqErrorMessage('expired')).toContain('已过期')
    expect(qqErrorMessage('cancelled')).toContain('已取消')
    expect(qqErrorMessage('failed')).toContain('未完成')
    expect(qqErrorMessage('unavailable')).toContain('暂不可用')
    expect(qqErrorMessage('<script>secret</script>')).toBe('')
  })
})
