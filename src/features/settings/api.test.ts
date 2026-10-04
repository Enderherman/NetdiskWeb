import { describe, expect, it, vi } from 'vitest'
import { avatarError, avatarUrl, nicknameError, passwordError, settingsApi } from './api'

describe('个人设置接口契约', () => {
  it('昵称只提交公开字段并验证真实资料响应', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ code: 200, data: { userId: 'alice', nickName: '新昵称', isAdmin: false, avatar: null } })))
    expect((await settingsApi.updateNickname('新昵称')).nickName).toBe('新昵称')
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/updateProfile')
    const request = fetchMock.mock.calls[0]![1]!
    expect(request.method).toBe('POST'); expect(request.credentials).toBe('include')
    expect(Object.fromEntries((request.body as URLSearchParams).entries())).toEqual({ nickName: '新昵称' })
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ code: 200, data: null })))
    await expect(settingsApi.updateNickname('新昵称')).rejects.toThrow('返回资料不完整')
  })
  it('头像用avatar multipart字段，密码不发送确认值', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify({ code: 200, data: null })))
    const image = new File(['photo'], 'me.png', { type: 'image/png' })
    await settingsApi.uploadAvatar(image)
    expect((fetchMock.mock.calls[0]![1]!.body as FormData).get('avatar')).toBe(image)
    expect(new Headers(fetchMock.mock.calls[0]![1]!.headers).has('Content-Type')).toBe(false)
    await settingsApi.changePassword(' oldPass1 ', ' newPass2 ')
    expect(fetchMock.mock.calls[1]![0]).toBe('/api/updatePassword')
    expect(Object.fromEntries((fetchMock.mock.calls[1]![1]!.body as URLSearchParams).entries())).toEqual({ currentPassword: ' oldPass1 ', password: ' newPass2 ' })
    expect(avatarUrl('a/b', 'rev?')).toBe('/api/getAvatar/a%2Fb?v=rev%3F')
  })
  it('边界校验不截断密码或猜测头像类型', () => {
    expect(nicknameError(' ')).toContain('1–20'); expect(nicknameError('a'.repeat(21))).toContain('1–20')
    expect(nicknameError('用户')).toBe('')
    expect(passwordError('', 'Password1', 'Password1')).toContain('当前密码')
    expect(passwordError('old', '12345678', '12345678')).toContain('英文字母')
    expect(passwordError('old', 'Password1', 'Password2')).toContain('不一致')
    expect(passwordError('old', ' pass123 ', ' pass123 ')).toBe('')
    expect(avatarError(new File(['x'], 'x.svg', { type: 'image/svg+xml' }))).toContain('JPEG')
    expect(avatarError(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'x.png', { type: 'image/png' }))).toContain('2 MB')
  })
})
