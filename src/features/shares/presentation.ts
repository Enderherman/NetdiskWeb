import { ApiError } from '../../api/client'
import type { ShareRecord } from './types'

export const validityOptions = [
  { value: 0, label: '1 天' }, { value: 1, label: '7 天' },
  { value: 2, label: '30 天' }, { value: 3, label: '永久有效' },
] as const

export function validShareId(value: unknown): value is string { return typeof value === 'string' && /^[A-Za-z0-9]{1,20}$/.test(value) }
export function sharePath(shareId: string): string {
  if (!validShareId(shareId)) throw new ApiError('分享链接格式不正确', 600)
  return `/s/${encodeURIComponent(shareId)}`
}
export function shareUrl(shareId: string, origin = window.location.origin): string { return new URL(sharePath(shareId), origin).href }
export function shareReturnPath(shareId: string, path = '', pageNo = 1): string {
  const query = new URLSearchParams()
  if (path && /^[A-Za-z0-9]{1,10}(\/[A-Za-z0-9]{1,10})*$/.test(path) && path.length <= 2200) query.set('path', path)
  if (Number.isInteger(pageNo) && pageNo > 1 && pageNo <= 1_000_000) query.set('page', String(pageNo))
  return sharePath(shareId) + (query.size ? `?${query.toString()}` : '')
}
/** 后端日期没有时区后缀，但契约明确为北京时间。 */
export function shareTimestamp(value: string | null): number {
  if (!value) return Number.NaN
  return Date.parse(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(value) ? `${value.replace(' ', 'T')}+08:00` : value)
}
export function shareExpired(value: string | null, now = Date.now()): boolean {
  const timestamp = shareTimestamp(value)
  return Number.isFinite(timestamp) && timestamp <= now
}
export function shareExpiry(value: string | null): string { return value ? value.replace(/:\d\d$/, '') : '永久有效' }
export function shareText(record: ShareRecord, fallbackName = '分享文件'): string {
  return `${record.fileName || fallbackName}\n链接：${shareUrl(record.shareId)}\n提取码：${record.code}\n有效期：${shareExpiry(record.expireTime)}`
}
export async function copyShareText(value: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new ApiError('浏览器暂不支持自动复制，请手动复制下方链接和提取码', 0)
  try { await navigator.clipboard.writeText(value) }
  catch { throw new ApiError('复制未完成，请手动复制链接和提取码', 0) }
}
