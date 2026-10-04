import { ApiError, baseUrl, postForm, request } from '../../api/client'
import type { SessionUser } from '../../types/account'

export function requireProfile(value: unknown): SessionUser {
  const profile = value as SessionUser | null
  if (!profile || typeof profile.userId !== 'string' || !profile.userId || typeof profile.nickName !== 'string' || typeof profile.isAdmin !== 'boolean') {
    throw new ApiError('账户资料响应异常，请重新读取', 0)
  }
  return { userId: profile.userId, nickName: profile.nickName, isAdmin: profile.isAdmin, avatar: typeof profile.avatar === 'string' ? profile.avatar : null }
}

export const settingsApi = {
  async updateNickname(nickName: string): Promise<SessionUser> {
    const result = await postForm<SessionUser>('/updateProfile', { nickName })
    if (!result || typeof result.userId !== 'string' || result.nickName !== nickName || typeof result.isAdmin !== 'boolean') {
      throw new ApiError('修改已提交，但返回资料不完整，请刷新核对', 0)
    }
    return result
  },
  uploadAvatar(avatar: File): Promise<null> {
    const body = new FormData(); body.set('avatar', avatar)
    return request<null>('/updateUserAvatar', { method: 'POST', body })
  },
  changePassword: (currentPassword: string, password: string) => postForm<null>('/updatePassword', { currentPassword, password }),
}

export function avatarUrl(userId: string, revision = ''): string {
  return `${baseUrl}/getAvatar/${encodeURIComponent(userId)}${revision ? `?v=${encodeURIComponent(revision)}` : ''}`
}

export function nicknameError(value: string): string {
  if (!value.trim() || value.trim().length > 20) return '昵称需为 1–20 个字符'
  return /[\u0000-\u001f\u007f]/.test(value) ? '昵称不能包含控制字符' : ''
}

export function passwordError(current: string, password: string, confirmation: string): string {
  if (!current || current.length > 64) return '请输入当前密码，长度不超过 64 位'
  if (!/^(?=.*[0-9])(?=.*[a-zA-Z]).{8,64}$/.test(password)) return '新密码须为 8–64 位，至少包含英文字母和数字'
  if (password !== confirmation) return '两次输入的新密码不一致'
  return ''
}

export function avatarError(file: File): string {
  if (!['image/jpeg', 'image/png', 'image/gif', 'image/bmp'].includes(file.type)) return '请选择 JPEG、PNG、GIF 或 BMP 图片'
  if (file.size === 0 || file.size > 2 * 1024 * 1024) return '头像文件需大于 0 字节且不超过 2 MB'
  return ''
}
