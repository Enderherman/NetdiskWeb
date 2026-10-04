import { ApiError, baseUrl, postForm } from './client'
import { safeReturnPath } from '../router/guards'

export function safeQqAuthorizationUrl(value: unknown): string {
  const invalid = () => new ApiError('QQ 授权地址不可用，请联系管理员检查登录配置', 600)
  if (typeof value !== 'string' || value.length > 4096) throw invalid()
  let url: URL
  try { url = new URL(value) } catch { throw invalid() }
  if (url.protocol !== 'https:' || url.hostname !== 'graph.qq.com' || url.port || url.username || url.password
    || url.pathname !== '/oauth2.0/authorize' || url.hash) throw invalid()
  const fields = url.searchParams
  for (const field of ['client_id', 'redirect_uri', 'response_type', 'state']) if (fields.getAll(field).length !== 1) throw invalid()
  if (fields.get('response_type') !== 'code' || !/^\d{1,20}$/.test(fields.get('client_id') || '')
    || !/^[A-Za-z0-9_-]{43}$/.test(fields.get('state') || '')) throw invalid()
  let callback: URL
  try { callback = new URL(fields.get('redirect_uri') || '') } catch { throw invalid() }
  const expected = new URL(`${baseUrl}/qqlogin/callback`, window.location.origin)
  if (expected.origin !== window.location.origin || callback.href !== expected.href) throw invalid()
  return url.href
}

export const qqApi = {
  async start(returnPath: unknown, signal?: AbortSignal) {
    return safeQqAuthorizationUrl(await postForm<string>('/qqlogin', { callBackUrl: safeReturnPath(returnPath) }, signal))
  },
}

export const qqNavigation = { open(url: string) { window.location.assign(safeQqAuthorizationUrl(url)) } }

export function qqErrorMessage(code: unknown): string {
  if (typeof code !== 'string') return ''
  const messages: Record<string, string> = {
    cancelled: '已取消 QQ 授权，可以重新选择登录方式。',
    expired: 'QQ 登录请求已过期，请重新发起。',
    unavailable: 'QQ 登录暂不可用，请稍后重试或使用邮箱登录。',
    failed: 'QQ 登录未完成，请重试或使用邮箱登录。',
  }
  return messages[code] || ''
}
